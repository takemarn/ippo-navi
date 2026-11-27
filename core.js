/* IPPO管理ナビ 画面。GAS との決まりは非公開リポジトリ kiroku-app の docs/api.md を参照。 */
(function () {
  'use strict';

  var CFG = window.IPPO_CONFIG || {};
  var DEMO = !CFG.LIFF_ID || !CFG.API_URL;
  var state = { idToken: null, me: null, options: null };
  var app = document.getElementById('app');

  // ---------- 小さな道具 ----------
  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function yen(n) { return Number(n || 0).toLocaleString('ja-JP') + '円'; }
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function errorsBox(list) {
    return '<div class="errors" role="alert">入力を確認してください<ul>' +
      list.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>';
  }
  function pill(status) {
    var cls = { '承認待ち': 'wait', '承認済み': 'ok', '差戻し': 'back', '取消': 'cancel' }[status] || 'cancel';
    return '<span class="pill ' + cls + '">' + esc(status) + '</span>';
  }
  function backLink(href, label) { return '<a class="back" href="' + href + '">← ' + label + '</a>'; }

  // ---------- GAS とのやりとり ----------
  function api(action, data) {
    if (DEMO) return Demo.call(action, data || {});
    return fetch(CFG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, idToken: state.idToken, data: data || {} })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res.ok) return res.data;
      var e = new Error(res.message || 'エラーが起きました'); e.code = res.code; e.details = res.details || [];
      throw e;
    });
  }

  // ---------- 見本モード（架空のデータ） ----------
  var Demo = {
    seq: 3,
    me: { 職員ID: 'STF-0001', 氏名: '見本 太郎', 職種: '看護師', 役割: '承認者' },
    options: {
      経費区分: ['看護', '介護', '施設', '利用者立替', 'その他', '救急搬送', '本部', '交通'],
      小口先出: ['小口', '先出'],
      物品: ['フリー入力', '滅菌ガーゼ', '絆創膏', 'アルコール綿', 'サージカルテープ', 'フィルムドレッシング', 'ワセリン', 'オリーブ油', '吸引チューブ'],
      勤怠項目: ['欠勤', '残業・前残業', '遅刻', '早退', '有給', '休日出勤', '冬季休暇', '夏季休暇', '特別休暇', '打刻修正出勤', '打刻修正退勤']
    },
    requests: [
      { 申請ID: 'EXP-20261127-DEMO01', 申請種類: '経費', 申請者職員ID: 'STF-0001', 申請日時: '2026-11-27 10:12:00', 状態: '承認済み', 現在段階: '', コメント: '', 承認者: '',
        明細: [{ 行番号: 1, 対象日: '2026-11-27', 経費区分: '看護', 物品: 'アルコール綿', 個数: 3, 金額: 990 }] },
      { 申請ID: 'ATT-20261126-DEMO02', 申請種類: '勤怠', 申請者職員ID: 'STF-0001', 申請日時: '2026-11-26 18:40:00', 状態: '承認待ち', 現在段階: 1, コメント: '', 承認者: '見本 一郎',
        明細: [{ 項目: '残業・前残業', 対象日: '2026-11-26', 開始: '17:30', 終了: '18:30', 備考: '' }] },
      { 申請ID: 'EXP-20261120-DEMO05', 申請種類: '経費', 申請者職員ID: 'STF-0001', 申請日時: '2026-11-20 15:02:00', 状態: '差戻し', 現在段階: '', コメント: '領収書の金額と合っていません。確認して出し直してください。', 承認者: '',
        明細: [{ 行番号: 1, 対象日: '2026-11-20', 経費区分: '交通', 物品: 'フリー入力', 個数: 1, 金額: 1200 }] },
      { 申請ID: 'ATT-20261115-DEMO06', 申請種類: '勤怠', 申請者職員ID: 'STF-0001', 申請日時: '2026-11-15 08:10:00', 状態: '取消', 現在段階: '', コメント: '', 承認者: '',
        明細: [{ 項目: '遅刻', 対象日: '2026-11-15', 開始: '09:00', 終了: '09:20', 備考: '電車遅延' }] }
    ],
    pending: [
      { 申請ID: 'EXP-20261128-DEMO03', 申請種類: '経費', 申請者: '見本 花子', 申請日時: '2026-11-28 09:05:00', 状態: '承認待ち', 現在段階: 1, 承認者: '見本 太郎', 担当: true,
        明細: [{ 行番号: 1, 対象日: '2026-11-28', 経費区分: '看護', 物品: '滅菌ガーゼ', 個数: 2, 金額: 640 }, { 行番号: 2, 対象日: '2026-11-28', 経費区分: '看護', 物品: '絆創膏', 個数: 1, 金額: 380 }] },
      { 申請ID: 'ATT-20261127-DEMO04', 申請種類: '勤怠', 申請者: '見本 次郎', 申請日時: '2026-11-27 20:31:00', 状態: '承認待ち', 現在段階: 1, 承認者: '見本 太郎', 担当: true,
        明細: [{ 項目: '残業・前残業', 対象日: '2026-11-27', 開始: '18:00', 終了: '19:30', 備考: '記録の入力' }] },
      { 申請ID: 'ATT-20261126-DEMO07', 申請種類: '勤怠', 申請者: '見本 三郎', 申請日時: '2026-11-26 12:44:00', 状態: '承認待ち', 現在段階: 1, 承認者: '見本 一郎', 担当: false,
        明細: [{ 項目: '有給', 対象日: '2026-12-03', 開始: '09:00', 終了: '18:00', 備考: '' }] },
      { 申請ID: 'EXP-20261125-DEMO08', 申請種類: '経費', 申請者: '見本 四郎', 申請日時: '2026-11-25 17:20:00', 状態: '承認待ち', 現在段階: 2, 承認者: '見本 一郎', 担当: false,
        明細: [{ 行番号: 1, 対象日: '2026-11-25', 経費区分: '施設', 物品: 'フリー入力', 個数: 1, 金額: 3300 }] }
    ],
    call: function (action, data) {
      var self = this;
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          try { resolve(self.handle(action, data)); } catch (e) { reject(e); }
        }, 250);
      });
    },
    handle: function (action, data) {
      var self = this;
      function newReq(type, prefix) {
        var r = { 申請ID: prefix + '-' + today().replace(/-/g, '') + '-DEMO' + ('0' + (++self.seq)).slice(-2), 申請種類: type,
          申請者職員ID: self.me.職員ID, 申請日時: today() + ' 12:00:00', 状態: '承認待ち', 現在段階: 1 };
        self.requests.unshift(r); return { 申請ID: r.申請ID, 状態: r.状態 };
      }
      switch (action) {
        case 'me': return this.me;
        case 'options': return this.options;
        case 'submitExpense': return newReq('経費', 'EXP');
        case 'submitAttendance': return newReq('勤怠', 'ATT');
        case 'myRequests': return this.requests.slice();
        case 'cancelRequest':
          this.requests.forEach(function (r) { if (r.申請ID === data.申請ID) { r.状態 = '取消'; r.現在段階 = ''; } });
          return { 申請ID: data.申請ID, 状態: '取消' };
        case 'pendingApprovals': return this.pending.slice();
        case 'decide':
          this.pending = this.pending.filter(function (r) { return r.申請ID !== data.申請ID; });
          return { 申請ID: data.申請ID, 状態: data.結果 === '承認' ? '承認済み' : '差戻し', 現在段階: '' };
      }
      throw new Error('不明な操作です');
    }
  };

  // ---------- 画面 ----------
  function selectHtml(id, list, value, placeholder) {
    return '<select id="' + id + '" name="' + id + '">' +
      '<option value="">' + (placeholder || '選んでください') + '</option>' +
      list.map(function (v) { return '<option' + (v === value ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('') +
      '</select>';
  }

  function submit(errs, action, data) {
    var err = document.getElementById('err');
    if (errs.length) { err.innerHTML = errorsBox(errs); err.scrollIntoView({ block: 'center' }); return; }
    err.innerHTML = '';
    var btn = document.querySelector('#f button[type=submit]');
    btn.disabled = true; btn.textContent = '送信中…';
    api(action, data).then(function () {
      toast('送信しました'); location.hash = '#requests';
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = '送信';
      err.innerHTML = e.details && e.details.length ? errorsBox(e.details) : '<div class="errors" role="alert">' + esc(e.message) + '</div>';
    });
  }

  // 開けなかったときのカード（参考アプリの「日報を開けませんでした」と同じ形: 理由＋再読み込み）
  function showError(e) {
    busy(false);
    app.innerHTML = '<div class="card fail" role="alert"><h2>画面を開けませんでした</h2>' +
      '<p class="fail-msg">' + esc(e && e.message || 'エラーが起きました') + '</p>' +
      (e && e.code === 401 ? '<p class="muted">LINE からもう一度開き直してください。</p>' : '<button onclick="location.reload()">再読み込み</button>') + '</div>';
  }

  // ---------- 読み込み中の表示（参考 0-6） ----------
  // 開いた直後: 中央に白い小カード（スピナー＋読み込み中...）
  function bootLoading() {
    return '<div class="boot" role="status"><div class="boot-card"><span class="spin" aria-hidden="true"></span>読み込み中...</div></div>';
  }
  // メニュー画面の読み込み中: 見出し「メニュー」＋「下にスワイプで読み込み」の行＋空のバー＋注意文
  function menuLoading() {
    return '<h1>メニュー</h1>' +
      '<div class="mload" role="status"><svg viewBox="0 0 30 20" aria-hidden="true"><path d="M6 3c-2 3-2 6 0 9 2-3 2-6 0-9zM6 12v6M20 3v14M15 12l5 5 5-5"/></svg>' +
      '<div><b>下にスワイプで読み込み</b><small>メニューを読み込み中...</small></div></div>' +
      '<div class="mload-bar"></div>' +
      '<p class="mload-note">画面を読み込み中です。表示されない場合は再読み込みしてください。</p>';
  }
  // 画面遷移や送信の途中: 画面全体をぼかして中央に「読み込み中・・・」。busy(true) で出し busy(false) で消す
  function busy(on) {
    var el = document.getElementById('busy');
    if (!on) { if (el) el.remove(); return; }
    if (el) return;
    el = document.createElement('div'); el.id = 'busy'; el.className = 'busy'; el.setAttribute('role', 'status');
    el.innerHTML = '<span>読み込み中・・・</span>';
    document.body.appendChild(el);
  }

  // ---------- メニュー画面の部品（参考 2章） ----------
  function canApprove() { var r = state.me && state.me.役割; return r === '承認者' || r === '管理者'; }
  // items: [{ label, href }]、href が無い項目は「準備中」。最下段に共通の「承認待ち一覧」を付ける
  function subMenu(items) {
    function btn(it) {
      if (!it.href) return '<button type="button" class="mbtn soon" data-soon="' + esc(it.label) + '">' + esc(it.label) + '<span class="mtag">準備中</span></button>';
      return '<a class="mbtn" href="' + it.href + '">' + esc(it.label) + '</a>';
    }
    var appr = canApprove()
      ? '<a class="mbtn" href="#approvals">承認待ち一覧<span id="pcount"></span></a>'
      : '<button type="button" class="mbtn locked" data-locked="1">承認待ち一覧<span class="mtag">承認者のみ</span></button>';
    app.innerHTML = '<h1>メニュー</h1><nav class="mgroup" aria-label="メニュー">' + items.map(btn).join('') + '</nav>' +
      '<div class="msolo">' + appr + '</div>';
    function onTap(e) {
      var b = e.target.closest('button.mbtn');
      if (!b) return;
      if (b.dataset.locked) toast('承認待ち一覧は承認者・管理者だけが使えます');
      else toast('「' + b.dataset.soon + '」は準備中です');
    }
    app.addEventListener('click', onTap);
    IPPO.cleanup.push(function () { app.removeEventListener('click', onTap); });
    if (canApprove()) api('pendingApprovals').then(function (list) {
      var el = document.getElementById('pcount');
      if (el && list.length) el.innerHTML = '<span class="badge">' + list.length + '</span>';
    }).catch(function () {});
  }

  // ---------- 画面の切り替え ----------
  // 各画面は views/*.js が IPPO.views に登録する。画面を離れるときの後片付けは IPPO.cleanup に積む
  // メニュー画面（リッチメニューの各タイルの行き先）。開いた直後はメニュー用の読み込み中表示を出す
  var MENUS = ['menu', 'apply', 'status', 'task', 'users', 'shift', 'portal'];
  function route() {
    busy(false);
    IPPO.cleanup.splice(0).forEach(function (fn) { try { fn(); } catch (_) {} });
    var name = (location.hash || '#menu').slice(1);
    (IPPO.views[name] || IPPO.views.menu)();
    window.scrollTo(0, 0);
  }

  window.IPPO = {
    app: app, state: state, DEMO: DEMO, api: api, route: route, showError: showError, submit: submit, selectHtml: selectHtml,
    esc: esc, today: today, yen: yen, toast: toast, errorsBox: errorsBox, pill: pill, backLink: backLink,
    busy: busy, bootLoading: bootLoading, menuLoading: menuLoading, subMenu: subMenu, canApprove: canApprove,
    MENUS: MENUS, views: {}, cleanup: []
  };

  // ---------- 起動 ----------
  function start() {
    document.getElementById('demo').hidden = !DEMO;
    var first = (location.hash || '#menu').slice(1);
    app.innerHTML = MENUS.indexOf(first) > 0 ? menuLoading() : bootLoading();
    // liff.line.me/LIFF_ID#apply で開かれたとき、行き先が liff.state に入って届くことがあるので拾っておく
    var st = new URLSearchParams(location.search).get('liff.state') || '';
    var ready = DEMO ? Promise.resolve() : liff.init({ liffId: CFG.LIFF_ID }).then(function () {
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return new Promise(function () {}); }
      state.idToken = liff.getIDToken();
      var h = st.indexOf('#') >= 0 ? st.slice(st.indexOf('#')) : '';
      if (!location.hash && h) history.replaceState(null, '', location.pathname + h);
    });
    ready.then(function () { return Promise.all([api('me'), api('options')]); })
      .then(function (r) {
        state.me = r[0]; state.options = r[1];
        document.getElementById('who').textContent = state.me.氏名;
        window.addEventListener('hashchange', route);
        route();
      })
      .catch(showError);
  }
  document.addEventListener('DOMContentLoaded', start);
})();
