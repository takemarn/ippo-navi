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
    }).then(function (r) { return r.json(); }, function () {
      throw new Error('通信できませんでした。電波の良い所でもう一度お試しください');
    }).catch(function (e) {
      if (e instanceof SyntaxError) throw new Error('サーバーの返事を読めませんでした。少し待ってからやり直してください');
      throw e;
    }).then(function (res) {
      if (res.ok) return res.data;
      var e = new Error(res.message || 'エラーが起きました'); e.code = res.code; e.details = res.details || [];
      throw e;
    });
  }

  // ---------- 見本モード（架空のデータ） ----------
  var Demo = {
    seq: 3,
    sent: {}, // 送信ID → 1回目の返事（二重送信の見本）
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
        明細: [{ 項目: '遅刻', 対象日: '2026-11-15', 開始: '09:00', 終了: '09:20', 備考: '電車遅延', 施設名: 'モア一津屋', 添付ファイルID: 'FILE-DEMO-0006' }] }
    ],
    pending: [
      { 申請ID: 'EXP-20261128-DEMO03', 申請種類: '経費', 申請者: '見本 花子', 申請者職員ID: 'STF-0002', 申請日時: '2026-11-28 09:05:00', 状態: '承認待ち', 現在段階: 1, 承認者: '見本 太郎', 担当: true,
        明細: [{ 行番号: 1, 対象日: '2026-11-28', 経費区分: '看護', 物品: '滅菌ガーゼ', 個数: 2, 金額: 640 }, { 行番号: 2, 対象日: '2026-11-28', 経費区分: '看護', 物品: '絆創膏', 個数: 1, 金額: 380 }] },
      { 申請ID: 'ATT-20261127-DEMO04', 申請種類: '勤怠', 申請者: '見本 次郎', 申請者職員ID: 'STF-0003', 申請日時: '2026-11-27 20:31:00', 状態: '承認待ち', 現在段階: 1, 承認者: '見本 太郎', 担当: true,
        明細: [{ 項目: '残業・前残業', 対象日: '2026-11-27', 開始: '18:00', 終了: '19:30', 備考: '記録の入力', 施設名: 'モア一津屋' }] },
      { 申請ID: 'ATT-20261127-DEMO09', 申請種類: '勤怠', 申請者: '見本 さくら', 申請者職員ID: 'STF-0006', 申請日時: '2026-11-27 09:50:00', 状態: '承認待ち', 現在段階: 1, 承認者: '見本 太郎', 担当: true,
        明細: [{ 項目: '遅刻', 対象日: '2026-11-27', 開始: '09:00', 終了: '09:40', 備考: '電車遅延（証明書あり）', 施設名: 'モア一津屋', 添付ファイルID: 'FILE-DEMO-0009' }] },
      { 申請ID: 'ATT-20261126-DEMO07', 申請種類: '勤怠', 申請者: '見本 三郎', 申請者職員ID: 'STF-0004', 申請日時: '2026-11-26 12:44:00', 状態: '承認待ち', 現在段階: 1, 承認者: '見本 一郎', 担当: false,
        明細: [{ 項目: '有給', 対象日: '2026-12-03', 開始: '09:00', 終了: '18:00', 備考: '' }] },
      { 申請ID: 'EXP-20261125-DEMO08', 申請種類: '経費', 申請者: '見本 四郎', 申請者職員ID: 'STF-0005', 申請日時: '2026-11-25 17:20:00', 状態: '承認待ち', 現在段階: 2, 承認者: '見本 一郎', 担当: false,
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
        // 送信ID: 同じIDの2回目は前の返事を返す（GAS と同じ。「もう一度送信する」で2件にしない）
        if (d.送信ID && self.sent[d.送信ID]) return self.sent[d.送信ID];
        check(type, d);
        var r = { 申請ID: prefix + '-' + today().replace(/-/g, '') + '-DEMO' + ('0' + (++self.seq)).slice(-2), 申請種類: type,
          申請者職員ID: self.me.職員ID, 申請日時: today() + ' 12:00:00', 状態: '承認待ち', 現在段階: 1 };
        if (type === '経費') {
          r.小口先出 = d.小口先出 || ''; r.備考 = d.備考 || '';
          r.明細 = (d.物品 || []).map(function (it, i) {
            return { 行番号: i + 1, 対象日: d.対象日 || '', 経費区分: d.経費区分 || '',
              物品: it.物品 === 'フリー入力' ? (it.自由入力 || 'フリー入力') : (it.物品 || ''), 個数: Number(it.個数) || 0, 金額: Number(it.金額) || 0, 施設名: d.施設名 || '' };
          });
        } else {
          var m = { 項目: d.項目 || '', 対象日: d.対象日 || '', 備考: d.備考 || '', 施設名: d.施設名 || '', 添付ファイルID: d.添付ファイルID || '' };
          if (d.打刻時刻) m.打刻時刻 = d.打刻時刻; else { m.開始 = d.開始 || ''; m.終了 = d.終了 || ''; }
          r.備考 = d.備考 || ''; r.明細 = [m];
        }
        self.requests.unshift(r);
        var res = { 申請ID: r.申請ID, 状態: r.状態 };
        if (d.送信ID) self.sent[d.送信ID] = res;
        return res;
      }
      // GAS と同じ入力チェック（docs/api.md「入力チェックと決まり」）。だめなら {code: 400, details} を投げる
      function check(type, d) {
        var errs = [], o = self.options, td = today();
        function realDay(v) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''), x = m && new Date(+m[1], +m[2] - 1, +m[3]); return !!x && x.getMonth() === +m[2] - 1 && x.getDate() === +m[3]; }
        function hm(v) { var m = /^(\d{2}):(\d{2})$/.exec(v || ''); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; }
        if (d.施設名 && o.施設.indexOf(d.施設名) < 0) errs.push('施設名は選択肢から選んでください');
        if (!realDay(d.対象日)) errs.push('対象日が正しくありません');
        if (String(d.備考 || '').length > 500) errs.push('備考は500文字までです');
        if (type === '経費') {
          if (realDay(d.対象日) && d.対象日 > td) errs.push('対象日は今日までの日にしてください');
          if (o.経費区分.indexOf(d.経費区分) < 0) errs.push('経費区分を選んでください');
          if (o.小口先出.indexOf(d.小口先出) < 0) errs.push('小口先出を選んでください');
          var items = d.物品 || [];
          if (!items.length) errs.push('物品を1つ以上入れてください');
          if (items.length > 50) errs.push('物品は50行までです');
          items.forEach(function (it, i) {
            var n = (i + 1) + '行目: ', q = Number(it.個数), y = Number(it.金額);
            if (!it.物品) errs.push(n + '物品を選んでください');
            if (it.物品 === 'フリー入力' && !String(it.自由入力 || '').trim()) errs.push(n + '物品名を書いてください');
            if (String(it.自由入力 || '').length > 100) errs.push(n + '物品名は100文字までです');
            if (!(q === Math.floor(q) && q >= 1 && q <= 9999)) errs.push(n + '個数は1〜9999の整数にしてください');
            if (it.金額 === '' || !(y === Math.floor(y) && y >= 0 && y <= 1000000)) errs.push(n + '金額は0〜1,000,000の整数にしてください');
          });
        } else {
          var k = d.項目 || '', s = hm(d.開始), e = hm(d.終了);
          if (o.勤怠項目.indexOf(k) < 0) errs.push('項目を選んでください');
          if (/^(残業|遅刻|早退|打刻修正)/.test(k) && realDay(d.対象日) && d.対象日 > td) errs.push(k + 'は先の日付では出せません');
          if (/^打刻修正/.test(k)) { if (hm(d.打刻時刻) === null) errs.push('打刻時刻を入れてください'); }
          else if (/^(欠勤|有給|冬期休暇|夏季休暇|特別休暇)$/.test(k)) {
            if (!d.開始 !== !d.終了) errs.push('時間は開始・終了の両方を入れるか、両方空にしてください');
            else if (d.開始 && (s === null || e === null || s >= e)) errs.push('時間が正しくありません');
          } else if (k) {
            if (s === null || e === null) errs.push('開始・終了の時刻を入れてください');
            else if (k === '残業・前残業') { var len = (e - s + 1440) % 1440; if (!len || len > 720) errs.push('残業の時間は12時間までで、開始と終了を同じにはできません'); }
            else if (s >= e) errs.push('終了は開始より後の時刻にしてください');
          }
        }
        if (errs.length) { var x = new Error('入力を確認してください'); x.code = 400; x.details = errs; throw x; }
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

  // 開けなかったときのカード（参考アプリの「日報を開けませんでした」と同じ形: 理由＋もう一度読み込む）。
  // エラー表示は2つの形にそろえてある: 画面ごと開けない → この白いカード（views/portal.js の failBox も同じ）、
  // 画面の一部（一覧など）が読めない → 赤い枠の「! 読み込めませんでした」（clients.js の showFail・shift.js の failBox）
  function showError(e) {
    busy(false);
    app.innerHTML = '<div class="card fail" role="alert"><h2>画面を開けませんでした</h2>' +
      '<p class="fail-msg">' + esc(e && e.message || 'エラーが起きました') + '</p>' +
      // 言い方は画面ごとのエラー表示（承認待ち一覧・自分の申請など）とそろえる:「電波の良い所で…」＋「もう一度読み込む」
      (e && e.code === 401 ? '<p class="fail-note">LINE からもう一度開き直してください。</p>'
        : (/電波/.test(e && e.message || '') ? '' : '<p class="fail-note">電波の良い所で、もう一度読み込んでください。</p>') +
          '<button type="button" onclick="location.reload()">もう一度読み込む</button>') + '</div>';
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
    app.innerHTML = (IPPO.menuHead ? IPPO.menuHead() : '<h1>メニュー</h1>') + '<nav class="mgroup" aria-label="メニュー">' + items.map(btn).join('') + '</nav>' +
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
    // 画面が変わるたびに番号を進める。遅れて届いた返事は、番号が変わっていたら捨てる（views/clients.js など）
    IPPO.gen = (IPPO.gen || 0) + 1;
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
    demoCore: DEMO ? Demo : null, // 見本の申請・承認待ちの入れ物（views/clients-demo.js が利用者申請・タスクの見本を足す）
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
