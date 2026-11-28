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
  // 昔の名前。今は共通の戻る部品 backHtml と同じものを返す
  function backLink(href, label) { return backHtml(href, label); }

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
    me: { 職員ID: 'STF-0001', 氏名: '見本 太郎', 職種: '看護師', 役割: '承認者', 当月残業合計: '3:30', 雇用形態: '常勤', 可能勤務: '日勤、早出、遅出、夜勤', 資格: '正看護師' },
    options: {
      経費区分: ['看護', '介護', '施設', '利用者立替', 'その他', '救急搬送', '本部', '交通'],
      小口先出: ['小口', '先出'],
      物品: ['フリー入力', '滅菌ガーゼ', '絆創膏', 'アルコール綿', 'サージカルテープ', 'フィルムドレッシング', 'ワセリン', 'オリーブ油', '吸引チューブ'],
      勤怠項目: ['欠勤', '残業・前残業', '遅刻', '早退', '有給', '休日出勤', '冬期休暇', '夏季休暇', '特別休暇', '打刻修正出勤', '打刻修正退勤'],
      施設: ['モア一津屋'],
      タスク種類: ['初診', '退院', '新入居 施設', '新入居 自宅', '新入居 病院', '特指示月1回目', '特指示月2回目', '点滴', '訪問スケジュール入力', 'その他']
    },
    requests: [
      { 申請ID: 'EXP-20261127-DEMO01', 申請種類: '経費', 申請者職員ID: 'STF-0001', 申請日時: '2026-11-27 10:12:00', 状態: '承認済み', 現在段階: '', コメント: '', 承認者: '',
        明細: [{ 行番号: 1, 対象日: '2026-11-27', 経費区分: '看護', 物品: 'アルコール綿', 個数: 3, 金額: 990 }] },
      { 申請ID: 'ATT-20261126-DEMO02', 申請種類: '勤怠', 申請者職員ID: 'STF-0001', 申請日時: '2026-11-26 18:40:00', 状態: '承認待ち', 現在段階: 1, コメント: '', 承認者: '見本 一郎',
        明細: [{ 項目: '残業・前残業', 対象日: '2026-11-26', 開始: '17:30', 終了: '18:30', 備考: '' }] },
      { 申請ID: 'EXP-20261120-DEMO05', 申請種類: '経費', 申請者職員ID: 'STF-0001', 申請日時: '2026-11-20 15:02:00', 状態: '差戻し', 現在段階: '', コメント: '領収書の金額と合っていません。確認して出し直してください。', 承認者: '',
        明細: [{ 行番号: 1, 対象日: '2026-11-20', 経費区分: '交通', 物品: 'バス代（往診同行）', 個数: 1, 金額: 1200 }] },
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
        明細: [{ 行番号: 1, 対象日: '2026-11-25', 経費区分: '施設', 物品: '電球（共用部）', 個数: 1, 金額: 3300 }] }
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
      // 見本モードで送った申請も「自分の申請」で中身が見えるよう、受け取った data から明細を作って残す
      function newReq(type, prefix, d) {
        d = d || {};
        var r = { 申請ID: prefix + '-' + today().replace(/-/g, '') + '-DEMO' + ('0' + (++self.seq)).slice(-2), 申請種類: type,
          申請者職員ID: self.me.職員ID, 申請日時: today() + ' 12:00:00', 状態: '承認待ち', 現在段階: 1 };
        if (type === '経費') {
          r.小口先出 = d.小口先出 || ''; r.備考 = d.備考 || '';
          r.明細 = (d.物品 || []).map(function (it, i) {
            return { 行番号: i + 1, 対象日: d.対象日 || '', 経費区分: d.経費区分 || '',
              物品: it.物品 === 'フリー入力' ? (it.自由入力 || 'フリー入力') : (it.物品 || ''), 個数: Number(it.個数) || 0, 金額: Number(it.金額) || 0 };
          });
        } else {
          var m = { 項目: d.項目 || '', 対象日: d.対象日 || '', 備考: d.備考 || '' };
          if (d.打刻時刻) m.打刻時刻 = d.打刻時刻; else { m.開始 = d.開始 || ''; m.終了 = d.終了 || ''; }
          r.備考 = d.備考 || ''; r.明細 = [m];
        }
        self.requests.unshift(r); return { 申請ID: r.申請ID, 状態: r.状態 };
      }
      // 第2段階以降の見本データは各画面のファイル（例 views/shift-demo.js）が IPPO.demo に登録する
      if (window.IPPO.demo[action]) return window.IPPO.demo[action](data || {}, self.me);
      switch (action) {
        case 'me': return this.me;
        case 'options': return this.options;
        case 'submitExpense': return newReq('経費', 'EXP', data);
        case 'submitAttendance': return newReq('勤怠', 'ATT', data);
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
    btn.disabled = true; btn.textContent = '送信中…'; busy(true);
    api(action, data).then(function () {
      toast('送信しました'); location.hash = '#requests';
    }).catch(function (e) {
      busy(false); btn.disabled = false; btn.textContent = '送信';
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
  // 画面遷移や送信の途中: 画面全体をぼかして中央に「読み込み中・・・」（参考 f_0411）。busy(true) で出し busy(false) で消す。
  // submit() の送信中に使う。画面を切り替えると route() が自動で消す
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
      '<div class="msolo">' + appr + '</div>' +
      backHtml('#menu', 'メニュー一覧に戻る');
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
      // 自分が承認する件数だけ数える（担当が無い古い形のデータは自分の分とみなす。approvals.js の mine() と同じ決まり）
      var n = list.filter(function (r) { return r.担当 === undefined ? true : r.担当; }).length;
      if (el && n) { el.innerHTML = '<span class="badge">' + n + '</span>'; el.setAttribute('aria-label', '自分の承認待ち ' + n + '件'); }
    }).catch(function () {});
  }

  // ---------- 画面の切り替え ----------
  // 各画面は views/*.js が IPPO.views に登録する。画面を離れるときの後片付けは IPPO.cleanup に積む
  // メニュー画面（リッチメニューの各タイルの行き先）。開いた直後はメニュー用の読み込み中表示を出す
  var MENUS = ['menu', 'apply', 'status', 'task', 'users', 'shift', 'portal'];
  // 最後に開いたメニュー画面を覚えておく（「戻る」の行き先に使う）。再読み込みしても残るよう sessionStorage にも置く
  var last = null;
  try { last = sessionStorage.getItem('ippo.lastMenu'); } catch (_) {}
  function lastMenu() { return last && MENUS.indexOf(last.slice(1)) >= 0 ? last : '#menu'; }
  // メニュー画面の名前（タイル名は richmenu/tiles.js と同じ）。#menu や不明なものは「メニュー」
  function menuName(h) {
    var t = (window.IPPO_TILES || []).filter(function (x) { return '#' + x.hash === h; })[0];
    return t ? t.label : 'メニュー';
  }
  // 共通の戻る部品。href 省略 → 最後に開いたメニュー、label 省略 →「<行き先のメニュー名>に戻る」（#apply なら「経費勤怠申請に戻る」）。フォームや一覧の下に置く
  function backHtml(href, label) {
    var to = href || lastMenu();
    return '<a class="ipp-back" href="' + esc(to) + '"><span aria-hidden="true">‹</span> ' + esc(label || (menuName(to) + 'に戻る')) + '</a>';
  }
  function route() {
    busy(false);
    IPPO.cleanup.splice(0).forEach(function (fn) { try { fn(); } catch (_) {} });
    var name = (location.hash || '#menu').slice(1);
    if (!IPPO.views[name]) name = 'menu';
    if (MENUS.indexOf(name) >= 0) { last = '#' + name; try { sessionStorage.setItem('ippo.lastMenu', last); } catch (_) {} }
    (IPPO.views[name] || IPPO.views.menu)();
    window.scrollTo(0, 0);
  }

  window.IPPO = {
    app: app, state: state, DEMO: DEMO, api: api, route: route, showError: showError, submit: submit, selectHtml: selectHtml,
    esc: esc, today: today, yen: yen, toast: toast, errorsBox: errorsBox, pill: pill, backLink: backLink,
    busy: busy, bootLoading: bootLoading, menuLoading: menuLoading, subMenu: subMenu, canApprove: canApprove,
    MENUS: MENUS, lastMenu: lastMenu, backHtml: backHtml, views: {}, cleanup: [], demo: {},
    demoRequests: DEMO ? Demo.requests : null // 見本の「自分の申請」。第3段階の申請（利用者登録・タスクなど）もここに足す
  };

  // ---------- 起動 ----------
  function start() {
    document.getElementById('demo').hidden = !DEMO;
    // liff.line.me/LIFF_ID#apply で開かれたとき、行き先が liff.state に入って届くことがあるので拾っておく
    var st = new URLSearchParams(location.search).get('liff.state') || '';
    var stHash = st.indexOf('#') >= 0 ? st.slice(st.indexOf('#')) : '';
    if (!location.hash && stHash) history.replaceState(null, '', location.pathname + location.search + stHash);
    var first = (location.hash || '#menu').slice(1);
    app.innerHTML = MENUS.indexOf(first) > 0 ? menuLoading() : bootLoading();
    var ready = DEMO ? Promise.resolve() : liff.init({ liffId: CFG.LIFF_ID }).then(function () {
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return new Promise(function () {}); }
      state.idToken = liff.getIDToken();
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
