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
      { 申請ID: 'EXP-20261127-DEMO01', 申請種類: '経費', 申請者職員ID: 'STF-0001', 申請日時: '2026-11-27 10:12:00', 状態: '承認済み', 現在段階: '' },
      { 申請ID: 'ATT-20261126-DEMO02', 申請種類: '勤怠', 申請者職員ID: 'STF-0001', 申請日時: '2026-11-26 18:40:00', 状態: '承認待ち', 現在段階: 1 }
    ],
    pending: [
      { 申請ID: 'EXP-20261128-DEMO03', 申請種類: '経費', 申請者: '見本 花子', 申請日時: '2026-11-28 09:05:00', 状態: '承認待ち', 現在段階: 1,
        明細: [{ 行番号: 1, 対象日: '2026-11-28', 経費区分: '看護', 物品: '滅菌ガーゼ', 個数: 2, 金額: 640 }, { 行番号: 2, 対象日: '2026-11-28', 経費区分: '看護', 物品: '絆創膏', 個数: 1, 金額: 380 }] },
      { 申請ID: 'ATT-20261127-DEMO04', 申請種類: '勤怠', 申請者: '見本 次郎', 申請日時: '2026-11-27 20:31:00', 状態: '承認待ち', 現在段階: 1,
        明細: [{ 項目: '残業・前残業', 対象日: '2026-11-27', 開始: '18:00', 終了: '19:30', 備考: '記録の入力' }] }
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
          return { 申請ID: data.申請ID, 状態: data.結果 === '承認' ? '承認済み' : '差戻し' };
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

  function showError(e) {
    app.innerHTML = '<div class="errors" role="alert">' + esc(e.message || 'エラーが起きました') + '</div>' +
      (e.code === 401 ? '' : '<button onclick="location.reload()">もう一度読み込む</button>');
  }

  // ---------- 画面の切り替え ----------
  // 各画面は views/*.js が IPPO.views に登録する。画面を離れるときの後片付けは IPPO.cleanup に積む
  function route() {
    IPPO.cleanup.splice(0).forEach(function (fn) { try { fn(); } catch (_) {} });
    var name = (location.hash || '#menu').slice(1);
    (IPPO.views[name] || IPPO.views.menu)();
    window.scrollTo(0, 0);
  }

  window.IPPO = {
    app: app, state: state, DEMO: DEMO, api: api, route: route, showError: showError, submit: submit, selectHtml: selectHtml,
    esc: esc, today: today, yen: yen, toast: toast, errorsBox: errorsBox, pill: pill, backLink: backLink,
    views: {}, cleanup: []
  };

  // ---------- 起動 ----------
  function start() {
    document.getElementById('demo').hidden = !DEMO;
    var ready = DEMO ? Promise.resolve() : liff.init({ liffId: CFG.LIFF_ID }).then(function () {
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return new Promise(function () {}); }
      state.idToken = liff.getIDToken();
    });
    ready.then(function () { return Promise.all([api('me'), api('options')]); })
      .then(function (r) {
        state.me = r[0]; state.options = r[1];
        document.getElementById('who').textContent = state.me.氏名 + ' さん';
        window.addEventListener('hashchange', route);
        route();
      })
      .catch(showError);
  }
  document.addEventListener('DOMContentLoaded', start);
})();
