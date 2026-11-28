/* 相談AI（社内ポータル）の画面（第4段階）。参考動画 5:04〜
   #portal      … 相談AIのメニュー（規程・組織図・福利厚生／駐車場ナビ／看護マニュアル／AI相談／日報／経営資料）＋承認待ち一覧。
                   views/menu.js の #portal（全部「準備中」）をここで上書きする
   #rules       … 社内ポータルの入口: 理念 → 就業規則・各規程を見る／組織図を見る → 福利厚生（社内紹介など）
   #rules-list  … 規程の一覧（題・施行日・対象の札）
   #rule-read   … 閲覧前のご確認（取り扱いの注意＋氏名＋確認チェック）→ 本文（目次・名前と日時の透かし）
   #org         … 組織図「あなたはどこ？」（職種ごとの上長・相談先）と「困ったときは、ここへ」
   GAS とのやりとり: portal / openRule / orgChart（kiroku-app の docs/api.md「相談AI」） */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, api = I.api, esc = I.esc;

  function loading(text) { return '<div class="loading" role="status">' + esc(text || '読み込み中...') + '</div>'; }
  // retry: true なら「再読み込み」ボタンを付ける（いまの画面を開き直す）
  function failBox(e, retry) {
    // core.js の showError と同じ形（白いカード＋理由＋再読み込み）
    if (!retry) return '<div class="errors" role="alert">' + esc(e && e.message || 'エラーが起きました') + '</div>'; // フォームの中のエラー
    return '<div class="card fail" role="alert"><h2>画面を開けませんでした</h2>' +
      '<p class="fail-msg">' + esc(e && e.message || 'エラーが起きました') + '</p>' +
      '<button type="button" onclick="IPPO.route()">再読み込み</button></div>';
  }
  // 返事が来たときに、まだ同じ画面を見ているか（途中でほかの画面へ移ったら描かない）
  // ハッシュだけでなく core.js の画面の番号（I.gen）も見る。いったん離れて同じ画面に戻ったときに、前に開いたときの遅い返事で描き直さないため
  function alive() { var h = location.hash, g = I.gen; return function () { return location.hash === h && I.gen === g; }; }
  // 規程やガイドをどこから開いたか（AI相談から開いたら「AI相談に戻る」を出す）
  function setPortalFrom(h) { try { sessionStorage.setItem('ippo.portalFrom', h); } catch (_) {} I._portalFrom = h; }
  function portalFrom() {
    if (I._portalFrom) return I._portalFrom;
    try { return sessionStorage.getItem('ippo.portalFrom'); } catch (_) { return null; }
  }
  I.setPortalFrom = setPortalFrom; I.portalFrom = portalFrom;
  function safeUrl(u) { return /^https:\/\//.test(String(u || '')) ? String(u) : ''; }
  function safeColor(c) { return /^#[0-9a-fA-F]{3,8}$/.test(String(c || '')) ? c : '#12317d'; }
  function ymdJa(s) {
    s = String(s || '');
    if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return esc(s);
    return +s.slice(0, 4) + '年' + +s.slice(5, 7) + '月' + +s.slice(8, 10) + '日';
  }
  // 上に置く小さな戻るリンク（参考アプリの「← 福利厚生にもどる」「← 規程の選び直し」と同じ位置）
  function topBack(href, label) { return '<a class="ptl-topback" href="' + href + '"><span aria-hidden="true">‹</span> ' + esc(label) + '</a>'; }

  // 線画の絵（ホームの「よく使う」と同じ 24×24・線の太さ 1.8 の描き方）。絵文字は端末で絵柄がちがい、
  // ほかの画面の線画・立体風の絵から浮くので、相談AIの中ではこれを使う。色は currentColor（CSS の color）
  var ICON = {
    book: '<path d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5z"/><path d="M4 20.5A2.5 2.5 0 016.5 18H20v3H6.5A2.5 2.5 0 014 20.5zM8 7.5h8M8 11h5"/>',
    books: '<path d="M2.5 5.5C5 4 8.5 4 12 6c3.5-2 7-2 9.5-.5V19c-2.5-1.5-6-1.5-9.5.5-3.5-2-7-2-9.5-.5z"/><path d="M12 6v13.5M5.5 9c1.5-.4 2.8-.3 4 .3M14.5 9.3c1.2-.6 2.5-.7 4-.3"/>',
    building: '<path d="M4 21V5a1 1 0 011-1h9a1 1 0 011 1v16M15 10h4a1 1 0 011 1v10M2.5 21h19"/><path d="M8 8h3M8 12h3M8 16h3M17.5 14v.01M17.5 17v.01"/>',
    fall: '<circle cx="6.5" cy="6" r="2"/><path d="M8.5 8.8l5 3.4 4.5-1.2M10.8 10.4L9.3 15 5 16.5M13.5 12.2l1.7 4.6"/><path d="M3 20.5h18"/>',
    note: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    pill: '<path d="M10.5 20.5a4.95 4.95 0 01-7-7l6-6a4.95 4.95 0 017 7z"/><path d="M7.5 10.5l6 6"/>',
    home: '<path d="M3 11l9-7 9 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
    bath: '<path d="M3 12h18v2.5a5.5 5.5 0 01-5.5 5.5h-7A5.5 5.5 0 013 14.5z"/><path d="M6 12V6.5a2.5 2.5 0 015 0M7 20l-1 1.5M17 20l1 1.5"/>',
    thermo: '<path d="M14 14.8V5a2 2 0 00-4 0v9.8a4 4 0 104 0z"/><path d="M12 9.5V17"/>',
    bandage: '<rect x="1.8" y="8.2" width="20.4" height="7.6" rx="3.8" transform="rotate(-45 12 12)"/><path d="M10 10.5v.01M13.5 10v.01M10.5 13.8v.01M14 13.5v.01"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    phone: '<path d="M21 16.4v3a2 2 0 01-2.2 2 19.5 19.5 0 01-8.5-3 19.2 19.2 0 01-6-6A19.5 19.5 0 011.3 3.8 2 2 0 013.3 1.6h3a2 2 0 012 1.7c.1.9.4 1.9.7 2.8a2 2 0 01-.4 2.1L7.3 9.5a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.8.7a2 2 0 011.5 1.9z"/>',
    ambulance: '<path d="M2.5 17V7.5a1 1 0 011-1h10.5V17M14 10h4l3.5 4v3H14"/><circle cx="7" cy="17.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/><path d="M8 9v4.5M5.8 11.2h4.4"/>',
    steth: '<path d="M5 3H4v5a5 5 0 0010 0V3h-1"/><path d="M9 13v1.5a5.5 5.5 0 0011 0V13"/><circle cx="20" cy="11" r="2"/>',
    sprout: '<path d="M12 21v-9"/><path d="M12 12C12 8 9.5 5.5 5 5.5c0 4.5 2.5 6.5 7 6.5zM12 14.5c0-4 2.5-6.5 7-6.5 0 4.5-2.5 6.5-7 6.5z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    warn: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2v.1"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    car: '<path d="M5 16.5V12l1.8-4.6A2 2 0 018.7 6h6.6a2 2 0 011.9 1.4L19 12v4.5"/><path d="M3.5 12h17v4.5h-17zM6.5 16.5V19M17.5 16.5V19M7 14.2h.01M17 14.2h.01"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    reload: '<path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/>'
  };
  function ic(name, cls) {
    return '<svg class="ptl-ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICON[name] || ICON.book) + '</svg>';
  }

  // ---------- 相談AIのメニュー ----------
  I.views.portal = function () {
    I.subMenu([
      { label: '就業規則・組織図・福利厚生', href: '#rules' },
      { label: '駐車場ナビ', href: '#parking' },
      { label: '看護マニュアル', href: '#manual' },
      { label: 'AIに聞く', href: '#ai' },
      { label: '日報' },
      { label: '経営資料' }
    ]);
    // 夜勤中の介護職でも迷わないよう、急変のページへの近道をいちばん上に置く（看護マニュアルの中と同じ行き先）
    var h1 = app.querySelector('.mh') || app.querySelector('h1'); // 見出し（絵＋名前）の下
    if (h1) h1.insertAdjacentHTML('afterend', '<a class="mnl-urgent ptl-urgent-top" href="#manual-urgent"><span class="mnl-urgent-ic" aria-hidden="true">!</span>' +
      '<span><b>様子がおかしい・急変</b><small>119番・当番の看護師（オンコール）への電話 → すぐ見る</small></span></a>');
    app.querySelector('.ptl-urgent-top').addEventListener('click', function () { setPortalFrom('#portal'); });
  };

  // ---------- 社内ポータルの入口 ----------
  var portalCache = null;
  function loadPortal() {
    if (portalCache) return Promise.resolve(portalCache);
    return api('portal').then(function (d) { portalCache = d; return d; });
  }

  function viewRules() {
    setPortalFrom('#rules'); // ここから組織図・規程を開いたときは、AIに聞く画面ではなく ここへ戻す
    app.innerHTML = '<h1>就業規則・組織図・福利厚生</h1><div id="ptl" class="ptl-stack">' + loading() + '</div>' + I.backHtml();
    var ok = alive();
    loadPortal().then(function (d) {
      var box = document.getElementById('ptl');
      if (!box || !ok()) return;
      var p = d.理念;
      box.innerHTML =
        (p && p.本文 ? '<section class="ptl-hero" aria-label="理念">' +
          '<p class="ptl-hero-k">IPPO の理念</p>' +
          '<p class="ptl-hero-t">' + esc(p.本文).replace(/\n/g, '<br>') + '</p>' +
          (p.問い ? '<p class="ptl-hero-q">' + esc(p.問い) + '</p>' : '') +
        '</section>' : '') +
        '<a class="ptl-big navy" href="#rules-list"><span class="ptl-big-ic" aria-hidden="true">' + ic('books') + '</span>' +
          '<span><b>就業規則・各規程を見る</b><small>お名前の確認あり（会社の機密情報）</small></span><span class="ptl-chev" aria-hidden="true">›</span></a>' +
        '<a class="ptl-big green" href="#org"><span class="ptl-big-ic" aria-hidden="true">' + ic('building') + '</span>' +
          '<span><b>組織図を見る</b><small>会社の体制と相談先</small></span><span class="ptl-chev" aria-hidden="true">›</span></a>' +
        (d.福利厚生 || []).map(function (b, i) {
          return (i === 0 ? '<h2 class="ptl-sec">福利厚生・制度</h2>' : '') +
            '<section class="ptl-benefit' + (i === 0 ? ' hot' : '') + '">' +
              '<b>' + esc(b.題) + '</b><p>' + esc(b.本文) + '</p>' +
              (b.札 && b.札.length ? '<div class="ptl-tags">' + b.札.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
              (b.担当 ? '<small>問い合わせ: ' + esc(b.担当) + '</small>' : '') +
            '</section>';
        }).join('');
    }).catch(function (e) { var box = document.getElementById('ptl'); if (box && ok()) box.innerHTML = failBox(e, true); });
  }

  // ---------- 規程の一覧 ----------
  function ruleIcon(r) {
    return '<svg class="ptl-book" viewBox="0 0 24 28" aria-hidden="true" style="color:' + safeColor(r.色) + '">' +
      '<path d="M3 3.5A2.5 2.5 0 015.5 1H21v22H5.5A2.5 2.5 0 003 25.5z" fill="currentColor"/><path d="M3 25.5A2.5 2.5 0 015.5 23H21v4H5.5A2.5 2.5 0 013 24.5" fill="#fff" stroke="currentColor" stroke-width="1.2"/></svg>';
  }
  function viewRulesList() {
    app.innerHTML = topBack('#rules', '就業規則・組織図・福利厚生にもどる') + '<h1 class="ptl-h1l">就業規則・各規程</h1>' +
      '<p class="muted" id="rl-ed"></p>' +
      '<p class="ptl-note">閲覧には<b>お名前の確認</b>が必要です（会社の機密情報のため）。</p>' +
      '<div id="rl" class="list">' + loading() + '</div>' + I.backHtml('#rules', '就業規則・組織図・福利厚生に戻る');
    var ok = alive();
    loadPortal().then(function (d) {
      var box = document.getElementById('rl');
      if (!box || !ok()) return;
      var list = d.規程 || [];
      // いちばん新しい施行日を「○年○月○日施行版」として出す（参考アプリの見出しの下の行）
      var latest = list.map(function (r) { return String(r.施行日 || ''); }).sort().pop();
      if (latest) document.getElementById('rl-ed').textContent = ymdJa(latest).replace(/<[^>]*>/g, '') + '施行版 ／ 株式会社IPPO';
      box.innerHTML = list.length ? list.map(function (r) {
        return '<a class="ptl-rule" href="#rule-read" data-id="' + esc(r.規程ID) + '">' + ruleIcon(r) +
          '<span class="ptl-rule-t"><b>' + esc(r.題) + '</b><small>' + ymdJa(r.施行日) + ' 施行</small></span>' +
          '<span class="ptl-tag">' + esc(r.対象 || '') + '</span></a>';
      }).join('') : '<div class="ptl-empty"><b>まだ規程が登録されていません</b><small>本部が規程を登録すると、ここに並びます。</small></div>';
      box.addEventListener('click', function (e) {
        var a = e.target.closest('a[data-id]');
        if (a) { pickRule(a.dataset.id); setPortalFrom('#rules-list'); }
      });
    }).catch(function (e) { var box = document.getElementById('rl'); if (box && ok()) box.innerHTML = failBox(e, true); });
  }

  // 選んだ規程は再読み込みしても残るよう sessionStorage にも置く。AI相談の「この規程を開く」からも使う
  // sec: AIに聞く画面から開くとき、答えに出た見出し。本文を開いたらそこまで送る
  function pickRule(id, sec) {
    try { sessionStorage.setItem('ippo.rule', id); sessionStorage.setItem('ippo.ruleSec', sec || ''); } catch (_) {}
    I.portalRule = id; I.portalRuleSec = sec || '';
  }
  function pickedSec() {
    if (I.portalRuleSec !== undefined) return I.portalRuleSec;
    try { return sessionStorage.getItem('ippo.ruleSec') || ''; } catch (_) { return ''; }
  }
  function savedName() { try { return sessionStorage.getItem('ippo.ruleName') || ''; } catch (_) { return ''; } }
  function pickedRule() {
    if (I.portalRule) return I.portalRule;
    try { return sessionStorage.getItem('ippo.rule'); } catch (_) { return null; }
  }
  I.pickRule = pickRule;

  // ---------- 閲覧前のご確認 → 本文 ----------
  function viewRuleRead() {
    var id = pickedRule();
    if (!id) { location.replace('#rules-list'); return; }
    app.innerHTML = '<div id="rr">' + loading() + '</div>';
    var ok = alive();
    loadPortal().then(function (d) {
      if (!ok()) return;
      var r = (d.規程 || []).filter(function (x) { return x.規程ID === id; })[0];
      if (!r) { location.replace('#rules-list'); return; }
      consent(r);
    }).catch(function (e) { if (ok()) app.innerHTML = failBox(e, true) + backBottom(); });
  }
  function topRule() { return portalFrom() === '#ai' ? topBack('#ai', 'AIに聞く画面に戻る') : topBack('#rules-list', '規程の選び直し'); }
  // 規程の画面の下の戻る: AI相談から開いたときは AI相談へ、ほかは規程の一覧へ
  function backBottom() {
    return portalFrom() === '#ai' ? I.backHtml('#ai', 'AIに聞く画面に戻る') : I.backHtml('#rules-list', '規程の一覧に戻る');
  }

  function consent(r) {
    var meName = (I.state.me || {}).氏名 || '';
    app.innerHTML = topRule() +
      '<form id="f" class="card ptl-consent" novalidate>' +
        '<h2>閲覧前のご確認</h2>' +
        '<p class="ptl-sel">選択中: <b>' + esc(r.題) + '</b></p>' +
        '<p class="ptl-note">規程は、みなさんの毎日の働き方に役立てるためのものです。読む前に次のお願いを確認してください。</p>' +
        '<div class="ptl-warn" role="note"><b>' + ic('warn') + '取り扱いに関する大事なお願い</b><ul>' +
          '<li><b>スクリーンショット・撮影・コピー・転送は禁止</b>です。</li>' +
          '<li>規程は<b>会社の機密情報</b>です。社外への持ち出し・共有はできません。</li>' +
          '<li>守られなかった場合、<b>損害賠償の対象</b>となることがあります。</li>' +
          '</ul></div>' +
        '<label>お名前（フルネームを入れてください）<input id="nm" autocomplete="name" value="' + esc(savedName()) + '" placeholder="' + esc(meName ? '例）' + meName : '例）山田 太郎') + '">' +
          '<small class="ptl-hint">' + (meName ? 'アプリに登録されている名前（<b>' + esc(meName) + '</b>）と同じに入れてください。' : '職員として登録されている名前と同じに入れてください。') +
          '閲覧した人として記録します。</small></label>' +
        '<label class="ptl-check"><input type="checkbox" id="ok"> 上記の取り扱いを確認しました。</label>' +
        '<div id="err"></div>' +
        '<button type="submit" id="go" disabled>確認して閲覧する</button>' +
      '</form>' + backBottom();
    var nm = document.getElementById('nm'), chk = document.getElementById('ok'), go = document.getElementById('go');
    function sync() { go.disabled = !(nm.value.trim() && chk.checked); }
    sync();
    nm.addEventListener('input', sync); chk.addEventListener('change', sync);
    document.getElementById('f').addEventListener('submit', function (e) {
      e.preventDefault();
      if (go.disabled) return;
      var ok = alive();
      var err = document.getElementById('err');
      err.innerHTML = '';
      go.disabled = true; go.textContent = '確認中…'; I.busy(true);
      api('openRule', { 規程ID: r.規程ID, 氏名: nm.value.trim(), 確認: chk.checked }).then(function (doc) {
        if (!ok()) return; // 途中でほかの画面へ移ったら、本文は出さない
        try { sessionStorage.setItem('ippo.ruleName', nm.value.trim()); } catch (_) {} // 次の規程では入力済みにする（確認のチェックは毎回）
        I.busy(false); readRule(doc);
      }).catch(function (e2) {
        if (!ok()) return;
        I.busy(false); go.textContent = '確認して閲覧する'; sync();
        err.innerHTML = e2.details && e2.details.length ? I.errorsBox(e2.details) : failBox(e2);
      });
    });
  }

  function readRule(doc) {
    var me = I.state.me || {};
    var t = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(doc.閲覧日時 || '');
    var mark = esc((me.氏名 || '') + ' ' + (t ? +t[2] + '月' + +t[3] + '日 ' + +t[4] + ':' + t[5] : ''));
    var secs = doc.本文 || [];
    app.innerHTML = topRule() +
      '<article class="ptl-doc">' +
        '<header><h1 class="ptl-h1l">' + esc(doc.題) + '</h1><p class="muted">' + ymdJa(doc.施行日) + ' 施行 ／ 対象: ' + esc(doc.対象 || '') + '</p></header>' +
        (secs.length > 1 ? '<nav class="ptl-toc" aria-label="目次">' + secs.map(function (s, i) {
          return '<a href="#rule-read" data-sec="' + i + '">' + esc(s.見出し) + '</a>';
        }).join('') + '</nav>' : '') +
        '<div class="ptl-body">' + secs.map(function (s, i) {
          return '<section id="sec' + i + '"><h2>' + esc(s.見出し) + '</h2>' +
            String(s.本文 || '').split('\n').map(function (line) { return '<p>' + esc(line) + '</p>'; }).join('') + '</section>';
        }).join('') +
        // 透かし: 閲覧した人の名前と日時を薄く重ねる（撮影・転送の抑止）
        '<div class="ptl-wm" aria-hidden="true">' + new Array(13).join('<span>' + mark + '</span>') + '</div></div>' +
        '<p class="ptl-foot">この画面は ' + mark + ' の閲覧として記録しました。</p>' +
      '</article>' + backBottom();
    // AIに聞く画面の答えに出た見出しがあれば、そこまで送る
    var want = pickedSec();
    if (want) {
      var at = secs.map(function (s) { return s.見出し; }).indexOf(want);
      var el0 = at >= 0 && document.getElementById('sec' + at);
      if (el0) setTimeout(function () { window.scrollTo(0, el0.getBoundingClientRect().top + window.scrollY - 12); el0.classList.add('ptl-hit'); }, 0);
      pickRule(pickedRule(), '');
    }
    app.querySelector('.ptl-toc') && app.querySelector('.ptl-toc').addEventListener('click', function (e) {
      var a = e.target.closest('a[data-sec]');
      if (!a) return;
      e.preventDefault();
      var el = document.getElementById('sec' + a.dataset.sec);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    window.scrollTo(0, 0);
  }

  // ---------- 組織図 ----------
  function viewOrg() {
    // AI相談の「組織図で見る」から来たときは AI相談へ戻す
    app.innerHTML = (portalFrom() === '#ai' ? topBack('#ai', 'AIに聞く画面に戻る') : topBack('#rules', 'トップに戻る')) +
      '<div id="og" class="ptl-stack">' + loading('組織図を読み込んでいます…') + '</div>' +
      (portalFrom() === '#ai' ? I.backHtml('#ai', 'AIに聞く画面に戻る') : I.backHtml('#rules', '就業規則・組織図・福利厚生に戻る'));
    var ok = alive();
    api('orgChart').then(function (d) {
      var box = document.getElementById('og');
      if (!box || !ok()) return;
      var mine = (I.state.me || {}).職種 || '';
      box.innerHTML =
        '<section class="ptl-orghead"><h1>' + esc(d.題 || '組織図') + '</h1><p>株式会社IPPO</p></section>' +
        '<p class="ptl-toclabel">このページの中身</p><nav class="ptl-chips" aria-label="このページの中身"><a href="#org" data-go="where">あなたはどこ？</a><a href="#org" data-go="help">困ったときは、ここへ</a></nav>' +
        '<h2 class="ptl-sec" id="where">あなたはどこ？</h2><p class="ptl-note">' + esc(d.説明 || '') + '</p>' +
        '<div class="list">' + (d.職種 || []).map(function (j) {
          var me = mine && j.職種.indexOf(mine.replace(/・.*/, '')) >= 0;
          return '<section class="ptl-role' + (me ? ' me' : '') + '"><b>' + esc(j.職種) + (me ? ' <span class="ptl-you">あなた</span>' : '') + '</b>' +
            '<p>上長は <em>' + esc(j.上長) + '</em>。相談は <em>' + esc(j.相談先) + '</em>。</p>' +
            (j.説明 ? '<p class="ptl-role-d">' + esc(j.説明) + '</p>' : '') + '</section>';
        }).join('') + '</div>' +
        '<h2 class="ptl-sec" id="help">困ったときは、ここへ</h2>' +
        '<dl class="ptl-help">' + (d.困ったとき || []).map(function (h) {
          return '<div><dt>' + esc(h.内容) + '</dt><dd>' + esc(h.窓口) + (h.連絡方法 ? '<small>' + esc(h.連絡方法) + '</small>' : '') + '</dd></div>';
        }).join('') + '</dl>';
      box.querySelector('.ptl-chips').addEventListener('click', function (e) {
        var a = e.target.closest('a[data-go]');
        if (!a) return;
        e.preventDefault();
        document.getElementById(a.dataset.go).scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }).catch(function (e) { var box = document.getElementById('og'); if (box && ok()) box.innerHTML = failBox(e, true); });
  }

  I.views.rules = viewRules;
  I.views['rules-list'] = viewRulesList;
  I.views['rule-read'] = viewRuleRead;
  I.views.org = viewOrg;
  I.portalTools = { loading: loading, failBox: failBox, topBack: topBack, ymdJa: ymdJa, alive: alive, safeUrl: safeUrl, ic: ic };
})();
