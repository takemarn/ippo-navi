/* 利用者管理・記録の画面（第3段階。参考動画 1:48〜4:10）
   流れ: #users（利用者管理: 新規登録・利用者検索・記録検索）→ #users-result（利用者検索結果）→ #user（利用者操作）
         → #user-info（情報閲覧） / #user-records（記録一覧） / #user-write（看護記録・介護記録・施設記録・往診）
         / #user-edit（データ修正・新規登録） / #user-photo（写真登録）。記録検索の結果は #records-result
   選んでいる利用者や検索条件は画面をまたぐので、この中の cur に持ち、sessionStorage にも置く（再読み込みしても続きから）
   ほかの画面へ: 申請内容を行に直す I.bodyLines を置く（views/approvals.js と views/requests.js が使う）
   GAS: searchClients / clientInfo / clientPhoto / uploadClientPhoto / addRecord / clientRecords / searchRecords / deleteRecord / requestClientChange
   見た目の約束: 見出しの上に小さな英字（EN）、ステータスは色つき札（stPill）、記録の種別は色（KIND_CLASS → css の --kc）。
   読み込み中は skel()、空は emptyHtml()、読めなかったら showFail()（もう一度読み込むボタン付き）。GAS とのやりとりの形は変えていない
   見直し4周目（使う人の目）: 言葉を日常語に（マスタ・ステータス・置換・単日指定など）、入口は「名前で探す」を先頭・新規登録は下、
   利用者操作は「記録を書く」2列ボタン、記録一覧は種類ボタンで画面内だけ絞り込み（GAS へは送らない）・日付は「11月28日(土)」 */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, state = I.state, api = I.api, esc = I.esc, toast = I.toast;

  var STATUS = ['居住中', '入院中', '退居', '登録なし'];
  var RECORD_KINDS = ['ヒヤリハット', '往診', '介護記録', '看護記録', '施設記録', '事故報告'];
  var WRITE_KINDS = ['看護記録', '介護記録', '施設記録', '往診'];

  // ---------- 画面をまたいで持つもの ----------
  var cur = load() || { q: { 施設: [], 氏名: '', ステータス: [] }, rq: { 施設: [], 種別: [], 開始日: '', 終了日: '', 単日: '' }, id: null, card: null, kind: '看護記録', edit: null };
  function save() { try { sessionStorage.setItem('ippo.clients', JSON.stringify(cur)); } catch (_) {} }
  // 前の版で保存した形が違っても壊れないよう、決まった形に重ねて読む
  function load() {
    try {
      var x = JSON.parse(sessionStorage.getItem('ippo.clients') || 'null');
      if (!x || typeof x !== 'object') return null;
      var d = { q: { 施設: [], 氏名: '', ステータス: [] }, rq: { 施設: [], 種別: [], 開始日: '', 終了日: '', 単日: '' }, id: null, card: null, kind: '看護記録', edit: null };
      var out = Object.assign(d, x);
      out.q = Object.assign({ 施設: [], 氏名: '', ステータス: [] }, x.q || {});
      out.rq = Object.assign({ 施設: [], 種別: [], 開始日: '', 終了日: '', 単日: '' }, x.rq || {});
      if (!out.card) out.id = null;
      return out;
    } catch (_) { return null; }
  }
  // 画面を離れたあとに届いた返事は使わない（core.js の route が IPPO.gen を進める）
  function keep(fn) { var g = I.gen; return function () { if (g === I.gen) return fn.apply(this, arguments); }; }
  var photoCache = {};

  // 自分が見られる施設だけ（GAS の me が返す 見られる施設。無ければ選択肢の施設）
  function facilities() { return (state.me && state.me.見られる施設) || (state.options && state.options.施設) || ['モア一津屋']; }

  // ---------- 共通の部品 ----------
  // 画面ごとの英字の小見出し（参考アプリの OVERVIEW / RECORD のような飾り。ホームの「MENU」「TO DO」とそろえる）
  var EN = {
    利用者管理: 'CLIENTS', 利用者検索結果: 'SEARCH RESULTS', 利用者操作: 'CLIENT MENU', 情報閲覧: 'OVERVIEW',
    看護記録: 'NURSING RECORD', 介護記録: 'CARE RECORD', 施設記録: 'FACILITY RECORD', 往診: 'HOME VISIT',
    記録一覧: 'RECORDS', 記録検索結果: 'RECORD SEARCH', 利用者の新規登録: 'NEW CLIENT', 利用者データ修正: 'EDIT DATA', 登録内容を直す: 'EDIT DATA', 写真登録: 'PHOTO'
  };
  // ページの外枠: 英字の小見出し・見出し・説明・右上の「戻る」
  function shell(title, sub, back, inner) {
    return '<section class="cl-shell"><div class="cl-head"><div class="cl-h"><small aria-hidden="true">' + esc(EN[title] || '') + '</small><h1>' + esc(title) + '</h1></div>' +
      (back ? '<a class="cl-backpill" href="' + back + '"><span aria-hidden="true">‹</span>戻る</a>' : '') + '</div>' +
      (sub ? '<p class="cl-sub">' + esc(sub) + '</p>' : '') + inner + '</section>';
  }
  // 小見出し（日本語＋右に小さな英字）。out=true はカードの外に置くとき
  function lab(jp, en, out, tag) {
    var t = tag || 'p';
    return '<' + t + ' class="cl-label' + (out ? ' cl-out' : '') + '">' + esc(jp) + (en ? '<small aria-hidden="true">' + esc(en) + '</small>' : '') + '</' + t + '>';
  }
  // ステータスの色つき札（居住中=緑、入院中=橙、退居=灰、登録なし=点線）
  var ST_CLASS = { 居住中: 'live', 入院中: 'hosp', 退居: 'out', 登録なし: 'none' };
  function stPill(s) { return s ? '<span class="cl-st ' + (ST_CLASS[s] || 'out') + '">' + esc(s) + '</span>' : ''; }
  // 記録の種別ごとの色（記録カードの左の帯と札に使う）
  var KIND_CLASS = { 看護記録: 'k-ns', 介護記録: 'k-cr', 施設記録: 'k-fc', 往診: 'k-dr', ヒヤリハット: 'k-hh', 事故報告: 'k-ac' };
  function chips(name, list, selected, multi, label) {
    return '<div class="cl-chips" role="group"' + (label ? ' aria-label="' + esc(label) + '"' : '') + ' data-chips="' + name + '"' + (multi ? ' data-multi="1"' : '') + '>' + list.map(function (v) {
      var on = selected.indexOf(v) >= 0;
      return '<button type="button" class="cl-chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-v="' + esc(v) + '">' + esc(v) + '</button>';
    }).join('') + '</div>';
  }
  function readChips(root, name) {
    return Array.prototype.map.call(root.querySelectorAll('[data-chips="' + name + '"] .cl-chip.on'), function (b) { return b.dataset.v; });
  }
  function onChipTap(e) {
    var b = e.target.closest('.cl-chip');
    if (!b) return;
    var g = b.parentNode;
    if (!g.dataset.multi) g.querySelectorAll('.cl-chip.on').forEach(function (x) { if (x !== b) { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); } });
    var on = !b.classList.contains('on');
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
  }
  function sec(label, inner, desc, en) {
    return '<div class="cl-card">' + lab(label, en) + (desc ? '<p class="cl-desc">' + esc(desc) + '</p>' : '') + inner + '</div>';
  }
  function photoBox(c) {
    if (!c.写真) return '<span class="cl-photo none">写真なし</span>';
    var src = photoCache[c.利用者ID];
    return '<span class="cl-photo" data-photo="' + esc(c.利用者ID) + '">' + (src ? '<img alt="" src="' + esc(src) + '">' : '<i>読込中</i>') + '</span>';
  }
  // 写真は一覧を先に出してから、同時に3人までずつ読む（一度にたくさん頼むとサーバーが詰まるため）。読めなかったら「画像登録なし」
  var photoQueue = [], photoBusy = 0;
  // 利用者IDに " などが入っていても壊れないよう、属性セレクタの値は CSS.escape する
  function photoSel(id) { return '[data-photo="' + (window.CSS && CSS.escape ? CSS.escape(id) : String(id).replace(/["\\]/g, '\\$&')) + '"]'; }
  // 一覧が長いとき（数百人）に全員の写真を一度に頼まないよう、画面に近づいたカードの分だけ順に読む（IntersectionObserver）
  var photoIO = window.IntersectionObserver ? new IntersectionObserver(function (ents) {
    ents.forEach(function (en) {
      if (!en.isIntersecting) return;
      photoIO.unobserve(en.target);
      var id = en.target.dataset.photo;
      if (!photoCache[id] && photoQueue.indexOf(id) < 0) photoQueue.push(id);
    });
    pumpPhotos();
  }, { rootMargin: '400px 0px' }) : null;
  function fillPhotos() {
    // 前の画面の読み残しは捨てる（いまの画面の写真を先に読む）
    if (photoIO) photoIO.disconnect();
    photoQueue = photoQueue.filter(function (id) { return document.querySelector(photoSel(id)); });
    document.querySelectorAll('[data-photo]').forEach(function (el) {
      var id = el.dataset.photo;
      if (photoCache[id] || photoQueue.indexOf(id) >= 0) return;
      if (photoIO) photoIO.observe(el); else photoQueue.push(id);
    });
    pumpPhotos();
  }
  function pumpPhotos() {
    while (photoBusy < 3 && photoQueue.length) {
      var id = photoQueue.shift();
      // 頼む前に画面を離れていたら読まない（写真の無い画面へ移っても裏で読み続けないように）
      if (document.querySelector(photoSel(id))) loadPhoto(id);
    }
  }
  function loadPhoto(id) {
    photoBusy++;
    function paint(html) { document.querySelectorAll(photoSel(id)).forEach(function (x) { x.innerHTML = html; if (!/img/.test(html)) x.classList.add('none'); }); }
    api('clientPhoto', { 利用者ID: id }).then(function (r) {
      if (!r.写真) return paint('写真なし');
      photoCache[id] = r.写真;
      paint('<img alt="" src="' + esc(r.写真) + '">');
    }).catch(function () { paint('読めません'); })
      .then(function () { photoBusy--; pumpPhotos(); });
  }
  // 写真のデータが壊れていて表示できないとき（img の error）は、壊れた絵の印を出さず「画像登録なし」にする。
  // error は泡立たないので document で捕まえる（読み込み時に1回だけ付ける。.cl-photo の中の img だけ見る）
  document.addEventListener('error', function (e) {
    var img = e.target, box = img && img.tagName === 'IMG' && img.closest('.cl-photo');
    if (!box) return;
    if (box.dataset.photo) delete photoCache[box.dataset.photo];
    box.classList.add('none'); box.textContent = box.id === 'ph-prev' ? '表示できない写真です' : '写真なし';
  }, true);
  function clientCard(c, asLink) {
    var body = '<div class="cl-cc-text"><p class="cl-cc-name"><span class="cl-id">' + esc(c.利用者ID) + '</span><b>' + esc(c.氏名) + '</b></p>' +
      '<p class="cl-kana">' + esc(c.ふりがな) + '</p><p>' + esc(c.施設名) + (c.部屋番号 ? ' <span class="cl-room">' + esc(c.部屋番号) + '</span>' : '') + '</p><p>' + stPill(c.ステータス) + '</p>' +
      ((c.タグ || []).length ? '<p class="cl-tags">' + c.タグ.map(function (t) { return '<span class="cl-tag">' + esc(t) + '</span>'; }).join('') + '</p>' : '') +
      '</div>' + photoBox(c);
    return asLink
      ? '<button type="button" class="cl-cc cl-cc-link" data-client="' + esc(c.利用者ID) + '" aria-label="' + esc(c.氏名) + 'さんの操作へ">' + body + '<span class="cl-chev" aria-hidden="true"></span></button>'
      : '<div class="cl-cc">' + body + '</div>';
  }
  function needClient() {
    if (cur.id && cur.card) return true;
    // replace にする（hash に入れると、ブラウザの「戻る」でこの画面に戻ってまた飛ばされ、抜け出せなくなる）
    location.replace('#users');
    return false;
  }
  // 画面の切り替え中に出す「記録を読み込み中・・・」（参考アプリの文言）
  function overlay(text) {
    I.busy(true);
    var el = document.querySelector('#busy span');
    if (el && text) el.textContent = text;
  }
  function failHtml(e) { return '<div class="errors" role="alert">' + esc(e && e.message || 'エラーが起きました') + '</div>'; }
  function loading(text) { return '<div class="loading" role="status">' + esc(text || '読み込み中...') + '</div>'; }
  // 一覧の読み込み中: カードの形の灰色の板（スケルトン）を並べ、文字でも「読み込み中」と伝える
  function skel(text, n, kind) {
    var one = kind === 'rec'
      ? '<div class="cl-skel rec"><i class="w40"></i><i class="w60"></i><i class="w90"></i><i class="w70"></i></div>'
      : kind === 'field'
        ? '<div class="cl-skel field"><i class="w30"></i><i class="w60"></i></div>'
        : '<div class="cl-skel cc"><div><i class="w40"></i><i class="w60"></i><i class="w70"></i><i class="w30"></i></div><b></b></div>';
    return '<div class="cl-loading" role="status" aria-live="polite"><p class="cl-loading-t"><span class="cl-spin" aria-hidden="true"></span>' + esc(text || '読み込み中...') + '</p>' +
      new Array(n || 3).join(',').split(',').map(function () { return one; }).join('') + '</div>';
  }
  // 読み込めなかったとき: 理由と「もう一度読み込む」ボタン（fn をもう一度呼ぶ）
  function showFail(el, e, fn) {
    if (!el) return;
    el.innerHTML = '<div class="cl-fail" role="alert"><p class="cl-fail-h">読み込めませんでした</p><p>' + esc(e && e.message || 'エラーが起きました') + '</p>' +
      // 通信エラーの文にはすでに「電波の良い所で…」が入っているので、同じ文を2回出さない
      (/電波/.test(e && e.message || '') ? '' : '<p class="cl-fail-n">電波の良い所で、もう一度お試しください。</p>') +
      (fn ? '<button type="button" class="cl-clear cl-retry">もう一度読み込む</button>' : '') + '</div>';
    var b = el.querySelector('.cl-retry');
    if (b) b.addEventListener('click', fn);
  }
  // 空のとき: 絵・ひとこと・次にできること
  function emptyHtml(title, note, btn) {
    return '<div class="cl-empty"><svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="21" cy="21" r="12"/><path d="M30 30l9 9M16 21h10"/></svg>' +
      '<b>' + esc(title) + '</b>' + (note ? '<span>' + esc(note) + '</span>' : '') + (btn || '') + '</div>';
  }
  // 記録を月ごとに区切って並べる（見出し「2026年11月 · 5件」）
  function recList(list, withName) {
    var html = '', ym = '', counts = {};
    list.forEach(function (r) { var k = String(r.記録日 || '').slice(0, 7); counts[k] = (counts[k] || 0) + 1; });
    list.forEach(function (r) {
      var k = String(r.記録日 || '').slice(0, 7);
      if (k !== ym) {
        ym = k;
        var m = /^(\d{4})-(\d{2})$/.exec(k);
        html += '<h3 class="cl-month">' + (m ? m[1] + '年' + (+m[2]) + '月' : '日付なし') + '<small>' + counts[k] + '件</small></h3>';
      }
      html += recCard(r, withName);
    });
    return html;
  }
  // Enter で検索する欄: 日本語入力の変換を確定する Enter では検索しない（isComposing / keyCode 229）
  function onEnter(el, fn) {
    el.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
      e.preventDefault(); fn();
    });
  }
  function trackClicks(fn) { app.addEventListener('click', fn); I.cleanup.push(function () { app.removeEventListener('click', fn); }); }

  // 申請の中身（利用者登録・利用者修正・タスク）を承認待ち一覧・自分の申請で表示する
  I.bodyLines = function (r) {
    var b = (r.明細 || [])[0] || {};
    if (b.非表示) return '<p class="muted">ほかの施設の利用者の申請なので、中身は表示しません。</p>';
    var rows = [];
    if (r.申請種類 === 'タスク') {
      rows = [['利用者', b.利用者氏名], ['タスク', b.タスク], ['保険種類', b.保険種類], ['生活保護', b.生活保護],
        ['日程', b.日程 || (b.日程開始 ? b.日程開始 + '〜' + (b.日程終了 || '') : '')],
        ['時間', b.時間開始 || b.時間終了 ? (b.時間開始 || '') + '〜' + (b.時間終了 || '') : ''],
        ['訪問看護指示書変更', b.訪問看護指示書変更], ['期間', b.期間開始 ? b.期間開始 + '〜' + (b.期間終了 || '') : ''], ['状態', b.状態], ['備考', b.備考]];
    } else {
      rows = [['種類', { 新規: '新規登録', 置換: '内容を直す（置換）', 削除: '登録をやめる（削除）' }[b.種類] || b.種類], ['利用者', b.利用者氏名]];
      Object.keys(b.項目 || {}).forEach(function (k) {
        var cat = k.split('/')[0], name = k.split('/').slice(1).join('/');
        if (b.種類 === '新規' && k === '利用者データ/氏名') return; // 「利用者」の行と同じなので出さない
        var label = cat === '利用者データ' ? showLabel(cat, name) : name.indexOf(cat) === 0 ? name : cat + ' / ' + name;
        var now = b.項目[k] || '（空にする）', old = (b.変更前 || {})[k];
        rows.push([label, old !== undefined && b.種類 === '置換' ? (old || '（空）') + ' → ' + now : now]);
      });
      if (b.理由) rows.push(['理由', b.理由]);
    }
    return '<dl class="apv-dl cl-body">' + rows.filter(function (x) { return x[1]; }).map(function (x) {
      return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>';
    }).join('') + '</dl>';
  };

  // ---------- 利用者管理（入口） ----------
  function viewTop() {
    // 上にほかのメニューと同じ絵の見出し（views/menu.js の IPPO.menuHead）を置く
    // 見出しは上の絵の「利用者一覧」だけにする（枠の中に「利用者管理」の大見出しを重ねない）。絵が無いときだけ枠に見出しを出す
    // 見直し4周目（使う人の目）: いちばん多い「人を探して記録を書く」を一番上に。名前の欄を先頭にし、
    // めったに使わない新規登録（運営・管理者向け）は一番下へ移した。専門用語・カタカナは日常の言葉に言い換えた
    var lead = '名前で探して、記録を書いたり情報を見たりできます。何も入れずに「探す」を押すと全員が出ます。';
    var top = I.menuHead
      ? '<section class="cl-shell cl-shell-top"><p class="cl-lead">' + esc(lead) + '</p>'
      : '<section class="cl-shell"><div class="cl-head"><div class="cl-h"><small aria-hidden="true">' + EN.利用者管理 + '</small><h1>利用者管理</h1></div></div><p class="cl-sub">' + esc(lead) + '</p>';
    app.innerHTML = (I.menuHead ? I.menuHead() : '') + top + (
      lab('利用者を探す', 'FIND CLIENTS', true, 'h2') +
      sec('名前で探す', '<input id="cl-name" class="cl-input" type="search" enterkeyhint="search" aria-label="名前で探す" placeholder="例: みほん（名字だけ・ふりがなでも可）" value="' + esc(cur.q.氏名) + '" autocomplete="off">', '', 'NAME') +
      sec('いまの状態', chips('st', STATUS, cur.q.ステータス, true, 'いまの状態'), '選ばなければ、すべての状態の方が出ます。', 'STATUS') +
      sec('施設', chips('fac', facilities(), cur.q.施設, true, '施設'), '', 'FACILITY') +
      '<button type="button" class="cl-go" id="cl-search"><svg class="cl-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>利用者を探す</button>' +
      '<hr class="cl-hr">' +
      lab('記録を探す', 'FIND RECORDS', true, 'h2') + '<p class="cl-desc cl-out">全員の記録の中から、種類や日付で探します（人を決めずに探すとき）。</p>' +
      sec('記録の種類', chips('rkind', RECORD_KINDS, cur.rq.種別, true, '記録の種類'), '選ばなければ、すべての種類が出ます。', 'TYPE') +
      sec('日付', dateRange(cur.rq), '1日だけ見るときは「この日だけ」に入れてください（開始日・終了日より優先）。', 'DATE') +
      sec('施設', chips('rfac', facilities(), cur.rq.施設, true, '記録を探す施設'), '', 'FACILITY') +
      '<div id="cl-err"></div>' +
      '<button type="button" class="cl-go" id="cl-rsearch"><svg class="cl-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>記録を探す</button>' +
      '<hr class="cl-hr">' +
      '<div class="cl-card cl-newcard">' + lab('新しい利用者の登録', 'NEW') + '<p class="cl-desc">新しく入居される方を登録する申請です。承認されると、この一覧に出ます。</p>' +
        '<button type="button" class="cl-clear" id="cl-new"><span aria-hidden="true" class="cl-plus">＋</span>新しい利用者を登録する</button></div>') + '</section>' +
      I.backHtml('#menu', 'メニュー一覧に戻る');
    trackClicks(function (e) {
      onChipTap(e);
      if (e.target.closest('#cl-new')) { cur.edit = { 種類: '新規' }; save(); location.hash = '#user-edit'; }
      if (e.target.closest('#cl-search')) {
        cur.q = { 施設: readChips(app, 'fac'), 氏名: document.getElementById('cl-name').value.trim(), ステータス: readChips(app, 'st') };
        save(); location.hash = '#users-result';
      }
      if (e.target.closest('#cl-rsearch')) {
        var rq = Object.assign({ 施設: readChips(app, 'rfac'), 種別: readChips(app, 'rkind') }, readRange());
        var err = rangeError(rq);
        if (err) { document.getElementById('cl-err').innerHTML = I.errorsBox([err]); return; }
        cur.rq = rq; save(); location.hash = '#records-result';
      }
    });
    onEnter(document.getElementById('cl-name'), function () { document.getElementById('cl-search').click(); });
  }
  function dateRange(q) {
    return '<div class="cl-dates"><label>開始日<input type="date" id="cl-from" class="cl-input" value="' + esc(q.開始日 || '') + '"></label>' +
      '<label>終了日<input type="date" id="cl-to" class="cl-input" value="' + esc(q.終了日 || '') + '"></label>' +
      '<label>この日だけ<input type="date" id="cl-day" class="cl-input" value="' + esc(q.単日 || '') + '"></label></div>';
  }
  function readRange() {
    return { 開始日: document.getElementById('cl-from').value, 終了日: document.getElementById('cl-to').value, 単日: document.getElementById('cl-day').value };
  }
  function rangeError(q) {
    if (!q.単日 && q.開始日 && q.終了日 && q.開始日 > q.終了日) return '終了日は開始日より後にしてください';
    return '';
  }
  function condText(q) {
    function v(a) { return a && a.length ? (Array.isArray(a) ? a.join('、') : a) : '指定なし'; }
    var when = q.単日 ? q.単日 : (q.開始日 || q.終了日 ? (q.開始日 || '') + ' 〜 ' + (q.終了日 || '') : '指定なし');
    // 「指定なし」は薄い色にして、指定した条件が目に入るようにする
    function row(k, val) { return '<p><span>' + esc(k) + '</span><b' + (val === '指定なし' ? ' class="none"' : '') + '>' + esc(val) + '</b></p>'; }
    return q.種別 !== undefined
      ? row('記録の種類', v(q.種別)) + row('日付', when) + row('施設', v(q.施設))
      : row('名前', v(q.氏名)) + row('いまの状態', v(q.ステータス)) + row('施設', v(q.施設));
  }

  // ---------- 利用者検索結果 ----------
  function viewResult() {
    app.innerHTML = shell('利用者検索結果', '条件に合う方の一覧です。', '#users',
      '<div class="cl-card">' + lab('検索条件', 'CONDITIONS') + '<div class="cl-cond">' + condText(cur.q) + '</div>' +
        '<a class="cl-condedit" href="#users">条件を変える</a></div>' +
      '<div class="cl-outrow">' + lab('検索結果', 'RESULTS', true, 'h2') + '<span id="cl-n"></span></div><p class="cl-desc cl-out">記録を書く・情報を見るときは、その方のカードを押してください。</p>' +
      '<div id="cl-list" class="cl-list">' + skel('利用者を読み込み中...', 3) + '</div>');
    trackClicks(function (e) {
      var b = e.target.closest('[data-client]');
      if (!b) return;
      cur.id = b.dataset.client; cur.card = (cur.list || []).filter(function (c) { return c.利用者ID === cur.id; })[0]; save();
      location.hash = '#user';
    });
    function run() {
      var el = document.getElementById('cl-list'); if (!el) return;
      el.innerHTML = skel('利用者を読み込み中...', 3);
      api('searchClients', cur.q).then(keep(function (r) {
        var el = document.getElementById('cl-list'); if (!el) return;
        cur.list = r.一覧; save();
        el.innerHTML = r.一覧.length ? r.一覧.map(function (c) { return clientCard(c, true); }).join('') :
          emptyHtml('条件に合う方はいません', '名前の一部だけにするか、状態の選択を外して、もう一度探してください。', '<a class="cl-clear" href="#users">条件を変える</a>');
        document.getElementById('cl-n').innerHTML = '<span class="cl-count">' + r.一覧.length + '名</span>';
        fillPhotos();
      })).catch(keep(function (e) { showFail(document.getElementById('cl-list'), e, run); }));
    }
    run();
  }

  // ---------- 利用者操作 ----------
  function viewOps() {
    if (!needClient()) return;
    // 見直し4周目（使う人の目）: 「主操作・補助操作」という言い方をやめ、「記録を書く」「見る」「そのほか」に分けた。
    // 夜勤で片手でも押しやすいよう、記録を書く4つは大きめの2列のボタンにして、スクロールせずに届く位置に置く
    var views = [
      ['OVERVIEW', '情報閲覧', '住所・保険・緊急連絡先などを見る', '#user-info'],
      ['RECORDS', '過去の記録', 'これまでの記録を新しい順に見る', '#user-records']
    ];
    var WRITE_NOTE = { 看護記録: 'バイタル・処置など', 介護記録: '食事・入浴・排せつなど', 施設記録: '居室・設備のこと', 往診: '医師の診察のこと' };
    app.innerHTML = shell('利用者操作', 'この方について、記録を書くか、情報を見るかを選んでください。', '#users-result',
      clientCard(cur.card) +
      lab('記録を書く', 'WRITE', true, 'h2') +
      '<div class="cl-wgrid">' + WRITE_KINDS.map(function (k) {
        return '<a class="cl-wt ' + KIND_CLASS[k] + '" href="#user-write" data-kind="' + esc(k) + '"><span class="cl-wt-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg></span>' +
          '<b>' + esc(k) + '</b><span>' + esc(WRITE_NOTE[k]) + '</span></a>';
      }).join('') + '</div>' +
      lab('見る', 'VIEW', true, 'h2') +
      '<div class="cl-ops">' + views.map(function (o) {
        return '<a class="cl-op k-view" href="' + o[3] + '"><small aria-hidden="true">' + o[0] + '</small><b>' + esc(o[1]) + '</b><span>' + esc(o[2]) + '</span>' +
          '<i class="cl-op-go" aria-hidden="true"></i></a>';
      }).join('') + '</div>' +
      lab('そのほか', 'MORE', true, 'h2') +
      '<div class="cl-subops"><button type="button" class="cl-chip" data-sub="edit">登録内容を直す（申請）</button>' +
      '<button type="button" class="cl-chip" data-sub="photo">写真を登録する</button>' +
      '<button type="button" class="cl-chip soon" data-sub="sheet" aria-disabled="true">フェイスシート印刷<small>準備中</small></button></div>');
    fillPhotos();
    trackClicks(function (e) {
      var k = e.target.closest('[data-kind]');
      // 参考アプリと同じく、記録画面へ移る間だけ「準備中」を出す（route() が消す）
      if (k) { cur.kind = k.dataset.kind; save(); overlay('記録画面を準備中・・・'); }
      var s = e.target.closest('[data-sub]');
      if (!s) return;
      if (s.dataset.sub === 'edit') askEditKind();
      if (s.dataset.sub === 'photo') location.hash = '#user-photo';
      if (s.dataset.sub === 'sheet') toast('フェイスシート（利用者の情報を1枚にまとめた紙）の印刷は、まだ使えません');
    });
  }

  // データ修正の前に「置換」か「削除」かを選ぶ（参考アプリは文字で入力させるが、押し間違えないようボタンにした）
  function askEditKind() {
    if (document.getElementById('cl-modal')) return; // 二度押しで小窓が2枚重ならないように
    var opened = Date.now(), wrap = document.createElement('div');
    wrap.className = 'cl-modal-wrap'; wrap.id = 'cl-modal';
    wrap.innerHTML = '<div class="cl-modal" role="dialog" aria-modal="true" aria-labelledby="cl-modal-h"><h2 id="cl-modal-h">登録内容を直す</h2>' +
      '<p>どちらにしますか。すぐには変わらず、申請して承認されてから反映されます。</p>' +
      '<div class="cl-modal-btns"><button type="button" data-k="置換">書いてある内容を直す<small>部屋の移動・連絡先の変更など</small></button><button type="button" class="danger" data-k="削除">この方の登録をやめる<small>退居など。記録は消えません</small></button>' +
      '<button type="button" class="sub" data-k="">キャンセル</button></div></div>';
    document.body.appendChild(wrap);
    wrap.querySelector('[data-k="置換"]').focus();
    function close() {
      wrap.remove(); document.removeEventListener('keydown', esc_);
      var back = document.querySelector('[data-sub="edit"]'); if (back) back.focus();
    }
    // Esc で閉じる。Tab は小窓の3つのボタンの中だけを回る
    function esc_(e) {
      if (e.key === 'Escape') return close();
      if (e.key !== 'Tab') return;
      var bs = wrap.querySelectorAll('button'), first = bs[0], last = bs[bs.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', esc_);
    I.cleanup.push(close);
    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('[data-k]');
      // 開いた直後（二度押しの2回目）は無視する。外側をすぐ押して閉じたり、下のボタンを押し間違えたりしないように
      if (Date.now() - opened < 400) return;
      if (e.target === wrap) return close();
      if (!b) return;
      close();
      if (b.dataset.k) { cur.edit = { 種類: b.dataset.k, 利用者ID: cur.id }; save(); location.hash = '#user-edit'; }
    });
  }

  // ---------- 情報閲覧 ----------
  var infoTab = '利用者データ';
  function viewInfo() {
    if (!needClient()) return;
    app.innerHTML = shell('情報閲覧', '見たい情報（保険・連絡先など）のボタンを押すと切り替わります。', '#user',
      clientCard(cur.card) + '<div id="cl-info"></div>');
    fillPhotos();
    function run() {
      var el = document.getElementById('cl-info'); if (!el) return;
      el.innerHTML = skel('利用者情報を読み込み中...', 4, 'field');
      api('clientInfo', { 利用者ID: cur.id }).then(keep(function (r) {
        cur.info = r.カテゴリ; save();
        drawInfo();
      })).catch(keep(function (e) { showFail(document.getElementById('cl-info'), e, run); }));
    }
    run();
    trackClicks(function (e) {
      var b = e.target.closest('[data-tab]');
      if (b) {
        infoTab = b.dataset.tab; drawInfo();
        // カテゴリを替えたら、その項目の見出しが見える所まで動かす（下の方を見ていても迷わないように）
        var h = document.getElementById('cl-info-h');
        if (h && h.getBoundingClientRect().top < 0) h.scrollIntoView({ block: 'start' });
      }
    });
  }
  function drawInfo() {
    var el = document.getElementById('cl-info'); if (!el) return;
    var cats = cur.info || [], c = cats.filter(function (x) { return x.名前 === infoTab; })[0] || cats[0];
    if (!c) { el.innerHTML = emptyHtml('表示できる情報がありません', '利用者の情報がまだ登録されていません。'); return; }
    infoTab = c.名前;
    // カテゴリのチップには、入っている項目の数を小さく出す（空のカテゴリはすぐ分かるよう薄くする）
    function filled(x) { return x.項目.filter(function (f) { return f.値; }).length; }
    var n = filled(c);
    el.innerHTML = '<div class="cl-card">' + lab('見たい情報を選ぶ', 'CATEGORY') + '<div class="cl-chips" role="group" aria-label="表示カテゴリ">' + cats.map(function (x) {
      var on = x.名前 === c.名前, k = filled(x);
      return '<button type="button" class="cl-chip' + (on ? ' on' : '') + (k ? '' : ' dim') + '" aria-pressed="' + on + '" data-tab="' + esc(x.名前) + '">' + esc(catName(x.名前)) + '</button>';
    }).join('') + '</div></div>' +
    '<div class="cl-outrow" id="cl-info-h">' + lab(catName(c.名前), '', true, 'h2') + '<span class="cl-count">' + c.項目.length + '項目中 ' + n + '項目 記入あり</span></div>' +
    '<div class="cl-fields">' + c.項目.map(function (f) {
      var v = f.値, html;
      if (!v) html = '<span class="cl-nil">（まだ書かれていません）</span>';
      else if (/電話番号|連絡先/.test(f.項目) && /^[0-9+\-() ]{6,}$/.test(v)) html = '<a class="cl-tel" href="tel:' + esc(v.replace(/[^0-9+]/g, '')) + '">' + esc(v) + '</a>';
      else html = esc(v);
      return '<div class="cl-field' + (v ? '' : ' nil') + '"><small>' + esc(showLabel(c.名前, f.項目)) + '</small><p>' + html + '</p></div>';
    }).join('') + '</div>';
  }

  // 画面に出すカテゴリ名: シートの「ケアマネマスタ」などの「マスタ」（台帳の意味の業界用語）は職員に分かりにくいので外して見せる。
  // データのやりとり（名前）はそのまま。「利用者データ」は「基本情報」と見せる
  function catName(n) { return n === '利用者データ' ? '基本情報' : String(n).replace(/マスタ$/, ''); }
  function toKata(t) { return String(t || '').replace(/[\u3041-\u3096]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) + 0x60); }); }

  // 画面に出す項目名（参考アプリの表示に合わせる。シートの列名・送る名前は 氏名・ふりがな のまま）
  function showLabel(cat, k) { return cat === '利用者データ' ? ({ 氏名: '名前', ふりがな: 'フリガナ', ステータス: '状態（ステータス）' }[k] || k) : k; }

  // ---------- 記録入力（看護記録・介護記録・施設記録・往診。4つとも同じ形） ----------
  function viewWrite() {
    if (!needClient()) return;
    var kind = WRITE_KINDS.indexOf(cur.kind) >= 0 ? cur.kind : '看護記録';
    // 書きかけのメモは利用者・種別ごとにこの端末（タブを閉じるまで）に残す。登録したら消す
    var dkey = 'ippo.draft.' + cur.id + '.' + kind, draft = '';
    try { draft = sessionStorage.getItem(dkey) || ''; } catch (_) {}
    app.innerHTML = shell(kind, '日付・書いた人・内容を入れて「登録する」を押してください。書きかけは自動で残ります。', '#user',
      clientCard(cur.card) +
      '<form id="f" class="cl-form" novalidate><div class="cl-card cl-wcard ' + (KIND_CLASS[kind] || '') + '">' + lab('書く内容', 'INPUT') +
        '<label>記録日<input type="date" id="w-day" class="cl-input" value="' + I.today() + '" max="' + I.today() + '" required></label>' +
        '<label>書いた人<input id="w-who" class="cl-input" value="' + esc(state.me && state.me.氏名) + '" autocomplete="off" required></label>' +
        '<div class="cl-memo-h"><label for="w-memo">記録の内容</label><button type="button" class="cl-mini" id="w-now">今の時刻を入れる</button></div>' +
        '<textarea id="w-memo" class="cl-input" rows="8" placeholder="自由に入力してください&#10;例: 20:45 食後の服薬を確認。変わりなし。" required>' + esc(draft) + '</textarea>' +
        '<p class="cl-memo-f"><span id="w-saved">' + (draft ? '書きかけを戻しました' : '') + '</span><span id="w-len">' + draft.length + '文字</span></p>' +
      '</div><div id="err"></div>' +
      '<button type="submit" class="cl-go">登録する</button>' +
      '</form>');
    fillPhotos();
    var memo = document.getElementById('w-memo'), saveT = 0, sending = false;
    memo.addEventListener('input', function () {
      document.getElementById('w-len').textContent = memo.value.length + '文字';
      clearTimeout(saveT);
      saveT = setTimeout(function () {
        try { if (memo.value) sessionStorage.setItem(dkey, memo.value); else sessionStorage.removeItem(dkey); } catch (_) {}
        var s = document.getElementById('w-saved'); if (s) s.textContent = memo.value ? '書きかけを保存しました' : '';
      }, 600);
    });
    // 参考アプリの記録はメモの頭に時刻（20:45 など）を書くことが多いので、押すとカーソルの位置に今の時刻を入れる
    document.getElementById('w-now').addEventListener('click', function () {
      var d = new Date(), t = d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2);
      var a = memo.selectionStart || 0, b = memo.selectionEnd || 0, v = memo.value;
      var ins = (a > 0 && v[a - 1] !== '\n' ? '\n' : '') + t + ' ';
      memo.value = v.slice(0, a) + ins + v.slice(b);
      memo.focus(); memo.selectionStart = memo.selectionEnd = a + ins.length;
      memo.dispatchEvent(new Event('input'));
    });
    document.getElementById('f').addEventListener('submit', function (e) {
      e.preventDefault();
      var data = { 利用者ID: cur.id, 種別: kind, 記録日: document.getElementById('w-day').value, 記録担当者: document.getElementById('w-who').value.trim(), メモ: document.getElementById('w-memo').value };
      var errs = [];
      if (sending) return; // 送信中にもう一度押されても二重に登録しない
      if (!data.記録日) errs.push('記録日を入れてください');
      else if (data.記録日 > I.today()) errs.push('記録日は今日までの日付にしてください');
      if (!data.記録担当者) errs.push('書いた人の名前を入れてください');
      if (!data.メモ.trim()) errs.push('記録の内容を入れてください');
      var err = document.getElementById('err'), btn = e.target.querySelector('button[type=submit]');
      if (errs.length) { err.innerHTML = I.errorsBox(errs); return; }
      err.innerHTML = ''; btn.disabled = true; btn.textContent = '登録中…'; overlay('読み込み中・・・'); sending = true;
      var g = I.gen;
      api('addRecord', data).then(function () {
        I.busy(false); toast(kind + 'を登録しました');
        clearTimeout(saveT); try { sessionStorage.removeItem(dkey); } catch (_) {}
        if (g === I.gen) location.hash = '#user'; // 参考アプリと同じく利用者操作へ戻る（もう別の画面にいたら動かさない）
      }).catch(function (x) {
        I.busy(false); btn.disabled = false; btn.textContent = '登録する'; sending = false;
        err.innerHTML = x.details && x.details.length ? I.errorsBox(x.details) : failHtml(x);
      });
    });
  }

  // ---------- 記録一覧（この利用者の過去の記録） ----------
  function emptyRecQ() { return { 開始日: '', 終了日: '', 単日: '', 文字: '' }; }
  // recKind: 種類のボタンで選んだ記録の種類（''=すべて）。読み込んだ一覧を画面の中だけで絞る（GAS には送らない）
  var recQ = emptyRecQ(), recQFor = null, recKind = '', recAll = [];
  function viewRecords() {
    if (!needClient()) return;
    if (recQFor !== cur.id) { recQ = emptyRecQ(); recQFor = cur.id; recKind = ''; } // 絞り込みは利用者ごと
    app.innerHTML = shell('記録一覧', 'この方の記録を新しい順に出しています。種類のボタンで、看護記録だけ・介護記録だけにもできます。', '#user',
      clientCard(cur.card) +
      '<details class="cl-card cl-fold"' + (recQ.開始日 || recQ.終了日 || recQ.単日 || recQ.文字 ? ' open' : '') + '><summary class="cl-label">日付・言葉で絞り込む<small aria-hidden="true">FILTER</small></summary>' +
        '<div class="cl-foldin">' + dateRange(recQ) +
        '<label class="cl-lab">言葉で探す<input id="cl-text" class="cl-input" type="search" enterkeyhint="search" placeholder="例: 転倒、むくみ、書いた人の名前" value="' + esc(recQ.文字) + '"></label>' +
        '<div id="cl-err"></div>' +
        '<div class="cl-btns"><button type="button" class="cl-go" id="cl-find">この条件で絞り込む</button><button type="button" class="cl-clear" id="cl-clear">条件を消して全部出す</button></div></div></details>' +
      '<div class="cl-outrow">' + lab('記録一覧', 'RECORDS', true, 'h2') + '<span id="cl-n"></span></div>' +
      '<div id="cl-kinds"></div>' +
      '<div id="cl-recs" class="cl-list">' + skel('記録を読み込み中...', 3, 'rec') + '</div>' +
      '<a class="cl-clear cl-towrite" href="#user">この方の記録を書く</a>');
    fillPhotos();
    trackClicks(function (e) {
      if (e.target.closest('#cl-find')) {
        var q = Object.assign(readRange(), { 文字: document.getElementById('cl-text').value.trim() }), m = rangeError(q);
        document.getElementById('cl-err').innerHTML = m ? I.errorsBox([m]) : '';
        if (!m) { recQ = q; loadRecs(); }
      }
      if (e.target.closest('#cl-clear') || e.target.closest('.cl-reset')) {
        recQ = emptyRecQ();
        ['cl-from', 'cl-to', 'cl-day', 'cl-text'].forEach(function (id) { var x = document.getElementById(id); if (x) x.value = ''; });
        document.getElementById('cl-err').innerHTML = '';
        loadRecs();
      }
      var kb = e.target.closest('[data-rkind]');
      if (kb) { recKind = kb.dataset.rkind; drawRecs(); }
      var d = e.target.closest('[data-del]');
      if (d) delRecord(d);
    });
    onEnter(document.getElementById('cl-text'), function () { document.getElementById('cl-find').click(); });
    loadRecs();
  }
  var recSeq = 0;
  function loadRecs() {
    var el = document.getElementById('cl-recs'); if (!el) return;
    // 検索を続けて押したとき、遅れて届いた古い返事で新しい結果を上書きしないよう、最後に頼んだ分だけ使う
    var my = ++recSeq;
    el.innerHTML = skel('記録を読み込み中...', 3, 'rec');
    overlay('記録を読み込み中・・・'); // 参考アプリと同じく、読み込むあいだは画面全体をぼかす
    api('clientRecords', Object.assign({ 利用者ID: cur.id }, recQ)).then(keep(function (r) {
      if (my !== recSeq) return;
      I.busy(false);
      if (!document.getElementById('cl-recs')) return;
      recAll = r.一覧;
      drawRecs();
    })).catch(keep(function (e) { if (my !== recSeq) return; I.busy(false); showFail(document.getElementById('cl-recs'), e, loadRecs); }));
  }
  // 種類のボタン（すべて・看護記録 3 …）と一覧を描く。種類のボタンは記録がある種類だけ出す
  function drawRecs() {
    var el = document.getElementById('cl-recs'), kb = document.getElementById('cl-kinds'); if (!el) return;
    var filtered = recQ.開始日 || recQ.終了日 || recQ.単日 || recQ.文字, cnt = {};
    recAll.forEach(function (r) { cnt[r.種別] = (cnt[r.種別] || 0) + 1; });
    var kinds = RECORD_KINDS.filter(function (k) { return cnt[k]; });
    Object.keys(cnt).forEach(function (k) { if (kinds.indexOf(k) < 0) kinds.push(k); });
    if (recKind && !cnt[recKind]) recKind = '';
    kb.innerHTML = kinds.length > 1 ? '<div class="cl-chips cl-kchips" role="group" aria-label="記録の種類で絞る">' + [''].concat(kinds).map(function (k) {
      var on = k === recKind;
      return '<button type="button" class="cl-chip' + (on ? ' on' : '') + (k ? ' ' + (KIND_CLASS[k] || '') : '') + '" aria-pressed="' + on + '" data-rkind="' + esc(k) + '">' +
        esc(k || 'すべて') + '<small>' + (k ? cnt[k] : recAll.length) + '</small></button>';
    }).join('') + '</div>' : '';
    var list = recAll.filter(function (r) { return !recKind || r.種別 === recKind; });
    document.getElementById('cl-n').innerHTML = '<span class="cl-count">' + list.length + '件</span>';
    el.innerHTML = list.length ? (state.me && state.me.役割 === '管理者' ? '' : '<p class="cl-note">削除ボタンが出るのは、自分が書いた記録だけです。</p>') + recList(list, false)
      : filtered ? emptyHtml('条件に合う記録はありません', '日付を広げるか、言葉を短くして、もう一度絞り込んでください。', '<button type="button" class="cl-clear cl-reset">条件を消して全部出す</button>')
        : emptyHtml('まだ記録はありません', '下の「この方の記録を書く」から書けます。');
  }
  // 記録日を「11月28日(土)」にし、今日・昨日は札を付ける（年は月の見出しにあるので省く）。形が違う値はそのまま出す
  function dayText(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ''));
    if (!m) return esc(d || '');
    var dt = new Date(+m[1], +m[2] - 1, +m[3]), t = I.today(), y = new Date(); y.setDate(y.getDate() - 1);
    var ys = y.getFullYear() + '-' + ('0' + (y.getMonth() + 1)).slice(-2) + '-' + ('0' + y.getDate()).slice(-2);
    var tag = d === t ? '<em class="cl-rel">今日</em>' : d === ys ? '<em class="cl-rel">昨日</em>' : '';
    return tag + (+m[2]) + '月' + (+m[3]) + '日(' + '日月火水木金土'.charAt(dt.getDay()) + ')';
  }
  function recCard(r, withName) {
    var mine = state.me && (r.記録者職員ID === state.me.職員ID || state.me.役割 === '管理者');
    return '<article class="cl-rec ' + (KIND_CLASS[r.種別] || '') + '" data-rec="' + esc(r.記録ID) + '"><div class="cl-rec-h"><b>' + esc(r.種別) + '</b><span>' + dayText(r.記録日) + '</span></div>' +
      (withName ? '<p class="cl-rec-who cl-rec-name">利用者: <b>' + esc(r.利用者氏名 || '') + '</b></p>' : '') +
      '<p class="cl-rec-who">書いた人: ' + esc(r.記録担当者) + '</p><p class="cl-rec-body">' + esc(r.メモ) + '</p>' +
      (mine && !withName ? '<div class="cl-rec-ops"><button type="button" class="cl-del" data-del="' + esc(r.記録ID) + '">削除</button></div>' : '') + '</article>';
  }
  // 削除はカードの中で確認（ブラウザの確認ダイアログは LINE の中で止まることがあるので使わない）
  function delRecord(btn) {
    var box = btn.parentNode;
    if (!btn.dataset.sure) {
      btn.dataset.sure = '1'; btn.textContent = 'もう一度押すと削除';
      setTimeout(function () { if (btn.isConnected && !btn.disabled) { delete btn.dataset.sure; btn.textContent = '削除'; } }, 4000);
      return;
    }
    if (btn.disabled) return;
    btn.disabled = true; btn.textContent = '削除中…';
    var old = box.querySelector('.errors'); if (old) old.remove(); // 前の失敗の知らせは消す（失敗のたびに積み重ならないように）
    var reload = keep(loadRecs); // 削除中に画面を離れたら一覧は読み直さない
    api('deleteRecord', { 記録ID: btn.dataset.del }).then(function () {
      toast('記録を削除しました');
      reload();
    }).catch(keep(function (e) {
      btn.disabled = false; delete btn.dataset.sure; btn.textContent = '削除';
      box.insertAdjacentHTML('beforeend', failHtml(e));
    }));
  }

  // ---------- 記録検索の結果（利用者横断） ----------
  function viewRecordResult() {
    app.innerHTML = shell('記録検索結果', '条件に合う記録を新しい順に出しています。', '#users',
      '<div class="cl-card">' + lab('検索条件', 'CONDITIONS') + '<div class="cl-cond">' + condText(cur.rq) + '</div>' +
        '<a class="cl-condedit" href="#users">条件を変える</a></div>' +
      '<div class="cl-outrow">' + lab('記録一覧', 'RECORDS', true, 'h2') + '<span id="cl-n"></span></div>' +
      '<div id="cl-recs" class="cl-list"></div>');
    function run() {
      var el = document.getElementById('cl-recs'); if (!el) return;
      el.innerHTML = skel('記録を読み込み中...', 3, 'rec');
      api('searchRecords', cur.rq).then(keep(function (r) {
        var el = document.getElementById('cl-recs'); if (!el) return;
        document.getElementById('cl-n').innerHTML = '<span class="cl-count">' + r.一覧.length + '件</span>';
        el.innerHTML = r.一覧.length ? recList(r.一覧, true)
          : emptyHtml('条件に合う記録はありません', '日付を広げるか、記録の種類の選択を外して、もう一度探してください。', '<a class="cl-clear" href="#users">条件を変える</a>');
      })).catch(keep(function (e) { showFail(document.getElementById('cl-recs'), e, run); }));
    }
    run();
  }

  // ---------- データ修正・新規登録（どちらも申請） ----------
  function viewEdit() {
    var ed = cur.edit || { 種類: '新規' };
    if (ed.種類 !== '新規' && !needClient()) return;
    // 修正の申請は、いま選んでいる利用者の分だけ（戻る操作などで別の人に変わっていたら操作画面からやり直す）
    if (ed.種類 !== '新規' && String(ed.利用者ID) !== String(cur.id)) { location.replace('#user'); return; }
    var isNew = ed.種類 === '新規';
    var title = isNew ? '利用者の新規登録' : '登録内容を直す';
    app.innerHTML = shell(title, isNew ? '名前・ふりがな・施設は必ず入れてください。ほかは分かる所だけで大丈夫です。申請して承認されると一覧に出ます。'
      : (ed.種類 === '削除' ? 'この方の登録をやめる申請をします。承認されると、状態が「登録なし」になります。' : '直したい所だけ書き換えて、いちばん下の「申請する」を押してください。直した所には「変更」の印が付きます。'),
      isNew ? '#users' : '#user',
      (isNew ? '' : clientCard(cur.card)) + '<div id="cl-edit"></div>');
    fillPhotos();
    if (isNew) return drawEdit(ed, categoriesTemplate());
    function run() {
      var el = document.getElementById('cl-edit'); if (!el) return;
      el.innerHTML = skel('今の登録内容を読み込み中...', 3, 'field');
      api('clientInfo', { 利用者ID: cur.id }).then(keep(function (r) { drawEdit(ed, r.カテゴリ); }))
        .catch(keep(function (e) { showFail(document.getElementById('cl-edit'), e, run); }));
    }
    run();
  }
  function categoriesTemplate() {
    // 項目の一覧は GAS の options（利用者項目）から。見本モードは views/clients-demo.js が I.CLIENT_CATEGORIES を置く
    var cats = (state.options && state.options.利用者項目) || I.CLIENT_CATEGORIES || (cur.info || []).map(function (c) { return [c.名前, c.項目.map(function (f) { return f.項目; })]; });
    return cats.map(function (c) { return { 名前: c[0], 項目: c[1].map(function (k) { return { 項目: k, 値: '' }; }) }; });
  }
  function fieldInput(cat, f, i) {
    var key = cat + '/' + f.項目, id = 'e' + i, v = f.値 || '';
    if (f.項目 === '利用者ID' || f.項目 === '年齢') return '';
    var inner;
    // data-orig には「画面に出した値」を入れる（出せなかった値を空として送り、消してしまわないように）
    function pick(list, dflt) {
      var opts = list.indexOf(v) >= 0 || !v ? list : [v].concat(list);
      v = v || dflt;
      return I.selectHtml(id, opts, v);
    }
    if (f.項目 === 'ステータス') inner = pick(STATUS, '居住中');
    else if (f.項目 === '施設名' && cat === '利用者データ') inner = pick(facilities(), facilities()[0]);
    else if (cat === '生活保護' && f.項目 === '生活保護') inner = pick(['あり', 'なし'], '');
    else if (/(日|年月日)$/.test(f.項目) && !/期間/.test(f.項目) && (!v || /^\d{4}-\d{2}-\d{2}$/.test(v))) inner = '<input type="date" id="' + id + '" value="' + esc(v) + '">';
    else if (f.項目 === '既往歴') inner = '<textarea id="' + id + '" rows="2">' + esc(v) + '</textarea>';
    else inner = '<input id="' + id + '" value="' + esc(v) + '"' + (/ふりがな$/.test(f.項目) ? ' placeholder="例: ヤマダ ハナコ"' : '') + (/電話番号|連絡先|郵便番号/.test(f.項目) ? ' inputmode="tel"' : '') + '>';
    var need = cat === '利用者データ' && /^(氏名|ふりがな|施設名)$/.test(f.項目);
    return '<label class="cl-lab" data-key="' + esc(key) + '" data-orig="' + esc(v) + '" data-id="' + id + '"><span>' + esc(showLabel(cat, f.項目)) +
      (need ? '<span class="req">(必須)</span>' : '') + '</span>' + inner + '</label>';
  }
  function drawEdit(ed, cats) {
    var el = document.getElementById('cl-edit'); if (!el) return;
    if (ed.種類 !== '削除' && !(cats || []).length) { el.innerHTML = failHtml({ message: '入力する項目を読み込めませんでした。画面を開き直してください' }); return; }
    var i = 0, del = ed.種類 === '削除';
    // 新規登録は必須の項目を先に出し、退居日・ご逝去・ステータス（居住中で始まる）は出さない
    if (ed.種類 === '新規') cats = cats.map(function (c) {
      if (c.名前 !== '利用者データ') return c;
      var first = ['氏名', 'ふりがな', '施設名', '部屋番号', '入居日'], skip = ['退居日', 'ご逝去', 'ステータス'];
      var by = {}; c.項目.forEach(function (f) { by[f.項目] = f; });
      return { 名前: c.名前, 項目: first.filter(function (k) { return by[k]; }).map(function (k) { return by[k]; })
        .concat(c.項目.filter(function (f) { return first.indexOf(f.項目) < 0 && skip.indexOf(f.項目) < 0; })) };
    });
    el.innerHTML = '<form id="f" class="cl-form" novalidate>' +
      (del ? '<div class="cl-card cl-warn">' + lab('登録をやめる申請', 'REMOVE') + '<p class="cl-desc">これまでの記録は消えずに残ります。状態が「登録なし」に変わるだけです。承認されるまでは今のままです。</p></div>'
        : cats.map(function (c) {
          return '<details class="cl-card cl-fold"' + (c.名前 === '利用者データ' ? ' open' : '') + '><summary class="cl-label">' + esc(catName(c.名前)) + '</summary>' +
            c.項目.map(function (f) { return fieldInput(c.名前, f, i++); }).join('') + '</details>';
        }).join('')) +
      '<div class="cl-card"><label class="cl-lab">' + (del ? '<span>やめる理由<span class="req">(必須)</span></span>' : '<span>申請の理由・メモ<span class="opt">(任意)</span></span>') +
        '<textarea id="e-why" rows="3" placeholder="' + (del ? '例: 退居して1年たったため' : '例: 部屋の移動があったため') + '"></textarea></label></div>' +
      (ed.種類 === '置換' ? '<p class="cl-chg-n" id="cl-chg-n" aria-live="polite">まだ直した項目はありません</p>' : '') +
      '<div id="err"></div><button type="submit" class="cl-go' + (del ? ' danger' : '') + '">' + (ed.種類 === '新規' ? '新規登録を申請する' : del ? '削除を申請する' : '申請する') + '</button></form>';
    // 置換: 直した項目に印を付け、何項目直したかを送信ボタンの上に出す（直したつもりの項目が漏れていないか確かめやすく）
    if (ed.種類 === '置換') el.querySelector('#f').addEventListener('input', function (e) {
      var lab = e.target.closest('[data-key]'); if (!lab) return;
      lab.classList.toggle('chg', e.target.value.trim() !== lab.dataset.orig);
      var n = el.querySelectorAll('[data-key].chg').length, box = document.getElementById('cl-chg-n');
      box.textContent = n ? n + '項目を直しています' : 'まだ直した項目はありません';
      box.classList.toggle('on', n > 0);
      // 折りたたみの見出しにも、その中で直した数を出す
      el.querySelectorAll('.cl-fold').forEach(function (d) {
        var k = d.querySelectorAll('[data-key].chg').length, s = d.querySelector('summary');
        s.dataset.n = k ? k + '件 変更' : '';
      });
    });
    document.getElementById('f').addEventListener('submit', function (e) {
      e.preventDefault();
      var fields = {}, before = {};
      el.querySelectorAll('[data-key]').forEach(function (lab) {
        var input = document.getElementById(lab.dataset.id), v = input.value.trim();
        // フリガナはカタカナにそろえる（ひらがなで入れてもよい。今ある値には手を付けない）
        if (/ふりがな$/.test(lab.dataset.key) && v !== lab.dataset.orig) { v = toKata(v); input.value = v; } // 直したときだけ
        if (ed.種類 === '新規' ? v : v !== lab.dataset.orig) { fields[lab.dataset.key] = v; before[lab.dataset.key] = lab.dataset.orig; }
      });
      var why = document.getElementById('e-why').value.trim(), errs = [];
      if (ed.種類 === '新規') {
        if (!fields['利用者データ/氏名']) errs.push('名前を入れてください');
        if (!fields['利用者データ/ふりがな']) errs.push('ふりがなを入れてください');
      } else if (ed.種類 === '置換' && !Object.keys(fields).length) errs.push('まだどこも直していません。直したい欄を書き換えてから押してください');
      if (del && !why) errs.push('やめる理由を入れてください');
      var err = document.getElementById('err'), btn = e.target.querySelector('button[type=submit]');
      if (errs.length) { err.innerHTML = I.errorsBox(errs); err.scrollIntoView({ block: 'center' }); return; }
      btn.disabled = true; btn.textContent = '送信中…'; I.busy(true);
      var g = I.gen;
      api('requestClientChange', { 種類: ed.種類, 利用者ID: ed.種類 === '新規' ? '' : cur.id, 項目: fields, 変更前: ed.種類 === '置換' ? before : {}, 理由: why }).then(function () {
        I.busy(false); toast('申請しました。承認されると反映されます。進み具合は「申請状況」で見られます'); if (g === I.gen) location.hash = '#requests';
      }).catch(function (x) {
        I.busy(false); btn.disabled = false; btn.textContent = ed.種類 === '新規' ? '新規登録を申請する' : del ? '削除を申請する' : '申請する';
        err.innerHTML = x.details && x.details.length ? I.errorsBox(x.details) : failHtml(x);
      });
    });
  }

  // ---------- 写真登録 ----------
  function viewPhoto() {
    if (!needClient()) return;
    var picked = null;
    app.innerHTML = shell('写真登録', '本人確認用の顔写真を、撮るか選んで登録します。', '#user',
      clientCard(cur.card) +
      '<div class="cl-card">' + lab('写真', 'PHOTO') +
        '<div class="cl-pick"><span class="cl-photo big" id="ph-prev"><i>まだ選んでいません</i></span>' +
        '<label class="cl-clear cl-file">写真を撮る・選ぶ<input type="file" id="ph-file" accept="image/*"></label></div>' +
        '<p class="cl-desc">写真は縮めてから送ります。ご本人やご家族の同意を得て撮影してください。</p>' +
        '<div id="err"></div><button type="button" class="cl-go" id="ph-send" disabled>登録する</button></div>');
    fillPhotos();
    document.getElementById('ph-file').addEventListener('change', function () {
      var f = this.files && this.files[0]; if (!f) return;
      // 縮めている間に画面を離れたら何もしない（keep）。読めなかったら前に選んだ写真も取り消す
      document.getElementById('err').innerHTML = '';
      shrink(f, 600).then(keep(function (url) {
        picked = url;
        document.getElementById('ph-prev').innerHTML = '<img alt="選んだ写真" src="' + esc(url) + '">';
        document.getElementById('ph-send').disabled = false;
      }), keep(function () {
        picked = null; document.getElementById('ph-send').disabled = true;
        document.getElementById('ph-prev').innerHTML = '<i>まだ選んでいません</i>';
        document.getElementById('err').innerHTML = failHtml({ message: '写真を読み込めませんでした。別の写真を選んでください' });
      }));
    });
    document.getElementById('ph-send').addEventListener('click', function () {
      if (!picked) return;
      var btn = this; btn.disabled = true; I.busy(true);
      var id = cur.id, g = I.gen;
      api('uploadClientPhoto', { 利用者ID: id, 写真: picked }).then(function () {
        I.busy(false); photoCache[id] = picked; toast('写真を登録しました');
        if (cur.id === id && cur.card) { cur.card.写真 = true; save(); }
        if (g === I.gen) location.hash = '#user';
      }).catch(keep(function (x) { I.busy(false); btn.disabled = false; document.getElementById('err').innerHTML = failHtml(x); }));
    });
  }
  // 長い辺を max px にして JPEG にする（通信量と保存容量を抑える）
  function shrink(file, max) {
    return new Promise(function (ok, ng) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url); ok(cv.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = function () { URL.revokeObjectURL(url); ng(); };
      img.src = url;
    });
  }

  I.views.users = viewTop;
  I.views['users-result'] = viewResult;
  I.views.user = viewOps;
  I.views['user-info'] = viewInfo;
  I.views['user-write'] = viewWrite;
  I.views['user-records'] = viewRecords;
  I.views['records-result'] = viewRecordResult;
  I.views['user-edit'] = viewEdit;
  I.views['user-photo'] = viewPhoto;
})();
