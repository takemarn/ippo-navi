/* 看護マニュアル（第4段階）。参考動画 5:30〜の「看護AI」にあたる、検索できるマニュアル
   #manual        … 入口: 「様子がおかしい・急変」の赤いボタン → キーワード検索 → 「いまこんな時」の場面カード → はじめての人へ → ほかのページ
   #manual-urgent … 急変: 見るところ（上から順に）＋そのガイドのカード
   #manual-guide  … 1つのガイド: 「パッと見（要点）」と「くわしく読む（本文）」。開いているガイドは sessionStorage に置く
   画面ごとにハッシュを分けているので、LINE やスマホの「戻る」でマニュアルのトップに戻れる。上に「文字 大」の切り替え
   参考アプリは暗証番号で入るが、こちらは LINE で本人が分かるので、職種（看護職）と役割（承認者・管理者）で見られる人を決める
   views/portal.js（I.portalTools・portalFrom）を先に読み込むこと
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

  // ガイドの絵（参考アプリと同じく、場面ごとに色つきの丸に絵）。絵は portal.js の線画（I.portalTools.ic）。
  // 絵文字は端末ごとに絵柄がちがい、ホームの線画・立体風の絵から浮くので使わない。
  // シートに 絵 の列があれば、線画の名前（fall / note / pill / home / bath / thermo / bandage / eye / phone / ambulance / steth / sprout / book）として使う
  var ICONS = [
    [/転倒|転落/, 'fall', 'pink'], [/記録|SOAP/, 'note', 'blue'], [/服薬|点滴|薬/, 'pill', 'green'], [/入居/, 'home', 'amber'],
    [/入浴/, 'bath', 'amber'], [/発熱|熱|血圧/, 'thermo', 'amber'], [/皮膚|けが|外傷/, 'bandage', 'blue'], [/様子/, 'eye', 'pink'],
    [/オンコール|電話/, 'phone', 'pink'], [/救急|搬送/, 'ambulance', 'pink'], [/目安|呼ぶ/, 'steth', 'green'], [/最初|はじめ|新人/, 'sprout', 'green']
  ];
  function iconOf(g) {
    // 場面・題で先に探し、当たらなければキーワードで（キーワードには ほかの場面の言葉も入るため）
    var head = [g.場面, g.題].join(' '), kw = String(g.キーワード || '');
    var hit = ICONS.filter(function (x) { return x[0].test(head); })[0] || ICONS.filter(function (x) { return x[0].test(kw); })[0];
    var own = /^[a-z]+$/.test(String(g.絵 || '')) ? g.絵 : '';
    return { e: own || (hit ? hit[1] : 'book'), c: hit ? hit[2] : 'blue' };
  }
  function icon(g, cls) { var i = iconOf(g); return '<span class="mnl-ic ' + i.c + (cls ? ' ' + cls : '') + '" aria-hidden="true">' + T().ic(i.e) + '</span>'; }
  // 要点の「場面 → こうする」を色つきのカードにするときの色（危ない順に 赤 → 黄 → 青 → 緑）
  function tone(t) {
    return /転倒|転落|様子|意識|呼吸|SpO2|119|急/.test(t) ? 'pink' : /熱|血圧|入浴/.test(t) ? 'amber' : /皮膚|けが|外傷|写真/.test(t) ? 'blue' : 'green';
  }
  function dateShort(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? +m[1] + '/' + +m[2] + '/' + +m[3] : esc(s || ''); }
  function meta(g) {
    return [g.改定日 ? '改定 ' + dateShort(g.改定日) : '', g.読む分 ? '読む目安 ' + esc(g.読む分) + '分' : '', g.対象 ? esc(g.対象) + '向け' : ''].filter(String).join('・');
  }

  // 下に固定する もどる／さがす／目次（参考アプリの看護マニュアルと同じ3つ。片手で届く位置）
  var jump = ''; // トップを開いたあと送る先（'search' か 'toc'）
  function tabBar(kind) {
    var backTo = kind === 'home' ? I.lastMenu() : (I.portalFrom && I.portalFrom() === '#ai' ? '#ai' : I.portalFrom && I.portalFrom() === '#portal' && kind === 'urgent' ? '#portal' : '#manual');
    return '<nav class="mnl-tabs" aria-label="マニュアルの移動">' +
      '<a href="' + esc(backTo) + '">' + T().ic('back') + 'もどる</a>' +
      '<button type="button" data-tab="search">' + T().ic('search') + 'さがす</button>' +
      '<button type="button" data-tab="toc">' + T().ic('list') + '目次</button></nav>';
  }
  function doJump(to) {
    var el = document.getElementById(to === 'search' ? 'mnl-f' : 'mnl-toc');
    if (!el) return;
    if (to === 'toc' && el.tagName === 'DETAILS') el.open = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (to === 'search') { var q = document.getElementById('mnl-q'); if (q) q.focus({ preventScroll: true }); }
  }

  // 3つの画面の共通の枠。kind: home / urgent / guide
  function frame(kind) {
    var from = I.portalFrom && I.portalFrom() === '#ai';
    var back = kind === 'home' ? I.backHtml()
      : (from ? I.backHtml('#ai', 'AIに聞く画面に戻る')
        : I.portalFrom && I.portalFrom() === '#portal' && kind === 'urgent' ? I.backHtml('#portal') // メニューの急変の近道から来たとき
        : I.backHtml('#manual', 'マニュアルのトップに戻る'));
    app.innerHTML = '<div class="mnl-top"><h1>看護マニュアル</h1>' +
      '<button type="button" class="mnl-size" id="mnl-size" aria-pressed="false">文字 大</button></div>' +
      '<div id="mn" class="ptl-stack">' + T().loading() + '</div>' + tabBar(kind) + back;
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

  // 上の戻る: 下の戻ると同じく、AIに聞く画面から来たときは そこへ
  function top() {
    return I.portalFrom && I.portalFrom() === '#ai' ? T().topBack('#ai', 'AIに聞く画面に戻る') : T().topBack('#manual', 'マニュアルのトップ');
  }

  function scenes(list) {
    return '<div class="mnl-scenes">' + list.map(function (g) {
      return '<button type="button" class="mnl-scene" data-guide="' + esc(g.ID) + '">' + icon(g) + '<span><b>' + esc(g.場面 || g.題) + '</b>' +
        (g.説明 ? '<small>' + esc(g.説明) + '</small>' : '') + '</span></button>';
    }).join('') + '</div>';
  }

  function render(kind) {
    var box = document.getElementById('mn');
    if (!box) return;
    if (kind === 'urgent') return renderUrgent(box);
    if (kind === 'guide') return renderGuide(box);
    var all = data.ガイド || [];
    function cat(g) { return String(g.分類 || '').replace(/[\s　]/g, ''); }
    var now = all.filter(function (g) { return cat(g) === 'いまこんな時'; });
    var first = all.filter(function (g) { return cat(g) === 'はじめての人へ'; });
    var rest = all.filter(function (g) { return cat(g) !== 'いまこんな時' && cat(g) !== 'はじめての人へ'; });
    box.innerHTML =
      '<section class="mnl-hero"><b>何に困ってる？</b><small>ここを見れば、マニュアルが見つかります。</small></section>' +
      '<a class="mnl-urgent" href="#manual-urgent"><span class="mnl-urgent-ic" aria-hidden="true">!</span>' +
        '<span><b>' + esc((data.急変 || {}).題 || '様子がおかしい・急変') + '</b><small>夜の連絡・オンコール・救急搬送 → すぐ見る</small></span></a>' +
      '<form class="mnl-search" id="mnl-f" role="search"><input id="mnl-q" type="search" enterkeyhint="search" placeholder="例：転倒" value="' + esc(query) + '" aria-label="マニュアルを探す">' +
        '<button type="submit">探す</button></form>' +
      '<div class="mnl-keys">' + (data.キーワード || []).map(function (k) { return '<button type="button" data-key="' + esc(k) + '">' + esc(k) + '</button>'; }).join('') + '</div>' +
      '<div id="mnl-res" hidden></div>' +
      (now.length ? '<h2 class="ptl-sec">いま こんな時 <small>押すと、その場面のページが開きます</small></h2>' + scenes(now) : '') +
      (first.length ? '<h2 class="ptl-sec">はじめての人へ</h2>' + scenes(first) : '') +
      (all.length ? toc(all, rest.length) : '') +
      (!all.length ? '<div class="loading">まだマニュアルが登録されていません。</div>' : '') +
      (data.看護職 === false ? '<p class="ptl-note">看護職向けのページ（記録の書き方など）は、看護職と運営だけに出ます。</p>' : '');
    document.getElementById('mnl-f').addEventListener('submit', function (e) {
      e.preventDefault(); query = document.getElementById('mnl-q').value.trim(); search();
      document.getElementById('mnl-q').blur();
    });
    if (query) search();
    if (jump) { var j = jump; jump = ''; setTimeout(function () { doJump(j); }, 0); }
  }

  // 目次: すべてのページを分類ごとに（題・改定日・読む目安）。参考アプリの「目次」にあたる
  function toc(all, restN) {
    var cats = [];
    all.forEach(function (g) { var c = g.分類 || 'そのほか'; if (cats.indexOf(c) < 0) cats.push(c); });
    return '<details class="mnl-toc" id="mnl-toc"><summary><span>' + T().ic('list') + '目次（すべてのページ ' + all.length + '）</span>' +
        (restN ? '<small>ほかのページ ' + restN + ' もここにあります</small>' : '') + '</summary>' +
      cats.map(function (c) {
        return '<p class="mnl-toc-c">' + esc(c) + '</p>' + all.filter(function (g) { return (g.分類 || 'そのほか') === c; }).map(function (g) {
          return '<button type="button" class="mnl-tocrow" data-guide="' + esc(g.ID) + '">' + icon(g, 'sm') +
            '<span><b>' + esc(g.題) + '</b><small>' + meta(g) + '</small></span><span class="ptl-chev" aria-hidden="true">›</span></button>';
        }).join('');
      }).join('') + '</details>';
  }

  // 画面の中だけで探す（マニュアルは件数が少ないので、全部受け取ってから端末で探す）
  function search() {
    var res = document.getElementById('mnl-res');
    if (!res) return;
    res.hidden = !query;
    if (!query) { res.innerHTML = ''; return; }
    // 全角・半角、大文字・小文字をそろえて比べる。言葉が多く当たるページほど上に出す
    function norm(s) { s = String(s || ''); return (s.normalize ? s.normalize('NFKC') : s).toLowerCase(); }
    var words = norm(query).split(/[\s、,]+/).filter(String);
    var hits = (data.ガイド || []).map(function (g) {
      var text = norm([g.題, g.場面, g.分類, g.キーワード, (g.要点 || []).join(' '), g.本文].join(' '));
      return { g: g, n: words.filter(function (w) { return text.indexOf(w) >= 0; }).length };
    }).filter(function (x) { return x.n > 0; }).sort(function (a, b) { return b.n - a.n; }).map(function (x) { return x.g; });
    res.innerHTML = '<div class="mnl-res" role="status"><div class="row"><p class="ptl-note">「' + esc(query) + '」で ' + hits.length + ' 件</p>' +
      '<button type="button" class="small sub" data-clear="1">消す</button></div>' +
      (hits.length ? hits.map(function (g) {
        return '<button type="button" class="mnl-tocrow" data-guide="' + esc(g.ID) + '">' + icon(g, 'sm') + '<span><b>' + esc(g.題) + '</b><small>' + esc(g.分類) + '</small></span><span class="ptl-chev" aria-hidden="true">›</span></button>';
      }).join('') : '<p class="muted">見つかりませんでした。言葉を短くするか、<a href="#ai">AIに聞く</a>で聞いてみてください。</p>') + '</div>';
  }

  function renderUrgent(box) {
    var u = data.急変 || {};
    var list = (u.見る順 || []).map(guide).filter(Boolean);
    box.innerHTML = top() +
      '<h2 class="mnl-uh">' + esc(u.題 || '様子がおかしい・急変') + '</h2>' +
      '<a class="mnl-119" href="tel:119"><b>命に関わるときは 119番</b><small>押すと電話をかけます。オンコール当番への連絡は、そのあとで大丈夫です</small></a>' +
      '<div id="mnl-calls">' + calls() + '</div>' +
      '<p class="ptl-note">この場面で見るところ（上から順に）</p>' +
      '<ol class="mnl-steps">' + list.map(function (g) {
        return '<li><button type="button" data-jump="' + esc(g.ID) + '">' + esc(g.題) + '</button></li>';
      }).join('') + '</ol>' +
      list.map(function (g) { return guideCard(g, true); }).join('') +
      (!list.length ? '<div class="loading">急変のときに見るページがまだ決まっていません。</div>' : '');
  }

  // 連絡先: 施設ごとに番号がちがうときは「どの施設ですか？」で選んでから出す（参考アプリと同じ流れ）。
  // 連絡先の 施設 が空の行は、どの施設でも出す（本部・施設長など）。選んだ施設は次も使う（端末に保存）
  function facility(v) {
    if (v !== undefined) { try { localStorage.setItem('ippo.facility', v); } catch (_) {} return v; }
    try { return localStorage.getItem('ippo.facility') || ''; } catch (_) { return ''; }
  }
  function calls() {
    var list = data.連絡先 || [];
    if (!list.length) return '<p class="ptl-note">オンコール当番の電話番号は、施設の掲示や当番表で確認してください。</p>';
    var facs = [];
    list.forEach(function (c) { if (c.施設 && facs.indexOf(c.施設) < 0) facs.push(c.施設); });
    var cur = facs.length === 1 ? facs[0] : facility();
    if (facs.indexOf(cur) < 0) cur = '';
    var pick = facs.length > 1 ? '<section class="mnl-fac"><b>' + T().ic('home') + 'どの施設ですか？<small>（施設で連絡先がちがいます）</small></b><div class="mnl-fac-btns">' +
      facs.map(function (f) { return '<button type="button" data-fac="' + esc(f) + '" aria-pressed="' + (f === cur) + '">' + esc(f) + '</button>'; }).join('') + '</div></section>' : '';
    if (facs.length > 1 && !cur) {
      // 施設を選ぶまでは、どの施設でも同じ連絡先（施設 が空の行）だけ先に出す
      return pick + list.filter(function (c) { return !c.施設; }).map(callBtn).join('');
    }
    return pick + list.filter(function (c) { return !c.施設 || c.施設 === cur; }).map(callBtn).join('');
  }
  function callBtn(c) {
    return '<a class="mnl-call" href="tel:' + esc(String(c.電話).replace(/#/g, '%23')) + '"><span class="mnl-call-ic" aria-hidden="true">' + T().ic('phone') + '</span><span><b>' + esc(c.名前) + 'に電話する</b><small>' +
      (c.施設 ? esc(c.施設) + '　' : '') + esc(c.電話) + '</small></span></a>';
  }

  // 要点: 「場面 → こうする」の形が2つ以上あれば、色つきのカードを2列に並べる（参考アプリの「6つの場面 → こうする」）
  function points(list) {
    var pairs = list.map(function (p) { var m = /^(.+?)\s*(?:→|->)\s*(.+)$/.exec(String(p)); return m ? { h: m[1], d: m[2] } : null; });
    var n = pairs.filter(Boolean).length;
    if (n < 2 || n < list.length - 1) return '<ul class="mnl-points">' + list.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>';
    return '<p class="mnl-gridh">' + n + 'つの場面 → こうする</p><div class="mnl-grid">' + list.map(function (p, i) {
      var x = pairs[i];
      if (!x) return '<div class="mnl-cell wide green"><span>' + esc(p) + '</span></div>';
      var t = tone(x.h);
      return '<div class="mnl-cell ' + t + '"><b>' + esc(x.h) + '</b><span>' + esc(x.d) + '</span></div>';
    }).join('') + '</div>';
  }

  function guideCard(g, compact) {
    var urgentCat = /緊急|急変|オンコール/.test(g.分類 || '');
    var body = String(g.本文 || '').replace(/^（見本の文章です）$/, '');
    return '<article class="mnl-guide" id="g-' + esc(g.ID) + '" tabindex="-1">' +
      '<div class="mnl-gh">' + icon(g, 'lg') + '<div><p class="mnl-cat' + (urgentCat ? ' red' : '') + '">' + esc(g.分類) + '</p><h2>' + esc(g.題) + '</h2>' +
      '<p class="muted">' + meta(g) + '</p></div></div>' +
      ((g.要点 || []).length ? '<h3>パッと見</h3>' + points(g.要点) : '') +
      (body ? '<details class="mnl-full"' + (compact ? '' : ' open') + '><summary>' + T().ic('book') + 'くわしく読む（原文）</summary>' +
        body.split('\n').map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') + '</details>' : '') +
      (!(g.要点 || []).length && !body ? '<p class="muted">このページは、まだ中身が書かれていません。</p>' : '') +
      '</article>';
  }

  function renderGuide(box) {
    var g = guide(currentGuide());
    if (!g) { location.replace('#manual'); return; }
    box.innerHTML = top() + guideCard(g, false);
  }

  function onClick(e) {
    var b = e.target.closest('button');
    if (!b || !app.contains(b)) return;
    if (b.id === 'mnl-size') return bigText(!document.body.classList.contains('mnl-big'));
    if (b.dataset.tab) {
      if (document.getElementById('mnl-f')) return doJump(b.dataset.tab); // トップにいるときはその場で
      jump = b.dataset.tab; location.hash = '#manual'; return;
    }
    if (b.dataset.fac !== undefined) {
      facility(b.dataset.fac);
      var box = document.getElementById('mnl-calls'); if (box) box.innerHTML = calls();
      return;
    }
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
