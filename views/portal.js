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
    return '<div class="errors" role="alert">' + esc(e && e.message || 'エラーが起きました') +
      (retry ? '<div><button type="button" class="small sub ptl-retry" onclick="IPPO.route()">再読み込み</button></div>' : '') + '</div>';
  }
  // 返事が来たときに、まだ同じ画面を見ているか（途中でほかの画面へ移ったら描かない）
  function alive() { var h = location.hash; return function () { return location.hash === h; }; }
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

  // ---------- 相談AIのメニュー ----------
  I.views.portal = function () {
    I.subMenu([
      { label: '就業規則・組織図・福利厚生', href: '#rules' },
      { label: '駐車場ナビ', href: '#parking' },
      { label: '看護マニュアル', href: '#manual' },
      { label: 'AI相談', href: '#ai' },
      { label: '日報' },
      { label: '経営資料' }
    ]);
  };

  // ---------- 社内ポータルの入口 ----------
  var portalCache = null;
  function loadPortal() {
    if (portalCache) return Promise.resolve(portalCache);
    return api('portal').then(function (d) { portalCache = d; return d; });
  }

  function viewRules() {
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
        '<a class="ptl-big navy" href="#rules-list"><span class="ptl-big-ic" aria-hidden="true">📚</span>' +
          '<span><b>就業規則・各規程を見る</b><small>お名前の確認あり（会社の機密情報）</small></span><span class="ptl-chev" aria-hidden="true">›</span></a>' +
        '<a class="ptl-big green" href="#org"><span class="ptl-big-ic" aria-hidden="true">🏢</span>' +
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
    app.innerHTML = topBack('#rules', '就業規則・組織図・福利厚生に戻る') +
      '<h1 class="ptl-h1l">就業規則・各規程</h1>' +
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
      }).join('') : '<div class="loading">まだ規程が登録されていません。</div>';
      box.addEventListener('click', function (e) {
        var a = e.target.closest('a[data-id]');
        if (a) { pickRule(a.dataset.id); setPortalFrom('#rules-list'); }
      });
    }).catch(function (e) { var box = document.getElementById('rl'); if (box && ok()) box.innerHTML = failBox(e, true); });
  }

  // 選んだ規程は再読み込みしても残るよう sessionStorage にも置く。AI相談の「この規程を開く」からも使う
  function pickRule(id) { try { sessionStorage.setItem('ippo.rule', id); } catch (_) {} I.portalRule = id; }
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
  function topRule() { return portalFrom() === '#ai' ? topBack('#ai', 'AI相談に戻る') : topBack('#rules-list', '規程の選び直し'); }
  // 規程の画面の下の戻る: AI相談から開いたときは AI相談へ、ほかは規程の一覧へ
  function backBottom() {
    return portalFrom() === '#ai' ? I.backHtml('#ai', 'AI相談に戻る') : I.backHtml('#rules-list', '規程の一覧に戻る');
  }

  function consent(r) {
    app.innerHTML = topRule() +
      '<form id="f" class="card ptl-consent" novalidate>' +
        '<h2>閲覧前のご確認</h2>' +
        '<p class="ptl-sel">選択中: <b>' + esc(r.題) + '</b></p>' +
        '<p class="ptl-note">規程は、みなさんの毎日の働き方に役立てるためのものです。読む前に次のお願いを確認してください。</p>' +
        '<div class="ptl-warn" role="note"><b>⚠ 取り扱いに関する大事なお願い</b><ul>' +
          '<li><b>スクリーンショット・撮影・コピー・転送は禁止</b>です。</li>' +
          '<li>規程は<b>会社の機密情報</b>です。社外への持ち出し・共有はできません。</li>' +
          '<li>守られなかった場合、<b>損害賠償の対象</b>となることがあります。</li>' +
          '</ul></div>' +
        '<label>お名前（フルネームを入れてください）<input id="nm" autocomplete="name" placeholder="例）山田 太郎">' +
          '<small class="ptl-hint">職員として登録されている名前と同じに入れてください。閲覧した人として記録します。</small></label>' +
        '<label class="ptl-check"><input type="checkbox" id="ok"> 上記の取り扱いを確認しました。</label>' +
        '<div id="err"></div>' +
        '<button type="submit" id="go" disabled>確認して閲覧する</button>' +
      '</form>' + backBottom();
    var nm = document.getElementById('nm'), chk = document.getElementById('ok'), go = document.getElementById('go');
    function sync() { go.disabled = !(nm.value.trim() && chk.checked); }
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
    app.innerHTML = topBack('#rules', '就業規則・組織図・福利厚生に戻る') + '<div id="og" class="ptl-stack">' + loading() + '</div>' + I.backHtml('#rules', '就業規則・組織図・福利厚生に戻る');
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
          return '<div><dt>' + esc(h.内容) + '</dt><dd>' + esc(h.窓口) + '</dd></div>';
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
  I.portalTools = { loading: loading, failBox: failBox, topBack: topBack, ymdJa: ymdJa, alive: alive, safeUrl: safeUrl };
})();
