/* 看護マニュアル（第4段階）。参考動画 5:30〜の「看護AI」にあたる、検索できるマニュアル
   #manual … 入口: 「様子がおかしい・急変」の赤いボタン → キーワード検索 → 「いまこんな時」の場面カード → ほかの場面
             ガイドを押すと同じ画面の中で「パッと見（要点）」と「くわしく読む（本文）」を出す。上に「文字 大」の切り替え
   参考アプリは暗証番号で入るが、こちらは LINE で本人が分かるので、職種（看護職）と役割（承認者・管理者）で見られる人を決める
   GAS とのやりとり: manual（kiroku-app の docs/api.md「相談AI」） */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, api = I.api, esc = I.esc;
  var T = function () { return I.portalTools; };

  var data = null, mode = { kind: 'home', id: null, q: '' };

  function bigText(on) {
    if (on === undefined) { try { on = localStorage.getItem('ippo.bigText') === '1'; } catch (_) { on = false; } }
    document.body.classList.toggle('mnl-big', !!on);
    try { localStorage.setItem('ippo.bigText', on ? '1' : '0'); } catch (_) {}
    var b = document.getElementById('mnl-size');
    if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function guide(id) { return (data.ガイド || []).filter(function (g) { return g.ID === id; })[0]; }

  function head() {
    return '<div class="mnl-top"><h1>看護マニュアル</h1>' +
      '<button type="button" class="mnl-size" id="mnl-size" aria-pressed="false">文字 大</button></div>';
  }

  function viewManual() {
    mode = { kind: 'home', id: null, q: '' };
    app.innerHTML = head() + '<div id="mn">' + T().loading() + '</div>' + I.backHtml();
    bigText();
    I.cleanup.push(function () { document.body.classList.remove('mnl-big'); });
    app.addEventListener('click', onClick);
    I.cleanup.push(function () { app.removeEventListener('click', onClick); });
    api('manual').then(function (d) { data = d; render(); })
      .catch(function (e) {
        var box = document.getElementById('mn');
        if (box) box.innerHTML = e.code === 403
          ? '<div class="card fail"><h2>このマニュアルは見られません</h2><p class="fail-msg">' + esc(e.message) + '</p></div>'
          : T().failBox(e);
      });
  }

  function scenes(list) {
    return '<div class="mnl-scenes">' + list.map(function (g) {
      return '<button type="button" class="mnl-scene" data-guide="' + esc(g.ID) + '"><b>' + esc(g.場面 || g.題) + '</b>' +
        (g.説明 ? '<small>' + esc(g.説明) + '</small>' : '') + '</button>';
    }).join('') + '</div>';
  }

  function render() {
    var box = document.getElementById('mn');
    if (!box || !data) return;
    if (mode.kind === 'guide') return renderGuide(box);
    if (mode.kind === 'urgent') return renderUrgent(box);
    var all = data.ガイド || [];
    var now = all.filter(function (g) { return g.分類 === 'いまこんな時'; });
    var first = all.filter(function (g) { return g.分類 === 'はじめての人へ'; });
    var rest = all.filter(function (g) { return g.分類 !== 'いまこんな時' && g.分類 !== 'はじめての人へ'; });
    box.innerHTML =
      '<section class="mnl-hero"><b>何に困ってる？</b><small>ここを見れば、マニュアルが見つかります。</small></section>' +
      '<button type="button" class="mnl-urgent" data-urgent="1"><span class="mnl-urgent-ic" aria-hidden="true">!</span>' +
        '<span><b>' + esc((data.急変 || {}).題 || '様子がおかしい・急変') + '</b><small>夜の連絡・オンコール・救急搬送 → すぐ見る</small></span></button>' +
      '<form class="mnl-search" id="mnl-f" role="search"><input id="mnl-q" type="search" placeholder="例：転倒　夜間　発熱" value="' + esc(mode.q) + '" aria-label="マニュアルを探す">' +
        '<button type="submit" class="small">探す</button></form>' +
      '<div class="mnl-keys">' + (data.キーワード || []).map(function (k) { return '<button type="button" data-key="' + esc(k) + '">' + esc(k) + '</button>'; }).join('') + '</div>' +
      '<div id="mnl-res"></div>' +
      '<h2 class="ptl-sec">いま こんな時 <small>押すと「見るところ」だけ出ます</small></h2>' + scenes(now) +
      (first.length ? '<h2 class="ptl-sec">はじめての人へ</h2>' + scenes(first) : '') +
      (rest.length ? '<details class="mnl-more"><summary>ほかのページ（' + rest.length + '）</summary>' + scenes(rest) + '</details>' : '');
    document.getElementById('mnl-f').addEventListener('submit', function (e) {
      e.preventDefault(); mode.q = document.getElementById('mnl-q').value.trim(); search();
    });
    if (mode.q) search();
  }

  // 画面の中だけで探す（マニュアルは件数が少ないので、全部受け取ってから端末で探す）
  function search() {
    var res = document.getElementById('mnl-res');
    if (!res) return;
    var q = mode.q;
    if (!q) { res.innerHTML = ''; return; }
    var words = q.split(/[\s　、,]+/).filter(String);
    var hits = (data.ガイド || []).filter(function (g) {
      var text = [g.題, g.場面, g.分類, g.キーワード, (g.要点 || []).join(' '), g.本文].join(' ');
      return words.every(function (w) { return text.indexOf(w) >= 0; });
    });
    res.innerHTML = '<div class="mnl-res" role="status"><p class="ptl-note">「' + esc(q) + '」で ' + hits.length + ' 件</p>' +
      (hits.length ? hits.map(function (g) {
        return '<button type="button" class="mnl-row" data-guide="' + esc(g.ID) + '"><b>' + esc(g.題) + '</b><small>' + esc(g.分類) + '</small></button>';
      }).join('') : '<p class="muted">見つかりませんでした。言葉を短くするか、AI相談で聞いてみてください。</p>') + '</div>';
  }

  function renderUrgent(box) {
    var u = data.急変 || {};
    box.innerHTML = '<button type="button" class="ptl-topback as-btn" data-home="1">← マニュアルのトップ</button>' +
      '<h2 class="mnl-uh">' + esc(u.題 || '様子がおかしい・急変') + '</h2><p class="ptl-note">この場面で見るところ（上から順に）</p>' +
      '<ol class="mnl-steps">' + (u.見る順 || []).map(function (id) {
        var g = guide(id);
        return g ? '<li><button type="button" data-guide="' + esc(id) + '">' + esc(g.題) + '</button></li>' : '';
      }).join('') + '</ol>' +
      (u.見る順 || []).map(function (id) { var g = guide(id); return g ? guideCard(g, true) : ''; }).join('');
  }

  function guideCard(g, compact) {
    return '<article class="mnl-guide" id="g-' + esc(g.ID) + '">' +
      '<p class="mnl-cat">' + esc(g.分類) + '</p><h2>' + esc(g.題) + '</h2>' +
      '<p class="muted">' + (g.改定日 ? T().ymdJa(g.改定日) + ' 改定　' : '') + (g.読む分 ? '読む目安 ' + esc(g.読む分) + '分' : '') + '</p>' +
      '<h3>パッと見</h3><ul class="mnl-points">' + (g.要点 || []).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' +
      (g.本文 ? '<details' + (compact ? '' : ' open') + '><summary>くわしく読む</summary>' +
        String(g.本文).split('\n').map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + '</details>' : '') +
      '</article>';
  }

  function renderGuide(box) {
    var g = guide(mode.id);
    if (!g) { mode.kind = 'home'; return render(); }
    box.innerHTML = '<button type="button" class="ptl-topback as-btn" data-home="1">← マニュアルのトップ</button>' + guideCard(g, false);
  }

  function onClick(e) {
    var b = e.target.closest('button');
    if (!b || !app.contains(b)) return;
    if (b.id === 'mnl-size') return bigText(!document.body.classList.contains('mnl-big'));
    if (b.dataset.key) { mode.q = b.dataset.key; var q = document.getElementById('mnl-q'); if (q) q.value = mode.q; return search(); }
    if (b.dataset.urgent) { mode.kind = 'urgent'; render(); return window.scrollTo(0, 0); }
    if (b.dataset.home) { mode.kind = 'home'; render(); return window.scrollTo(0, 0); }
    if (b.dataset.guide) {
      // 急変の画面の中の「見るところ」は、同じ画面のカードへ移動するだけ
      var here = document.getElementById('g-' + b.dataset.guide);
      if (mode.kind === 'urgent' && here) return here.scrollIntoView({ behavior: 'smooth', block: 'start' });
      mode.kind = 'guide'; mode.id = b.dataset.guide; render(); window.scrollTo(0, 0);
    }
  }

  // AI相談の「マニュアルを開く」から、そのガイドを直接開く
  I.openGuide = function (id) { I.pendingGuide = id; location.hash = '#manual'; };
  I.views.manual = function () {
    viewManual();
    if (I.pendingGuide) {
      var id = I.pendingGuide; I.pendingGuide = null;
      var wait = setInterval(function () { if (data) { clearInterval(wait); mode = { kind: 'guide', id: id, q: '' }; render(); } }, 50);
      I.cleanup.push(function () { clearInterval(wait); });
    }
  };
})();
