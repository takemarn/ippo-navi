/* タスク管理のメニュー（#task）と「施設→本部事務」の依頼フォーム（#task-office）。参考動画 1:32〜1:48
   並び: 担当者 → 施設名 → 利用者名（かな で絞り込み＋選択） → 保険種類 → 生活保護 → タスク → 日程（期間） → 日程 → 時間
         → 訪問看護指示書変更 → 期間 → 状態 → 備考、カードの外に「送信」。
   参考アプリと同じく、タスクを選ぶまで日程から下は使えない。日程は タスクによって「1日」か「期間」のどちらか（dateMode）。
   特指示のときだけ 訪問看護指示書変更・期間・状態 が使え、そのときは必須。
   送ると「タスク」の申請になり、承認待ち一覧・自分の申請に出る（中身の表示は views/clients.js の I.bodyLines）。
   GAS: submitTask（決まりは kiroku-app の docs/api.md）。利用者の候補は searchClients で取る */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, state = I.state, api = I.api, esc = I.esc, toast = I.toast;

  I.views.task = function () { I.subMenu([{ label: '施設→本部事務', href: '#task-office' }, { label: '介護タスク' }]); };

  // ひらがな・カタカナ・空白の違いを無視して比べる（GAS の normName と同じ考え方）
  function norm(t) {
    return String(t || '').replace(/[\s\u3000]/g, '').replace(/[\u3041-\u3096]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) + 0x60); });
  }
  function $(id) { return document.getElementById('tk-' + id); }
  function head(id, label, req) {
    return '<div class="exp-lab"><label for="tk-' + id + '">' + esc(label) + '</label>' +
      '<span class="' + (req ? 'exp-req">(必須)' : 'exp-opt">(任意)') + '</span></div>';
  }
  function field(key, inner) { return '<div class="exp-field" data-f="' + key + '">' + inner + '</div>'; }
  // タスクごとに、日程を「1日」で入れるか「期間」で入れるか。参考動画で確かめられたのは 新入居 施設（1日）だけで、
  // 期間にしたもの（点滴・訪問スケジュール入力）は推測。違っていたらここを直す（GAS の validateTask はどちらでも受け付ける）
  var SPAN_TASKS = ['点滴', '訪問スケジュール入力'];
  function dateMode(kind) { return !kind ? '' : SPAN_TASKS.indexOf(kind) >= 0 ? 'span' : 'day'; }
  function sel(id, list, first) {
    return '<select id="tk-' + id + '"><option value="">' + esc(first || '') + '</option>' +
      list.map(function (v) { return '<option>' + esc(v) + '</option>'; }).join('') + '</select>';
  }
  function toggles(id, list) {
    return '<div class="tk-tog" id="tk-' + id + '" role="group" aria-labelledby="tk-' + id + '-lab">' + list.map(function (v) {
      return '<button type="button" aria-pressed="false" data-v="' + esc(v) + '">' + esc(v) + '</button>';
    }).join('') + '</div>';
  }
  function range(id) {
    return '<div class="tk-row"><input type="date" id="tk-' + id + '-from" aria-label="始まり"><span aria-hidden="true">〜</span>' +
      '<input type="date" id="tk-' + id + '-to" aria-label="終わり"></div>';
  }
  function timeRange() {
    return '<div class="tk-row"><input type="time" id="tk-time-from" aria-label="開始時刻"><span aria-hidden="true">〜</span>' +
      '<input type="time" id="tk-time-to" aria-label="終了時刻"></div>';
  }

  function viewOffice() {
    var o = state.options || {}, facs = (state.me && state.me.見られる施設) || o.施設 || ['モア一津屋'];
    var clients = [];
    app.innerHTML =
      '<h1 class="exp-title">施設→本部事務</h1>' +
      '<div id="tk-stage"><form id="tk-form" class="exp-form" novalidate><div class="card exp-card">' +
        field('担当者', head('who', '担当者', true) + '<input id="tk-who" value="' + esc(state.me && state.me.氏名) + '" readonly aria-readonly="true">') +
        field('施設名', head('fac', '施設名', true) + sel('fac', facs)) +
        field('利用者名', head('client', '利用者名', true) +
          '<div class="tk-name"><input id="tk-kana" placeholder="かな" aria-label="利用者名を かな で絞り込む" autocomplete="off">' +
          '<select id="tk-client" disabled><option value="">施設名を先に選んでください</option></select></div>') +
        field('保険種類', '<div class="exp-lab"><span class="exp-lab-name" id="tk-ins-lab">保険種類</span><span class="exp-req">(必須)</span></div>' + toggles('ins', ['介護保険', '医療保険'])) +
        field('生活保護', '<div class="exp-lab"><span class="exp-lab-name" id="tk-wel-lab">生活保護</span><span class="exp-req">(必須)</span></div>' + toggles('wel', ['有', '無', '確認中'])) +
        field('タスク', head('kind', 'タスク', true) + sel('kind', o.タスク種類 || [])) +
        '<div class="exp-field exp-off" data-f="日程期間" data-need="span"><div class="exp-lab"><label for="tk-span-from">日程（期間）</label><span class="exp-req">(必須)</span></div>' + range('span') + '</div>' +
        '<div class="exp-field exp-off" data-f="日程" data-need="day">' + head('day', '日程', true) + '<input type="date" id="tk-day"></div>' +
        '<div class="exp-field exp-off" data-f="時間" data-need="any"><div class="exp-lab"><label for="tk-time-from">時間</label><span class="exp-opt">(任意)</span></div>' + timeRange() + '</div>' +
        '<div class="exp-field exp-off" data-f="指示書" data-need="special">' + head('order', '訪問看護指示書変更', true) + sel('order', ['有', '無']) + '</div>' +
        '<div class="exp-field exp-off" data-f="期間" data-need="special"><div class="exp-lab"><label for="tk-term-from">期間</label><span class="exp-req">(必須)</span></div>' + range('term') + '</div>' +
        '<div class="exp-field exp-off" data-f="状態" data-need="special">' + head('state', '状態', true) + '<input id="tk-state" placeholder="例: 状態に変化あり"></div>' +
        field('備考', head('memo', '備考', false) + '<textarea id="tk-memo"></textarea>') +
      '</div>' +
      '<div id="tk-err"></div>' +
      '<button type="submit" class="exp-send">送信</button>' +
      I.backHtml('#task', 'タスク管理に戻る') +
      '</form><div id="tk-after"></div></div>';

    var form = $('form');
    // タスクを選ぶまで日程から下は使えない（参考アプリと同じ）
    function syncKind() {
      var k = $('kind').value, mode = dateMode(k), special = k.indexOf('特指示') === 0;
      form.querySelectorAll('[data-need]').forEach(function (box) {
        var n = box.dataset.need;
        var on = n === 'any' ? !!k : n === 'special' ? special : n === mode;
        box.classList.toggle('exp-off', !on);
        box.querySelectorAll('input, select').forEach(function (x) { x.disabled = !on; });
      });
    }
    syncKind();
    $('kind').addEventListener('change', syncKind);

    // 利用者の候補（施設名を選ぶと読み込む。かな で絞り込み）
    function fillClients() {
      var s = $('client'), kana = norm($('kana').value);
      var list = clients.filter(function (c) { return !kana || norm(c.ふりがな).indexOf(kana) >= 0 || norm(c.氏名).indexOf(kana) >= 0; });
      var msg = !$('fac').value ? '施設名を先に選んでください' : !clients.length ? 'この施設の利用者はいません' : list.length ? '選んでください' : '見つかりません';
      s.innerHTML = '<option value="">' + msg + '</option>' +
        list.map(function (c) { return '<option value="' + esc(c.利用者ID) + '">' + esc(c.利用者ID + ' ' + c.氏名) + '</option>'; }).join('');
      s.disabled = !list.length;
    }
    $('fac').addEventListener('change', function () {
      clients = []; fillClients();
      var fac = $('fac').value;
      if (!fac) return;
      $('client').innerHTML = '<option value="">読み込み中…</option>';
      api('searchClients', { 施設: [fac], 氏名: '', ステータス: ['居住中', '入院中'] }).then(function (r) {
        if ($('fac') && $('fac').value === fac) { clients = r.一覧 || []; fillClients(); }
      }).catch(function (e) { if ($('client')) $('client').innerHTML = '<option value="">' + esc(e.message || '読み込めませんでした') + '</option>'; });
    });
    $('kana').addEventListener('input', fillClients);
    if (facs.length === 1) { $('fac').value = facs[0]; $('fac').dispatchEvent(new Event('change')); }

    form.addEventListener('click', function (e) {
      var b = e.target.closest('.tk-tog button');
      if (!b) return;
      b.parentNode.querySelectorAll('button').forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
    });
    function picked(id) { var b = $(id).querySelector('button.on'); return b ? b.dataset.v : ''; }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = {
        施設名: $('fac').value, 利用者ID: $('client').value, 保険種類: picked('ins'), 生活保護: picked('wel'), タスク: $('kind').value,
        日程開始: $('span-from').value, 日程終了: $('span-to').value, 日程: $('day').value,
        時間開始: $('time-from').value, 時間終了: $('time-to').value,
        訪問看護指示書変更: $('order').disabled ? '' : $('order').value,
        期間開始: $('term-from').disabled ? '' : $('term-from').value, 期間終了: $('term-to').disabled ? '' : $('term-to').value,
        状態: $('state').disabled ? '' : $('state').value.trim(), 備考: $('memo').value.trim()
      };
      var errs = [];
      if (!d.施設名) errs.push('施設名を選んでください');
      if (!d.利用者ID) errs.push('利用者名を選んでください');
      if (!d.保険種類) errs.push('保険種類を選んでください');
      if (!d.生活保護) errs.push('生活保護を選んでください');
      if (!d.タスク) errs.push('タスクを選んでください');
      else {
        if (dateMode(d.タスク) === 'span') {
          d.日程 = '';
          if (!d.日程開始 || !d.日程終了) errs.push('日程（期間）の始まりと終わりを入れてください');
          else if (d.日程開始 > d.日程終了) errs.push('日程（期間）の終わりは始まりより後にしてください');
        } else {
          d.日程開始 = ''; d.日程終了 = '';
          if (!d.日程) errs.push('日程を入れてください');
        }
        if (d.タスク.indexOf('特指示') === 0) {
          if (!d.訪問看護指示書変更) errs.push('訪問看護指示書変更を選んでください');
          if (!d.期間開始 || !d.期間終了) errs.push('期間の始まりと終わりを入れてください');
          if (!d.状態) errs.push('状態を入れてください');
        }
        if (d.期間開始 && d.期間終了 && d.期間開始 > d.期間終了) errs.push('期間の終わりは始まりより後にしてください');
      }
      var err = $('err'), btn = form.querySelector('button[type=submit]');
      if (errs.length) { err.innerHTML = I.errorsBox(errs); err.scrollIntoView({ block: 'center' }); return; }
      err.innerHTML = ''; btn.disabled = true; btn.textContent = '送信中…'; I.busy(true);
      var g = I.gen; // 送信中に別の画面へ移ったら、結果は画面に書かない
      api('submitTask', d).then(function (res) {
        I.busy(false); toast('送信しました');
        if (g !== I.gen) return;
        form.hidden = true;
        $('after').innerHTML = '<section class="card exp-card exp-done"><h2>依頼を送信しました</h2>' +
          '<p class="exp-done-id">申請番号 ' + esc(res.申請ID || '—') + '</p>' + (res.状態 ? '<p>' + I.pill(res.状態) + '</p>' : '') +
          '<p class="exp-done-note">本部事務で確認されると「自分の申請」の状態が変わります。</p></section>' +
          '<div class="exp-actions"><a class="exp-send" href="#requests">自分の申請を見る</a>' +
          '<button type="button" class="exp-back" id="tk-again">続けて依頼する</button>' + I.backHtml('#task', 'タスク管理に戻る') + '</div>';
        window.scrollTo(0, 0);
        $('again').addEventListener('click', viewOffice);
      }).catch(function (x) {
        I.busy(false);
        if (g !== I.gen) { toast(x.message || '送信できませんでした'); return; }
        btn.disabled = false; btn.textContent = '送信';
        err.innerHTML = I.errorsBox(x.details && x.details.length ? x.details : [x.message || '送信できませんでした']);
      });
    });
  }

  I.views['task-office'] = viewOffice;
})();
