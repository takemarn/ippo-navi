/* シフトの画面（第2段階）
   #shift        … シフト管理のメニュー（シフト提出／シフト確認、承認者・管理者には シフト作成）＋ 最下段に承認待ち一覧
   #shift-submit … シフト提出（参考 4:16〜）: 本人の情報 → 凡例 → 月カレンダー → 予定（選んだ日の希望）・他の人の休み・メモ → 下に固定の「送信」
   #shift-view   … シフト確認（参考 4:43〜）: 職員番号・所属 → 前月/次月 → 日ごとのカード（確定した勤務は濃い赤）
   #shift-make   … シフト作成（承認者・管理者）: 参考アプリに映っていないので自社用に作った表。マスを押して勤務を入れ、保存・確定する
   GAS とのやりとり: shiftForm / submitShiftWishes / dayOffs / myShifts / shiftBoard / saveShifts / fixShifts（kiroku-app の docs/api.md） */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, state = I.state, api = I.api, esc = I.esc, toast = I.toast;

  var WISHES = ['出勤可', '出勤不可', '休み希望'];
  var WISH_CLS = { '出勤可': 'ok', '出勤不可': 'ng', '休み希望': 'off' };
  var DOW = ['日', '月', '火', '水', '木', '金', '土'];
  // 作成の表で使う勤務の短い字と色の種類
  var SHORT = { '日勤': '日', '早出': '早', '遅出': '遅', '夜勤': '夜', '明け': '明', '公休': '休' };
  var WORKING = ['日勤', '早出', '遅出', '夜勤'];

  // ---------- 日付の小道具 ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function addMonth(ym, n) { return ymOf(new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)); }
  function ymLabel(ym) { return +ym.slice(0, 4) + '年' + +ym.slice(5, 7) + '月'; }
  function dateObj(s) { return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); }
  function dateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dayLabel(s) { var d = dateObj(s); return (d.getMonth() + 1) + '月' + d.getDate() + '日(' + DOW[d.getDay()] + ')'; }
  function monthDays(ym) {
    var n = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate(), out = [];
    for (var i = 1; i <= n; i++) out.push(ym + '-' + pad(i));
    return out;
  }
  function thisYm() { return ymOf(new Date()); }
  function nextYm() { return addMonth(thisYm(), 1); }

  function loadingBar(text) { return '<div class="loading" role="status">' + (text || '読み込み中...') + '</div>'; }
  function failBox(e) { return '<div class="errors" role="alert">' + esc(e && e.message || 'エラーが起きました') + '</div>'; }

  // ---------- メニュー ----------
  function viewMenu() {
    var items = [{ label: 'シフト提出', href: '#shift-submit' }, { label: 'シフト確認', href: '#shift-view' }];
    if (I.canApprove()) items.push({ label: 'シフト作成', href: '#shift-make' });
    I.subMenu(items);
  }

  // ---------- 下から出るシート（他の人の休み・作成のマス） ----------
  function openSheet(html, onClose) {
    closeSheet();
    var wrap = document.createElement('div');
    wrap.className = 'sft-sheet-wrap'; wrap.id = 'sft-sheet';
    wrap.innerHTML = '<div class="sft-sheet" role="dialog" aria-modal="true" aria-labelledby="sft-sheet-h"><span class="sft-grip" aria-hidden="true"></span>' + html + '</div>';
    document.body.appendChild(wrap);
    document.body.classList.add('sft-noscroll');
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap || e.target.closest('[data-close]')) { closeSheet(); if (onClose) onClose(); }
    });
    var first = wrap.querySelector('[data-close]');
    if (first) first.focus();
    return wrap.querySelector('.sft-sheet');
  }
  function closeSheet() {
    var el = document.getElementById('sft-sheet');
    if (el) el.remove();
    document.body.classList.remove('sft-noscroll');
  }
  function onEsc(e) { if (e.key === 'Escape') closeSheet(); }

  // ---------- シフト提出 ----------
  var sub = { ym: null, saved: {}, edits: {}, sel: null, info: null };

  function wishOf(date) {
    if (sub.edits[date]) return sub.edits[date];
    return sub.saved[date] || { 希望: '', メモ: '' };
  }
  function dirtyDates() { return Object.keys(sub.edits).sort(); }

  function viewSubmit() {
    if (!sub.ym) sub.ym = nextYm();
    sub.sel = null;
    document.addEventListener('keydown', onEsc);
    I.cleanup.push(function () { document.removeEventListener('keydown', onEsc); closeSheet(); document.body.classList.remove('sft-has-bar'); });
    document.body.classList.add('sft-has-bar');
    app.innerHTML =
      '<div class="sft-head"><h1 class="sft-title">シフト提出<small>（' + esc(state.me && state.me.氏名) + '）</small></h1>' +
      '<div id="sft-info" class="sft-info"></div>' +
      '<div class="sft-legend" aria-label="色の見かた">' + WISHES.map(function (w) { return '<span class="sft-chip ' + WISH_CLS[w] + '">' + w + '</span>'; }).join('') + '</div></div>' +
      '<section class="sft-cal" aria-label="カレンダー">' +
        '<div class="sft-calnav"><button type="button" class="sft-navbtn" data-mv="-1">前月</button><b id="sft-ym" aria-live="polite"></b><button type="button" class="sft-navbtn" data-mv="1">翌月</button></div>' +
        '<div class="sft-grid sft-dow" aria-hidden="true">' + DOW.map(function (d, i) { return '<span class="d' + i + '">' + d + '</span>'; }).join('') + '</div>' +
        '<div class="sft-grid" id="sft-days" role="grid"></div>' +
      '</section>' +
      '<section class="sft-plan">' +
        '<div class="sft-plan-row"><div><b>予定</b><p id="sft-seldate" class="sft-seldate">日付を選択してください</p></div>' +
          '<select id="sft-wish" class="sft-wish" aria-label="この日の予定" disabled><option value="">--</option>' + WISHES.map(function (w) { return '<option>' + w + '</option>'; }).join('') + '</select></div>' +
        '<button type="button" id="sft-offs" class="sft-offs" disabled>この日の自分以外の休み申請を見る</button>' +
        '<label class="sft-memo"><span>メモ</span><small>時間指定などある場合24時間表記で、その他ご要望はここに記入してください</small>' +
          '<textarea id="sft-note" maxlength="200" disabled></textarea></label>' +
      '</section>' +
      '<div id="sft-err"></div>' +
      I.backHtml('#shift') +
      '<div class="sft-bar"><button type="button" id="sft-send" class="sft-send">送信</button></div>';

    app.querySelectorAll('[data-mv]').forEach(function (b) {
      b.addEventListener('click', function () { moveMonth(+b.dataset.mv); });
    });
    document.getElementById('sft-days').addEventListener('click', function (e) {
      var c = e.target.closest('button[data-d]');
      if (c) pick(c.dataset.d);
    });
    document.getElementById('sft-wish').addEventListener('change', function () { edit({ 希望: this.value }); });
    document.getElementById('sft-note').addEventListener('input', function () { edit({ メモ: this.value }); });
    document.getElementById('sft-offs').addEventListener('click', function () { if (sub.sel) showOffs(sub.sel); });
    document.getElementById('sft-send').addEventListener('click', send);
    loadMonth();
  }

  function moveMonth(n) {
    sub.ym = addMonth(sub.ym, n);
    sub.sel = null;
    loadMonth();
  }

  function loadMonth() {
    var ym = sub.ym;
    document.getElementById('sft-ym').textContent = ymLabel(ym);
    drawDays(true);
    drawPlan();
    api('shiftForm', { 年月: ym }).then(function (r) {
      if (sub.ym !== ym || !document.getElementById('sft-days')) return;
      sub.info = r.職員 || {};
      // 送っていない変更はほかの月に行っても残す（月ごとに saved を持つ）
      sub.saved = {};
      (r.希望 || []).forEach(function (w) { sub.saved[w.対象日] = { 希望: w.希望 || '', メモ: w.メモ || '' }; });
      drawInfo(); drawDays(false); drawPlan();
    }).catch(function (e) { document.getElementById('sft-err').innerHTML = failBox(e); drawDays(false); });
  }

  function drawInfo() {
    var p = sub.info || {};
    function it(k, v) { return '<span><em>' + k + '：</em>' + esc(v || '—') + '</span>'; }
    document.getElementById('sft-info').innerHTML =
      '<p>' + it('職種', p.職種) + it('雇用形態', p.雇用形態) + '</p>' +
      '<p>' + it('可能勤務', p.可能勤務) + it('有資格', p.資格) + '</p>';
  }

  // 6週分（前後の月の日は薄く出して押せない）。参考アプリと同じく日曜はじまり
  function drawDays(loading) {
    var ym = sub.ym, first = dateObj(ym + '-01'), start = new Date(first);
    start.setDate(1 - first.getDay());
    var html = '';
    for (var i = 0; i < 42; i++) {
      var d = new Date(start); d.setDate(start.getDate() + i);
      var s = dateStr(d), inMonth = s.slice(0, 7) === ym, w = inMonth && !loading ? wishOf(s).希望 : '';
      var cls = 'sft-day d' + d.getDay() + (inMonth ? '' : ' out') + (w ? ' ' + WISH_CLS[w] : '') + (sub.sel === s ? ' sel' : '') + (sub.edits[s] ? ' dirty' : '');
      html += inMonth
        ? '<button type="button" class="' + cls + '" data-d="' + s + '" aria-label="' + dayLabel(s) + (w ? ' ' + w : ' 未設定') + '" aria-pressed="' + (sub.sel === s) + '"' + (loading ? ' disabled' : '') + '>' + d.getDate() + '</button>'
        : '<span class="' + cls + '" aria-hidden="true">' + d.getDate() + '</span>';
    }
    document.getElementById('sft-days').innerHTML = html;
  }

  function drawPlan() {
    var on = !!sub.sel, w = on ? wishOf(sub.sel) : { 希望: '', メモ: '' };
    document.getElementById('sft-seldate').textContent = on ? sub.sel : '日付を選択してください';
    var sel = document.getElementById('sft-wish');
    sel.disabled = !on; sel.value = w.希望 || '';
    sel.className = 'sft-wish' + (w.希望 ? ' ' + WISH_CLS[w.希望] : '');
    document.getElementById('sft-offs').disabled = !on;
    var note = document.getElementById('sft-note');
    note.disabled = !on;
    if (document.activeElement !== note) note.value = w.メモ || '';
    var n = dirtyDates().length, btn = document.getElementById('sft-send');
    btn.textContent = n ? '送信（' + n + '日分）' : '送信';
  }

  function pick(date) {
    sub.sel = date;
    drawDays(false); drawPlan();
  }

  function edit(change) {
    if (!sub.sel) return;
    var cur = wishOf(sub.sel), next = { 希望: cur.希望 || '', メモ: cur.メモ || '' };
    Object.keys(change).forEach(function (k) { next[k] = change[k]; });
    var saved = sub.saved[sub.sel] || { 希望: '', メモ: '' };
    if (next.希望 === (saved.希望 || '') && next.メモ === (saved.メモ || '')) delete sub.edits[sub.sel];
    else sub.edits[sub.sel] = next;
    drawDays(false); drawPlan();
  }

  function send() {
    var err = document.getElementById('sft-err');
    var dates = dirtyDates();
    if (!dates.length) { err.innerHTML = '<div class="errors" role="alert">変更がありません。日付を押して予定を選んでください</div>'; return; }
    err.innerHTML = '';
    // 月ごとにまとめて送る（GAS は1回に1か月分を受け取る）
    var byYm = {};
    dates.forEach(function (d) { (byYm[d.slice(0, 7)] = byYm[d.slice(0, 7)] || []).push({ 対象日: d, 希望: sub.edits[d].希望, メモ: sub.edits[d].メモ }); });
    var btn = document.getElementById('sft-send');
    btn.disabled = true; btn.textContent = '送信中…'; I.busy(true);
    var chain = Promise.resolve();
    Object.keys(byYm).sort().forEach(function (ym) {
      chain = chain.then(function () {
        return api('submitShiftWishes', { 年月: ym, 日: byYm[ym] }).then(function () {
          byYm[ym].forEach(function (d) { delete sub.edits[d.対象日]; });
        });
      });
    });
    chain.then(function () {
      I.busy(false); btn.disabled = false;
      toast('送信しました');
      loadMonth();
    }).catch(function (e) {
      I.busy(false); btn.disabled = false; drawPlan();
      err.innerHTML = e.details && e.details.length ? I.errorsBox(e.details) : failBox(e);
    });
  }

  // その日の自分以外の休み（参考: 施設のタブで絞り込み）
  function showOffs(date) {
    var sheet = openSheet(
      '<div class="sft-sheet-head"><div><h2 id="sft-sheet-h">' + dayLabel(date) + ' の休み申請</h2><p class="sft-count" id="sft-offn">&nbsp;</p></div>' +
      '<button type="button" class="sft-x" data-close aria-label="閉じる">×</button></div>' +
      '<div class="sft-tabs" id="sft-tabs" role="tablist"></div>' +
      '<div class="sft-offlist" id="sft-offlist">' + loadingBar() + '</div>');
    api('dayOffs', { 対象日: date }).then(function (r) {
      if (!document.getElementById('sft-offlist')) return;
      var tabs = ['全施設'].concat(r.施設 || []), cur = '全施設', list = r.一覧 || [];
      function draw() {
        var rows = list.filter(function (x) { return cur === '全施設' || x.施設名 === cur; });
        sheet.querySelector('#sft-offn').textContent = rows.length + '件';
        sheet.querySelector('#sft-tabs').innerHTML = tabs.map(function (t) {
          return '<button type="button" role="tab" class="sft-tab' + (t === cur ? ' on' : '') + '" aria-selected="' + (t === cur) + '" data-tab="' + esc(t) + '">' + esc(t) + '</button>';
        }).join('');
        sheet.querySelector('#sft-offlist').innerHTML = rows.length ? rows.map(function (x) {
          return '<div class="sft-off"><div><b>' + esc(x.氏名) + '</b><small>' + esc(x.施設名) + '</small>' +
            (x.明け && x.休み !== '明け' ? '<span class="sft-ake">明け<i aria-hidden="true">明</i></span>' : '') + '</div>' +
            '<span class="sft-offk">' + esc(x.休み) + '</span></div>';
        }).join('') : '<p class="sft-empty">この日に休みを出している人はいません</p>';
      }
      sheet.querySelector('#sft-tabs').addEventListener('click', function (e) {
        var t = e.target.closest('[data-tab]');
        if (t) { cur = t.dataset.tab; draw(); }
      });
      draw();
    }).catch(function (e) { var el = document.getElementById('sft-offlist'); if (el) el.innerHTML = failBox(e); });
  }

  // ---------- シフト確認 ----------
  var chk = { ym: null };
  function viewCheck() {
    if (!chk.ym) chk.ym = thisYm();
    app.innerHTML =
      '<div class="sft-head"><h1 class="sft-title">シフト確認<small>（' + esc(state.me && state.me.氏名) + '）</small></h1>' +
      '<div id="chk-info" class="sft-info"></div></div>' +
      '<div class="chk-nav"><button type="button" data-mv="-1">前月</button><b id="chk-ym" aria-live="polite"></b><button type="button" data-mv="1">次月</button></div>' +
      '<div id="chk-list" class="chk-list"></div>' +
      I.backHtml('#shift');
    app.querySelectorAll('[data-mv]').forEach(function (b) {
      b.addEventListener('click', function () { chk.ym = addMonth(chk.ym, +b.dataset.mv); loadCheck(); });
    });
    loadCheck();
  }
  function loadCheck() {
    var ym = chk.ym;
    document.getElementById('chk-ym').textContent = ymLabel(ym);
    var list = document.getElementById('chk-list');
    list.innerHTML = loadingBar();
    api('myShifts', { 年月: ym }).then(function (r) {
      if (chk.ym !== ym || !document.getElementById('chk-list')) return;
      document.getElementById('chk-info').innerHTML =
        '<p><span><em>職員番号：</em>' + esc(r.職員番号) + '</span></p>' +
        '<p class="chk-fac"><span><em>所属：</em>' + esc((r.所属 || []).join(', ')) + '</span></p>';
      list.innerHTML = (r.確定 ? '' : '<p class="chk-note">' + esc(ymLabel(ym)) + 'のシフトはまだ確定していません。確定すると勤務が表示されます。</p>') +
        (r.日 || []).map(function (d) {
          var o = dateObj(d.対象日), head = '<div class="chk-dh"><b>' + o.getDate() + '日（' + DOW[o.getDay()] + '）</b><span>' + esc(d.対象日) + '</span></div>';
          var body = d.種類 === '勤務'
            ? '<dl class="chk-box work' + (WORKING.indexOf(d.勤務) < 0 ? ' rest' : '') + '"><dt>施設名</dt><dd>' + esc(d.施設名) + '</dd><dt>勤務</dt><dd>' + esc(d.勤務) + '</dd></dl>'
            : '<dl class="chk-box"><dt>勤務</dt><dd class="' + (d.種類 === '未設定' ? 'unset' : '') + '">' + esc(d.勤務) + '</dd></dl>';
          return '<article class="chk-day">' + head + body + '</article>';
        }).join('');
    }).catch(function (e) { list.innerHTML = failBox(e); });
  }

  // ---------- シフト作成（承認者・管理者） ----------
  var mk = { ym: null, board: null, edits: {} };
  function cellKey(id, date) { return id + '|' + date; }
  function shiftAt(p, date) {
    var k = cellKey(p.職員ID, date);
    if (k in mk.edits) return mk.edits[k];
    return (p.シフト[date] && p.シフト[date].勤務) || '';
  }

  function viewMake() {
    if (!I.canApprove()) { app.innerHTML = '<div class="card fail"><h2>シフト作成は承認者・管理者だけが使えます</h2></div>' + I.backHtml('#shift'); return; }
    if (!mk.ym) mk.ym = nextYm();
    document.addEventListener('keydown', onEsc);
    I.cleanup.push(function () { document.removeEventListener('keydown', onEsc); closeSheet(); });
    app.innerHTML =
      '<div class="sft-head"><h1 class="sft-title">シフト作成</h1>' +
      '<p class="mk-lead">マスを押して勤務を入れます。色は職員の希望です。「確定する」と職員の「シフト確認」に表示されます（LINE への通知はしません）。</p></div>' +
      '<div class="chk-nav"><button type="button" data-mv="-1">前月</button><b id="mk-ym" aria-live="polite"></b><button type="button" data-mv="1">次月</button></div>' +
      '<div class="mk-status" id="mk-status"></div>' +
      '<div class="sft-legend">' + WISHES.map(function (w) { return '<span class="sft-chip ' + WISH_CLS[w] + '">' + w + '</span>'; }).join('') +
        '<span class="mk-keys">' + Object.keys(SHORT).map(function (k) { return SHORT[k] + '=' + k; }).join(' ') + '</span></div>' +
      '<div id="mk-board" class="mk-board">' + loadingBar() + '</div>' +
      '<div id="mk-err"></div>' +
      '<div class="actions mk-actions"><button type="button" class="sub" id="mk-save">下書き保存</button><button type="button" id="mk-fix">確定する</button></div>' +
      I.backHtml('#shift');
    app.querySelectorAll('[data-mv]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (Object.keys(mk.edits).length) { toast('保存していない変更があります。先に「下書き保存」してください'); return; }
        mk.ym = addMonth(mk.ym, +b.dataset.mv); loadMake();
      });
    });
    document.getElementById('mk-board').addEventListener('click', function (e) {
      var c = e.target.closest('button[data-id]');
      if (c) editCell(c.dataset.id, c.dataset.d);
    });
    document.getElementById('mk-save').addEventListener('click', function () { saveMake(false); });
    document.getElementById('mk-fix').addEventListener('click', function () { saveMake(true); });
    loadMake();
  }

  function loadMake() {
    var ym = mk.ym;
    mk.edits = {}; mk.board = null;
    document.getElementById('mk-ym').textContent = ymLabel(ym);
    document.getElementById('mk-status').innerHTML = '';
    document.getElementById('mk-board').innerHTML = loadingBar();
    api('shiftBoard', { 年月: ym }).then(function (b) {
      if (mk.ym !== ym || !document.getElementById('mk-board')) return;
      mk.board = b; drawBoard();
    }).catch(function (e) { document.getElementById('mk-board').innerHTML = failBox(e); });
  }

  function drawStatus() {
    var st = mk.board.状態 || {}, n = Object.keys(mk.edits).length;
    document.getElementById('mk-status').innerHTML =
      (st.状態 === '確定' ? '<span class="pill ok">確定</span><small>' + esc(st.確定日時) + ' に確定。直すとすぐ職員に見えます</small>'
        : '<span class="pill wait">作成中</span><small>職員にはまだ見えません</small>') +
      (n ? '<span class="mk-dirty">未保存 ' + n + 'マス</span>' : '');
  }

  function drawBoard() {
    var b = mk.board, days = monthDays(b.年月);
    var head = '<tr><th class="mk-name" scope="col">職員</th>' + days.map(function (d) {
      var w = dateObj(d).getDay();
      return '<th scope="col" class="d' + w + '">' + +d.slice(8) + '<small>' + DOW[w] + '</small></th>';
    }).join('') + '</tr>';
    var rows = b.職員.map(function (p) {
      return '<tr><th scope="row" class="mk-name"><b>' + esc(p.氏名) + '</b><small>' + esc(p.職種) + '</small></th>' + days.map(function (d) {
        var w = p.希望[d] && p.希望[d].希望, s = shiftAt(p, d), k = cellKey(p.職員ID, d);
        var memo = p.希望[d] && p.希望[d].メモ;
        return '<td><button type="button" class="mk-cell' + (w ? ' ' + WISH_CLS[w] : '') + (k in mk.edits ? ' dirty' : '') + (s && WORKING.indexOf(s) < 0 ? ' rest' : '') + '" data-id="' + esc(p.職員ID) + '" data-d="' + d + '"' +
          ' aria-label="' + esc(p.氏名) + ' ' + dayLabel(d) + ' 希望 ' + (w || 'なし') + ' 勤務 ' + (s || '未設定') + '">' + (SHORT[s] || '') + (memo ? '<i class="mk-memo" aria-hidden="true"></i>' : '') + '</button></td>';
      }).join('') + '</tr>';
    }).join('');
    var count = '<tr class="mk-sum"><th scope="row" class="mk-name">出勤人数</th>' + days.map(function (d) {
      var n = b.職員.filter(function (p) { return WORKING.indexOf(shiftAt(p, d)) >= 0; }).length;
      return '<td>' + (n || '') + '</td>';
    }).join('') + '</tr>';
    document.getElementById('mk-board').innerHTML = '<div class="mk-scroll"><table class="mk-table"><thead>' + head + '</thead><tbody>' + rows + count + '</tbody></table></div>';
    drawStatus();
  }

  function editCell(id, date) {
    var p = mk.board.職員.filter(function (x) { return x.職員ID === id; })[0];
    if (!p) return;
    var w = p.希望[date] || {}, cur = shiftAt(p, date);
    var sheet = openSheet(
      '<div class="sft-sheet-head"><div><h2 id="sft-sheet-h">' + esc(p.氏名) + '　' + dayLabel(date) + '</h2>' +
      '<p class="sft-count">可能勤務：' + esc(p.可能勤務 || '—') + '</p></div><button type="button" class="sft-x" data-close aria-label="閉じる">×</button></div>' +
      '<div class="mk-wish">希望：' + (w.希望 ? '<span class="sft-chip ' + WISH_CLS[w.希望] + '">' + esc(w.希望) + '</span>' : '<span class="muted">出ていません</span>') +
        (w.メモ ? '<p>メモ：' + esc(w.メモ) + '</p>' : '') + '</div>' +
      '<div class="mk-kinds">' + (mk.board.勤務区分 || []).map(function (k) {
        return '<button type="button" class="mk-kind' + (k === cur ? ' on' : '') + (WORKING.indexOf(k) < 0 ? ' rest' : '') + '" data-k="' + esc(k) + '" aria-pressed="' + (k === cur) + '">' + esc(k) + '</button>';
      }).join('') + '<button type="button" class="mk-kind clear" data-k="">消す</button></div>');
    sheet.querySelector('.mk-kinds').addEventListener('click', function (e) {
      var b = e.target.closest('[data-k]');
      if (!b) return;
      var saved = (p.シフト[date] && p.シフト[date].勤務) || '', k = cellKey(id, date);
      if (b.dataset.k === saved) delete mk.edits[k]; else mk.edits[k] = b.dataset.k;
      closeSheet(); drawBoard();
    });
  }

  function saveMake(fix) {
    if (!mk.board) return;
    var err = document.getElementById('mk-err'); err.innerHTML = '';
    var list = Object.keys(mk.edits).map(function (k) { var a = k.split('|'); return { 職員ID: a[0], 対象日: a[1], 勤務: mk.edits[k] }; });
    if (!fix && !list.length) { toast('変更はありません'); return; }
    var ym = mk.ym;
    I.busy(true);
    var p = list.length ? api('saveShifts', { 年月: ym, 割当: list }) : Promise.resolve();
    p.then(function () { return fix ? api('fixShifts', { 年月: ym }) : null; })
      .then(function () { I.busy(false); toast(fix ? ymLabel(ym) + 'のシフトを確定しました' : '保存しました'); loadMake(); })
      .catch(function (e) { I.busy(false); err.innerHTML = e.details && e.details.length ? I.errorsBox(e.details) : failBox(e); });
  }

  I.views.shift = viewMenu;
  I.views['shift-submit'] = viewSubmit;
  I.views['shift-view'] = viewCheck;
  I.views['shift-make'] = viewMake;
})();
