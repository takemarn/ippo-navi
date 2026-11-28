/* menu の画面
   #menu   … 入口。LINE のリッチメニューを使わずブラウザで開いたとき用に、リッチメニューと同じ6タイルを並べる
   #status … 申請状況のメニュー
   ほかのタイルの画面: #shift は views/shift.js、#users は views/clients.js、#task は views/task.js、#portal は views/portal.js */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, esc = I.esc;
  var TILES = window.IPPO_TILES || [];

  function icon(t) {
    return '<svg class="ticon" viewBox="0 0 64 64" aria-hidden="true" style="color:' + t.color + '">' + t.icon + '</svg>';
  }

  function viewMenu() {
    app.innerHTML = '<h1>メニュー</h1>' +
      '<nav class="tiles" aria-label="メニュー">' + TILES.map(function (t) {
        return '<a class="tile" href="#' + t.hash + '" style="--tint:' + t.tint + ';--badge:' + t.badge + '">' +
          '<span class="tblob" aria-hidden="true"></span>' + icon(t) +
          '<b class="tlabel">' + esc(t.label) + '</b><small class="ten" aria-hidden="true">' + esc(t.en) + '</small>' +
          '<span class="tno" aria-hidden="true">' + t.no + '</span></a>';
      }).join('') + '</nav>' +
      '<p class="tiles-note">LINE のトーク画面下のメニューと同じ並びです。</p>';
  }

  I.views.menu = viewMenu;
  I.views.status = function () { I.subMenu([{ label: '自分の申請', href: '#requests' }]); };
})();
