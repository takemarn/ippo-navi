/* シフトの画面（第2段階）
   #shift        … シフト管理のメニュー（シフト提出／シフト確認、承認者・管理者には シフト作成）＋ 最下段に承認待ち一覧。
                    その下に「次の勤務」「来月の希望の出し具合」の小さなまとめを足す（押すと各画面へ）
   #shift-submit … シフト提出（参考 4:16〜）: 本人の情報 → 凡例 → 月カレンダー（この月の数のまとめ付き）
                    → 予定（選んだ日の希望を4つのボタンで選ぶ・前後の日へ）・他の人の休み・メモ → 下に固定の「送信」
   #shift-view   … シフト確認（参考 4:43〜）: 職員番号・所属 → 前月/次月 → 月のまとめ → 日ごとのカード（確定した勤務は濃い赤）
   #shift-make   … シフト作成（承認者・管理者）: 参考アプリに映っていないので自社用に作った表。
                    日ごとに「日中（日勤・早出・遅出）」「夜勤」の人数を必要人数と比べ、足りない日を赤で示す。
                    マスを押すと下からシートが出て、勤務を選ぶと次の日へ進む（続けて入れられる）
   GAS とのやりとり: shiftForm / submitShiftWishes / dayOffs / myShifts / shiftBoard / saveShifts / fixShifts / unfixShifts（kiroku-app の docs/api.md）
   ・shiftForm の「状態」「提出可」: 提出可=false の月は提出画面で入力を止める
   ・shiftBoard の職員の「所属施設」（配列）: 施設が2つ以上なら作成画面に施設タブ。saveShifts はタブの施設名を付けて送る
   ・fixShifts は1マスも無い月だと 400（画面でも先に止める）。unfixShifts で確定を取り消す
   ※ shiftBoard の返事に「必要人数」（{ 日中: 数, 夜勤: 数 }、または { 'YYYY-MM-DD': { 日中, 夜勤 } } の日ごと）を足すと、
     その数で足りない日を判定する。無いときは画面で決めた数（この端末に覚える。初めは 日中3・夜勤1）を使う。
     → GAS側にも「必要人数」を返す口が要る（任意。無くても画面は動く） */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, state = I.state, api = I.api, esc = I.esc, toast = I.toast;

  var WISHES = ['出勤可', '出勤不可', '休み希望'];
  var WISH_CLS = { '出勤可': 'ok', '出勤不可': 'ng', '休み希望': 'off' };
  var DOW = ['日', '月', '火', '水', '木', '金', '土'];
  // 作成の表で使う勤務の短い字
  var SHORT = { '日勤': '日', '早出': '早', '遅出': '遅', '夜勤': '夜', '明け': '明', '公休': '休' };
  var WORKING = ['日勤', '早出', '遅出', '夜勤'];
  var DAYTIME = ['日勤', '早出', '遅出'];
  var NEED_DEFAULT = { 日中: 3, 夜勤: 1 };
  var NEED_KEY = 'ippo.shiftNeed';

  // ---------- 日付の小道具 ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function addMonth(ym, n) { return ymOf(new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)); }
  function ymLabel(ym) { return +ym.slice(0, 4) + '年' + +ym.slice(5, 7) + '月'; }
  function mLabel(ym) { return +ym.slice(5, 7) + '月'; }
  function dateObj(s) { return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); }
  function dateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dayLabel(s) { var d = dateObj(s); return (d.getMonth() + 1) + '月' + d.getDate() + '日(' + DOW[d.getDay()] + ')'; }
  function shortDay(s) { var d = dateObj(s); return (d.getMonth() + 1) + '/' + d.getDate() + '(' + DOW[d.getDay()] + ')'; }
  function addDay(s, n) { var d = dateObj(s); d.setDate(d.getDate() + n); return dateStr(d); }
  function monthDays(ym) {
    var n = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate(), out = [];
    for (var i = 1; i <= n; i++) out.push(ym + '-' + pad(i));
    return out;
  }
  function thisYm() { return ymOf(new Date()); }
  function nextYm() { return addMonth(thisYm(), 1); }

  // ---------- 状態の表示（読み込み中・エラー・空） ----------
  function loadingBar(text) { return '<div class="loading sft-loading" role="status"><span class="sft-spin" aria-hidden="true"></span>' + esc(text || '読み込み中...') + '</div>'; }
  // retry を付けると「もう一度読み込む」ボタンを出す（押されたら data-retry を拾って呼び直す）
  function failBox(e, retry) {
    return '<div class="errors sft-fail" role="alert"><p>' + esc(e && e.message || 'エラーが起きました') + '</p>' +
      (retry ? '<button type="button" class="sft-retry" data-retry="' + retry + '">もう一度読み込む</button>' : '') + '</div>';
  }
  function emptyBox(title, text) {
    return '<div class="sft-emptybox"><b>' + esc(title) + '</b>' + (text ? '<p>' + esc(text) + '</p>' : '') + '</div>';
  }
  // 画面が切り替わったあとに遅れて届いた返事を捨てるための番号（core.js の route() が進める）
  function stale(gen) { return gen !== I.gen; }
  // app（#app）は画面を移っても同じ要素なので、そこに付けたクリックは画面を離れるときに外す。
  // 外さないと、行き来するたびに「もう一度読み込む」などが二重・三重に動く
  function onApp(fn) {
    app.addEventListener('click', fn);
    I.cleanup.push(function () { app.removeEventListener('click', fn); });
  }

  // ---------- 下から出るシート（他の人の休み・作成のマス・確かめ） ----------
  // 閉じたら、開く前にいた所（押したボタン）へフォーカスを戻す（キーボード・読み上げで迷わないように）。
  // sheetBack に関数を入れると、それが返す要素へ戻す（作成の表は描き直すとボタンが入れ替わるため）
  var sheetFrom = null, sheetBack = null;
  function openSheet(html, onClose) {
    if (!document.getElementById('sft-sheet')) { sheetFrom = document.activeElement; sheetBack = null; }
    closeSheet(true);
    var wrap = document.createElement('div');
    wrap.className = 'sft-sheet-wrap'; wrap.id = 'sft-sheet';
    wrap.innerHTML = '<div class="sft-sheet" role="dialog" aria-modal="true" aria-labelledby="sft-sheet-h"><span class="sft-grip" aria-hidden="true"></span>' + html + '</div>';
    document.body.appendChild(wrap);
    document.body.classList.add('sft-noscroll');
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap || e.target.closest('[data-close]')) { closeSheet(); if (onClose) onClose(); }
    });
    // Tab でシートの外（後ろの画面）へ出ないようにする
    wrap.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = [].filter.call(wrap.querySelectorAll('button, a[href], textarea, input'), function (x) { return !x.disabled && x.offsetParent; });
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    var first = wrap.querySelector('[data-close]');
    if (first) first.focus();
    return wrap.querySelector('.sft-sheet');
  }
  // keep: 続けて別のシートを開くとき（フォーカスは戻さない）
  function closeSheet(keep) {
    var el = document.getElementById('sft-sheet');
    if (!el) return;
    el.remove();
    document.body.classList.remove('sft-noscroll');
    if (keep === true) return;
    var to = sheetBack ? sheetBack() : sheetFrom;
    sheetFrom = sheetBack = null;
    if (to && to.isConnected && to.focus) to.focus({ preventScroll: true });
  }
  function onEsc(e) { if (e.key === 'Escape') closeSheet(); }
  // 「はい／やめる」を聞くシート。ok を押すと onOk。extra は本文に足す HTML
  function confirmSheet(title, extra, okLabel, onOk, more) {
    var sheet = openSheet(
      '<div class="sft-sheet-head"><h2 id="sft-sheet-h">' + esc(title) + '</h2><button type="button" class="sft-x" data-close aria-label="閉じる">×</button></div>' +
      '<div class="sft-confirm">' + extra + '</div>' +
      '<div class="sft-confirm-btns">' + (more || '') + '<button type="button" class="sub" data-close>やめる</button><button type="button" data-ok>' + esc(okLabel) + '</button></div>');
    sheet.querySelector('[data-ok]').addEventListener('click', function () { closeSheet(); onOk(); });
    return sheet;
  }

  // ---------- メニュー ----------
  function viewMenu() {
    var items = [{ label: 'シフト提出', href: '#shift-submit' }, { label: 'シフト確認', href: '#shift-view' }];
    if (I.canApprove()) items.push({ label: 'シフト作成', href: '#shift-make' });
    I.subMenu(items);
    // 共通のメニューの下（戻るの上）に、自分のシフトの小さなまとめを足す
    var back = app.querySelector('.ipp-back');
    var box = document.createElement('section');
    box.className = 'sft-glance'; box.setAttribute('aria-label', '自分のシフトのまとめ');
    box.innerHTML = '<a class="sft-glance-item" href="#shift-view"><small>次の勤務</small><b class="sft-skel">読み込み中...</b></a>' +
      '<a class="sft-glance-item" href="#shift-submit"><small>' + esc(mLabel(nextYm())) + 'の希望</small><b class="sft-skel">読み込み中...</b></a>';
    app.insertBefore(box, back);
    var gen = I.gen, td = I.today();
    Promise.all([api('myShifts', { 年月: thisYm() }), api('myShifts', { 年月: nextYm() }), api('shiftForm', { 年月: nextYm() })]).then(function (r) {
      if (stale(gen)) return;
      var days = (r[0].確定 ? r[0].日 || [] : []).concat(r[1].確定 ? r[1].日 || [] : []);
      var next = days.filter(function (d) { return d.対象日 >= td && d.種類 === '勤務' && WORKING.indexOf(d.勤務) >= 0; })[0];
      var a = box.children[0], b = box.children[1];
      a.innerHTML = '<small>次の勤務</small>' + (next
        ? '<b><span class="sft-glance-k">' + esc(next.勤務) + '</span>' + esc(next.対象日 === td ? '今日' : dayLabel(next.対象日)) + '</b><span class="sft-glance-sub">' + esc(next.施設名 || '') + '</span>'
        : '<b class="sft-glance-none">' + (r[0].確定 ? 'この先の勤務はまだありません' : '今月のシフトは確定前です') + '</b>');
      var all = monthDays(nextYm()).length, done = (r[2].希望 || []).filter(function (w) { return w.希望; }).length;
      b.innerHTML = '<small>' + esc(mLabel(nextYm())) + 'の希望</small><b>' + done + '<span class="sft-glance-of">/' + all + '日</span> 出しました</b>' +
        '<span class="sft-glance-bar" aria-hidden="true"><i style="width:' + Math.round(done / all * 100) + '%"></i></span>' +
        '<span class="sft-glance-sub">' + (done < all ? 'あと' + (all - done) + '日 未設定' : 'すべて出しました') + '</span>';
    }).catch(function () { if (!stale(gen)) box.remove(); });
  }

  // ---------- シフト提出 ----------
  // saved … GAS に入っている希望（今見ている月の分）、edits … まだ送っていない変更（月をまたいで残す）
  var sub = { ym: null, saved: {}, edits: {}, sel: null, info: null, loading: false, failed: false };

  function wishOf(date) {
    if (sub.edits[date]) return sub.edits[date];
    return sub.saved[date] || { 希望: '', メモ: '' };
  }
  function dirtyDates() { return Object.keys(sub.edits).sort(); }

  function viewSubmit() {
    sub.ym = nextYm(); // 開くたびに翌月から（前に見た月のままだと、出す月をまちがえやすい）。未送信の変更は月をまたいで残る
    sub.sel = null;
    document.addEventListener('keydown', onEsc);
    I.cleanup.push(function () { document.removeEventListener('keydown', onEsc); closeSheet(true); document.body.classList.remove('sft-has-bar', 'sft-typing'); });
    document.body.classList.add('sft-has-bar');
    app.innerHTML =
      '<div class="sft-head"><h1 class="sft-title">シフト提出<small>（' + esc(state.me && state.me.氏名) + '）</small></h1>' +
      '<div id="sft-info" class="sft-info"></div>' +
      '<div class="sft-legend" aria-label="色の見かた">' + WISHES.map(function (w) { return '<span class="sft-chip ' + WISH_CLS[w] + '">' + w + '</span>'; }).join('') +
        '<span class="sft-chip none">未設定</span><span class="sft-legend-dot"><i aria-hidden="true"></i>未送信</span></div></div>' +
      '<section class="sft-cal" aria-label="カレンダー">' +
        '<div class="sft-calnav"><button type="button" class="sft-navbtn" data-mv="-1">前月</button><b id="sft-ym" aria-live="polite"></b><button type="button" class="sft-navbtn" data-mv="1">翌月</button></div>' +
        '<div class="sft-grid sft-dow" aria-hidden="true">' + DOW.map(function (d, i) { return '<span class="d' + i + '">' + d + '</span>'; }).join('') + '</div>' +
        '<div class="sft-gridwrap"><div class="sft-grid" id="sft-days"></div><div class="sft-calload" id="sft-calload" hidden></div></div>' +
        '<div class="sft-tally" id="sft-tally" aria-live="polite"></div>' +
      '</section>' +
      '<div id="sft-err"></div>' +
      '<div id="sft-lock" class="sft-lock" role="status" hidden></div>' +
      '<section class="sft-plan" id="sft-plan" aria-label="選んだ日の予定">' +
        '<div class="sft-plan-row">' +
          '<button type="button" class="sft-step" data-step="-1" aria-label="前の日">‹</button>' +
          '<div class="sft-plan-day"><b>予定</b><p id="sft-seldate" class="sft-seldate">カレンダーの日付を押してください</p></div>' +
          '<span id="sft-cur" class="sft-cur"></span>' +
          '<button type="button" class="sft-step" data-step="1" aria-label="次の日">›</button></div>' +
        '<div class="sft-seg" id="sft-seg" role="radiogroup" aria-label="この日の予定">' +
          WISHES.map(function (w) { return '<button type="button" role="radio" class="sft-segbtn ' + WISH_CLS[w] + '" data-w="' + w + '">' + w + '</button>'; }).join('') +
          '<button type="button" role="radio" class="sft-segbtn none" data-w="">未設定</button></div>' +
        '<button type="button" id="sft-offs" class="sft-offs">この日の自分以外の休み申請を見る</button>' +
        '<label class="sft-memo"><span>メモ</span><small>時間指定などある場合24時間表記で、その他ご要望はここに記入してください（例：9:00〜15:00 なら可）</small>' +
          '<textarea id="sft-note" maxlength="200" placeholder="なし"></textarea><em class="sft-memo-n" id="sft-memo-n">0/200</em></label>' +
      '</section>' +
      I.backHtml('#shift') +
      '<div class="sft-bar"><p class="sft-bar-note" id="sft-bar-note" hidden></p><button type="button" id="sft-send" class="sft-send">送信</button></div>';

    app.querySelectorAll('[data-mv]').forEach(function (b) {
      b.addEventListener('click', function () { moveMonth(+b.dataset.mv); });
    });
    document.getElementById('sft-days').addEventListener('click', function (e) {
      var c = e.target.closest('button[data-d]');
      if (c) pick(c.dataset.d);
    });
    document.getElementById('sft-seg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-w]');
      if (b && sub.sel) edit({ 希望: b.dataset.w });
    });
    app.querySelectorAll('[data-step]').forEach(function (b) {
      b.addEventListener('click', function () { stepDay(+b.dataset.step); });
    });
    var note = document.getElementById('sft-note');
    note.addEventListener('input', function () { edit({ メモ: this.value }); });
    // メモを打っている間は下の送信バーを隠す（スマホのキーボードの上に乗って、入力欄や文字数を隠すため）
    note.addEventListener('focus', function () { document.body.classList.add('sft-typing'); });
    note.addEventListener('blur', function () { document.body.classList.remove('sft-typing'); });
    document.getElementById('sft-offs').addEventListener('click', function () { if (sub.sel) showOffs(sub.sel); });
    document.getElementById('sft-send').addEventListener('click', send);
    document.getElementById('sft-tally').addEventListener('click', function (e) { if (e.target.closest('#sft-fill')) fillUnset(); });
    onApp(function (e) { if (e.target.closest('[data-retry="sub"]')) loadMonth(); });
    loadMonth();
  }

  function moveMonth(n) {
    sub.ym = addMonth(sub.ym, n);
    sub.sel = null;
    loadMonth();
  }

  function loadMonth() {
    var ym = sub.ym, gen = I.gen;
    sub.loading = true; sub.failed = false; sub.locked = false;
    document.getElementById('sft-ym').textContent = ymLabel(ym);
    document.getElementById('sft-err').innerHTML = '';
    drawDays(); drawPlan(); drawTally();
    api('shiftForm', { 年月: ym }).then(function (r) {
      if (stale(gen) || sub.ym !== ym) return;
      sub.info = r.職員 || {};
      // 確定した月（提出可=false）は見るだけにする。前に打った未送信の変更があっても送れないので捨てる
      sub.locked = r.提出可 === false; sub.state = r.状態 || '';
      if (sub.locked) Object.keys(sub.edits).forEach(function (d) { if (d.slice(0, 7) === ym) delete sub.edits[d]; });
      sub.saved = {};
      (r.希望 || []).forEach(function (w) { sub.saved[w.対象日] = { 希望: w.希望 || '', メモ: w.メモ || '' }; });
      sub.loading = false;
      // 初めて開いた月は、未設定の最初の日を選んでおく（すぐ押せるように）
      if (!sub.sel) sub.sel = monthDays(ym).filter(function (d) { return !wishOf(d).希望; })[0] || null;
      drawInfo(); drawDays(); drawPlan(); drawTally();
    }).catch(function (e) {
      if (stale(gen) || sub.ym !== ym) return;
      sub.loading = false; sub.failed = true;
      document.getElementById('sft-err').innerHTML = failBox(e, 'sub');
      drawDays(); drawPlan(); drawTally();
    });
  }

  function drawInfo() {
    var p = sub.info || {};
    function it(k, v) { return '<span><em>' + k + '：</em>' + esc(v || '—') + '</span>'; }
    document.getElementById('sft-info').innerHTML =
      '<p>' + it('職種', p.職種) + it('雇用形態', p.雇用形態) + '</p>' +
      '<p>' + it('可能勤務', p.可能勤務) + it('有資格', p.資格) + '</p>';
  }

  // 6週分（前後の月の日は薄く出して押せない）。参考アプリと同じく日曜はじまり
  function drawDays() {
    var ym = sub.ym, first = dateObj(ym + '-01'), start = new Date(first), td = I.today(), off = sub.loading || sub.failed;
    start.setDate(1 - first.getDay());
    var html = '';
    for (var i = 0; i < 42; i++) {
      var d = new Date(start); d.setDate(start.getDate() + i);
      var s = dateStr(d), inMonth = s.slice(0, 7) === ym, wv = inMonth && !off ? wishOf(s) : { 希望: '', メモ: '' }, w = wv.希望;
      var cls = 'sft-day d' + d.getDay() + (inMonth ? '' : ' out') + (w ? ' ' + WISH_CLS[w] : '') + (sub.sel === s ? ' sel' : '') +
        (sub.edits[s] ? ' dirty' : '') + (s === td ? ' today' : '') + (s < td ? ' past' : '');
      html += inMonth
        ? '<button type="button" class="' + cls + '" data-d="' + s + '" aria-label="' + dayLabel(s) + (s === td ? ' 今日' : '') + (w ? ' ' + w : ' 未設定') + (wv.メモ ? ' メモあり' : '') + (sub.edits[s] ? ' 未送信' : '') + '" aria-pressed="' + (sub.sel === s) + '"' + (off ? ' disabled' : '') + '>' +
            '<span class="n">' + d.getDate() + '</span>' + (wv.メモ ? '<i class="sft-memo-mk" aria-hidden="true"></i>' : '') + '</button>'
        : '<span class="' + cls + '" aria-hidden="true"><span class="n">' + d.getDate() + '</span></span>';
    }
    document.getElementById('sft-days').innerHTML = html;
    var ld = document.getElementById('sft-calload');
    ld.hidden = !sub.loading;
    ld.innerHTML = sub.loading ? '<span class="sft-spin" aria-hidden="true"></span>読み込み中...' : '';
  }

  // カレンダーの下: この月の数のまとめと、未設定をまとめて埋めるボタン
  function drawTally() {
    var el = document.getElementById('sft-tally');
    var lock = document.getElementById('sft-lock');
    lock.hidden = !(sub.locked && !sub.loading);
    lock.innerHTML = lock.hidden ? '' : '<b>' + esc(ymLabel(sub.ym)) + 'のシフトは' + esc(sub.state || '確定') + '済みです</b>' +
      '<p>この月の希望は変えられません。変更したいときは管理者（シフトを作る人）へ連絡してください。</p><a href="#shift-view">シフト確認で勤務を見る ›</a>';
    if (sub.loading || sub.failed) { el.innerHTML = ''; return; }
    var n = { 出勤可: 0, 出勤不可: 0, 休み希望: 0, '': 0 };
    monthDays(sub.ym).forEach(function (d) { n[wishOf(d).希望 || ''] += 1; });
    el.innerHTML = '<div class="sft-tally-n">' + WISHES.map(function (w) {
      return '<span class="' + WISH_CLS[w] + '"><i aria-hidden="true"></i>' + w + '<b>' + n[w] + '</b></span>';
    }).join('') + '<span class="none"><i aria-hidden="true"></i>未設定<b>' + n[''] + '</b></span></div>' +
      (n[''] && !sub.locked ? '<button type="button" id="sft-fill" class="sft-fill">未設定の' + n[''] + '日をまとめて「出勤可」にする</button>' : '');
  }

  function drawPlan() {
    var on = !!sub.sel && !sub.loading && !sub.failed, w = on ? wishOf(sub.sel) : { 希望: '', メモ: '' };
    var can = on && !sub.locked; // 確定した月は日を選んで見られるが、変えられない
    document.getElementById('sft-plan').classList.toggle('idle', !on);
    document.getElementById('sft-seldate').innerHTML = on
      ? '<strong>' + esc(dayLabel(sub.sel)) + '</strong><span>' + esc(sub.sel) + '</span>'
      : (sub.loading ? '読み込み中...' : 'カレンダーの日付を押してください');
    document.getElementById('sft-cur').innerHTML = on
      ? (w.希望 ? '<span class="sft-chip ' + WISH_CLS[w.希望] + '">' + esc(w.希望) + '</span>' : '<span class="sft-chip none">--</span>') +
        (sub.edits[sub.sel] ? '<em class="sft-cur-dirty">未送信</em>' : '')
      : '';
    app.querySelectorAll('.sft-segbtn').forEach(function (b) {
      var p = on && b.dataset.w === (w.希望 || '');
      b.disabled = !can; b.classList.toggle('on', p); b.setAttribute('aria-checked', String(p));
    });
    app.querySelectorAll('[data-step]').forEach(function (b) {
      var to = on ? addDay(sub.sel, +b.dataset.step) : '';
      b.disabled = !on || to.slice(0, 7) !== sub.ym;
    });
    document.getElementById('sft-offs').disabled = !on;
    var note = document.getElementById('sft-note');
    note.disabled = !can;
    if (document.activeElement !== note) note.value = w.メモ || '';
    document.getElementById('sft-memo-n').textContent = (note.value || '').length + '/200';
    var n = dirtyDates().length, btn = document.getElementById('sft-send'), bn = document.getElementById('sft-bar-note');
    btn.textContent = n ? '送信（' + n + '日分）' : '送信';
    btn.classList.toggle('empty', !n);
    // ほかの月に送っていない変更があるときは、送信バーの上に知らせる
    var other = dirtyDates().filter(function (d) { return d.slice(0, 7) !== sub.ym; }).map(function (d) { return d.slice(0, 7); });
    other = other.filter(function (m, i) { return other.indexOf(m) === i; });
    bn.hidden = !other.length;
    bn.textContent = other.length ? other.map(mLabel).join('・') + 'の未送信の変更も一緒に送ります' : '';
  }

  function pick(date) {
    sub.sel = date;
    drawDays(); drawPlan();
  }
  function stepDay(n) {
    if (!sub.sel) return;
    var to = addDay(sub.sel, n);
    if (to.slice(0, 7) === sub.ym) pick(to);
  }

  function setWish(date, change) {
    var cur = wishOf(date), next = { 希望: cur.希望 || '', メモ: cur.メモ || '' };
    Object.keys(change).forEach(function (k) { next[k] = change[k]; });
    var saved = sub.saved[date] || { 希望: '', メモ: '' };
    // メモは前後の空白・改行を除いて比べる（空白だけ打った・消し残した日を「未送信」にしない）
    if (next.希望 === (saved.希望 || '') && String(next.メモ || '').trim() === String(saved.メモ || '').trim()) delete sub.edits[date];
    else sub.edits[date] = next;
  }
  function edit(change) {
    if (!sub.sel || sub.locked) return;
    setWish(sub.sel, change);
    drawDays(); drawPlan(); drawTally();
  }
  function fillUnset() {
    if (sub.locked) return;
    var list = monthDays(sub.ym).filter(function (d) { return !wishOf(d).希望; });
    list.forEach(function (d) { setWish(d, { 希望: '出勤可' }); });
    drawDays(); drawPlan(); drawTally();
    toast(list.length + '日を「出勤可」にしました。送信すると届きます');
  }

  function send() {
    if (sub.sending) return; // 送信中の二度押し・Enter の連打
    var err = document.getElementById('sft-err');
    var dates = dirtyDates();
    if (!dates.length) { err.innerHTML = '<div class="errors" role="alert">まだ変更がありません。日付を押して予定を選んでから送信してください</div>'; return; }
    err.innerHTML = '';
    // 月ごとにまとめて送る（GAS は1回に1か月分を受け取る）
    var byYm = {};
    dates.forEach(function (d) { (byYm[d.slice(0, 7)] = byYm[d.slice(0, 7)] || []).push({ 対象日: d, 希望: sub.edits[d].希望, メモ: String(sub.edits[d].メモ || '').trim() }); });
    var btn = document.getElementById('sft-send'), gen = I.gen;
    btn.disabled = true; btn.textContent = '送信中…'; I.busy(true); sub.sending = true;
    var chain = Promise.resolve();
    Object.keys(byYm).sort().forEach(function (ym) {
      chain = chain.then(function () {
        return api('submitShiftWishes', { 年月: ym, 日: byYm[ym] }).then(function () {
          byYm[ym].forEach(function (d) { delete sub.edits[d.対象日]; });
        });
      });
    });
    chain.then(function () {
      sub.sending = false;
      toast(dates.length + '日分の希望を送信しました');
      // 送信中にほかの画面へ移ったときは、届いたことだけ知らせる（提出の画面へ戻っていれば読み直す）
      if (stale(gen)) { if (document.getElementById('sft-days')) loadMonth(); return; }
      I.busy(false); btn.disabled = false;
      loadMonth();
    }).catch(function (e) {
      sub.sending = false;
      if (stale(gen)) { toast(e.message || '送信できませんでした'); return; } // 送れなかった分は edits に残っている
      I.busy(false); btn.disabled = false; drawPlan(); drawDays(); drawTally();
      err.innerHTML = e.details && e.details.length ? I.errorsBox(e.details) : failBox(e);
      err.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }

  // その日の自分以外の休み（参考: 施設のタブで絞り込み）
  var OFF_CLS = { '出勤不可': 'ng', '休み希望': 'off', '公休': 'rest', '明け': 'ake' };
  function showOffs(date) {
    var sheet = openSheet(
      '<div class="sft-sheet-head"><div><h2 id="sft-sheet-h">' + dayLabel(date) + ' の休み申請</h2><p class="sft-count" id="sft-offn">&nbsp;</p></div>' +
      '<button type="button" class="sft-x" data-close aria-label="閉じる">×</button></div>' +
      '<div class="sft-tabs" id="sft-tabs" role="tablist"></div>' +
      '<div class="sft-offlist" id="sft-offlist">' + loadingBar() + '</div>');
    function load() {
      sheet.querySelector('#sft-offlist').innerHTML = loadingBar();
      api('dayOffs', { 対象日: date }).then(function (r) {
        if (!sheet.isConnected) return; // 閉じた・別の日を開き直したシートには描かない
        var tabs = ['全施設'].concat(r.施設 || []), cur = '全施設', list = r.一覧 || [];
        function draw() {
          var rows = list.filter(function (x) { return cur === '全施設' || x.施設名 === cur; });
          var kinds = {};
          rows.forEach(function (x) { kinds[x.休み] = (kinds[x.休み] || 0) + 1; });
          sheet.querySelector('#sft-offn').textContent = rows.length + '件' + (rows.length ? '（' + Object.keys(kinds).map(function (k) { return k + ' ' + kinds[k]; }).join('・') + '）' : '');
          sheet.querySelector('#sft-tabs').innerHTML = tabs.map(function (t) {
            return '<button type="button" role="tab" class="sft-tab' + (t === cur ? ' on' : '') + '" aria-selected="' + (t === cur) + '" data-tab="' + esc(t) + '">' + esc(t) + '</button>';
          }).join('');
          sheet.querySelector('#sft-offlist').innerHTML = rows.length ? rows.map(function (x) {
            return '<div class="sft-off"><div class="sft-off-who"><b>' + esc(x.氏名) + '</b><small>' + esc(x.施設名) + '</small>' +
              (x.明け && x.休み !== '明け' ? '<span class="sft-ake">夜勤明け<i aria-hidden="true">明</i></span>' : '') + '</div>' +
              '<span class="sft-offk ' + (OFF_CLS[x.休み] || '') + '">' + esc(x.休み) + '</span></div>';
          }).join('') : emptyBox('この日に休みを出している人はいません', cur === '全施設' ? '' : '「全施設」に切り替えると、ほかの施設の人も見られます');
        }
        sheet.querySelector('#sft-tabs').addEventListener('click', function (e) {
          var t = e.target.closest('[data-tab]');
          if (t) { cur = t.dataset.tab; draw(); }
        });
        draw();
      }).catch(function (e) { if (sheet.isConnected) sheet.querySelector('#sft-offlist').innerHTML = failBox(e, 'offs'); });
    }
    sheet.addEventListener('click', function (e) { if (e.target.closest('[data-retry="offs"]')) load(); });
    load();
  }

  // ---------- シフト確認 ----------
  var chk = { ym: null };
  function viewCheck() {
    if (!chk.ym) chk.ym = thisYm();
    app.innerHTML =
      '<div class="sft-head"><h1 class="sft-title">シフト確認<small>（' + esc(state.me && state.me.氏名) + '）</small></h1>' +
      '<div id="chk-info" class="sft-info"></div></div>' +
      '<div class="chk-nav"><button type="button" data-mv="-1">‹ 前月</button><b id="chk-ym" aria-live="polite"></b><button type="button" data-mv="1">次月 ›</button></div>' +
      '<div id="chk-sum"></div>' +
      '<div id="chk-list" class="chk-list"></div>' +
      I.backHtml('#shift');
    app.querySelectorAll('[data-mv]').forEach(function (b) {
      b.addEventListener('click', function () { chk.ym = addMonth(chk.ym, +b.dataset.mv); loadCheck(); });
    });
    onApp(function (e) {
      if (e.target.closest('[data-retry="chk"]')) loadCheck();
      if (e.target.closest('#chk-today')) {
        var t = document.querySelector('.chk-day.today');
        if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash'); }
      }
    });
    loadCheck();
  }
  function loadCheck() {
    var ym = chk.ym, gen = I.gen;
    document.getElementById('chk-ym').textContent = ymLabel(ym);
    var list = document.getElementById('chk-list'), sum = document.getElementById('chk-sum');
    // 参考アプリと同じく、前の中身は薄くして上に「読み込み中」を出す（画面が跳ねない）
    list.classList.add('stale');
    sum.innerHTML = loadingBar();
    api('myShifts', { 年月: ym }).then(function (r) {
      if (stale(gen) || chk.ym !== ym) return;
      list.classList.remove('stale');
      document.getElementById('chk-info').innerHTML =
        '<p><span><em>職員番号：</em>' + esc(r.職員番号) + '</span></p>' +
        '<p class="chk-fac"><span><em>所属：</em>' + esc((r.所属 || []).join(', ')) + '</span></p>';
      var days = r.日 || [], td = I.today();
      sum.innerHTML = drawCheckSum(r, ym);
      if (!days.length) { list.innerHTML = emptyBox(ymLabel(ym) + 'の予定はありません'); return; }
      list.innerHTML = days.map(function (d) {
        var o = dateObj(d.対象日), isToday = d.対象日 === td;
        var head = '<div class="chk-dh"><b class="d' + o.getDay() + '">' + o.getDate() + '日（' + DOW[o.getDay()] + '）' + (isToday ? '<span class="chk-todaytag">今日</span>' : '') + '</b><span>' + esc(d.対象日) + '</span></div>';
        var body;
        if (d.種類 === '勤務') {
          var rest = WORKING.indexOf(d.勤務) < 0;
          body = '<dl class="chk-box work' + (rest ? ' rest' : '') + (d.勤務 === '夜勤' ? ' night' : '') + '"><dt>施設名</dt><dd>' + esc(d.施設名) + '</dd><dt>勤務</dt><dd>' + esc(d.勤務) + '</dd></dl>';
        } else if (d.種類 === '希望') {
          body = '<dl class="chk-box"><dt>勤務</dt><dd><span class="sft-chip ' + (WISH_CLS[d.勤務] || '') + '">' + esc(d.勤務) + '</span><small class="chk-wishnote">あなたの希望</small></dd></dl>';
        } else {
          body = '<dl class="chk-box"><dt>勤務</dt><dd class="unset">' + esc(d.勤務 || '勤務未設定') + '</dd></dl>';
        }
        return '<article class="chk-day' + (isToday ? ' today' : '') + (d.対象日 < td ? ' past' : '') + '">' + head + body + '</article>';
      }).join('');
    }).catch(function (e) {
      if (stale(gen) || chk.ym !== ym) return;
      list.classList.remove('stale');
      list.innerHTML = '';
      sum.innerHTML = failBox(e, 'chk');
    });
  }
  // 月のまとめ: 確定していれば勤務の数、まだなら確定前の知らせ
  function drawCheckSum(r, ym) {
    var days = r.日 || [], isNow = ym === thisYm();
    var todayBtn = isNow ? '<button type="button" id="chk-today" class="chk-todaybtn">今日へ</button>' : '';
    if (!r.確定) {
      var wish = days.filter(function (d) { return d.種類 === '希望'; }).length;
      return '<div class="chk-note"><b>' + esc(ymLabel(ym)) + 'のシフトはまだ確定していません</b>' +
        '<p>確定すると、ここに勤務が出ます。いまは出した休みの希望（' + wish + '日）だけ出ています。</p>' +
        '<a href="#shift-submit">希望を出す・直す ›</a></div>' + (todayBtn ? '<div class="chk-tools">' + todayBtn + '</div>' : '');
    }
    var n = {}, work = 0, rest = 0;
    days.forEach(function (d) {
      if (d.種類 !== '勤務') return;
      if (WORKING.indexOf(d.勤務) >= 0) { work++; n[d.勤務] = (n[d.勤務] || 0) + 1; } else rest++;
    });
    return '<div class="chk-sum"><div class="chk-sum-main"><span><b>' + work + '</b>日 勤務</span><span><b>' + rest + '</b>日 休み・明け</span>' + todayBtn + '</div>' +
      '<div class="chk-sum-kinds">' + WORKING.filter(function (k) { return n[k]; }).map(function (k) {
        return '<span class="' + (k === '夜勤' ? 'night' : '') + '">' + k + ' ' + n[k] + '</span>';
      }).join('') + '</div></div>';
  }

  // ---------- シフト作成（承認者・管理者） ----------
  // editFac … 施設タブで入れたマスの施設（マスのキー → 施設名）、fac … 見ている施設タブ
  var mk = { ym: null, board: null, edits: {}, editFac: {}, fac: '', need: null };
  function cellKey(id, date) { return id + '|' + date; }
  function savedAt(p, date) { return (p.シフト[date] && p.シフト[date].勤務) || ''; }
  function shiftAt(p, date) {
    var k = cellKey(p.職員ID, date);
    if (k in mk.edits) return mk.edits[k];
    return savedAt(p, date);
  }
  // ---- 施設（施設が2つ以上のときだけタブを出して絞り込む） ----
  function facList() {
    var b = mk.board, out = (b.施設 || []).slice();
    b.職員.forEach(function (p) { (p.所属施設 || []).forEach(function (f) { if (out.indexOf(f) < 0) out.push(f); }); });
    return out;
  }
  function useFac() { return facList().length >= 2; }
  // 表に出す職員: タブの施設に所属する人（所属施設が空の人はどのタブにも出す）
  function staffList() {
    if (!useFac()) return mk.board.職員;
    return mk.board.職員.filter(function (p) { var f = p.所属施設 || []; return !f.length || f.indexOf(mk.fac) >= 0; });
  }
  // そのマスの勤務がどの施設のものか（入れ直したマスは入れたときのタブ、保存済みは施設名、どちらも無ければ所属の1つ目）
  function facAt(p, date) {
    var k = cellKey(p.職員ID, date);
    if (k in mk.edits && mk.editFac[k]) return mk.editFac[k];
    return (p.シフト[date] && p.シフト[date].施設名) || (p.所属施設 || [])[0] || '';
  }
  // ほかの施設での勤務（2施設に所属する人）。この施設の人数には数えない
  function elsewhere(p, date) { return useFac() && !!shiftAt(p, date) && facAt(p, date) !== mk.fac; }
  function canOf(p) { return String(p.可能勤務 || '').split(/[、,\s]+/).filter(Boolean); }
  // マスの食い違い: cannot … 可能勤務にない勤務を入れた、clash … 出勤不可・休み希望の日に勤務を入れた
  function issueOf(p, date) {
    var s = shiftAt(p, date), w = p.希望[date] && p.希望[date].希望, can = canOf(p), work = WORKING.indexOf(s) >= 0;
    return { cannot: work && can.length > 0 && can.indexOf(s) < 0, clash: work && (w === '出勤不可' || w === '休み希望') };
  }
  // 月全体の数（確定前の確認に出す）
  function monthIssues() {
    var r = { empty: 0, filled: 0, cannot: 0, clash: 0 };
    mk.board.職員.forEach(function (p) { // 確定は月全体（全施設）なので全員を数える
      monthDays(mk.board.年月).forEach(function (d) {
        if (shiftAt(p, d)) r.filled++; else r.empty++;
        var x = issueOf(p, d);
        if (x.cannot) r.cannot++;
        if (x.clash) r.clash++;
      });
    });
    return r;
  }
  function hasKind(k) { return (mk.board.勤務区分 || []).indexOf(k) >= 0; }
  function loadNeed() {
    var n = { 日中: NEED_DEFAULT.日中, 夜勤: NEED_DEFAULT.夜勤 };
    try { var s = JSON.parse(localStorage.getItem(NEED_KEY) || 'null'); if (s && s.日中 >= 0 && s.夜勤 >= 0) n = { 日中: +s.日中, 夜勤: +s.夜勤 }; } catch (_) {}
    return n;
  }
  function saveNeed() { try { localStorage.setItem(NEED_KEY, JSON.stringify(mk.need)); } catch (_) {} }
  // GAS が必要人数を返していればそれを使う（全日共通 {日中,夜勤} か、日ごと {'YYYY-MM-DD': {日中,夜勤}}）
  function needOf(date) {
    var g = mk.board && mk.board.必要人数;
    if (g && g[date]) return { 日中: +g[date].日中 || 0, 夜勤: +g[date].夜勤 || 0 };
    if (g && g.日中 !== undefined) return { 日中: +g.日中 || 0, 夜勤: +g.夜勤 || 0 };
    return mk.need;
  }
  function needFromGas() { return !!(mk.board && mk.board.必要人数); }
  // その日の人数と、足りない数
  function countOf(date) {
    var day = 0, night = 0, can = 0;
    staffList().forEach(function (p) {
      var s = elsewhere(p, date) ? '' : shiftAt(p, date);
      if (DAYTIME.indexOf(s) >= 0) day++;
      if (s === '夜勤') night++;
      if (p.希望[date] && p.希望[date].希望 === '出勤可') can++;
    });
    var need = needOf(date);
    return { 日中: day, 夜勤: night, 出勤可: can, need: need, lackDay: Math.max(0, need.日中 - day), lackNight: Math.max(0, need.夜勤 - night) };
  }

  function viewMake() {
    if (!I.canApprove()) {
      app.innerHTML = '<div class="sft-head"><h1 class="sft-title">シフト作成</h1></div>' +
        emptyBox('シフト作成は承認者・管理者だけが使えます', '自分のシフトは「シフト確認」で見られます。') + I.backHtml('#shift');
      return;
    }
    if (!mk.ym) mk.ym = nextYm();
    if (!mk.need) mk.need = loadNeed();
    document.addEventListener('keydown', onEsc);
    window.addEventListener('beforeunload', onUnload);
    I.cleanup.push(function () {
      document.removeEventListener('keydown', onEsc); window.removeEventListener('beforeunload', onUnload);
      closeSheet(true); document.body.classList.remove('sft-has-bar');
      keepEdits();
    });
    document.body.classList.add('sft-has-bar');
    app.innerHTML =
      '<div class="sft-head"><h1 class="sft-title">シフト作成</h1>' +
      '<p class="mk-lead">マスを押して勤務を入れます。マスの色は職員の希望です。「確定する」と職員の「シフト確認」に出ます（LINE への通知はしません）。</p></div>' +
      '<div class="chk-nav"><button type="button" data-mv="-1">‹ 前月</button><b id="mk-ym" aria-live="polite"></b><button type="button" data-mv="1">次月 ›</button></div>' +
      '<div class="mk-status" id="mk-status"></div>' +
      '<div class="sft-tabs mk-factabs" id="mk-facs" role="tablist" aria-label="施設" hidden></div>' +
      '<section class="mk-short" id="mk-short" aria-live="polite"></section>' +
      '<div class="mk-tools" id="mk-tools"></div>' +
      '<div id="mk-board" class="mk-board">' + loadingBar() + '</div>' +
      '<div class="sft-legend mk-legend">' + WISHES.map(function (w) { return '<span class="sft-chip ' + WISH_CLS[w] + '">希望：' + w + '</span>'; }).join('') +
        '<span class="sft-chip none">希望なし</span><span class="mk-keys"><i class="mk-warn-mk mk-key-ic" aria-hidden="true">!</i>希望と食い違い　<s>薄い点線</s>可能勤務外</span>' +
        '<span class="mk-keys">' + Object.keys(SHORT).map(function (k) { return '<b>' + SHORT[k] + '</b>' + k; }).join(' ') + '</span></div>' +
      '<div id="mk-err"></div>' +
      I.backHtml('#shift') +
      '<div class="sft-bar mk-bar"><p class="sft-bar-note" id="mk-bar-note" hidden></p><div class="mk-bar-btns"><button type="button" class="sub" id="mk-save">下書き保存</button><button type="button" id="mk-fix" class="sft-send">確定する</button></div></div>';
    app.querySelectorAll('[data-mv]').forEach(function (b) {
      b.addEventListener('click', function () { leaveMonth(+b.dataset.mv); });
    });
    document.getElementById('mk-board').addEventListener('click', function (e) {
      var c = e.target.closest('button[data-id]');
      if (c) editCell(c.dataset.id, c.dataset.d);
    });
    document.getElementById('mk-short').addEventListener('click', function (e) {
      var c = e.target.closest('[data-go]');
      if (c) goColumn(c.dataset.go);
      if (e.target.closest('#mk-more')) { mk.showAll = true; drawShort(); }
    });
    document.getElementById('mk-tools').addEventListener('click', function (e) {
      var b = e.target.closest('[data-need]');
      if (b) {
        var a = b.dataset.need.split(':');
        mk.need[a[0]] = Math.max(0, Math.min(20, mk.need[a[0]] + +a[1]));
        saveNeed(); drawBoard();
      }
      if (e.target.closest('#mk-auto')) autoFill(false);
      if (e.target.closest('#mk-off')) autoFill(true);
    });
    onApp(function (e) { if (e.target.closest('[data-retry="mk"]')) loadMake(); });
    document.getElementById('mk-save').addEventListener('click', function () { saveMake(false); });
    document.getElementById('mk-fix').addEventListener('click', askFix);
    document.getElementById('mk-status').addEventListener('click', function (e) { if (e.target.closest('#mk-unfix')) askUnfix(); });
    document.getElementById('mk-facs').addEventListener('click', function (e) {
      var t = e.target.closest('[data-fac]');
      if (t && t.dataset.fac !== mk.fac) { mk.fac = t.dataset.fac; mk.showAll = false; drawBoard(); }
    });
    loadMake();
  }

  // 戻る・リッチメニューなどで画面を離れたとき、保存していない変更を黙って消さない。
  // ハッシュの移動は止められない（core.js の route が先に動く）ので、預かっておき、作成の画面へ戻ったら戻す。
  // 読み直しても残るよう sessionStorage にも置く。ページを閉じる・読み直すときはブラウザの確認を出す
  var KEEP_KEY = 'ippo.shiftMakeKeep';
  function onUnload(e) {
    if (!Object.keys(mk.edits).length) return;
    keepEdits(true);
    e.preventDefault(); e.returnValue = '';
  }
  function keepEdits(quiet) {
    var n = Object.keys(mk.edits).length;
    if (!mk.board || !n || mk.saving) return;
    mk.keep = { ym: mk.ym, edits: Object.assign({}, mk.edits), fac: Object.assign({}, mk.editFac) };
    try { sessionStorage.setItem(KEEP_KEY, JSON.stringify(mk.keep)); } catch (_) {}
    if (!quiet) toast('シフト作成の保存していない ' + n + 'マスは預かっています。作成の画面に戻ると続きから直せます');
  }
  function takeKept(ym) {
    var k = mk.keep;
    if (!k) { try { k = JSON.parse(sessionStorage.getItem(KEEP_KEY) || 'null'); } catch (_) { k = null; } }
    if (!k || k.ym !== ym || !k.edits) return null;
    mk.keep = null;
    try { sessionStorage.removeItem(KEEP_KEY); } catch (_) {}
    return k;
  }

  // 保存していない変更があるときに月を移ろうとしたら聞く
  function leaveMonth(n) {
    var cnt = Object.keys(mk.edits).length;
    function go() { mk.ym = addMonth(mk.ym, n); loadMake(); }
    if (!cnt) { go(); return; }
    var sheet = confirmSheet('保存していない変更があります', '<p>' + esc(ymLabel(mk.ym)) + 'の ' + cnt + 'マスがまだ保存されていません。</p>',
      '保存して移る', function () { saveMake(false, go); },
      '<button type="button" class="danger" data-drop>保存せずに移る</button>');
    sheet.querySelector('[data-drop]').addEventListener('click', function () { closeSheet(); mk.edits = {}; mk.editFac = {}; go(); });
  }

  function loadMake() {
    var ym = mk.ym, gen = I.gen;
    mk.edits = {}; mk.editFac = {}; mk.board = null; mk.showAll = false;
    document.getElementById('mk-ym').textContent = ymLabel(ym);
    ['mk-status', 'mk-short', 'mk-tools', 'mk-err'].forEach(function (id) { document.getElementById(id).innerHTML = ''; });
    document.getElementById('mk-board').innerHTML = loadingBar('職員の希望と勤務を読み込み中...');
    setBar(false);
    api('shiftBoard', { 年月: ym }).then(function (b) {
      if (stale(gen) || mk.ym !== ym) return;
      b.職員 = (b.職員 || []).map(function (p) { p.希望 = p.希望 || {}; p.シフト = p.シフト || {}; return p; });
      mk.board = b;
      // 前に離れたときに預かった変更を戻す（いない職員・この月でない日のマスは捨てる）
      var fl = facList();
      if (fl.indexOf(mk.fac) < 0) mk.fac = fl[0] || ''; // 前に見ていた施設があればそのまま
      var keptAll = takeKept(ym), kept = keptAll && keptAll.edits, ids = b.職員.map(function (p) { return p.職員ID; }), back = 0;
      if (kept) Object.keys(kept).forEach(function (k) {
        var a = k.split('|');
        if (ids.indexOf(a[0]) >= 0 && a[1].slice(0, 7) === ym) { mk.edits[k] = kept[k]; if (keptAll.fac && keptAll.fac[k]) mk.editFac[k] = keptAll.fac[k]; back++; }
      });
      drawBoard();
      if (back) toast('保存していない ' + back + 'マスを戻しました。「下書き保存」で保存されます');
    }).catch(function (e) {
      if (stale(gen) || mk.ym !== ym) return;
      document.getElementById('mk-board').innerHTML = failBox(e, 'mk');
    });
  }

  function setBar(on) {
    document.getElementById('mk-save').disabled = !on;
    document.getElementById('mk-fix').disabled = !on;
  }

  function drawStatus() {
    var st = mk.board.状態 || {}, n = Object.keys(mk.edits).length;
    document.getElementById('mk-status').innerHTML =
      (st.状態 === '確定' ? '<span class="pill ok">確定</span><small>' + esc(st.確定日時) + ' に確定。直して保存するとすぐ職員に見えます</small>' +
          '<button type="button" class="sub small mk-unfix" id="mk-unfix">確定を取り消す</button>'
        : '<span class="pill wait">作成中</span><small>職員にはまだ見えません</small>');
    var note = document.getElementById('mk-bar-note');
    note.hidden = !n; note.textContent = n ? '保存していない変更 ' + n + 'マス' : '';
    document.getElementById('mk-save').textContent = n ? '下書き保存（' + n + '）' : '下書き保存';
    document.getElementById('mk-fix').textContent = st.状態 === '確定' && !n ? '確定済み' : '確定する';
    document.getElementById('mk-save').disabled = !n;
    document.getElementById('mk-fix').disabled = st.状態 === '確定' && !n;
  }

  // 施設のタブ（2つ以上のときだけ）。足りない日・人数・仮入れは、選んだ施設の分だけで数える
  function drawFacs() {
    var el = document.getElementById('mk-facs'), fl = facList();
    el.hidden = fl.length < 2;
    el.innerHTML = fl.length < 2 ? '' : fl.map(function (f) {
      var n = mk.board.職員.filter(function (p) { var x = p.所属施設 || []; return !x.length || x.indexOf(f) >= 0; }).length;
      return '<button type="button" role="tab" class="sft-tab' + (f === mk.fac ? ' on' : '') + '" aria-selected="' + (f === mk.fac) + '" data-fac="' + esc(f) + '">' + esc(f) + '<small>' + n + '人</small></button>';
    }).join('');
  }

  // 足りない日の一覧（押すとその日の列へ移る）
  function drawShort() {
    var days = monthDays(mk.board.年月), td = I.today();
    var lack = days.map(function (d) { return { d: d, c: countOf(d) }; }).filter(function (x) { return x.c.lackDay || x.c.lackNight; });
    var el = document.getElementById('mk-short');
    if (!staffList().length) { el.innerHTML = ''; return; }
    if (!lack.length) {
      el.className = 'mk-short good';
      el.innerHTML = '<b class="mk-short-h"><i aria-hidden="true">✓</i>どの日も必要な人数がそろっています</b>';
      return;
    }
    var max = mk.showAll ? lack.length : 8;
    el.className = 'mk-short';
    el.innerHTML = '<div class="mk-short-top"><b class="mk-short-h"><i aria-hidden="true">!</i>人が足りない日 <strong>' + lack.length + '</strong>日</b><small>押すとその日へ移ります</small></div>' +
      '<div class="mk-short-list">' + lack.slice(0, max).map(function (x) {
        var w = dateObj(x.d).getDay(), parts = [];
        if (x.c.lackDay) parts.push('日中あと' + x.c.lackDay);
        if (x.c.lackNight) parts.push('夜勤あと' + x.c.lackNight);
        return '<button type="button" class="mk-lack' + (x.d < td ? ' past' : '') + '" data-go="' + x.d + '"><b class="d' + w + '">' + esc(shortDay(x.d)) + '</b><span>' + parts.join('・') + '</span></button>';
      }).join('') + (lack.length > max ? '<button type="button" class="mk-lack more" id="mk-more">ほか ' + (lack.length - max) + '日</button>' : '') + '</div>';
  }

  function drawTools() {
    var from = needFromGas(), fill = autoPlan(false).length, off = autoPlan(true).length;
    function step(k) {
      return '<span class="mk-need-k">' + k + '</span>' + (from ? '<b>' + needOf(mk.board.年月 + '-01')[k] + '</b>'
        : '<button type="button" class="mk-stepper" data-need="' + k + ':-1" aria-label="' + k + 'の必要人数を減らす">−</button><b aria-live="polite">' + mk.need[k] + '</b><button type="button" class="mk-stepper" data-need="' + k + ':1" aria-label="' + k + 'の必要人数を増やす">＋</button>') + '<span class="mk-need-u">人</span>';
    }
    document.getElementById('mk-tools').innerHTML =
      '<div class="mk-need"><span class="mk-need-h">1日に必要な人数</span><div class="mk-need-row">' + step('日中') + step('夜勤') + '</div>' +
        (from ? '' : '<small>この端末に覚えます</small>') + '</div>' +
      // 2つのボタンは入れるマスが重ならない（休み → 公休 ／ 出勤可・夜勤の翌日 → 日勤・明け）
      (off ? '<button type="button" id="mk-off" class="mk-auto">休み希望を公休で埋める（' + off + 'マス）<small>空いているマスだけ：出勤不可・休み希望 → 公休</small></button>' : '') +
      (fill ? '<button type="button" id="mk-auto" class="mk-auto">希望から仮入れ（' + fill + 'マス）<small>空いているマスだけ：出勤可 → 日勤' + (hasKind('明け') ? '、夜勤の翌日 → 明け' : '') + '</small></button>' : '');
  }

  function drawBoard() {
    var b = mk.board, days = monthDays(b.年月), td = I.today(), staff = staffList();
    drawStatus(); drawFacs(); drawShort(); drawTools();
    if (!staff.length) {
      document.getElementById('mk-board').innerHTML = emptyBox('この月に割り当てる職員がいません', '職員の登録（所属・可能勤務）を確かめてください。');
      return;
    }
    var cnt = {};
    days.forEach(function (d) { cnt[d] = countOf(d); });
    var head = '<tr><th class="mk-name mk-corner" scope="col">職員</th>' + days.map(function (d) {
      var w = dateObj(d).getDay(), c = cnt[d], lack = c.lackDay || c.lackNight;
      return '<th scope="col" data-col="' + d + '" class="d' + w + (lack ? ' lack' : '') + (d === td ? ' today' : '') + '">' + +d.slice(8) + '<small>' + DOW[w] + '</small></th>';
    }).join('') + '<th scope="col" class="mk-tot">計</th></tr>';
    var rows = staff.map(function (p) {
      var tot = 0, night = 0;
      var cells = days.map(function (d) {
        var w = p.希望[d] && p.希望[d].希望, s = shiftAt(p, d), k = cellKey(p.職員ID, d);
        var memo = p.希望[d] && p.希望[d].メモ;
        if (WORKING.indexOf(s) >= 0 && !away) tot++;
        if (s === '夜勤' && !away) night++;
        // 希望が「出勤不可・休み希望」なのに勤務を入れたマスは斜線と「!」、可能勤務にない勤務は薄く点線で示す
        var iss = issueOf(p, d), clash = iss.clash, away = elsewhere(p, d);
        if (away) { iss.cannot = false; clash = false; } // ほかの施設の勤務は、その施設のタブで確かめる
        return '<td><button type="button" class="mk-cell' + (WISH_CLS[w] ? ' ' + WISH_CLS[w] : '') + (k in mk.edits ? ' dirty' : '') + (s && WORKING.indexOf(s) < 0 ? ' rest' : '') + (s === '夜勤' ? ' night' : '') + (clash ? ' clash' : '') + (iss.cannot ? ' cannot' : '') + (away ? ' away' : '') + '" data-id="' + esc(p.職員ID) + '" data-d="' + d + '"' +
          ' aria-label="' + esc(p.氏名) + ' ' + dayLabel(d) + ' 希望 ' + (w || 'なし') + ' 勤務 ' + (s || '未設定') + (away ? ' ' + esc(facAt(p, d)) + 'の勤務' : '') + (clash ? ' 希望と食い違い' : '') + (iss.cannot ? ' 可能勤務外' : '') + (memo ? ' メモ ' + esc(memo) : '') + '">' +
          (SHORT[s] || esc(String(s || '').slice(0, 1))) + (memo ? '<i class="mk-memo" aria-hidden="true"></i>' : '') + (clash ? '<i class="mk-warn-mk" aria-hidden="true">!</i>' : '') + '</button></td>';
      }).join('');
      return '<tr><th scope="row" class="mk-name"><b>' + esc(p.氏名) + '</b><small>' + esc(p.職種) + (p.雇用形態 ? '・' + esc(p.雇用形態) : '') + '</small></th>' + cells +
        '<td class="mk-tot"><b>' + tot + '</b>' + (night ? '<small>夜' + night + '</small>' : '') + '</td></tr>';
    }).join('');
    function sumRow(label, key, needKey, lackKey) {
      return '<tr class="mk-sum"><th scope="row" class="mk-name">' + label + '</th>' + days.map(function (d) {
        var c = cnt[d], lack = c[lackKey];
        return '<td class="' + (lack ? 'lack' : 'ok') + '"><span>' + c[key] + '<small>/' + c.need[needKey] + '</small></span></td>';
      }).join('') + '<td class="mk-tot"></td></tr>';
    }
    var canRow = '<tr class="mk-sum can"><th scope="row" class="mk-name">出勤可の人</th>' + days.map(function (d) {
      return '<td>' + (cnt[d].出勤可 || '') + '</td>';
    }).join('') + '<td class="mk-tot"></td></tr>';
    var keep = document.querySelector('.mk-scroll'), left = keep ? keep.scrollLeft : null;
    document.getElementById('mk-board').innerHTML = '<div class="mk-scroll"><table class="mk-table"><thead>' + head + '</thead><tbody>' + rows + '</tbody>' +
      '<tfoot>' + sumRow('日中の人数', '日中', '日中', 'lackDay') + sumRow('夜勤の人数', '夜勤', '夜勤', 'lackNight') + canRow + '</tfoot></table></div>' +
      '<p class="mk-hint">横にずらすと月末まで見られます。下の段の赤は人が足りない日です。</p>';
    var sc = document.querySelector('.mk-scroll');
    if (left !== null) sc.scrollLeft = left;
    else if (b.年月 === thisYm()) { var t = sc.querySelector('th.today'); if (t) sc.scrollLeft = Math.max(0, t.offsetLeft - 120); }
  }

  // 足りない日の列へ横に移って、少し光らせる
  function goColumn(date) {
    var sc = document.querySelector('.mk-scroll'), th = sc && sc.querySelector('th[data-col="' + date + '"]');
    if (!th) return;
    var name = sc.querySelector('.mk-corner');
    sc.scrollTo({ left: Math.max(0, th.offsetLeft - (name ? name.offsetWidth : 0) - 8), behavior: 'smooth' });
    document.getElementById('mk-board').scrollIntoView({ block: 'start', behavior: 'smooth' });
    var idx = Array.prototype.indexOf.call(th.parentNode.children, th);
    sc.querySelectorAll('tr').forEach(function (tr) {
      var c = tr.children[idx];
      if (c) { c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); }
    });
  }

  // 空いているマスに希望どおりの仮の勤務を入れる（保存するまで職員には見えない）。
  // off=true … 出勤不可・休み希望 → 公休 だけ。off=false … 夜勤の翌日 → 明け、出勤可 → 日勤（できなければ できる勤務）
  // 返すのは [マスのキー, 勤務] の並び（数えるときにも使う）
  function autoPlan(off) {
    var out = [];
    staffList().forEach(function (p) {
      var can = canOf(p), days = monthDays(mk.board.年月), prev = '';
      days.forEach(function (d) {
        var cur = shiftAt(p, d), w = p.希望[d] && p.希望[d].希望, k = '';
        if (!cur) {
          if (off) { if (w === '出勤不可' || w === '休み希望') k = '公休'; }
          else if (prev === '夜勤' && hasKind('明け')) k = '明け';
          else if (w === '出勤可') k = can.indexOf('日勤') >= 0 || !can.length ? '日勤' : (can.filter(function (x) { return WORKING.indexOf(x) >= 0; })[0] || '日勤');
        }
        if (k) out.push([cellKey(p.職員ID, d), k]);
        prev = k || cur;
      });
    });
    return out;
  }
  function autoFill(off) {
    var plan = autoPlan(off);
    plan.forEach(function (x) { mk.edits[x[0]] = x[1]; if (useFac()) mk.editFac[x[0]] = mk.fac; });
    drawBoard();
    toast(off ? plan.length + 'マスを公休にしました。保存するまで職員には見えません'
      : plan.length + 'マスに仮の勤務を入れました。足りない日を直してから保存してください');
  }

  function editCell(id, date) {
    var p = mk.board.職員.filter(function (x) { return x.職員ID === id; })[0];
    if (!p) return;
    var days = monthDays(mk.board.年月);
    var w = p.希望[date] || {}, cur = shiftAt(p, date), c = countOf(date), idx = days.indexOf(date);
    var can = canOf(p), afterNight = idx > 0 && shiftAt(p, days[idx - 1]) === '夜勤' && cur !== '明け';
    function stat(label, n, need) { return '<span class="' + (n < need ? 'lack' : 'ok') + '">' + label + ' ' + n + '/' + need + '人</span>'; }
    var sheet = openSheet(
      '<div class="sft-sheet-head"><div><h2 id="sft-sheet-h">' + esc(p.氏名) + '<span class="mk-sheet-d">' + dayLabel(date) + '</span></h2>' +
      '<p class="sft-count">' + esc(p.職種 || '') + '　可能勤務：' + esc(p.可能勤務 || '—') + '</p></div><button type="button" class="sft-x" data-close aria-label="閉じる">×</button></div>' +
      '<div class="mk-wish"><div class="mk-wish-row"><span>希望</span>' + (w.希望 ? '<span class="sft-chip ' + WISH_CLS[w.希望] + '">' + esc(w.希望) + '</span>' : '<span class="muted">出ていません</span>') + '</div>' +
        (w.メモ ? '<p class="mk-wish-memo">メモ：' + esc(w.メモ) + '</p>' : '') +
        (elsewhere(p, date) ? '<p class="mk-wish-memo">この日は「' + esc(facAt(p, date)) + '」の勤務が入っています。ここで選び直すと「' + esc(mk.fac) + '」の勤務になります</p>' : '') +
        '<div class="mk-daystat">この日 ' + stat('日中', c.日中, c.need.日中) + stat('夜勤', c.夜勤, c.need.夜勤) + '</div></div>' +
      '<div class="mk-kinds">' + (mk.board.勤務区分 || []).map(function (k) {
        var cannot = WORKING.indexOf(k) >= 0 && can.length && can.indexOf(k) < 0;
        return '<button type="button" class="mk-kind' + (k === cur ? ' on' : '') + (WORKING.indexOf(k) < 0 ? ' rest' : '') + (k === '夜勤' ? ' night' : '') + (cannot ? ' cannot' : '') + (afterNight && k === '明け' ? ' suggest' : '') + '" data-k="' + esc(k) + '" aria-pressed="' + (k === cur) + '">' + esc(k) +
          (cannot ? '<small>可能勤務外</small>' : afterNight && k === '明け' ? '<small>夜勤の翌日</small>' : '') + '</button>';
      }).join('') + '<button type="button" class="mk-kind clear" data-k="">消す</button></div>' +
      '<div class="mk-sheet-nav"><button type="button" class="sub" data-nav="-1"' + (idx <= 0 ? ' disabled' : '') + '>‹ 前の日</button>' +
        '<small>選ぶと次の日へ進みます</small><button type="button" class="sub" data-nav="1"' + (idx >= days.length - 1 ? ' disabled' : '') + '>次の日 ›</button></div>');
    sheetBack = function () { return document.querySelector('.mk-cell[data-id="' + esc(id) + '"][data-d="' + date + '"]'); };
    var focusK = sheet.querySelector('.mk-kind.on') || sheet.querySelector('.mk-kind.suggest') || sheet.querySelector('.mk-kind');
    if (focusK) focusK.focus();
    sheet.querySelector('.mk-kinds').addEventListener('click', function (e) {
      var b = e.target.closest('[data-k]');
      if (!b) return;
      var k = cellKey(id, date);
      if (b.dataset.k === savedAt(p, date) && (!useFac() || facAt(p, date) === mk.fac)) { delete mk.edits[k]; delete mk.editFac[k]; }
      else { mk.edits[k] = b.dataset.k; if (useFac()) mk.editFac[k] = mk.fac; else delete mk.editFac[k]; }
      drawBoard();
      // 選んだら同じ人の次の日へ進む（1人分を続けて入れられる）。月末なら閉じる
      if (idx < days.length - 1) editCell(id, days[idx + 1]); else closeSheet();
    });
    sheet.querySelector('.mk-sheet-nav').addEventListener('click', function (e) {
      var b = e.target.closest('[data-nav]');
      if (b && !b.disabled) editCell(id, days[idx + +b.dataset.nav]);
    });
  }

  function askFix() {
    if (!mk.board) return;
    var days = monthDays(mk.board.年月);
    var lack = days.filter(function (d) { var c = countOf(d); return c.lackDay || c.lackNight; });
    var n = Object.keys(mk.edits).length, is = monthIssues();
    if (!is.filled) {
      // 1マスも入っていない月は確定させない（空のシフトが職員に公開されてしまうため）
      openSheet('<div class="sft-sheet-head"><h2 id="sft-sheet-h">' + esc(ymLabel(mk.ym)) + 'はまだ勤務が入っていません</h2><button type="button" class="sft-x" data-close aria-label="閉じる">×</button></div>' +
        '<div class="sft-confirm"><p>マスを押して勤務を入れるか、「希望から仮入れ」を使ってから確定してください。</p></div>' +
        '<div class="sft-confirm-btns"><button type="button" data-close>わかりました</button></div>');
      return;
    }
    confirmSheet(ymLabel(mk.ym) + 'のシフトを確定しますか',
      '<p>確定すると、<b>' + esc(ymLabel(mk.ym)) + 'の勤務が職員全員の「シフト確認」に公開</b>されます。</p>' +
      '<ul class="mk-check">' +
        '<li class="' + (is.empty ? 'warn' : 'ok') + '">未入力のマス <b>' + is.empty + '</b></li>' +
        '<li class="' + (is.clash ? 'warn' : 'ok') + '">休み希望・出勤不可の日の勤務 <b>' + is.clash + '</b></li>' +
        '<li class="' + (is.cannot ? 'warn' : 'ok') + '">可能勤務外の勤務 <b>' + is.cannot + '</b></li>' +
      '</ul>' +
      (n ? '<p>保存していない ' + n + 'マスも一緒に保存します。</p>' : '') +
      (lack.length ? '<p class="mk-warn">人が足りない日が <b>' + lack.length + '日</b> あります（' + esc(lack.slice(0, 5).map(shortDay).join('、')) + (lack.length > 5 ? ' ほか' : '') + '）。このまま確定してもよいですか。</p>' : ''),
      '確定する', function () { saveMake(true); });
  }

  // 確定の取消（GAS unfixShifts）。作成中に戻り、職員の「シフト確認」からは勤務が消える。入れた勤務は残る
  function askUnfix() {
    if (!mk.board || mk.saving) return;
    var ym = mk.ym;
    confirmSheet(ymLabel(ym) + 'の確定を取り消しますか',
      '<p>取り消すと「作成中」に戻り、職員の「シフト確認」には<b>勤務が出なくなります</b>（入れた勤務は残ります）。</p>' +
      '<p>直したあと、もう一度「確定する」を押してください。</p>',
      '確定を取り消す', function () {
        var gen = I.gen;
        mk.saving = true; setBar(false); I.busy(true);
        api('unfixShifts', { 年月: ym }).then(function () {
          mk.saving = false; toast(ymLabel(ym) + 'の確定を取り消しました');
          if (stale(gen)) return;
          I.busy(false); keepEdits(true); loadMake(); // 保存していない変更は預かって、読み直したあと戻す
        }).catch(function (e) {
          mk.saving = false;
          if (stale(gen)) { toast(e.message || '取り消せませんでした'); return; }
          I.busy(false); drawStatus();
          var err = document.getElementById('mk-err');
          err.innerHTML = failBox(e); err.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
      });
  }

  function saveMake(fix, then) {
    if (!mk.board) return;
    var err = document.getElementById('mk-err'); err.innerHTML = '';
    // 施設タブで入れたマスは施設名を付ける（省くと GAS は本人の所属施設にする）
    var list = Object.keys(mk.edits).map(function (k) {
      var a = k.split('|'), o = { 職員ID: a[0], 対象日: a[1], 勤務: mk.edits[k] };
      if (mk.editFac[k]) o.施設名 = mk.editFac[k];
      return o;
    });
    if (!fix && !list.length) { toast('変更はありません'); return; }
    if (mk.saving) return; // 保存・確定中の二度押し
    var ym = mk.ym, gen = I.gen;
    I.busy(true); mk.saving = true; setBar(false);
    var p = list.length ? api('saveShifts', { 年月: ym, 割当: list }) : Promise.resolve();
    p.then(function () { return fix ? api('fixShifts', { 年月: ym }) : null; })
      .then(function () {
        mk.saving = false;
        toast(fix ? ymLabel(ym) + 'のシフトを確定しました' : list.length + 'マスを保存しました');
        if (stale(gen)) { if (document.getElementById('mk-board')) loadMake(); return; } // 保存中にほかの画面へ移ったとき
        I.busy(false);
        if (then) then(); else loadMake();
      })
      .catch(function (e) {
        mk.saving = false;
        if (stale(gen)) { toast(e.message || '保存できませんでした'); return; }
        I.busy(false); drawStatus();
        err.innerHTML = e.details && e.details.length ? I.errorsBox(e.details) : failBox(e);
        err.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
  }

  I.views.shift = viewMenu;
  I.views['shift-submit'] = viewSubmit;
  I.views['shift-view'] = viewCheck;
  I.views['shift-make'] = viewMake;
})();
