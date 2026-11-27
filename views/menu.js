/* menu の画面
   #menu   … 入口。LINE のリッチメニューを使わずブラウザで開いたとき用に、リッチメニューと同じ6タイルを並べる
   #status … 申請状況のメニュー
   #task #users #shift #portal … まだ作っていない機能のメニュー（項目は「準備中」） */
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
  I.views.task = function () { I.subMenu([{ label: '施設→本部事務' }, { label: '介護タスク' }]); };
  I.views.users = function () { I.subMenu([{ label: '利用者を探す' }, { label: '利用者の新規登録' }, { label: '記録検索' }]); };
  I.views.shift = function () { I.subMenu([{ label: 'シフト提出' }, { label: 'シフト確認' }]); };
  I.views.portal = function () {
    I.subMenu([{ label: '就業規則・組織図・福利厚生' }, { label: '駐車場ナビ' }, { label: '看護AI' }, { label: '日報' }, { label: '経営資料' }]);
  };
})();
