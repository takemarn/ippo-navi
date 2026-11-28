/* 経費申請の画面（#expense）
   参考アプリの並び: 申請者 → 小口先出 → 対象日 → 施設名 → 経費区分 → 物品（追加/削除） → 備考、カードの外に「送信」。
   送信の流れ: 送信 → 入力チェック（項目の下に赤字） → ページ内の確認カード → 送信中 → 完了カード。
   GAS に送る data: {対象日, 小口先出, 施設名, 経費区分, 物品: [{物品, 自由入力?, 個数, 金額}], 備考?, 送信ID}
     施設名 = 選んだ施設（options.施設 のどれか）、送信ID = 確認カードを出すときに作る文字（同じIDの2回目は GAS が前の返事を返す＝二重登録しない）。
   入力の決まり: 対象日は今日まで（先の日付は不可）。個数は1〜9999の整数、金額は0〜100万円の整数（1.5 や 1e3、マイナスは不可）。
   差し戻された申請の「出し直す」（views/requests.js）から来たときは、sessionStorage の ippo.redo に入れた明細で入力を埋めて開く。 */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, state = I.state, api = I.api, esc = I.esc, today = I.today, yen = I.yen, toast = I.toast;

  // 施設名は options.施設 から（無ければ モア一津屋）。表示と確認のためだけで、送るデータには入れない（GAS の形を変えないため）。
  // 1つだけなら最初から選んでおく。2つ以上なら参考アプリと同じく空から選ぶ
  function facilities() { var f = state.options && state.options.施設; return f && f.length ? f : ['モア一津屋']; }
  // 'YYYY-MM-DD' → '2026年11月28日（土）'。確認カードで日付の読み間違いを防ぐ
  function fmtDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
    if (!m) return v || '';
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return m[1] + '年' + Number(m[2]) + '月' + Number(m[3]) + '日（' + '日月火水木金土'.charAt(d.getDay()) + '）';
  }

  // 小口先出は社内の言葉で、パートの職員には分かりにくい。選ぶ欄と確認では「何のお金で払ったか」を添えて見せる
  // （送る値は 小口／先出 のまま。GAS の形は変えない。知らない値はそのまま出す）
  var PAY_LABEL = { 小口: '小口（施設の小口現金で払った）', 先出: '先出（自分のお金で立て替えた）' };
  function payLabel(v) { return PAY_LABEL[v] || v; }
  // 空行を先頭に置くセレクト（参考アプリと同じく、未選択は空）。label があれば見せる文字だけ変える（value は元のまま）
  function sel(id, list, value, first, disabled, label) {
    return '<select id="' + id + '"' + (disabled ? ' disabled' : '') + '>' +
      (first === null ? '' : '<option value="">' + esc(first || '') + '</option>') +
      list.map(function (v) {
        return '<option' + (label ? ' value="' + esc(v) + '"' : '') + (v === value ? ' selected' : '') + '>' + esc(label ? label(v) : v) + '</option>';
      }).join('') +
      '</select>';
  }
  function head(forId, label, req, extra) {
    return '<div class="exp-lab"><label for="' + forId + '">' + label + '</label>' + (extra || '') +
      '<span class="' + (req ? 'exp-req">(必須)' : 'exp-opt">(任意)') + '</span></div>';
  }
  var MAX_YEN = 1000000, MAX_QTY = 9999; // GAS の validateExpense と同じ上限
  var isInt = function (v) { return /^\d+$/.test(String(v === undefined || v === null ? '' : v).trim()); };
  // 差し戻された申請の出し直し: requests.js が sessionStorage に置いた中身を1回だけ取り出す（種類が違えば使わない）
  // 送信ID: 確認カードを出すときに作るランダムな文字。GAS は同じ送信IDの2回目には前の返事を返す（二重登録しない）。
  // 「もう一度送信する」では同じIDを使い、入力に戻って直したら次の確認で作り直す
  function newSendId() {
    try {
      var a = new Uint8Array(16); crypto.getRandomValues(a);
      return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    } catch (_) { return Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
  }
  function takeRedo(type) {
    try {
      var r = JSON.parse(sessionStorage.getItem('ippo.redo') || 'null');
      if (!r || r.種類 !== type) return null;
      sessionStorage.removeItem('ippo.redo'); return r;
    } catch (_) { return null; }
  }
  function field(key, inner) {
    return '<div class="exp-field" data-f="' + key + '">' + inner + '<p class="exp-err" id="exp-err-' + key + '" hidden></p></div>';
  }

  function viewExpense() {
    var o = state.options || {};
    var goods = (o.物品 || []).slice();
    if (goods.indexOf('フリー入力') < 0) goods.unshift('フリー入力');
    var rows = [{}];
    var FACILITIES = facilities(), oneFac = FACILITIES.length === 1;
    var redo = takeRedo('経費'), rd = redo && (redo.明細 || [])[0] || {};
    if (redo && (redo.明細 || []).length) {
      rows = redo.明細.map(function (x) {
        var name = x.物品 === 'フリー入力' ? (x.自由入力 || '') : (x.物品 || ''), known = goods.indexOf(name) >= 0 && name !== 'フリー入力';
        return { 物品: known ? name : 'フリー入力', 自由入力: known ? '' : name, 個数: x.個数, 金額: x.金額 };
      });
    }

    app.innerHTML =
      '<h1 class="exp-title">経費申請</h1>' +
      (redo ? '<div class="exp-redo" role="note"><b>差し戻された申請を出し直します</b>' +
        '<span>前の内容を入れてあります。下の理由のところを直して、「内容を確認する」を押してください。</span>' +
        (redo.コメント ? '<span class="exp-redo-why">差戻しの理由：' + esc(redo.コメント) + '</span>' : '') + '</div>' : '') +
      '<div id="exp-stage">' +
      '<form id="exp-form" class="exp-form" novalidate>' +
        '<div class="card exp-card">' +
          field('申請者', head('exp-申請者', '申請者', true) +
            '<input id="exp-申請者" value="' + esc(state.me && state.me.氏名) + '" readonly aria-readonly="true">') +
          field('小口先出', head('exp-小口先出', '小口先出', true) + sel('exp-小口先出', o.小口先出 || [], redo && (redo.小口先出 || rd.小口先出), '選んでください', false, payLabel).replace('<select', '<select aria-describedby="exp-小口先出-hint"') +
            '<p class="exp-hint" id="exp-小口先出-hint">何のお金で払ったかを選びます。自分のお金で立て替えたときは「先出」です。</p>') +
          // 参考アプリと同じく、小口先出を選ぶまで対象日は使えない。先の日付は選べない（max）。使えない間は理由を下に出す
          field('対象日', head('exp-対象日', '対象日', true) + '<input type="date" id="exp-対象日" value="' + esc(rd.対象日 || today()) + '" max="' + today() + '" disabled aria-describedby="exp-対象日-hint">' +
            '<p class="exp-hint" id="exp-対象日-hint">買った日（お金を払った日）を入れます。先に「小口先出」を選ぶと入れられます。</p>') +
          field('施設名', head('exp-施設名', '施設名', true) + (oneFac ? sel('exp-施設名', FACILITIES, FACILITIES[0], null) : sel('exp-施設名', FACILITIES, '').replace('<select', '<select class="exp-empty"'))) +
          field('経費区分', head('exp-経費区分', '経費区分', true) + sel('exp-経費区分', o.経費区分 || [], rd.経費区分, '選んでください')) +
          '<div class="exp-field" data-f="物品">' +
            '<div class="exp-lab"><span class="exp-lab-name" id="exp-物品-lab">物品</span>' +
              // 「削除」が何を消すのか分かるよう、読み上げ名で補う（見た目は参考アプリと同じ短い名前）
              '<button type="button" class="exp-pill exp-add" id="exp-add" aria-label="物品の行を追加">＋ 追加</button>' +
              '<button type="button" class="exp-pill exp-del" id="exp-del" aria-label="最後の物品の行を削除">－ 削除</button>' +
              '<span class="exp-req">(必須)</span></div>' +
            '<div id="exp-items" class="exp-items" role="group" aria-labelledby="exp-物品-lab"></div>' +
            '<p class="exp-total" id="exp-total" hidden></p>' +
            '<p class="exp-hint">物品が2つ以上なら「＋ 追加」で行を増やします（「－ 削除」は最後の行を消す）。金額は個数ぶんの合計です。</p>' +
          '</div>' +
          field('備考', head('exp-備考', '備考', false) + '<textarea id="exp-備考">' + esc(redo && (redo.備考 || rd.備考) || '') + '</textarea>') +
        '</div>' +
        '<p class="exp-formerr" id="exp-formerr" role="alert" hidden></p>' +
        // 押すとすぐ送られるのではなく、まず確認カードが出る。そのことが分かる名前にした（前は「送信」）
        '<button type="submit" class="exp-send">内容を確認する</button>' +
        (I.backHtml ? I.backHtml('#apply') : '') +
      '</form>' +
      '<div id="exp-after"></div>' +
      '</div>';

    var form = document.getElementById('exp-form');
    var after = document.getElementById('exp-after');
    function $(id) { return document.getElementById('exp-' + id); }

    // ---------- ブラウザ（スマホ）の「戻る」 ----------
    // 確認カードを出すときに履歴を1つ積んである。戻るを押すと、書いた内容のまま入力に戻る（「戻って直す」も同じ動き）。
    // 完了カードで戻ると #apply へ（同じ申請をうっかり出し直さないように）。送信中の戻るは何もしない
    var leaving = false;
    function backToForm() { after.innerHTML = ''; form.hidden = false; window.scrollTo(0, 0); }
    function fixTap() {
      if (history.state && history.state.ippoStep === 'confirm') history.back(); // popstate → onPop → backToForm
      else backToForm();
    }
    function onPop() {
      if (leaving || !document.getElementById('exp-form')) return;
      if ($('done-h')) { leaving = true; location.replace('#apply'); return; }
      if (form.hidden && $('go') && !$('go').disabled) backToForm();
    }
    window.addEventListener('popstate', onPop);
    I.cleanup.push(function () { window.removeEventListener('popstate', onPop); });
    // 「続けて…する」: 画面の切り替え（core の route）と同じく、後片付けをして番号を進めてから描き直す
    function restart() {
      I.cleanup.splice(0).forEach(function (f) { try { f(); } catch (_) {} });
      I.gen = (I.gen || 0) + 1;
      viewExpense();
    }

    // ---------- 物品の行 ----------
    // 1行ぶんの HTML。行の追加・削除・フリー入力の出し入れは、その行だけを変える（他の行のエラー表示を消さないため）
    function rowHtml(r, i) {
        var free = r.物品 === 'フリー入力';
        return '<div class="exp-item" data-i="' + i + '">' +
          '<div class="exp-item-row">' +
            sel('exp-物品_' + i, goods, r.物品, '物品').replace('<select', '<select aria-label="物品 ' + (i + 1) + '行目"' + (r.物品 ? '' : ' class="exp-empty"')) +
            // 物品（と物品名）は1行全部を使い、個数と金額は次の行に並べる（幅320pxでも文字が切れないように）
            (free ? '<input class="exp-free" id="exp-自由入力_' + i + '" placeholder="物品名を入力" aria-label="物品名 ' + (i + 1) + '行目" value="' + esc(r.自由入力 || '') + '">' : '') +
            // 個数・金額は、数を入れたあとも何の欄か分かるよう右端に「個」「円」を出す（exp-unit）
            '<span class="exp-unit" data-u="個"><input type="number" inputmode="numeric" min="1" max="' + MAX_QTY + '" step="1" id="exp-個数_' + i + '" placeholder="個数" aria-label="個数 ' + (i + 1) + '行目" value="' + esc(r.個数 || '') + '"></span>' +
            '<span class="exp-unit" data-u="円"><input type="number" inputmode="numeric" min="0" max="' + MAX_YEN + '" step="1" id="exp-金額_' + i + '" placeholder="金額" aria-label="金額（円） ' + (i + 1) + '行目" value="' + esc(r.金額 === undefined || r.金額 === null ? '' : r.金額) + '"></span>' +
          '</div>' +
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
      // 合計に入れるのは正しい金額（0以上の整数）だけ。マイナスや小数が入っている行は合計から外し、そう書く
      var sum = 0, any = false, bad = 0;
      rows.forEach(function (_, i) {
        var el = $('金額_' + i); if (!el || (el.value === '' && !(el.validity && el.validity.badInput))) return;
        any = true; if (isInt(el.value) && Number(el.value) <= MAX_YEN) sum += Number(el.value); else bad++;
      });
      $('total').hidden = !any;
      $('total').textContent = rows.length + '件　合計 ' + yen(sum) + (bad ? '（正しくない金額 ' + bad + '件を除く）' : '');
    }
    drawItems();

    // ---------- 入力に応じた切り替え ----------
    function syncDate() {
      var on = !!$('小口先出').value;
      $('対象日').disabled = !on;
      $('対象日').closest('.exp-field').classList.toggle('exp-off', !on);
      $('対象日-hint').textContent = on ? '買った日（お金を払った日）を入れます。今日より後の日は選べません。' : '買った日（お金を払った日）を入れます。先に「小口先出」を選ぶと入れられます。';
    }
    syncDate();
    // まだ選んでいない欄は「選んでください」を薄い字で（選ぶと濃くなる。change で切り替え）
    ['小口先出', '経費区分'].forEach(function (k) { $(k).classList.toggle('exp-empty', !$(k).value); });

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
        $('物品_' + i).insertAdjacentHTML('afterend',
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
    // 入っていない欄（need）と、入っているが決まりに合わない欄（qty=個数 / yen=金額）で文を分ける
    var KIND_MSG = { qty: '個数は1〜' + MAX_QTY + 'の整数で入れてください', yen: '金額は0円以上・' + yen(MAX_YEN) + 'までの整数（円）で入れてください' };
    function setRowMsg(row, bads) {
      var i = Number(row.dataset.i), need = [], kinds = [];
      Array.prototype.forEach.call(bads, function (el) {
        var k = el.dataset.err;
        if (KIND_MSG[k]) { if (kinds.indexOf(k) < 0) kinds.push(k); } else need.push(FIELD_NAME[el.id.replace(/^exp-|_\d+$/g, '')]);
      });
      var ORDER = ['物品', '物品名', '個数', '金額'];
      need.sort(function (a, b) { return ORDER.indexOf(a) - ORDER.indexOf(b); });
      kinds.sort();
      var msg = (need.length ? [need.join('・') + 'を入れてください'] : []).concat(kinds.map(function (k) { return KIND_MSG[k]; })).join('。');
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
        対象日: $('対象日').value, 小口先出: $('小口先出').value, 施設名: $('施設名').value, 経費区分: $('経費区分').value,
        物品: rows.map(function (r) {
          // 決まりに合わない値は文字のまま残す（validate で見分ける）。正しい値だけ数にして送る
          var num = function (v) { return v === '' || v === undefined ? '' : isInt(v) ? Number(v) : String(v); };
          var it = { 物品: r.物品 || '', 個数: num(r.個数), 金額: num(r.金額) };
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
      else if (d.小口先出 && d.対象日 > today()) { showErr('対象日', '対象日は今日より後にできません（使った日を入れてください）'); n++; }
      if (!$('施設名').value) { showErr('施設名', '施設名を選んでください'); n++; }
      if (!d.経費区分) { showErr('経費区分', '経費区分を選んでください'); n++; }
      d.物品.forEach(function (it, i) {
        var bad = function (k, kind) { var el = $(k + '_' + i); if (el) { el.classList.add('exp-bad-in'); el.dataset.err = kind || 'need'; } };
        if (!it.物品) bad('物品');
        else if (it.物品 === 'フリー入力' && !it.自由入力) bad('自由入力');
        // type=number の欄は、数として読めない文字だと value が空になる（badInput）。その時は「決まりに合わない」として扱う
        var raw = function (k) { var el = $(k + '_' + i); return el && el.validity && el.validity.badInput; };
        if (it.個数 === '' && !raw('個数')) bad('個数');
        else if (typeof it.個数 !== 'number' || it.個数 < 1 || it.個数 > MAX_QTY) bad('個数', 'qty');
        if (it.金額 === '' && !raw('金額')) bad('金額');
        else if (typeof it.金額 !== 'number' || it.金額 > MAX_YEN) bad('金額', 'yen');
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
        return '<li><span>' + esc(it.物品 === 'フリー入力' ? it.自由入力 : it.物品) + ' <span class="exp-qty">× ' + esc(it.個数) + '</span></span><span>' + esc(yen(it.金額)) + '</span></li>';
      }).join('');
      form.hidden = true;
      d.送信ID = newSendId();
      try { history.pushState({ ippoStep: 'confirm' }, ''); } catch (_) {} // ブラウザの「戻る」で入力に戻れるように
      after.innerHTML =
        '<section class="card exp-card exp-confirm" aria-labelledby="exp-cf-h">' +
          '<h2 id="exp-cf-h" class="exp-cf-h">この内容で送信しますか？</h2>' +
          '<dl class="exp-dl">' +
            '<dt>申請者</dt><dd>' + esc(state.me && state.me.氏名) + '</dd>' +
            '<dt>小口先出</dt><dd>' + esc(payLabel(d.小口先出)) + '</dd>' +
            '<dt>対象日</dt><dd>' + esc(fmtDate(d.対象日)) + '</dd>' +
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
      $('fix').addEventListener('click', fixTap);
      $('go').addEventListener('click', function () { send(d); });
      $('go').focus({ preventScroll: true });
    }

    function send(d) {
      var go = $('go'), fix = $('fix'), box = $('senderr');
      go.disabled = true; fix.disabled = true; box.hidden = true;
      go.innerHTML = '<span class="exp-spin" aria-hidden="true"></span>送信中…';
      go.setAttribute('aria-busy', 'true');
      if (I.busy) I.busy(true); // 送信中は画面全体をぼかして「読み込み中・・・」（core.js）
      var g = I.gen; // 送信中に別の画面へ移ったら、結果は画面に書かない
      api('submitExpense', d).then(function (res) {
        if (I.busy) I.busy(false); // 完了カードを同じ画面に出すので自分で消す
        if (g !== I.gen) { toast('経費申請を送信しました'); return; }
        showDone(res || {}, d);
        toast('送信しました');
      }).catch(function (e) {
        if (I.busy) I.busy(false);
        if (g !== I.gen) { toast((e && e.message) || '送信できませんでした'); return; }
        go.disabled = false; fix.disabled = false; go.textContent = 'もう一度送信する'; go.removeAttribute('aria-busy');
        var list = e && e.details && e.details.length ? e.details : [];
        box.innerHTML = '<strong>' + esc((e && e.message) || '送信できませんでした') + '</strong>' +
          (list.length ? '<ul>' + list.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p>通信の状態を確かめて、もう一度送信してください。</p>');
        box.hidden = false;
      });
    }

    function showDone(res, d) {
      try { if (history.state && history.state.ippoStep === 'confirm') history.replaceState({ ippoStep: 'done' }, ''); } catch (_) {}
      var sum = d.物品.reduce(function (a, it) { return a + Number(it.金額 || 0); }, 0);
      after.innerHTML =
        '<section class="card exp-card exp-done" aria-labelledby="exp-done-h">' +
          '<svg class="exp-done-ic" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21"/><path d="M14 24.5l7 7 13-14"/></svg>' +
          '<h2 id="exp-done-h">経費申請を送信しました</h2>' +
          '<p class="exp-done-sum">' + esc(fmtDate(d.対象日)) + '　' + esc(d.経費区分) + '　' + d.物品.length + '件　合計 ' + esc(yen(sum)) + '</p>' +
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
      $('again').addEventListener('click', restart);
    }
  }

  I.views.expense = viewExpense;
})();
