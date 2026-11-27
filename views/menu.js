/* menu の画面 */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, state = I.state, api = I.api, esc = I.esc, today = I.today, yen = I.yen, toast = I.toast,
    errorsBox = I.errorsBox, pill = I.pill, backLink = I.backLink, selectHtml = I.selectHtml, submit = I.submit, showError = I.showError, route = I.route;

  var ICON = {
    apply: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
    approve: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>',
    shift: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    people: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.2 3.2 0 010 6.4M18 14.8c1.8.7 3 2.4 3.5 5.2"/></svg>',
    task: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h7"/><path d="M15 17l2 2 4-4"/></svg>',
    book: '<svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 016.5 3H20v15H6.5A2.5 2.5 0 004 20.5z"/><path d="M4 20.5A2.5 2.5 0 016.5 18H20v3H6.5"/></svg>'
  };

  function tile(href, icon, label, note) {
    if (!href) return '<div class="tile off" aria-disabled="true">' + ICON[icon] + label + '<small>' + note + '</small></div>';
    return '<a class="tile" href="' + href + '">' + ICON[icon] + label + (note ? '<small>' + note + '</small>' : '') + '</a>';
  }

  function viewMenu() {
    var canApprove = state.me.役割 === '承認者' || state.me.役割 === '管理者';
    app.innerHTML =
      '<h1>メニュー</h1>' +
      '<div class="tiles">' +
        tile('#apply', 'apply', '経費勤怠申請') +
        (canApprove ? tile('#approvals', 'approve', '承認待ち', '<span id="pcount"></span>') : tile('#requests', 'approve', '自分の申請')) +
        tile('', 'shift', 'シフト', '準備中') +
        tile('', 'people', '利用者', '準備中') +
        tile('', 'task', 'タスク', '準備中') +
        tile('', 'book', '社内ポータル', '準備中') +
      '</div>' +
      '<p class="muted">シフト・利用者・タスク・社内ポータルは、これから順に追加します。</p>';
    if (canApprove) api('pendingApprovals').then(function (list) {
      var el = document.getElementById('pcount');
      if (el && list.length) el.innerHTML = '<span class="badge">' + list.length + '件</span>';
    }).catch(function () {});
  }


  I.views.menu = viewMenu;
})();
