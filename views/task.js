/* タスク管理のメニュー（#task）と「施設→本部事務」の依頼フォーム（#task-office）。参考動画 1:32〜1:46
   並び: 担当者 → 施設名 → 利用者名（かな で絞り込み＋選択） → 保険種類 → 生活保護 → タスク → 日程（期間） → 日程 → 時間
         → 訪問看護指示書変更 → 期間 → 状態 → 備考、カードの外に「送信」。
   参考アプリと同じく、タスクを選ぶまで日程から下は使えない。日程は タスクによって「1日」か「期間」のどちらか（dateMode）。
   特指示のときだけ 訪問看護指示書変更・期間・状態 が使え、そのときは必須。
   送信の流れは経費・勤怠と同じ: 送信 → 入力チェック（項目の下に赤字・件数） → ページ内の確認カード → 送信中 → 完了カード。
   送ると「タスク」の申請になり、承認待ち一覧・自分の申請に出る（中身の表示は views/clients.js の I.bodyLines）。
   GAS: submitTask（決まりは kiroku-app の docs/api.md）。送る data の形は変えていない:
     {施設名, 利用者ID, 保険種類, 生活保護, タスク, 日程開始, 日程終了, 日程, 時間開始, 時間終了, 訪問看護指示書変更, 期間開始, 期間終了, 状態, 備考, 送信ID}
     送信ID = 確認カードを出すときに作る文字。「もう一度送信する」では同じIDを送るので、GAS は2件目を作らず前の返事を返す
   利用者の候補は searchClients で取る。見た目は css/expense.css（exp-* の共通部品と、末尾の「タスク管理」の区切り） */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, state = I.state, api = I.api, esc = I.esc, toast = I.toast;

  I.views.task = function () { I.subMenu([{ label: '本部事務へ依頼する', href: '#task-office' }, { label: '介護タスク' }]); };

  // ひらがな・カタカナ・空白の違いを無視して比べる（GAS の normName と同じ考え方）
  function norm(t) {
    return String(t || '').replace(/[\s　]/g, '').replace(/[ぁ-ゖ]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) + 0x60); });
  }
  function $(id) { return document.getElementById('tk-' + id); }
  // 'YYYY-MM-DD' → '2026年12月1日（火）'。確認カードで読み間違いを防ぐため曜日を付ける
  function fmtDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return s || '';
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return m[1] + '年' + Number(m[2]) + '月' + Number(m[3]) + '日（' + '日月火水木金土'.charAt(d.getDay()) + '）';
  }

  // 送信ID（経費・勤怠の画面と同じ作り方）。暗号の乱数が使えない古い端末では時刻＋乱数
  function newSendId() {
    try {
      var a = new Uint8Array(16); crypto.getRandomValues(a);
      return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    } catch (_) { return Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
  }

  // ラベル行。forId が無いもの（ボタンの組・2つ並びの欄）は span にして、組の aria-labelledby から指す
  function head(key, label, req, forId) {
    var name = forId ? '<label for="tk-' + forId + '">' + esc(label) + '</label>'
      : '<span class="exp-lab-name" id="tk-' + key + '-lab">' + esc(label) + '</span>';
    return '<div class="exp-lab">' + name + '<span class="' + (req ? 'exp-req">(必須)' : 'exp-opt">(任意)') + '</span></div>';
  }
  // 項目のかたまり。下にエラーの赤字（tk-err-<key>）を置く。need があるものはタスクを選ぶまで使えない
  function field(key, inner, need) {
    return '<div class="exp-field' + (need ? ' exp-off' : '') + '" data-f="' + key + '"' + (need ? ' data-need="' + need + '"' : '') + '>' +
      inner + '<p class="exp-err" id="tk-err-' + key + '" hidden></p></div>';
  }
  // タスクごとに、日程を「1日」で入れるか「期間」で入れるか。参考動画で確かめられたのは 新入居 施設（1日）だけで、
  // 期間にしたもの（点滴・訪問スケジュール入力）は推測。違っていたらここを直す（GAS の validateTask はどちらでも受け付ける）
  var SPAN_TASKS = ['点滴', '訪問スケジュール入力'];
  function dateMode(kind) { return !kind ? '' : SPAN_TASKS.indexOf(kind) >= 0 ? 'span' : 'day'; }
  function isSpecial(kind) { return String(kind || '').indexOf('特指示') === 0; }
  function sel(id, list, first) {
    return '<select id="tk-' + id + '" class="exp-empty"><option value="">' + esc(first || '') + '</option>' +
      list.map(function (v) { return '<option>' + esc(v) + '</option>'; }).join('') + '</select>';
  }
  // 保険種類・生活保護: 参考アプリと同じく白いボタンを並べ、選んだものが緑になる（1つだけ選べる）
  function toggles(id, list) {
    return '<div class="tk-tog tk-tog' + list.length + '" id="tk-' + id + '" role="group" aria-labelledby="tk-' + id + '-lab">' + list.map(function (v) {
      return '<button type="button" aria-pressed="false" data-v="' + esc(v) + '">' + esc(v) + '</button>';
    }).join('') + '</div>';
  }
  // 日付の2つ並び（日程（期間）・期間）は半分ずつ、時刻の2つ並びは勤怠申請と同じく短め
  function pair(id, type, a, b, cls) {
    return '<div class="tk-row ' + cls + '" role="group" aria-labelledby="tk-' + id + '-lab">' +
      '<input type="' + type + '" id="tk-' + id + '-from" aria-label="' + a + '"><span class="tk-tilde" aria-hidden="true">～</span>' +
      '<input type="' + type + '" id="tk-' + id + '-to" aria-label="' + b + '"></div>';
  }

  function viewOffice() {
    var o = state.options || {}, facs = (state.me && state.me.見られる施設) || o.施設 || ['モア一津屋'];
    var clients = [], loadState = 'idle'; // idle（施設未選択）/ loading / ok / fail
    app.innerHTML =
      // 題は「何をする画面か」で。参考アプリの名前（施設→本部事務）は下の一言に残す
      '<h1 class="exp-title">本部事務へ依頼</h1>' +
      '<p class="exp-lead">利用者の入居・退院・指示書などの手続きを、施設から本部事務へ依頼します（施設→本部事務）。<br>入れたあと「内容を確認する」を押すと、送る前に確認できます。</p>' +
      '<div id="tk-stage"><form id="tk-form" class="exp-form tk-form" novalidate><div class="card exp-card">' +
        field('担当者', head('who', '担当者', true, 'who') + '<input id="tk-who" value="' + esc(state.me && state.me.氏名) + '" readonly aria-readonly="true">') +
        field('施設名', head('fac', '施設名', true, 'fac') + sel('fac', facs)) +
        field('利用者名', head('client', '利用者名', true, 'client') +
          '<div class="tk-name"><input id="tk-kana" type="search" placeholder="かな" aria-label="利用者名を かな で絞り込む" autocomplete="off" enterkeyhint="done">' +
          '<select id="tk-client" class="exp-empty" disabled><option value="">施設名を先に選んでください</option></select></div>' +
          '<p class="tk-hint" id="tk-client-hint" aria-live="polite"></p>') +
        field('保険種類', head('ins', '保険種類', true) + toggles('ins', ['介護保険', '医療保険'])) +
        field('生活保護', head('wel', '生活保護', true) + toggles('wel', ['有', '無', '確認中'])) +
        field('タスク', head('kind', 'タスク', true, 'kind') + sel('kind', o.タスク種類 || []) +
          '<p class="tk-hint" id="tk-kind-hint">タスクを選ぶと、下の日程などが入れられるようになります</p>') +
        field('日程期間', head('span', '日程（期間）', true) + pair('span', 'date', '日程の始まり', '日程の終わり', 'tk-dates'), 'span') +
        field('日程', head('day', '日程', true, 'day') + '<input type="date" id="tk-day">', 'day') +
        field('時間', head('time', '時間', false) + pair('time', 'time', '開始時刻', '終了時刻', 'tk-times'), 'any') +
        field('指示書', head('order', '訪問看護指示書変更', true, 'order') + sel('order', ['有', '無']), 'special') +
        field('期間', head('term', '期間', true) + pair('term', 'date', '期間の始まり', '期間の終わり', 'tk-dates'), 'special') +
        field('状態', head('state', '状態', true, 'state') + '<input id="tk-state" placeholder="例: 状態に変化あり" maxlength="200">', 'special') +
        field('備考', head('memo', '備考', false, 'memo') + '<textarea id="tk-memo" placeholder="本部事務に伝えたいことがあれば"></textarea>') +
      '</div>' +
      '<p class="exp-formerr" id="tk-formerr" role="alert" hidden></p>' +
      '<button type="submit" class="exp-send">内容を確認する</button>' +
      I.backHtml('#task', 'タスク管理に戻る') +
      '</form><div id="tk-after"></div></div>';

    var form = $('form'), after = $('after');

    // ---------- ブラウザ（スマホ）の「戻る」 ----------
    // 確認カードを出すときに履歴を1つ積んである。戻るを押すと、書いた内容のまま入力に戻る（「戻って直す」も同じ動き）。
    // 完了カードで戻ると #task へ（同じ申請をうっかり出し直さないように）。送信中の戻るは何もしない
    var leaving = false;
    function backToForm() { after.innerHTML = ''; form.hidden = false; window.scrollTo(0, 0); }
    function fixTap() {
      if (history.state && history.state.ippoStep === 'confirm') history.back(); // popstate → onPop → backToForm
      else backToForm();
    }
    function onPop() {
      if (leaving || !document.getElementById('tk-form')) return;
      if ($('done-h')) { leaving = true; location.replace('#task'); return; }
      if (form.hidden && $('go') && !$('go').disabled) backToForm();
    }
    window.addEventListener('popstate', onPop);
    I.cleanup.push(function () { window.removeEventListener('popstate', onPop); });
    // 「続けて…する」: 画面の切り替え（core の route）と同じく、後片付けをして番号を進めてから描き直す
    function restart() {
      I.cleanup.splice(0).forEach(function (f) { try { f(); } catch (_) {} });
      I.gen = (I.gen || 0) + 1;
      viewOffice();
    }

    // ---------- タスクに応じた切り替え（選ぶまで日程から下は使えない） ----------
    function syncKind() {
      var k = $('kind').value, mode = dateMode(k), special = isSpecial(k);
      // タスクを選んだら、何を入れればよいかを一言で（選ぶ前は「選ぶと入れられる」案内）
      $('kind-hint').textContent = !k ? 'タスクを選ぶと、下の日程などが入れられるようになります'
        : (mode === 'span' ? '日程は始まりと終わりの日を入れてください。' : '日程は1日を選んでください。') +
          (special ? '特指示なので、指示書の変更・期間・状態も入れてください。' : '');
      form.querySelectorAll('[data-need]').forEach(function (box) {
        var n = box.dataset.need;
        var on = n === 'any' ? !!k : n === 'special' ? special : n === mode;
        box.classList.toggle('exp-off', !on);
        box.querySelectorAll('input, select').forEach(function (x) { x.disabled = !on; });
        if (!on) clearBox(box); // 使えなくなった欄の古いエラーは消す
      });
    }
    syncKind();

    // ---------- 利用者の候補（施設名を選ぶと読み込む。かな で絞り込み） ----------
    function clientLabel(c) { return c.利用者ID + ' ' + c.氏名 + (c.ステータス && c.ステータス !== '居住中' ? '（' + c.ステータス + '）' : ''); }
    function fillClients() {
      var s = $('client'), kana = norm($('kana').value), keep = s.value;
      var list = clients.filter(function (c) { return !kana || norm(c.ふりがな).indexOf(kana) >= 0 || norm(c.氏名).indexOf(kana) >= 0; });
      var msg = loadState === 'idle' ? '施設名を先に選んでください' : loadState === 'loading' ? '読み込み中…' : loadState === 'fail' ? '読み込めませんでした'
        : !clients.length ? 'この施設の利用者はいません' : list.length ? '選んでください' : '見つかりません';
      s.innerHTML = '<option value="">' + msg + '</option>' +
        list.map(function (c) { return '<option value="' + esc(c.利用者ID) + '">' + esc(clientLabel(c)) + '</option>'; }).join('');
      // 絞り込んでも、選んでいた人が候補に残っていれば選んだままにする
      if (keep && list.some(function (c) { return String(c.利用者ID) === keep; })) s.value = keep;
      s.disabled = !list.length;
      s.classList.toggle('exp-empty', !s.value);
      var hint = $('client-hint');
      hint.classList.toggle('tk-hint-bad', loadState === 'fail');
      hint.innerHTML = loadState === 'loading' ? '<span class="tk-dots" aria-hidden="true"></span>利用者を読み込んでいます'
        : loadState === 'fail' ? esc(loadErr) + ' <button type="button" class="tk-retry" id="tk-retry">もう一度読み込む</button>'
        : loadState === 'ok' && clients.length ? (kana ? clients.length + '人中 ' + list.length + '人が見つかりました' : '全' + clients.length + '人（かなで絞り込めます）')
        : '';
    }
    var loadErr = '';
    function loadClients() {
      var fac = $('fac').value;
      clients = [];
      loadState = fac ? 'loading' : 'idle';
      $('client').value = '';
      fillClients();
      if (!fac) return;
      var g = I.gen;
      api('searchClients', { 施設: [fac], 氏名: '', ステータス: ['居住中', '入院中'] }).then(function (r) {
        if (g !== I.gen || !$('fac') || $('fac').value !== fac) return;
        clients = (r && r.一覧) || []; loadState = 'ok'; fillClients();
      }).catch(function (e) {
        if (g !== I.gen || !$('fac') || $('fac').value !== fac) return;
        loadErr = (e && e.message) || '利用者を読み込めませんでした'; loadState = 'fail'; fillClients();
      });
    }
    $('fac').addEventListener('change', loadClients);
    $('kana').addEventListener('input', fillClients);
    if (facs.length === 1) { $('fac').value = facs[0]; $('fac').classList.remove('exp-empty'); loadClients(); }

    // ---------- 入力のたびの反応 ----------
    form.addEventListener('click', function (e) {
      if (e.target.id === 'tk-retry') { loadClients(); return; }
      var b = e.target.closest('.tk-tog button');
      if (!b) return;
      b.parentNode.querySelectorAll('button').forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
      clearErr(b);
    });
    form.addEventListener('change', function (e) {
      if (e.target.id === 'tk-kind') syncKind();
      if (e.target.tagName === 'SELECT') e.target.classList.toggle('exp-empty', !e.target.value);
      clearErr(e.target);
    });
    form.addEventListener('input', function (e) { if (e.target.id !== 'tk-kana') clearErr(e.target); });
    function picked(id) { var b = $(id).querySelector('button.on'); return b ? b.dataset.v : ''; }

    // ---------- エラー表示（項目の下に赤字、送信ボタンの上に件数） ----------
    function clearBox(box) {
      if (!box.classList.contains('exp-bad')) return;
      box.classList.remove('exp-bad');
      var p = box.querySelector(':scope > .exp-err'); if (p) { p.hidden = true; p.textContent = ''; }
    }
    function clearErr(el) {
      var box = el && el.closest && el.closest('.exp-field');
      if (!box || !box.classList.contains('exp-bad')) return;
      clearBox(box); refreshFormErr();
    }
    function refreshFormErr() {
      var n = form.querySelectorAll('.exp-bad').length;
      $('formerr').hidden = !n;
      if (n) $('formerr').textContent = '入力を確認してください（' + n + '件）';
    }
    function showErr(key, msg) {
      var p = $('err-' + key); if (!p) return;
      p.textContent = msg; p.hidden = false; p.parentNode.classList.add('exp-bad');
    }

    function readData() {
      var k = $('kind').value, mode = dateMode(k), sp = isSpecial(k);
      return {
        施設名: $('fac').value, 利用者ID: $('client').value, 保険種類: picked('ins'), 生活保護: picked('wel'), タスク: k,
        日程開始: mode === 'span' ? $('span-from').value : '', 日程終了: mode === 'span' ? $('span-to').value : '',
        日程: mode === 'day' ? $('day').value : '',
        時間開始: k ? $('time-from').value : '', 時間終了: k ? $('time-to').value : '',
        訪問看護指示書変更: sp ? $('order').value : '',
        期間開始: sp ? $('term-from').value : '', 期間終了: sp ? $('term-to').value : '',
        状態: sp ? $('state').value.trim() : '', 備考: $('memo').value.trim()
      };
    }
    function validate(d) {
      var n = 0;
      function bad(key, msg) { showErr(key, msg); n++; }
      if (!d.施設名) bad('施設名', '施設名を選んでください');
      if (!d.利用者ID) bad('利用者名', loadState === 'loading' ? '利用者を読み込み中です。少し待ってから選んでください' : '利用者名を選んでください');
      if (!d.保険種類) bad('保険種類', '保険種類を選んでください');
      if (!d.生活保護) bad('生活保護', '生活保護を選んでください');
      if (!d.タスク) { bad('タスク', 'タスクを選んでください'); return n; }
      if (dateMode(d.タスク) === 'span') {
        if (!d.日程開始 || !d.日程終了) bad('日程期間', '日程（期間）の始まりと終わりを入れてください');
        else if (d.日程開始 > d.日程終了) bad('日程期間', '終わりは始まりと同じ日か、後の日にしてください');
      } else if (!d.日程) bad('日程', '日程を入れてください');
      if (!!d.時間開始 !== !!d.時間終了) bad('時間', '時間は開始と終了の両方を入れるか、両方空にしてください');
      else if (d.時間開始 && d.時間開始 >= d.時間終了) bad('時間', '終了は開始より後にしてください');
      if (isSpecial(d.タスク)) {
        if (!d.訪問看護指示書変更) bad('指示書', '訪問看護指示書変更を選んでください');
        if (!d.期間開始 || !d.期間終了) bad('期間', '期間の始まりと終わりを入れてください');
        else if (d.期間開始 > d.期間終了) bad('期間', '終わりは始まりと同じ日か、後の日にしてください');
        if (!d.状態) bad('状態', '状態を入れてください');
      }
      return n;
    }

    // ---------- 送信 → 確認 → 送信中 → 完了 ----------
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      form.querySelectorAll('.exp-bad').forEach(clearBox);
      $('formerr').hidden = true;
      var d = readData(), n = validate(d);
      if (n) {
        refreshFormErr();
        var first = form.querySelector('.exp-bad');
        if (first) {
          first.scrollIntoView({ block: 'center' });
          // 選ぶ欄を先に（利用者名は かな ではなく選ぶ欄へ）
          var f = first.querySelector('select:not(:disabled)') || first.querySelector('input:not([readonly]):not(:disabled), textarea, .tk-tog button');
          if (f) f.focus({ preventScroll: true });
        }
        return;
      }
      showConfirm(d);
    });

    function clientName(id) {
      var c = clients.filter(function (x) { return String(x.利用者ID) === String(id); })[0];
      return c ? clientLabel(c) : id;
    }
    function row(label, html) { return '<dt>' + label + '</dt><dd>' + html + '</dd>'; }
    function summary(d) {
      return row('担当者', esc(state.me && state.me.氏名)) +
        row('施設名', esc(d.施設名)) +
        row('利用者名', esc(clientName(d.利用者ID))) +
        row('保険種類', esc(d.保険種類)) +
        row('生活保護', esc(d.生活保護)) +
        row('タスク', esc(d.タスク)) +
        (d.日程 ? row('日程', esc(fmtDate(d.日程))) : row('日程（期間）', esc(fmtDate(d.日程開始)) + ' ～<br>' + esc(fmtDate(d.日程終了)))) +
        (d.時間開始 ? row('時間', esc(d.時間開始) + ' ～ ' + esc(d.時間終了)) : '') +
        (isSpecial(d.タスク) ? row('指示書変更', esc(d.訪問看護指示書変更)) +
          row('期間', esc(fmtDate(d.期間開始)) + ' ～<br>' + esc(fmtDate(d.期間終了))) + row('状態', esc(d.状態)) : '') +
        row('備考', d.備考 ? esc(d.備考) : '<span class="exp-none">なし</span>');
    }

    function showConfirm(d) {
      d.送信ID = newSendId(); // 確認のたびに作る（直して確認し直したら新しいID。送り直しは同じ d なので同じID）
      form.hidden = true;
      try { history.pushState({ ippoStep: 'confirm' }, ''); } catch (_) {} // ブラウザの「戻る」で入力に戻れるように
      after.innerHTML =
        '<section class="card exp-card exp-confirm" aria-labelledby="tk-cf-h">' +
          '<h2 id="tk-cf-h" class="exp-cf-h">この内容で本部事務に依頼しますか？</h2>' +
          '<dl class="exp-dl tk-dl">' + summary(d) + '</dl>' +
          '<div class="exp-senderr" id="tk-senderr" role="alert" hidden></div>' +
        '</section>' +
        '<div class="exp-actions">' +
          '<button type="button" class="exp-send" id="tk-go">この内容で送信</button>' +
          '<button type="button" class="exp-back" id="tk-fix">戻って直す</button>' +
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
      I.busy(true); // 送信中は画面全体をぼかして「読み込み中・・・」（core.js）
      var g = I.gen; // 送信中に別の画面へ移ったら、結果は画面に書かない
      api('submitTask', d).then(function (res) {
        I.busy(false); toast('送信しました');
        if (g !== I.gen) return;
        showDone(res || {}, d);
      }).catch(function (x) {
        I.busy(false);
        if (g !== I.gen) { toast((x && x.message) || '送信できませんでした'); return; }
        go.disabled = false; fix.disabled = false; go.textContent = 'もう一度送信する'; go.removeAttribute('aria-busy');
        var list = x && x.details && x.details.length ? x.details : [];
        box.innerHTML = '<strong>' + esc((x && x.message) || '送信できませんでした') + '</strong>' +
          (list.length ? '<ul>' + list.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '<p>通信の状態を確かめて、もう一度送信してください。</p>');
        box.hidden = false;
      });
    }

    function showDone(res, d) {
      try { if (history.state && history.state.ippoStep === 'confirm') history.replaceState({ ippoStep: 'done' }, ''); } catch (_) {}
      after.innerHTML =
        '<section class="card exp-card exp-done" aria-labelledby="tk-done-h">' +
          '<svg class="exp-done-ic" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21"/><path d="M14 24.5l7 7 13-14"/></svg>' +
          '<h2 id="tk-done-h">本部事務に依頼しました</h2>' +
          '<p class="exp-done-sum">' + esc(clientName(d.利用者ID)) + ' ・ ' + esc(d.タスク) + '</p>' +
          '<p class="exp-done-id">申請番号 ' + esc(res.申請ID || '—') + '</p>' +
          (res.状態 ? '<p>' + I.pill(res.状態) + '</p>' : '') +
          '<p class="exp-done-note">本部事務で確認されると「自分の申請」の状態が変わります。</p>' +
        '</section>' +
        '<div class="exp-actions">' +
          '<a class="exp-send" href="#requests">自分の申請を見る</a>' +
          '<button type="button" class="exp-back" id="tk-again">続けて依頼する</button>' +
          I.backHtml('#task', 'タスク管理に戻る') +
        '</div>';
      window.scrollTo(0, 0);
      $('done-h').setAttribute('tabindex', '-1'); $('done-h').focus();
      $('again').addEventListener('click', restart);
    }
  }

  I.views['task-office'] = viewOffice;
})();
