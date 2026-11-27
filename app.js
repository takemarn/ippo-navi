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
  var ICON = {
    apply: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
    approve: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>',
    shift: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    people: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.2 3.2 0 010 6.4M18 14.8c1.8.7 3 2.4 3.5 5.2"/></svg>',
    task: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h7"/><path d="M15 17l2 2 4-4"/></svg>',
    book: '<svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5z"/><path d="M4 20.5A2.5 2.5 0 016.5 18H20v3H6.5"/></svg>'
  };

  function tile(href, icon, label, note) {
    if (!href) return '<div class="tile off" aria-disabled="true">' + ICON[icon] + label + '<small>' + note + '</small></div>';
    return '<a class="tile" href="' + href + '">' + ICON[icon] + label + (note ? '<small>' + note + '</small>' : '') + '</a>';
  }

  function viewMenu() {
    var canApprove = state.me.役割 === '承認者' || state.me.役割 === '管理者';
    app.innerHTML =
      '<h1>メニュー</h1>' +
      '<div class="tiles">' +
        tile('#apply', 'apply', '経費勤怠申請') +
        (canApprove ? tile('#approvals', 'approve', '承認待ち', '<span id="pcount"></span>') : tile('#requests', 'approve', '自分の申請')) +
        tile('', 'shift', 'シフト', '準備中') +
        tile('', 'people', '利用者', '準備中') +
        tile('', 'task', 'タスク', '準備中') +
        tile('', 'book', '社内ポータル', '準備中') +
      '</div>' +
      '<p class="muted">シフト・利用者・タスク・社内ポータルは、これから順に追加します。</p>';
    if (canApprove) api('pendingApprovals').then(function (list) {
      var el = document.getElementById('pcount');
      if (el && list.length) el.innerHTML = '<span class="badge">' + list.length + '件</span>';
    }).catch(function () {});
  }

  function viewApply() {
    app.innerHTML = backLink('#menu', 'メニュー') + '<h1>経費勤怠申請</h1>' +
      '<div class="list">' +
        '<a class="btn" href="#expense">経費申請</a>' +
        '<a class="btn" href="#attendance">勤怠申請</a>' +
        '<a class="btn" href="#requests" style="background:transparent;color:var(--accent)">自分の申請を見る</a>' +
      '</div>';
  }

  function selectHtml(id, list, value, placeholder) {
    return '<select id="' + id + '" name="' + id + '">' +
      '<option value="">' + (placeholder || '選んでください') + '</option>' +
      list.map(function (v) { return '<option' + (v === value ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('') +
      '</select>';
  }

  function viewExpense() {
    var o = state.options;
    var rows = [{}];
    app.innerHTML = backLink('#apply', '経費勤怠申請') + '<h1>経費申請</h1>' +
      '<form id="f" class="card" novalidate>' +
        '<label>申請者<input value="' + esc(state.me.氏名) + '" disabled></label>' +
        '<div class="two">' +
          '<label>対象日<span class="req">必須</span><input type="date" id="対象日" value="' + today() + '"></label>' +
          '<label>小口先出<span class="req">必須</span>' + selectHtml('小口先出', o.小口先出 || []) + '</label>' +
        '</div>' +
        '<label>経費区分<span class="req">必須</span>' + selectHtml('経費区分', o.経費区分 || []) + '</label>' +
        '<div id="items" class="list"></div>' +
        '<button type="button" class="sub" id="add">＋ 物品を追加</button>' +
        '<div class="row"><strong>合計</strong><strong id="total">0円</strong></div>' +
        '<label>備考<span class="opt">任意</span><textarea id="備考"></textarea></label>' +
        '<div id="err"></div>' +
        '<button type="submit" id="send">送信</button>' +
      '</form>';

    function drawItems() {
      var box = document.getElementById('items');
      box.innerHTML = rows.map(function (r, i) {
        return '<div class="item" data-i="' + i + '">' +
          '<div class="item-head">物品 ' + (i + 1) + (rows.length > 1 ? '<button type="button" class="small danger" data-del="' + i + '">削除</button>' : '') + '</div>' +
          '<label>物品<span class="req">必須</span>' + selectHtml('物品_' + i, o.物品 || [], r.物品) + '</label>' +
          (r.物品 === 'フリー入力' ? '<label>物品名<span class="req">必須</span><input id="自由入力_' + i + '" value="' + esc(r.自由入力 || '') + '"></label>' : '') +
          '<div class="two">' +
            '<label>個数<span class="req">必須</span><input type="number" inputmode="numeric" min="1" id="個数_' + i + '" value="' + esc(r.個数 || '') + '"></label>' +
            '<label>金額（円）<span class="req">必須</span><input type="number" inputmode="numeric" min="0" id="金額_' + i + '" value="' + esc(r.金額 === undefined ? '' : r.金額) + '"></label>' +
          '</div></div>';
      }).join('');
      updateTotal();
    }
    function collect() {
      rows = rows.map(function (_, i) {
        var g = function (k) { var el = document.getElementById(k + '_' + i); return el ? el.value : undefined; };
        return { 物品: g('物品'), 自由入力: g('自由入力'), 個数: g('個数'), 金額: g('金額') };
      });
    }
    function updateTotal() {
      var sum = 0;
      rows.forEach(function (_, i) { var el = document.getElementById('金額_' + i); sum += Number(el && el.value || 0); });
      document.getElementById('total').textContent = yen(sum);
    }
    drawItems();
    var form = document.getElementById('f');
    form.addEventListener('input', function (e) { if (/^金額_/.test(e.target.id)) updateTotal(); });
    form.addEventListener('change', function (e) { if (/^物品_/.test(e.target.id)) { collect(); drawItems(); } });
    form.addEventListener('click', function (e) {
      if (e.target.id === 'add') { collect(); rows.push({}); drawItems(); }
      if (e.target.dataset && e.target.dataset.del !== undefined) { collect(); rows.splice(Number(e.target.dataset.del), 1); drawItems(); }
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault(); collect();
      var v = function (id) { return document.getElementById(id).value; };
      var data = { 対象日: v('対象日'), 小口先出: v('小口先出'), 経費区分: v('経費区分'), 物品: rows.map(function (r) {
        return { 物品: r.物品, 自由入力: r.自由入力, 個数: Number(r.個数), 金額: r.金額 === '' ? '' : Number(r.金額) };
      }), 備考: v('備考') };
      var errs = [];
      if (!data.対象日) errs.push('対象日を入れてください');
      if (!data.小口先出) errs.push('小口先出を選んでください');
      if (!data.経費区分) errs.push('経費区分を選んでください');
      data.物品.forEach(function (it, i) {
        if (!it.物品 || (it.物品 === 'フリー入力' && !it.自由入力)) errs.push((i + 1) + '行目の物品を選んでください');
        if (!(it.個数 > 0)) errs.push((i + 1) + '行目の個数を入れてください');
        if (it.金額 === '' || !(it.金額 >= 0)) errs.push((i + 1) + '行目の金額を入れてください');
      });
      submit(errs, 'submitExpense', data);
    });
  }

  function viewAttendance() {
    var kinds = state.options.勤怠項目 || [];
    app.innerHTML = backLink('#apply', '経費勤怠申請') + '<h1>勤怠申請</h1>' +
      '<form id="f" class="card" novalidate>' +
        '<label>申請者<input value="' + esc(state.me.氏名) + '" disabled></label>' +
        '<label>項目<span class="req">必須</span>' + selectHtml('項目', kinds) + '</label>' +
        '<label>対象日<span class="req">必須</span><input type="date" id="対象日" value="' + today() + '"></label>' +
        '<div class="two" id="range"><label>開始<span class="req">必須</span><input type="time" id="開始"></label><label>終了<span class="req">必須</span><input type="time" id="終了"></label></div>' +
        '<label id="stamp" hidden>打刻時刻<span class="req">必須</span><input type="time" id="打刻時刻"></label>' +
        '<label>備考<span class="opt">任意</span><textarea id="備考" placeholder="特別休暇の場合は詳細を書いてください"></textarea></label>' +
        '<div id="err"></div>' +
        '<button type="submit">送信</button>' +
      '</form>';
    var kind = document.getElementById('項目');
    kind.addEventListener('change', function () {
      var stamp = /^打刻修正/.test(kind.value);
      document.getElementById('range').hidden = stamp;
      document.getElementById('stamp').hidden = !stamp;
    });
    document.getElementById('f').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = function (id) { return document.getElementById(id).value; };
      var stamp = /^打刻修正/.test(v('項目'));
      var data = { 項目: v('項目'), 対象日: v('対象日'), 備考: v('備考') };
      if (stamp) data.打刻時刻 = v('打刻時刻'); else { data.開始 = v('開始'); data.終了 = v('終了'); }
      var errs = [];
      if (!data.項目) errs.push('項目を選んでください');
      if (!data.対象日) errs.push('対象日を入れてください');
      if (stamp && !data.打刻時刻) errs.push('打刻時刻を入れてください');
      if (!stamp && (!data.開始 || !data.終了)) errs.push('時間（開始〜終了）を入れてください');
      submit(errs, 'submitAttendance', data);
    });
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

  function viewRequests() {
    app.innerHTML = backLink('#apply', '経費勤怠申請') + '<h1>自分の申請</h1><div id="list" class="list"><p class="loading">読み込み中…</p></div>';
    api('myRequests').then(function (list) {
      var box = document.getElementById('list');
      if (!list.length) { box.innerHTML = '<p class="muted">まだ申請はありません。</p>'; return; }
      box.innerHTML = list.map(function (r) {
        return '<div class="card"><div class="row"><h2>' + esc(r.申請種類) + '申請</h2>' + pill(r.状態) + '</div>' +
          '<p class="muted">' + esc(r.申請日時) + '　' + esc(r.申請ID) + '</p>' +
          (r.状態 === '承認待ち' ? '<button class="small danger" data-cancel="' + esc(r.申請ID) + '">取り消す</button>' : '') + '</div>';
      }).join('');
    }).catch(showError);
    app.addEventListener('click', onCancel);
  }
  function onCancel(e) {
    var id = e.target.dataset && e.target.dataset.cancel;
    if (!id) return;
    if (e.target.dataset.sure !== '1') { e.target.dataset.sure = '1'; e.target.textContent = 'もう一度押すと取り消します'; return; }
    e.target.disabled = true;
    api('cancelRequest', { 申請ID: id }).then(function () { toast('取り消しました'); route(); }).catch(showError);
  }

  function viewApprovals() {
    app.innerHTML = backLink('#menu', 'メニュー') + '<h1>承認待ち</h1><div id="list" class="list"><p class="loading">読み込み中…</p></div>';
    api('pendingApprovals').then(function (list) {
      var box = document.getElementById('list');
      if (!list.length) { box.innerHTML = '<p class="muted">承認待ちの申請はありません。</p>'; return; }
      box.innerHTML = list.map(function (r) {
        var lines = (r.明細 || []).map(function (d) {
          if (r.申請種類 === '経費') return '<dt>' + esc(d.物品) + ' ×' + esc(d.個数) + '</dt><dd>' + yen(d.金額) + '</dd>';
          return '<dt>' + esc(d.項目) + '</dt><dd>' + esc(d.対象日) + ' ' + esc(d.打刻時刻 || (d.開始 + '〜' + d.終了)) + (d.備考 ? '　' + esc(d.備考) : '') + '</dd>';
        }).join('');
        var total = r.申請種類 === '経費' ? (r.明細 || []).reduce(function (s, d) { return s + Number(d.金額 || 0); }, 0) : null;
        return '<div class="card" data-id="' + esc(r.申請ID) + '">' +
          '<div class="row"><h2>' + esc(r.申請種類) + '申請　' + esc(r.申請者) + '</h2><span class="muted">' + esc(r.現在段階) + '段目</span></div>' +
          '<p class="muted">' + esc(r.申請日時) + '　' + esc(r.申請ID) + '</p>' +
          '<dl class="detail">' + lines + (total !== null ? '<dt><strong>合計</strong></dt><dd><strong>' + yen(total) + '</strong></dd>' : '') + '</dl>' +
          '<label>コメント<span class="opt">差戻しのときは必須</span><textarea class="cmt"></textarea></label>' +
          '<div class="actions"><button class="sub danger" data-act="差戻し">差戻し</button><button data-act="承認">承認</button></div>' +
          '<div class="err"></div></div>';
      }).join('');
    }).catch(showError);
    app.addEventListener('click', onDecide);
  }
  function onDecide(e) {
    var act = e.target.dataset && e.target.dataset.act;
    if (!act) return;
    var card = e.target.closest('.card');
    var cmt = card.querySelector('.cmt').value.trim();
    var err = card.querySelector('.err');
    if (act === '差戻し' && !cmt) { err.innerHTML = '<div class="errors">差戻しの理由をコメントに書いてください</div>'; return; }
    card.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    api('decide', { 申請ID: card.dataset.id, 結果: act, コメント: cmt }).then(function () {
      toast(act === '承認' ? '承認しました' : '差し戻しました'); card.remove();
      if (!document.querySelector('#list .card')) document.getElementById('list').innerHTML = '<p class="muted">承認待ちの申請はありません。</p>';
    }).catch(function (x) {
      card.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
      err.innerHTML = '<div class="errors">' + esc(x.message) + '</div>';
    });
  }

  function showError(e) {
    app.innerHTML = '<div class="errors" role="alert">' + esc(e.message || 'エラーが起きました') + '</div>' +
      (e.code === 401 ? '' : '<button onclick="location.reload()">もう一度読み込む</button>');
  }

  // ---------- 画面の切り替え ----------
  var VIEWS = { menu: viewMenu, apply: viewApply, expense: viewExpense, attendance: viewAttendance, requests: viewRequests, approvals: viewApprovals };
  function route() {
    app.removeEventListener('click', onCancel);
    app.removeEventListener('click', onDecide);
    var name = (location.hash || '#menu').slice(1);
    (VIEWS[name] || viewMenu)();
    window.scrollTo(0, 0);
  }

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
  start();
})();
