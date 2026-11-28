/* 看護マニュアル（第4段階）。参考動画 5:30〜の「看護AI」にあたる、検索できるマニュアル
   #manual        … 入口: 「様子がおかしい・急変」の赤いボタン → キーワード検索 → 「いまこんな時」の場面カード → はじめての人へ → ほかのページ
   #manual-urgent … 急変: 見るところ（上から順に）＋そのガイドのカード
   #manual-guide  … 1つのガイド: 「パッと見（要点）」と「くわしく読む（本文）」。開いているガイドは sessionStorage に置く
   画面ごとにハッシュを分けているので、LINE やスマホの「戻る」でマニュアルのトップに戻れる。上に「文字 大」の切り替え
   参考アプリは暗証番号で入るが、こちらは LINE で本人が分かるので、職種（看護職）と役割（承認者・管理者）で見られる人を決める
   GAS とのやりとり: manual（kiroku-app の docs/api.md「相談AI」） */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, api = I.api, esc = I.esc;
  var T = function () { return I.portalTools; };

  var data = null;   // 一度受け取ったら、ページを開いている間は使い回す
  var query = '';    // 検索の言葉（トップに戻っても残す）

  function bigText(on) {
    if (on === undefined) { try { on = localStorage.getItem('ippo.bigText') === '1'; } catch (_) { on = false; } }
    document.body.classList.toggle('mnl-big', !!on);
    try { localStorage.setItem('ippo.bigText', on ? '1' : '0'); } catch (_) {}
    var b = document.getElementById('mnl-size');
    if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  function guide(id) { return ((data && data.ガイド) || []).filter(function (g) { return g.ID === id; })[0]; }
  function setGuide(id) { try { sessionStorage.setItem('ippo.guide', id); } catch (_) {} I.manualGuide = id; }
  function currentGuide() {
    if (I.manualGuide) return I.manualGuide;
    try { return sessionStorage.getItem('ippo.guide'); } catch (_) { return null; }
  }

  // 3つの画面の共通の枠。kind: home / urgent / guide
  function frame(kind) {
    var from = I.portalFrom && I.portalFrom() === '#ai';
    var back = kind === 'home' ? I.backHtml()
      : (from ? I.backHtml('#ai', 'AI相談に戻る') : I.backHtml('#manual', 'マニュアルのトップに戻る'));
    app.innerHTML = '<div class="mnl-top"><h1>看護マニュアル</h1>' +
      '<button type="button" class="mnl-size" id="mnl-size" aria-pressed="false">文字 大</button></div>' +
      '<div id="mn" class="ptl-stack">' + T().loading() + '</div>' + back;
    bigText();
    I.cleanup.push(function () { document.body.classList.remove('mnl-big'); });
    app.addEventListener('click', onClick);
    I.cleanup.push(function () { app.removeEventListener('click', onClick); });
    var alive = T().alive();
    var p = data ? Promise.resolve(data) : api('manual').then(function (d) { data = d; return d; });
    p.then(function () { if (alive()) render(kind); }).catch(function (e) {
      if (!alive()) return;
      var size = document.getElementById('mnl-size');
      if (size && e.code === 403) size.hidden = true;
      document.getElementById('mn').innerHTML = e.code === 403
        ? '<div class="card fail"><h2>このマニュアルは見られません</h2><p class="fail-msg">' + esc(e.message) + '</p>' +
            '<p class="fail-msg"><b>急変のときは、まず看護師かオンコール当番へ連絡してください。</b>命に関わるときは119番。</p>' +
            '<a class="btn" href="tel:119">119番に電話する</a><a class="btn sub-link" href="#org">困ったときの窓口（組織図）</a></div>'
        : T().failBox(e, true);
    });
  }

  function scenes(list) {
    return '<div class="mnl-scenes">' + list.map(function (g) {
      return '<button type="button" class="mnl-scene" data-guide="' + esc(g.ID) + '"><b>' + esc(g.場面 || g.題) + '</b>' +
        (g.説明 ? '<small>' + esc(g.説明) + '</small>' : '') + '</button>';
    }).join('') + '</div>';
  }

  function render(kind) {
    var box = document.getElementById('mn');
    if (!box) return;
    if (kind === 'urgent') return renderUrgent(box);
    if (kind === 'guide') return renderGuide(box);
    var all = data.ガイド || [];
    var now = all.filter(function (g) { return g.分類 === 'いまこんな時'; });
    var first = all.filter(function (g) { return g.分類 === 'はじめての人へ'; });
    var rest = all.filter(function (g) { return g.分類 !== 'いまこんな時' && g.分類 !== 'はじめての人へ'; });
    box.innerHTML =
      '<section class="mnl-hero"><b>何に困ってる？</b><small>ここを見れば、マニュアルが見つかります。</small></section>' +
      '<a class="mnl-urgent" href="#manual-urgent"><span class="mnl-urgent-ic" aria-hidden="true">!</span>' +
        '<span><b>' + esc((data.急変 || {}).題 || '様子がおかしい・急変') + '</b><small>夜の連絡・オンコール・救急搬送 → すぐ見る</small></span></a>' +
      '<form class="mnl-search" id="mnl-f" role="search"><input id="mnl-q" type="search" enterkeyhint="search" placeholder="例：転倒　夜間　発熱" value="' + esc(query) + '" aria-label="マニュアルを探す">' +
        '<button type="submit">探す</button></form>' +
      '<div class="mnl-keys">' + (data.キーワード || []).map(function (k) { return '<button type="button" data-key="' + esc(k) + '">' + esc(k) + '</button>'; }).join('') + '</div>' +
      '<div id="mnl-res" hidden></div>' +
      (now.length ? '<h2 class="ptl-sec">いま こんな時 <small>押すと、その場面のページが開きます</small></h2>' + scenes(now) : '') +
      (first.length ? '<h2 class="ptl-sec">はじめての人へ</h2>' + scenes(first) : '') +
      (rest.length ? '<details class="mnl-more"><summary>＋ ほかのページ（' + rest.length + '）</summary>' + scenes(rest) + '</details>' : '') +
      (!all.length ? '<div class="loading">まだマニュアルが登録されていません。</div>' : '');
    document.getElementById('mnl-f').addEventListener('submit', function (e) {
      e.preventDefault(); query = document.getElementById('mnl-q').value.trim(); search();
      document.getElementById('mnl-q').blur();
    });
    if (query) search();
  }

  // 画面の中だけで探す（マニュアルは件数が少ないので、全部受け取ってから端末で探す）
  function search() {
    var res = document.getElementById('mnl-res');
    if (!res) return;
    res.hidden = !query;
    if (!query) { res.innerHTML = ''; return; }
    var words = query.split(/[\s　、,]+/).filter(String);
    var hits = (data.ガイド || []).filter(function (g) {
      var text = [g.題, g.場面, g.分類, g.キーワード, (g.要点 || []).join(' '), g.本文].join(' ');
      return words.every(function (w) { return text.indexOf(w) >= 0; });
    });
    res.innerHTML = '<div class="mnl-res" role="status"><div class="row"><p class="ptl-note">「' + esc(query) + '」で ' + hits.length + ' 件</p>' +
      '<button type="button" class="small sub" data-clear="1">消す</button></div>' +
      (hits.length ? hits.map(function (g) {
        return '<button type="button" class="mnl-row" data-guide="' + esc(g.ID) + '"><b>' + esc(g.題) + '</b><small>' + esc(g.分類) + '</small></button>';
      }).join('') : '<p class="muted">見つかりませんでした。言葉を短くするか、<a href="#ai">AI相談</a>で聞いてみてください。</p>') + '</div>';
  }

  function renderUrgent(box) {
    var u = data.急変 || {};
    var list = (u.見る順 || []).map(guide).filter(Boolean);
    box.innerHTML = T().topBack('#manual', 'マニュアルのトップ') +
      '<h2 class="mnl-uh">' + esc(u.題 || '様子がおかしい・急変') + '</h2>' +
      '<a class="mnl-119" href="tel:119"><b>命に関わるときは 119番</b><small>押すと電話をかけます。連絡はそのあとでよい</small></a>' +
      '<p class="ptl-note">この場面で見るところ（上から順に）</p>' +
      '<ol class="mnl-steps">' + list.map(function (g) {
        return '<li><button type="button" data-jump="' + esc(g.ID) + '">' + esc(g.題) + '</button></li>';
      }).join('') + '</ol>' +
      list.map(function (g) { return guideCard(g, true); }).join('') +
      (!list.length ? '<div class="loading">急変のときに見るページがまだ決まっていません。</div>' : '');
  }

  function guideCard(g, compact) {
    return '<article class="mnl-guide" id="g-' + esc(g.ID) + '" tabindex="-1">' +
      '<p class="mnl-cat">' + esc(g.分類) + '</p><h2>' + esc(g.題) + '</h2>' +
      '<p class="muted">' + (g.改定日 ? T().ymdJa(g.改定日) + ' 改定　' : '') + (g.読む分 ? '読む目安 ' + esc(g.読む分) + '分' : '') + '</p>' +
      '<h3>パッと見</h3><ul class="mnl-points">' + (g.要点 || []).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' +
      (g.本文 ? '<details' + (compact ? '' : ' open') + '><summary>くわしく読む（全文）</summary>' +
        String(g.本文).split('\n').map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + '</details>' : '') +
      '</article>';
  }

  function renderGuide(box) {
    var g = guide(currentGuide());
    if (!g) { location.replace('#manual'); return; }
    box.innerHTML = T().topBack('#manual', 'マニュアルのトップ') + guideCard(g, false);
  }

  function onClick(e) {
    var b = e.target.closest('button');
    if (!b || !app.contains(b)) return;
    if (b.id === 'mnl-size') return bigText(!document.body.classList.contains('mnl-big'));
    if (b.dataset.key) { query = b.dataset.key; var q = document.getElementById('mnl-q'); if (q) q.value = query; return search(); }
    if (b.dataset.clear) { query = ''; var q2 = document.getElementById('mnl-q'); if (q2) q2.value = ''; return search(); }
    if (b.dataset.jump) {
      var here = document.getElementById('g-' + b.dataset.jump);
      if (here) { here.scrollIntoView({ behavior: 'smooth', block: 'start' }); here.focus({ preventScroll: true }); }
      return;
    }
    if (b.dataset.guide) { setGuide(b.dataset.guide); if (I.setPortalFrom) I.setPortalFrom('#manual'); location.hash = '#manual-guide'; }
  }

  // AI相談の「マニュアルを開く」から、そのガイドを直接開く
  I.openGuide = function (id) { setGuide(id); location.hash = '#manual-guide'; };
  I.views.manual = function () { if (I.setPortalFrom) I.setPortalFrom('#manual'); frame('home'); };
  I.views['manual-urgent'] = function () { frame('urgent'); };
  I.views['manual-guide'] = function () { frame('guide'); };
})();
