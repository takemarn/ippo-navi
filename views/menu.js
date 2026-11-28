/* menu の画面
   #menu   … 入口（ホーム）。あいさつ → 今やること（承認待ち・差戻し・結果待ち）→ リッチメニューと同じ6タイル → よく使う近道。
             LINE のリッチメニューを使わずブラウザで開いたとき用でもあるので、6タイルはリッチメニュー画像と同じ絵・並び。
   #status … 申請状況のメニュー
   各メニュー画面（#apply #status #task #shift #portal）の見出し（絵＋名前）も、ここの IPPO.menuHead が作る（core.js の subMenu が呼ぶ）。
   ほかのタイルの画面: #shift は views/shift.js、#users は views/clients.js、#task は views/task.js、#portal は views/portal.js
   タイルの名前・色は richmenu/tiles.js、絵は richmenu/art.js（リッチメニュー画像と共通。直すとどちらにも効く） */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, esc = I.esc, api = I.api, state = I.state;
  var TILES = window.IPPO_TILES || [];
  var ART = window.IPPO_ART || [];

  // タイルの絵。art.js が無いときは tiles.js の線画にする
  function art(t, cls) {
    var a = ART[t.no - 1];
    if (a) return '<svg class="' + cls + '" viewBox="0 0 240 200" aria-hidden="true" focusable="false">' + a + '</svg>';
    return '<svg class="' + cls + ' line" viewBox="0 0 64 64" aria-hidden="true" focusable="false" style="color:' + t.color + '">' + t.icon + '</svg>';
  }
  function tileOf(hash) { return TILES.filter(function (t) { return t.hash === hash; })[0]; }

  // タイルと見出しに出す「中で何ができるか」の一言（初めて開いた人が名前だけで迷わないように）。
  // tile = タイルの下の短い一言（幅320pxの3列で2行まで。| は折り返してよい所。語の途中で切れないように）、head = 各メニュー画面の見出しの下の説明
  var DESC = {
    apply: { tile: '立て替え・|遅刻・残業', head: '立て替えたお金（経費）や、遅刻・残業・休みなど（勤怠）を申請します。' },
    status: { tile: '出した申請の|結果', head: '自分が出した申請が、承認されたか・差し戻されたかを見られます。' },
    task: { tile: '本部への|手続き依頼', head: '利用者の入居・退院・指示書などの手続きを、本部事務に依頼します。' },
    users: { tile: '利用者の|情報', head: '利用者の情報を見たり、登録・修正を申請したりします。' },
    shift: { tile: '希望の提出・|確認', head: 'シフトの希望を出したり、決まったシフトを見たりします。' },
    portal: { tile: '規程・手順を|調べる', head: '規程やマニュアルを調べたり、AI に質問したりできます。' }
  };

  // '|' を折り返し位置（<wbr>）にする。CSS の word-break: keep-all と組み合わせて、ここ以外では切らない
  function wrapAt(t) { return esc(t).split('|').join('<wbr>'); }

  // 右向きの小さな矢印（丸の中）
  var ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 4.5L10 8l-3.5 3.5"/></svg>';

  // ---------- 入口（ホーム） ----------
  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  function greeting(h) { return h < 11 ? 'おはようございます' : h < 17 ? 'こんにちは' : 'おつかれさまです'; }
  function canApprove() { var r = state.me && state.me.役割; return r === '承認者' || r === '管理者'; }

  function hero() {
    var d = new Date(), me = state.me || {};
    var place = (state.options && state.options.施設 || []).length === 1 ? state.options.施設[0] : '';
    var sub = [place, me.職種].filter(Boolean).map(esc).join('<i aria-hidden="true">・</i>');
    return '<section class="hm-hero">' +
      '<img class="hm-logo" src="img/logo.png" alt="" width="56" height="56" onerror="this.remove()">' +
      '<div class="hm-hi"><p class="hm-date">' + (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WEEK[d.getDay()] + '）</p>' +
      '<h1>' + greeting(d.getHours()) + '<span>' + esc(me.氏名 || '') + (me.氏名 ? ' さん' : '') + '</span></h1>' +
      (sub ? '<p class="hm-sub">' + sub + '</p>' : '') + '</div>' +
      '<span class="hm-wave" aria-hidden="true"></span></section>';
  }

  // 今やること: 件数の行。tone で色（wait=オレンジ, back=赤, info=青）
  function todoRow(href, tone, title, note, n) {
    return '<a class="hm-todo-row ' + tone + '" href="' + href + '">' +
      '<span class="hm-todo-dot" aria-hidden="true"></span>' +
      '<span class="hm-todo-txt"><b>' + esc(title) + '</b><small>' + esc(note) + '</small></span>' +
      '<span class="hm-todo-n">' + n + '<small>件</small></span>' +
      '<span class="hm-arrow" aria-hidden="true">' + ARROW + '</span></a>';
  }
  function todoBox(inner) {
    return '<section class="hm-todo" aria-labelledby="hm-todo-h"><h2 id="hm-todo-h" class="hm-sec">今やること<small aria-hidden="true">TO DO</small></h2>' + inner + '</section>';
  }
  function loadTodo() {
    var gen = I.gen;
    var jobs = [api('myRequests').catch(function () { return null; })];
    if (canApprove()) jobs.push(api('pendingApprovals').catch(function () { return null; }));
    Promise.all(jobs).then(function (r) {
      var box = document.getElementById('hm-todo');
      if (!box || I.gen !== gen) return; // 画面を離れたあとに届いた返事は捨てる
      var mine = r[0], pend = r[1];
      if (mine === null && (!canApprove() || pend === null)) {
        box.innerHTML = todoBox('<p class="hm-todo-none">件数を読み込めませんでした。下のメニューからそれぞれの画面を開けます。</p>');
        return;
      }
      var rows = '';
      if (pend) {
        // 自分が承認する件数だけ数える（担当が無い古い形のデータは自分の分とみなす。approvals.js と同じ決まり）
        var n = pend.filter(function (x) { return x.担当 === undefined ? true : x.担当; }).length;
        if (n) rows += todoRow('#approvals', 'wait', 'あなたの承認待ち', '中を見て、承認か差戻しをしてください', n);
      }
      if (mine) {
        var back = mine.filter(function (x) { return x.状態 === '差戻し'; }).length;
        var wait = mine.filter(function (x) { return x.状態 === '承認待ち'; }).length;
        if (back) rows += todoRow('#requests', 'back', '差し戻された申請', '理由を見て、出し直してください', back);
        if (wait) rows += todoRow('#requests', 'info', '結果待ちの申請', '承認されるとここから消えます', wait);
      }
      box.innerHTML = todoBox(rows ? '<div class="hm-todo-list">' + rows + '</div>' :
        '<p class="hm-todo-none ok"><span aria-hidden="true">✓</span>今やることはありません。おつかれさまです。</p>');
    });
  }

  // 6タイル（リッチメニューと同じ 3列×2段）
  function tiles() {
    return '<nav class="hm-tiles" aria-label="メニュー">' + TILES.map(function (t) {
      return '<a class="hm-tile" href="#' + t.hash + '" style="--tint:' + t.tint + ';--tc:' + t.color + ';--badge:' + t.badge + '">' +
        '<span class="hm-tile-bg" aria-hidden="true"></span>' + art(t, 'hm-art') +
        '<b>' + esc(t.label) + '</b>' +
        // 前は英語の小見出し（7px）を出していたが、読めず意味も伝わらないので、日本語の一言にした（読み上げにも入れる）
        (DESC[t.hash] ? '<small>' + wrapAt(DESC[t.hash].tile) + '</small>' : '') +
        '<span class="hm-go" aria-hidden="true">' + ARROW + '</span></a>';
    }).join('') + '</nav>';
  }

  // よく使う近道（中の画面へ直接）。急変は赤
  var QUICK = [
    { href: '#requests', label: '自分の申請', ic: '<path d="M7 4h10a2 2 0 012 2v13a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"/><path d="M9 9h6M9 13h6M9 17h3"/>' },
    { href: '#shift-view', label: 'シフト確認', ic: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4M8 14h2M14 14h2M8 17h2"/>' },
    { href: '#ai', label: 'AIに聞く', ic: '<path d="M5 5h14a2 2 0 012 2v8a2 2 0 01-2 2h-7l-4 3v-3H5a2 2 0 01-2-2V7a2 2 0 012-2z"/><path d="M8 13l2-5 2 5M8.7 11.5h2.6M15 8v5"/>' },
    { href: '#manual-urgent', label: '急変時の|対応', urgent: true, ic: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17.2v.1"/>' }
  ];
  function quick() {
    return '<h2 class="hm-sec">よく使う<small aria-hidden="true">SHORTCUTS</small></h2><nav class="hm-quick" aria-label="よく使う">' +
      QUICK.filter(function (q) { return I.views[q.href.slice(1)]; }).map(function (q) {
        return '<a class="hm-q' + (q.urgent ? ' urgent' : '') + '" href="' + q.href + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true">' + q.ic + '</svg><span>' + wrapAt(q.label) + '</span></a>';
      }).join('') + '</nav>';
  }

  function viewMenu() {
    app.innerHTML = hero() +
      '<div id="hm-todo">' + todoBox('<div class="loading" role="status">読み込み中...</div>') + '</div>' +
      '<h2 class="hm-sec">メニュー<small aria-hidden="true">MENU</small></h2>' + tiles() +
      '<p class="hm-note">LINE のトーク画面の下にあるメニューと同じ並びです。</p>' +
      quick() +
      '<footer class="hm-foot"><img src="img/logo.png" alt="" width="20" height="20" onerror="this.remove()">株式会社IPPO</footer>';
    loadTodo();
  }

  // ---------- 各メニュー画面の見出し（core.js の subMenu から呼ばれる） ----------
  I.menuHead = function () {
    var t = tileOf((location.hash || '').slice(1));
    if (!t) return '<h1>メニュー</h1>';
    return '<header class="mh" style="--tint:' + t.tint + ';--tc:' + t.color + '">' +
      '<span class="mh-bg" aria-hidden="true"></span>' + art(t, 'mh-art') +
      '<div class="mh-txt"><small aria-hidden="true">' + esc(t.en) + '</small><h1>' + esc(t.label) + '</h1>' +
      '<p>' + esc(DESC[t.hash] ? DESC[t.hash].head : 'メニュー') + '</p></div></header>';
  };

  I.views.menu = viewMenu;
  // 申請状況: 「自分の申請」に差戻しの件数を赤い数字で出す（出し直しが要る申請があると分かるように）
  I.views.status = function () {
    I.subMenu([{ label: '自分の申請', href: '#requests' }]);
    var gen = I.gen;
    api('myRequests').then(function (list) {
      var n = (list || []).filter(function (x) { return x.状態 === '差戻し'; }).length;
      var a = app.querySelector('.mgroup a[href="#requests"]');
      if (!n || !a || I.gen !== gen) return;
      a.insertAdjacentHTML('beforeend', '<span class="badge" aria-hidden="true">差戻し ' + n + '</span>');
      a.setAttribute('aria-label', '自分の申請（差戻し ' + n + '件）');
    }).catch(function () {});
  };
})();
