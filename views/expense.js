/* 経費申請の画面（#expense）
   参考アプリの並び: 申請者 → 小口先出 → 対象日 → 施設名 → 経費区分 → 物品（追加/削除） → 備考、カードの外に「送信」。
   送信の流れ: 送信 → 入力チェック（項目の下に赤字） → ページ内の確認カード → 送信中 → 完了カード。
   GAS に送る data の形は docs/api.md のまま: {対象日, 小口先出, 経費区分, 物品: [{物品, 自由入力?, 個数, 金額}], 備考?} */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, state = I.state, api = I.api, esc = I.esc, today = I.today, yen = I.yen, toast = I.toast;

  var FACILITIES = ['モア一津屋']; // 施設は1つだけ。表示のみで、送るデータには入れない

  // 空行を先頭に置くセレクト（参考アプリと同じく、未選択は空）
  function sel(id, list, value, first, disabled) {
    return '<select id="' + id + '"' + (disabled ? ' disabled' : '') + '>' +
      (first === null ? '' : '<option value="">' + esc(first || '') + '</option>') +
      list.map(function (v) { return '<option' + (v === value ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('') +
      '</select>';
  }
  function head(forId, label, req, extra) {
    return '<div class="exp-lab"><label for="' + forId + '">' + label + '</label>' + (extra || '') +
      '<span class="' + (req ? 'exp-req">(必須)' : 'exp-opt">(任意)') + '</span></div>';
  }
  function field(key, inner) {
    return '<div class="exp-field" data-f="' + key + '">' + inner + '<p class="exp-err" id="exp-err-' + key + '" hidden></p></div>';
  }

  function viewExpense() {
    var o = state.options || {};
    var goods = (o.物品 || []).slice();
    if (goods.indexOf('フリー入力') < 0) goods.unshift('フリー入力');
    var rows = [{}];

    app.innerHTML =
      '<h1 class="exp-title">経費申請</h1>' +
      '<div id="exp-stage">' +
      '<form id="exp-form" class="exp-form" novalidate>' +
        '<div class="card exp-card">' +
          field('申請者', head('exp-申請者', '申請者', true) +
            '<input id="exp-申請者" value="' + esc(state.me && state.me.氏名) + '" readonly aria-readonly="true">') +
          field('小口先出', head('exp-小口先出', '小口先出', true) + sel('exp-小口先出', o.小口先出 || [])) +
          // 参考アプリと同じく、小口先出を選ぶまで対象日は使えない
          field('対象日', head('exp-対象日', '対象日', true) + '<input type="date" id="exp-対象日" value="' + today() + '" disabled>') +
          field('施設名', head('exp-施設名', '施設名', true) + sel('exp-施設名', FACILITIES, FACILITIES[0], null)) +
          field('経費区分', head('exp-経費区分', '経費区分', true) + sel('exp-経費区分', o.経費区分 || [])) +
          '<div class="exp-field" data-f="物品">' +
            '<div class="exp-lab"><span class="exp-lab-name" id="exp-物品-lab">物品</span>' +
              '<button type="button" class="exp-pill exp-add" id="exp-add">追加</button>' +
              '<button type="button" class="exp-pill exp-del" id="exp-del">削除</button>' +
              '<span class="exp-req">(必須)</span></div>' +
            '<div id="exp-items" class="exp-items" role="group" aria-labelledby="exp-物品-lab"></div>' +
            '<p class="exp-total" id="exp-total" hidden></p>' +
          '</div>' +
          field('備考', head('exp-備考', '備考', false) + '<textarea id="exp-備考"></textarea>') +
        '</div>' +
        '<p class="exp-formerr" id="exp-formerr" role="alert" hidden></p>' +
        '<button type="submit" class="exp-send">送信</button>' +
        (I.backHtml ? I.backHtml('#apply') : '') +
      '</form>' +
      '<div id="exp-after"></div>' +
      '</div>';

    var form = document.getElementById('exp-form');
    var after = document.getElementById('exp-after');
    function $(id) { return document.getElementById('exp-' + id); }

    // ---------- 物品の行 ----------
    // 1行ぶんの HTML。行の追加・削除・フリー入力の出し入れは、その行だけを変える（他の行のエラー表示を消さないため）
    function rowHtml(r, i) {
        var free = r.物品 === 'フリー入力';
        return '<div class="exp-item" data-i="' + i + '">' +
          '<div class="exp-item-row">' +
            sel('exp-物品_' + i, goods, r.物品, '物品').replace('<select', '<select aria-label="物品 ' + (i + 1) + '行目"' + (r.物品 ? '' : ' class="exp-empty"')) +
            '<input type="number" inputmode="numeric" min="1" step="1" id="exp-個数_' + i + '" placeholder="個数" aria-label="個数 ' + (i + 1) + '行目" value="' + esc(r.個数 || '') + '">' +
            '<input type="number" inputmode="numeric" min="0" step="1" id="exp-金額_' + i + '" placeholder="金額" aria-label="金額（円） ' + (i + 1) + '行目" value="' + esc(r.金額 === undefined ? '' : r.金額) + '">' +
          '</div>' +
          (free ? '<input class="exp-free" id="exp-自由入力_' + i + '" placeholder="物品名を入力" aria-label="物品名 ' + (i + 1) + '行目" value="' + esc(r.自由入力 || '') + '">' : '') +
          '<p class="exp-err" id="exp-err-物品_' + i + '" hidden></p>' +
        '</div>';
    }
    function drawItems() {
      $('items').innerHTML = rows.map(rowHtml).join('');
      updateTotal();
    }
    function collect() {
      rows = rows.map(function (_, i) {
        var g = function (k) { var el = $(k + '_' + i); return el ? el.value : undefined; };
        return { 物品: g('物品'), 自由入力: g('自由入力'), 個数: g('個数'), 金額: g('金額') };
      });
    }
    function updateTotal() {
      var sum = 0, any = false;
      rows.forEach(function (_, i) { var el = $('金額_' + i); if (el && el.value !== '') { any = true; sum += Number(el.value || 0); } });
      $('total').hidden = !any;
      $('total').textContent = '合計 ' + yen(sum);
    }
    drawItems();

    // ---------- 入力に応じた切り替え ----------
    function syncDate() {
      var on = !!$('小口先出').value;
      $('対象日').disabled = !on;
      $('対象日').closest('.exp-field').classList.toggle('exp-off', !on);
    }
    syncDate();

    form.addEventListener('input', function (e) {
      if (/^exp-金額_/.test(e.target.id)) updateTotal();
      clearErr(e.target);
    });
    form.addEventListener('change', function (e) {
      var id = e.target.id;
      if (id === 'exp-小口先出') syncDate();
      if (/^exp-物品_/.test(id)) setFree(Number(id.split('_')[1]), e.target.value === 'フリー入力');
      if (e.target.tagName === 'SELECT') e.target.classList.toggle('exp-empty', !e.target.value);
      clearErr(e.target);
    });
    // フリー入力を選んだ行にだけ物品名の欄を出す
    function setFree(i, on) {
      var cur = $('自由入力_' + i);
      if (on && !cur) {
        $('物品_' + i).closest('.exp-item-row').insertAdjacentHTML('afterend',
          '<input class="exp-free" id="exp-自由入力_' + i + '" placeholder="物品名を入力" aria-label="物品名 ' + (i + 1) + '行目">');
        // エラー表示中の行なら、出てきた物品名の欄も最初からエラー扱いにする（赤字は clearErr で書き直す）
        if ($('物品_' + i).closest('.exp-item').classList.contains('exp-bad')) {
          $('自由入力_' + i).classList.add('exp-bad-in'); $('自由入力_' + i).dataset.err = 'need';
        }
        $('自由入力_' + i).focus();
      } else if (!on && cur) cur.remove();
    }
    $('add').addEventListener('click', function () {
      collect(); rows.push({});
      $('items').insertAdjacentHTML('beforeend', rowHtml({}, rows.length - 1));
      $('物品_' + (rows.length - 1)).focus();
    });
    // 参考アプリと同じく「削除」は最後の行を消す。1行は残す
    $('del').addEventListener('click', function () {
      if (rows.length <= 1) { toast('物品は1行以上必要です'); return; }
      collect(); rows.pop();
      var items = $('items'); items.removeChild(items.lastElementChild);
      updateTotal(); refreshFormErr();
    });

    // ---------- エラー表示（項目の下に赤字） ----------
    function clearErr(el) {
      var f = el && el.closest && el.closest('.exp-field, .exp-item');
      if (!f || !f.classList.contains('exp-bad')) return;
      // 物品の行は、触った欄の赤枠だけ外し、残っている欄があれば赤字をその欄だけで書き直す
      if (f.classList.contains('exp-item')) {
        el.classList.remove('exp-bad-in');
        var left = f.querySelectorAll('.exp-bad-in');
        if (left.length) { setRowMsg(f, left); return; }
      }
      f.classList.remove('exp-bad');
      var p = f.querySelector(':scope > .exp-err'); if (p) { p.hidden = true; p.textContent = ''; }
      refreshFormErr();
    }
    // 送信ボタン上の「入力を確認してください（N件）」を、残っているエラーの数に合わせる
    function refreshFormErr() {
      var n = form.querySelectorAll('.exp-bad').length;
      $('formerr').hidden = !n;
      if (n) $('formerr').textContent = '入力を確認してください（' + n + '件）';
    }
    function showErr(key, msg) {
      var p = $('err-' + key); if (!p) return;
      p.textContent = msg; p.hidden = false;
      p.parentNode.classList.add('exp-bad');
    }
    var FIELD_NAME = { 物品: '物品', 自由入力: '物品名', 個数: '個数', 金額: '金額' };
    function setRowMsg(row, bads) {
      var i = Number(row.dataset.i), need = [], intErr = false;
      Array.prototype.forEach.call(bads, function (el) {
        if (el.dataset.err === 'int') intErr = true; else need.push(FIELD_NAME[el.id.replace(/^exp-|_\d+$/g, '')]);
      });
      var ORDER = ['物品', '物品名', '個数', '金額'];
      need.sort(function (a, b) { return ORDER.indexOf(a) - ORDER.indexOf(b); });
      var msg = (need.length ? need.join('・') + 'を入れてください' : '') + (intErr ? (need.length ? '。' : '') + '個数は1以上の整数で入れてください' : '');
      showErr('物品_' + i, (rows.length > 1 ? (i + 1) + '行目：' : '') + msg);
    }
    function resetErrs() {
      form.querySelectorAll('.exp-bad-in').forEach(function (f) { f.classList.remove('exp-bad-in'); delete f.dataset.err; });
      form.querySelectorAll('.exp-bad').forEach(function (f) { f.classList.remove('exp-bad'); });
      form.querySelectorAll('.exp-err').forEach(function (p) { p.hidden = true; p.textContent = ''; });
      $('formerr').hidden = true;
    }

    function readData() {
      collect();
      return {
        対象日: $('対象日').value, 小口先出: $('小口先出').value, 経費区分: $('経費区分').value,
        物品: rows.map(function (r) {
          var it = { 物品: r.物品 || '', 個数: r.個数 === '' || r.個数 === undefined ? '' : Number(r.個数), 金額: r.金額 === '' || r.金額 === undefined ? '' : Number(r.金額) };
          if (r.物品 === 'フリー入力') it.自由入力 = (r.自由入力 || '').trim();
          return it;
        }),
        備考: $('備考').value.trim()
      };
    }
    function validate(d) {
      var n = 0;
      if (!d.小口先出) { showErr('小口先出', '小口先出を選んでください'); n++; }
      if (d.小口先出 && !d.対象日) { showErr('対象日', '対象日を入れてください'); n++; }
      if (!d.経費区分) { showErr('経費区分', '経費区分を選んでください'); n++; }
      d.物品.forEach(function (it, i) {
        var bad = function (k, kind) { var el = $(k + '_' + i); if (el) { el.classList.add('exp-bad-in'); el.dataset.err = kind || 'need'; } };
        if (!it.物品) bad('物品');
        else if (it.物品 === 'フリー入力' && !it.自由入力) bad('自由入力');
        if (it.個数 === '') bad('個数');
        else if (!(it.個数 > 0 && Math.floor(it.個数) === it.個数)) bad('個数', 'int');
        if (it.金額 === '' || !(it.金額 >= 0)) bad('金額');
        var row = $('items').children[i], left = row.querySelectorAll('.exp-bad-in');
        if (left.length) { setRowMsg(row, left); n++; }
      });
      return n;
    }

    // ---------- 送信 → 確認 → 送信中 → 完了 ----------
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      resetErrs();
      var d = readData();
      var n = validate(d);
      if (n) {
        $('formerr').textContent = '入力を確認してください（' + n + '件）';
        $('formerr').hidden = false;
        var first = form.querySelector('.exp-bad');
        if (first) { first.scrollIntoView({ block: 'center' }); var f = first.querySelector('select, input, textarea'); if (f && !f.disabled) f.focus({ preventScroll: true }); }
        return;
      }
      showConfirm(d);
    });

    function showConfirm(d) {
      var sum = d.物品.reduce(function (a, it) { return a + Number(it.金額 || 0); }, 0);
      var lines = d.物品.map(function (it) {
        return '<li><span>' + esc(it.物品 === 'フリー入力' ? it.自由入力 : it.物品) + ' × ' + esc(it.個数) + '</span><span>' + esc(yen(it.金額)) + '</span></li>';
      }).join('');
      form.hidden = true;
      after.innerHTML =
        '<section class="card exp-card exp-confirm" aria-labelledby="exp-cf-h">' +
          '<h2 id="exp-cf-h" class="exp-cf-h">この内容で送信しますか？</h2>' +
          '<dl class="exp-dl">' +
            '<dt>申請者</dt><dd>' + esc(state.me && state.me.氏名) + '</dd>' +
            '<dt>小口先出</dt><dd>' + esc(d.小口先出) + '</dd>' +
            '<dt>対象日</dt><dd>' + esc(d.対象日) + '</dd>' +
            '<dt>施設名</dt><dd>' + esc($('施設名').value) + '</dd>' +
            '<dt>経費区分</dt><dd>' + esc(d.経費区分) + '</dd>' +
            '<dt>物品</dt><dd><ul class="exp-lines">' + lines + '<li class="exp-sum"><span>合計</span><span>' + esc(yen(sum)) + '</span></li></ul></dd>' +
            '<dt>備考</dt><dd>' + (d.備考 ? esc(d.備考) : '<span class="exp-none">なし</span>') + '</dd>' +
          '</dl>' +
          '<div class="exp-senderr" id="exp-senderr" role="alert" hidden></div>' +
        '</section>' +
        '<div class="exp-actions">' +
          '<button type="button" class="exp-send" id="exp-go">この内容で送信</button>' +
          '<button type="button" class="exp-back" id="exp-fix">戻って直す</button>' +
        '</div>';
      window.scrollTo(0, 0);
      $('fix').addEventListener('click', function () { after.innerHTML = ''; form.hidden = false; window.scrollTo(0, 0); });
      $('go').addEventListener('click', function () { send(d); });
      $('go').focus({ preventScroll: true });
    }

    function send(d) {
      var go = $('go'), fix = $('fix'), box = $('senderr');
      go.disabled = true; fix.disabled = true; box.hidden = true;
      go.innerHTML = '<span class="exp-spin" aria-hidden="true"></span>送信中…';
      go.setAttribute('aria-busy', 'true');
      if (I.busy) I.busy(true); // 送信中は画面全体をぼかして「読み込み中・・・」（core.js）
      api('submitExpense', d).then(function (res) {
        if (I.busy) I.busy(false); // 完了カードを同じ画面に出すので自分で消す
        showDone(res || {});
        toast('送信しました');
      }).catch(function (e) {
        if (I.busy) I.busy(false);
        go.disabled = false; fix.disabled = false; go.textContent = 'もう一度送信する'; go.removeAttribute('aria-busy');
        var list = e && e.details && e.details.length ? e.details : [];
        box.innerHTML = '<strong>' + esc((e && e.message) || '送信できませんでした') + '</strong>' +
          (list.length ? '<ul>' + list.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p>通信の状態を確かめて、もう一度送信してください。</p>');
        box.hidden = false;
      });
    }

    function showDone(res) {
      after.innerHTML =
        '<section class="card exp-card exp-done" aria-labelledby="exp-done-h">' +
          '<svg class="exp-done-ic" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21"/><path d="M14 24.5l7 7 13-14"/></svg>' +
          '<h2 id="exp-done-h">経費申請を送信しました</h2>' +
          '<p class="exp-done-id">申請番号 ' + esc(res.申請ID || '—') + '</p>' +
          (res.状態 ? '<p>' + I.pill(res.状態) + '</p>' : '') +
          '<p class="exp-done-note">承認されると「自分の申請」の状態が変わります。</p>' +
        '</section>' +
        '<div class="exp-actions">' +
          '<a class="exp-send" href="#requests">自分の申請を見る</a>' +
          '<button type="button" class="exp-back" id="exp-again">続けて経費申請する</button>' +
          (I.backHtml ? I.backHtml('#apply') : '') +
        '</div>';
      window.scrollTo(0, 0);
      $('done-h').setAttribute('tabindex', '-1'); $('done-h').focus();
      $('again').addEventListener('click', viewExpense);
    }
  }

  I.views.expense = viewExpense;
})();
