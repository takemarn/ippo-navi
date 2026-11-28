/* 利用者管理・記録の画面（第3段階。参考動画 1:48〜4:10）
   流れ: #users（利用者管理: 新規登録・利用者検索・記録検索）→ #users-result（利用者検索結果）→ #user（利用者操作）
         → #user-info（情報閲覧） / #user-records（記録一覧） / #user-write（看護記録・介護記録・施設記録・往診）
         / #user-edit（データ修正・新規登録） / #user-photo（写真登録）。記録検索の結果は #records-result
   選んでいる利用者や検索条件は画面をまたぐので、この中の cur に持ち、sessionStorage にも置く（再読み込みしても続きから）
   GAS: searchClients / clientInfo / clientPhoto / uploadClientPhoto / addRecord / clientRecords / searchRecords / deleteRecord / requestClientChange */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, state = I.state, api = I.api, esc = I.esc, toast = I.toast;

  var STATUS = ['居住中', '入院中', '退居', '登録なし'];
  var RECORD_KINDS = ['ヒヤリハット', '往診', '介護記録', '看護記録', '施設記録', '事故報告'];
  var WRITE_KINDS = ['看護記録', '介護記録', '施設記録', '往診'];

  // ---------- 画面をまたいで持つもの ----------
  var cur = load() || { q: { 施設: [], 氏名: '', ステータス: [] }, rq: { 施設: [], 種別: [], 開始日: '', 終了日: '', 単日: '' }, id: null, card: null, kind: '看護記録', edit: null };
  function save() { try { sessionStorage.setItem('ippo.clients', JSON.stringify(cur)); } catch (_) {} }
  function load() { try { return JSON.parse(sessionStorage.getItem('ippo.clients') || 'null'); } catch (_) { return null; } }
  var photoCache = {};

  // 自分が見られる施設だけ（GAS の me が返す 見られる施設。無ければ選択肢の施設）
  function facilities() { return (state.me && state.me.見られる施設) || (state.options && state.options.施設) || ['モア一津屋']; }

  // ---------- 共通の部品 ----------
  // ページの外枠: 見出し・説明・右上の「戻る」
  function shell(title, sub, back, inner) {
    return '<section class="cl-shell"><div class="cl-head"><h1>' + esc(title) + '</h1>' +
      (back ? '<a class="cl-backpill" href="' + back + '">戻る</a>' : '') + '</div>' +
      (sub ? '<p class="cl-sub">' + esc(sub) + '</p>' : '') + inner + '</section>';
  }
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
  function sec(label, inner, desc) {
    return '<div class="cl-card"><p class="cl-label">' + esc(label) + '</p>' + (desc ? '<p class="cl-desc">' + esc(desc) + '</p>' : '') + inner + '</div>';
  }
  function photoBox(c) {
    if (!c.写真) return '<span class="cl-photo none">画像登録なし</span>';
    var src = photoCache[c.利用者ID];
    return '<span class="cl-photo" data-photo="' + esc(c.利用者ID) + '">' + (src ? '<img alt="" src="' + esc(src) + '">' : '<i>読み込み中・・・</i>') + '</span>';
  }
  // 写真は一覧を先に出してから、同時に3人までずつ読む（一度にたくさん頼むとサーバーが詰まるため）。読めなかったら「画像登録なし」
  var photoQueue = [], photoBusy = 0;
  function fillPhotos() {
    // 前の画面の読み残しは捨てる（いまの画面の写真を先に読む）
    photoQueue = photoQueue.filter(function (id) { return document.querySelector('[data-photo="' + id + '"]'); });
    document.querySelectorAll('[data-photo]').forEach(function (el) {
      var id = el.dataset.photo;
      if (!photoCache[id] && photoQueue.indexOf(id) < 0) photoQueue.push(id);
    });
    pumpPhotos();
  }
  function pumpPhotos() {
    while (photoBusy < 3 && photoQueue.length) loadPhoto(photoQueue.shift());
  }
  function loadPhoto(id) {
    photoBusy++;
    function paint(html) { document.querySelectorAll('[data-photo="' + id + '"]').forEach(function (x) { x.innerHTML = html; if (!/img/.test(html)) x.classList.add('none'); }); }
    api('clientPhoto', { 利用者ID: id }).then(function (r) {
      if (!r.写真) return paint('画像登録なし');
      photoCache[id] = r.写真;
      paint('<img alt="" src="' + esc(r.写真) + '">');
    }).catch(function () { paint('読込失敗'); })
      .then(function () { photoBusy--; pumpPhotos(); });
  }
  function clientCard(c, asLink) {
    var body = '<div class="cl-cc-text"><p class="cl-cc-name"><span class="cl-id">' + esc(c.利用者ID) + '</span><b>' + esc(c.氏名) + '</b></p>' +
      '<p>' + esc(c.ふりがな) + '</p><p>' + esc(c.施設名) + (c.部屋番号 ? ' ' + esc(c.部屋番号) : '') + '</p><p>' + esc(c.ステータス) + '</p>' +
      ((c.タグ || []).length ? '<p class="cl-tags">' + c.タグ.map(function (t) { return '<span class="cl-tag">' + esc(t) + '</span>'; }).join('') + '</p>' : '') +
      '</div>' + photoBox(c);
    return asLink
      ? '<button type="button" class="cl-cc cl-cc-link" data-client="' + esc(c.利用者ID) + '" aria-label="' + esc(c.氏名) + 'さんの操作へ">' + body + '</button>'
      : '<div class="cl-cc">' + body + '</div>';
  }
  function needClient() {
    if (cur.id && cur.card) return true;
    location.hash = '#users';
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
    app.innerHTML = shell('利用者管理', '条件を組み合わせて利用者を検索し、情報閲覧や記録入力へ進みます。', null,
      '<div class="cl-card"><p class="cl-label">新規登録</p><p class="cl-desc">利用者マスタの項目を新規登録申請します。</p>' +
        '<button type="button" class="cl-go" id="cl-new">新規登録</button></div>' +
      sec('施設を選択', chips('fac', facilities(), cur.q.施設, true, '施設を選択')) +
      sec('氏名から検索', '<input id="cl-name" class="cl-input" aria-label="氏名から検索" placeholder="名前 / ふりがなで検索" value="' + esc(cur.q.氏名) + '" autocomplete="off">') +
      sec('ステータスを選択', chips('st', STATUS, cur.q.ステータス, true, 'ステータスを選択')) +
      '<button type="button" class="cl-go" id="cl-search">この条件で利用者を検索</button>' +
      '<p class="cl-label cl-out">記録検索</p><p class="cl-desc cl-out">条件を組み合わせて、利用者横断で記録を検索します。</p>' +
      sec('施設を選択', chips('rfac', facilities(), cur.rq.施設, true, '記録検索の施設を選択')) +
      sec('記録種別を選択', chips('rkind', RECORD_KINDS, cur.rq.種別, true, '記録種別を選択')) +
      sec('期間・単日指定', dateRange(cur.rq)) +
      '<div id="cl-err"></div>' +
      '<button type="button" class="cl-go" id="cl-rsearch">この条件で記録を検索</button>') +
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
    document.getElementById('cl-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') document.getElementById('cl-search').click(); });
  }
  function dateRange(q) {
    return '<div class="cl-dates"><label>開始日<input type="date" id="cl-from" class="cl-input" value="' + esc(q.開始日 || '') + '"></label>' +
      '<label>終了日<input type="date" id="cl-to" class="cl-input" value="' + esc(q.終了日 || '') + '"></label>' +
      '<label>単日指定<input type="date" id="cl-day" class="cl-input" value="' + esc(q.単日 || '') + '"></label></div>';
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
    return q.種別 !== undefined
      ? '<p>施設: ' + esc(v(q.施設)) + '</p><p>記録種別: ' + esc(v(q.種別)) + '</p><p>期間: ' + esc(when) + '</p>'
      : '<p>施設: ' + esc(v(q.施設)) + '</p><p>氏名: ' + esc(v(q.氏名)) + '</p><p>ステータス: ' + esc(v(q.ステータス)) + '</p>';
  }

  // ---------- 利用者検索結果 ----------
  function viewResult() {
    app.innerHTML = shell('利用者検索結果', '指定した条件に合致する利用者を表示しています。', '#users',
      '<div class="cl-card"><p class="cl-label">検索条件</p><div class="cl-cond">' + condText(cur.q) + '</div></div>' +
      '<p class="cl-label cl-out">検索結果</p><p class="cl-desc cl-out">利用者カードを選ぶと次の操作画面へ進みます。</p>' +
      '<div id="cl-list" class="cl-list">' + loading('利用者を読み込み中...') + '</div>');
    trackClicks(function (e) {
      var b = e.target.closest('[data-client]');
      if (!b) return;
      cur.id = b.dataset.client; cur.card = (cur.list || []).filter(function (c) { return c.利用者ID === cur.id; })[0]; save();
      location.hash = '#user';
    });
    api('searchClients', cur.q).then(function (r) {
      var el = document.getElementById('cl-list'); if (!el) return;
      cur.list = r.一覧; save();
      el.innerHTML = r.一覧.length ? r.一覧.map(function (c) { return clientCard(c, true); }).join('') :
        '<div class="cl-empty">条件に合う利用者はいません。条件を減らしてもう一度検索してください。</div>';
      el.insertAdjacentHTML('afterbegin', '<p class="cl-count">' + r.一覧.length + '名</p>');
      fillPhotos();
    }).catch(function (e) { var el = document.getElementById('cl-list'); if (el) el.innerHTML = failHtml(e); });
  }

  // ---------- 利用者操作 ----------
  function viewOps() {
    if (!needClient()) return;
    var ops = [
      ['OVERVIEW', '情報閲覧', 'カテゴリごとに利用者情報を確認します。', '#user-info'],
      ['RECORDS', '過去の記録閲覧', 'この利用者の過去の記録を一覧で確認します。', '#user-records']
    ].concat(WRITE_KINDS.map(function (k) { return ['RECORD', k, 'この利用者に対する' + k + 'を入力します。', '#user-write', k]; }));
    app.innerHTML = shell('利用者操作', '必要な操作を選択して、閲覧・入力・出力へ進みます。', '#users-result',
      clientCard(cur.card) +
      '<p class="cl-label cl-out">主操作</p><p class="cl-desc cl-out">閲覧や記録入力など、利用者に対する主要な操作です。</p>' +
      '<div class="cl-ops">' + ops.map(function (o) {
        return '<a class="cl-op" href="' + o[3] + '"' + (o[4] ? ' data-kind="' + esc(o[4]) + '"' : '') + '><small>' + o[0] + '</small><b>' + esc(o[1]) + '</b><span>' + esc(o[2]) + '</span></a>';
      }).join('') + '</div>' +
      '<p class="cl-label cl-out">補助操作</p>' +
      '<div class="cl-subops"><button type="button" class="cl-chip" data-sub="edit">データ修正</button>' +
      '<button type="button" class="cl-chip" data-sub="photo">写真登録</button>' +
      '<button type="button" class="cl-chip" data-sub="sheet">フェイスシート出力</button></div>');
    fillPhotos();
    trackClicks(function (e) {
      var k = e.target.closest('[data-kind]');
      if (k) { cur.kind = k.dataset.kind; save(); overlay('記録画面を準備中・・・'); }
      var s = e.target.closest('[data-sub]');
      if (!s) return;
      if (s.dataset.sub === 'edit') askEditKind();
      if (s.dataset.sub === 'photo') location.hash = '#user-photo';
      if (s.dataset.sub === 'sheet') toast('フェイスシート出力は準備中です');
    });
  }

  // データ修正の前に「置換」か「削除」かを選ぶ（参考アプリは文字で入力させるが、押し間違えないようボタンにした）
  function askEditKind() {
    var wrap = document.createElement('div');
    wrap.className = 'cl-modal-wrap'; wrap.id = 'cl-modal';
    wrap.innerHTML = '<div class="cl-modal" role="dialog" aria-modal="true" aria-labelledby="cl-modal-h"><h2 id="cl-modal-h">データ修正</h2>' +
      '<p>書き換えは「置換」、利用者の登録をやめるときは「削除」を選んでください。どちらも申請になり、承認されると反映されます。</p>' +
      '<div class="cl-modal-btns"><button type="button" data-k="置換">内容を直す（置換）</button><button type="button" class="danger" data-k="削除">登録をやめる（削除）</button>' +
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
    app.innerHTML = shell('情報閲覧', 'カテゴリを切り替えて、利用者情報を見やすく確認できます。', '#user',
      clientCard(cur.card) + '<div id="cl-info">' + loading() + '</div>');
    fillPhotos();
    api('clientInfo', { 利用者ID: cur.id }).then(function (r) {
      cur.info = r.カテゴリ; save();
      drawInfo();
    }).catch(function (e) { var el = document.getElementById('cl-info'); if (el) el.innerHTML = failHtml(e); });
    trackClicks(function (e) {
      var b = e.target.closest('[data-tab]');
      if (b) { infoTab = b.dataset.tab; drawInfo(); }
    });
  }
  function drawInfo() {
    var el = document.getElementById('cl-info'); if (!el) return;
    var cats = cur.info || [], c = cats.filter(function (x) { return x.名前 === infoTab; })[0] || cats[0];
    if (!c) { el.innerHTML = ''; return; }
    infoTab = c.名前;
    el.innerHTML = '<div class="cl-card"><p class="cl-label">表示カテゴリ</p><div class="cl-chips" role="group" aria-label="表示カテゴリ">' + cats.map(function (x) {
      var on = x.名前 === c.名前;
      return '<button type="button" class="cl-chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-tab="' + esc(x.名前) + '">' + esc(x.名前) + '</button>';
    }).join('') + '</div></div>' +
    '<p class="cl-label cl-out">' + esc(c.名前) + '</p>' +
    '<div class="cl-fields">' + c.項目.map(function (f) {
      var v = f.値, html;
      if (!v) html = '—';
      else if (/電話番号|連絡先/.test(f.項目) && /^[0-9+\-() ]{6,}$/.test(v)) html = '<a href="tel:' + esc(v.replace(/[^0-9+]/g, '')) + '">' + esc(v) + '</a>';
      else html = esc(v);
      return '<div class="cl-field"><small>' + esc(showLabel(c.名前, f.項目)) + '</small><p>' + html + '</p></div>';
    }).join('') + '</div>';
  }

  function toKata(t) { return String(t || '').replace(/[\u3041-\u3096]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) + 0x60); }); }

  // 画面に出す項目名（参考アプリの表示に合わせる。シートの列名・送る名前は 氏名・ふりがな のまま）
  function showLabel(cat, k) { return cat === '利用者データ' ? ({ 氏名: '名前', ふりがな: 'フリガナ' }[k] || k) : k; }

  // ---------- 記録入力（看護記録・介護記録・施設記録・往診。4つとも同じ形） ----------
  function viewWrite() {
    if (!needClient()) return;
    var kind = WRITE_KINDS.indexOf(cur.kind) >= 0 ? cur.kind : '看護記録';
    app.innerHTML = shell(kind, '必要事項を入力して登録します。担当者名は必要に応じて修正できます。', '#user',
      clientCard(cur.card) +
      '<form id="f" class="cl-form" novalidate><div class="cl-card"><p class="cl-label">入力内容</p>' +
        '<label>記録日<input type="date" id="w-day" class="cl-input" value="' + I.today() + '" required></label>' +
        '<label>記録担当者<input id="w-who" class="cl-input" value="' + esc(state.me && state.me.氏名) + '" required></label>' +
        '<label>メモ<textarea id="w-memo" class="cl-input" rows="7" placeholder="自由に入力してください" required></textarea></label>' +
      '</div><div id="err"></div>' +
      '<button type="submit" class="cl-go">登録する</button>' +
      '</form>');
    fillPhotos();
    document.getElementById('f').addEventListener('submit', function (e) {
      e.preventDefault();
      var data = { 利用者ID: cur.id, 種別: kind, 記録日: document.getElementById('w-day').value, 記録担当者: document.getElementById('w-who').value.trim(), メモ: document.getElementById('w-memo').value };
      var errs = [];
      if (!data.記録日) errs.push('記録日を入れてください');
      if (!data.記録担当者) errs.push('記録担当者を入れてください');
      if (!data.メモ.trim()) errs.push('メモを入れてください');
      var err = document.getElementById('err'), btn = e.target.querySelector('button[type=submit]');
      if (errs.length) { err.innerHTML = I.errorsBox(errs); return; }
      err.innerHTML = ''; btn.disabled = true; btn.textContent = '登録中…'; overlay('読み込み中・・・');
      api('addRecord', data).then(function () {
        I.busy(false); toast(kind + 'を登録しました'); location.hash = '#user'; // 参考アプリと同じく利用者操作へ戻る
      }).catch(function (x) {
        I.busy(false); btn.disabled = false; btn.textContent = '登録する';
        err.innerHTML = x.details && x.details.length ? I.errorsBox(x.details) : failHtml(x);
      });
    });
  }

  // ---------- 記録一覧（この利用者の過去の記録） ----------
  function emptyRecQ() { return { 開始日: '', 終了日: '', 単日: '', 文字: '' }; }
  var recQ = emptyRecQ(), recQFor = null;
  function viewRecords() {
    if (!needClient()) return;
    if (recQFor !== cur.id) { recQ = emptyRecQ(); recQFor = cur.id; } // 絞り込みは利用者ごと
    app.innerHTML = shell('記録一覧', '日付やキーワードで絞り込み、利用者の記録を確認します。', '#user',
      clientCard(cur.card) +
      '<details class="cl-card cl-fold"' + (recQ.開始日 || recQ.終了日 || recQ.単日 || recQ.文字 ? ' open' : '') + '><summary class="cl-label">絞り込み（日付・キーワード）</summary>' + dateRange(recQ) +
        '<label class="cl-lab">部分テキスト検索<input id="cl-text" class="cl-input" placeholder="記録種別・担当者・メモを検索" value="' + esc(recQ.文字) + '"></label>' +
        '<div id="cl-err"></div>' +
        '<button type="button" class="cl-go" id="cl-find">検索</button><button type="button" class="cl-clear" id="cl-clear">条件をクリア</button></details>' +
      '<p class="cl-label cl-out">記録一覧</p><div id="cl-recs" class="cl-list">' + loading('記録を読み込み中...') + '</div>');
    fillPhotos();
    trackClicks(function (e) {
      if (e.target.closest('#cl-find')) {
        var q = Object.assign(readRange(), { 文字: document.getElementById('cl-text').value.trim() }), m = rangeError(q);
        document.getElementById('cl-err').innerHTML = m ? I.errorsBox([m]) : '';
        if (!m) { recQ = q; loadRecs(); }
      }
      if (e.target.closest('#cl-clear')) {
        recQ = emptyRecQ();
        ['cl-from', 'cl-to', 'cl-day', 'cl-text'].forEach(function (id) { var x = document.getElementById(id); if (x) x.value = ''; });
        document.getElementById('cl-err').innerHTML = '';
        loadRecs();
      }
      var d = e.target.closest('[data-del]');
      if (d) delRecord(d);
    });
    loadRecs();
  }
  function loadRecs() {
    var el = document.getElementById('cl-recs');
    el.innerHTML = loading('記録を読み込み中...');
    overlay('記録を読み込み中・・・'); // 参考アプリと同じく、読み込むあいだは画面全体をぼかす
    api('clientRecords', Object.assign({ 利用者ID: cur.id }, recQ)).then(function (r) {
      I.busy(false);
      if (!document.getElementById('cl-recs')) return;
      var filtered = recQ.開始日 || recQ.終了日 || recQ.単日 || recQ.文字;
      el.innerHTML = r.一覧.length ? '<p class="cl-count">' + r.一覧.length + '件（削除できるのは自分が書いた記録だけ）</p>' + r.一覧.map(function (x) { return recCard(x, false); }).join('')
        : '<div class="cl-empty">' + (filtered ? '条件に合う記録はありません。条件を変えてもう一度検索してください。' : '記録はありません。') + '</div>';
    }).catch(function (e) { I.busy(false); el.innerHTML = failHtml(e); });
  }
  function recCard(r, withName) {
    var mine = state.me && (r.記録者職員ID === state.me.職員ID || state.me.役割 === '管理者');
    return '<article class="cl-rec" data-rec="' + esc(r.記録ID) + '"><div class="cl-rec-h"><b>' + esc(r.種別) + '</b><span>' + esc(r.記録日) + '</span></div>' +
      (withName ? '<p class="cl-rec-who">利用者: ' + esc(r.利用者氏名 || '') + '</p>' : '') +
      '<p class="cl-rec-who">記録担当者: ' + esc(r.記録担当者) + '</p><p class="cl-rec-body">' + esc(r.メモ) + '</p>' +
      (mine && !withName ? '<div class="cl-rec-ops"><button type="button" class="cl-del" data-del="' + esc(r.記録ID) + '">削除</button></div>' : '') + '</article>';
  }
  // 削除はカードの中で確認（ブラウザの確認ダイアログは LINE の中で止まることがあるので使わない）
  function delRecord(btn) {
    var box = btn.parentNode;
    if (!btn.dataset.sure) {
      btn.dataset.sure = '1'; btn.textContent = 'もう一度押すと削除';
      setTimeout(function () { if (btn.isConnected) { delete btn.dataset.sure; btn.textContent = '削除'; } }, 4000);
      return;
    }
    btn.disabled = true;
    api('deleteRecord', { 記録ID: btn.dataset.del }).then(function () {
      toast('記録を削除しました'); loadRecs();
    }).catch(function (e) { btn.disabled = false; box.insertAdjacentHTML('beforeend', failHtml(e)); });
  }

  // ---------- 記録検索の結果（利用者横断） ----------
  function viewRecordResult() {
    app.innerHTML = shell('記録検索結果', '条件に合う記録を新しい順に表示しています。', '#users',
      '<div class="cl-card"><p class="cl-label">検索条件</p><div class="cl-cond">' + condText(cur.rq) + '</div></div>' +
      '<p class="cl-label cl-out">記録一覧</p><div id="cl-recs" class="cl-list">' + loading('記録を読み込み中...') + '</div>');
    api('searchRecords', cur.rq).then(function (r) {
      var el = document.getElementById('cl-recs'); if (!el) return;
      el.innerHTML = '<p class="cl-count">' + r.一覧.length + '件</p>' + (r.一覧.length ? r.一覧.map(function (x) { return recCard(x, true); }).join('') : '<div class="cl-empty">条件に合う記録はありません。</div>');
    }).catch(function (e) { var el = document.getElementById('cl-recs'); if (el) el.innerHTML = failHtml(e); });
  }

  // ---------- データ修正・新規登録（どちらも申請） ----------
  function viewEdit() {
    var ed = cur.edit || { 種類: '新規' };
    if (ed.種類 !== '新規' && !needClient()) return;
    // 修正の申請は、いま選んでいる利用者の分だけ（戻る操作などで別の人に変わっていたら操作画面からやり直す）
    if (ed.種類 !== '新規' && String(ed.利用者ID) !== String(cur.id)) { location.hash = '#user'; return; }
    var isNew = ed.種類 === '新規';
    var title = isNew ? '利用者の新規登録' : '利用者データ修正';
    app.innerHTML = shell(title, isNew ? '利用者マスタの項目を新規登録申請します。承認されると利用者一覧に出ます。'
      : (ed.種類 === '削除' ? '利用者の登録をやめる申請をします（ステータスが「登録なし」になります）。' : '利用者マスタの項目を申請・修正します。直した項目だけが申請されます。'),
      isNew ? '#users' : '#user',
      (isNew ? '' : clientCard(cur.card)) + '<div id="cl-edit">' + (isNew ? '' : loading()) + '</div>');
    fillPhotos();
    if (isNew) return drawEdit(ed, categoriesTemplate());
    api('clientInfo', { 利用者ID: cur.id }).then(function (r) { drawEdit(ed, r.カテゴリ); })
      .catch(function (e) { var el = document.getElementById('cl-edit'); if (el) el.innerHTML = failHtml(e); });
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
      (del ? '<div class="cl-card"><p class="cl-label">削除の申請</p><p class="cl-desc">記録は消えずに残ります。利用者のステータスだけ「登録なし」になります。</p></div>'
        : cats.map(function (c) {
          return '<details class="cl-card cl-fold"' + (c.名前 === '利用者データ' ? ' open' : '') + '><summary class="cl-label">' + esc(c.名前 === '利用者データ' ? '基本情報' : c.名前) + '</summary>' +
            c.項目.map(function (f) { return fieldInput(c.名前, f, i++); }).join('') + '</details>';
        }).join('')) +
      '<div class="cl-card"><label class="cl-lab">' + (del ? '<span>削除の理由<span class="req">(必須)</span></span>' : '<span>申請の理由・メモ<span class="opt">(任意)</span></span>') +
        '<textarea id="e-why" rows="3" placeholder="' + (del ? '例: 退居して1年たったため' : '例: 部屋の移動があったため') + '"></textarea></label></div>' +
      '<div id="err"></div><button type="submit" class="cl-go">' + (ed.種類 === '新規' ? '新規登録を申請する' : '申請する') + '</button></form>';
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
        if (!fields['利用者データ/氏名']) errs.push('氏名を入れてください');
        if (!fields['利用者データ/ふりがな']) errs.push('ふりがなを入れてください');
      } else if (ed.種類 === '置換' && !Object.keys(fields).length) errs.push('直した項目がありません');
      if (del && !why) errs.push('削除の理由を入れてください');
      var err = document.getElementById('err'), btn = e.target.querySelector('button[type=submit]');
      if (errs.length) { err.innerHTML = I.errorsBox(errs); err.scrollIntoView({ block: 'center' }); return; }
      btn.disabled = true; btn.textContent = '送信中…'; I.busy(true);
      api('requestClientChange', { 種類: ed.種類, 利用者ID: ed.種類 === '新規' ? '' : cur.id, 項目: fields, 変更前: ed.種類 === '置換' ? before : {}, 理由: why }).then(function () {
        I.busy(false); toast('申請しました。承認されると反映されます'); location.hash = '#requests';
      }).catch(function (x) {
        I.busy(false); btn.disabled = false; btn.textContent = ed.種類 === '新規' ? '新規登録を申請する' : '申請する';
        err.innerHTML = x.details && x.details.length ? I.errorsBox(x.details) : failHtml(x);
      });
    });
  }

  // ---------- 写真登録 ----------
  function viewPhoto() {
    if (!needClient()) return;
    var picked = null;
    app.innerHTML = shell('写真登録', '顔写真を撮るか選んで登録します。本人確認のための写真です。', '#user',
      clientCard(cur.card) +
      '<div class="cl-card"><p class="cl-label">写真</p>' +
        '<div class="cl-pick"><span class="cl-photo big" id="ph-prev"><i>まだ選んでいません</i></span>' +
        '<label class="cl-clear cl-file">写真を撮る・選ぶ<input type="file" id="ph-file" accept="image/*"></label></div>' +
        '<p class="cl-desc">写真は縮めてから送ります。ご本人やご家族の同意を得て撮影してください。</p>' +
        '<div id="err"></div><button type="button" class="cl-go" id="ph-send" disabled>登録する</button></div>');
    fillPhotos();
    document.getElementById('ph-file').addEventListener('change', function () {
      var f = this.files && this.files[0]; if (!f) return;
      shrink(f, 600).then(function (url) {
        picked = url;
        document.getElementById('ph-prev').innerHTML = '<img alt="選んだ写真" src="' + url + '">';
        document.getElementById('ph-send').disabled = false;
      }).catch(function () { document.getElementById('err').innerHTML = failHtml({ message: '写真を読み込めませんでした。別の写真を選んでください' }); });
    });
    document.getElementById('ph-send').addEventListener('click', function () {
      if (!picked) return;
      var btn = this; btn.disabled = true; I.busy(true);
      api('uploadClientPhoto', { 利用者ID: cur.id, 写真: picked }).then(function () {
        I.busy(false); photoCache[cur.id] = picked; cur.card.写真 = true; save(); toast('写真を登録しました'); location.hash = '#user';
      }).catch(function (x) { I.busy(false); btn.disabled = false; document.getElementById('err').innerHTML = failHtml(x); });
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
