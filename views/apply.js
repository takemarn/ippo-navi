/* apply の画面 */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, state = I.state, api = I.api, esc = I.esc, today = I.today, yen = I.yen, toast = I.toast,
    errorsBox = I.errorsBox, pill = I.pill, backLink = I.backLink, selectHtml = I.selectHtml, submit = I.submit, showError = I.showError, route = I.route;

  function viewApply() {
    app.innerHTML = backLink('#menu', 'メニュー') + '<h1>経費勤怠申請</h1>' +
      '<div class="list">' +
        '<a class="btn" href="#expense">経費申請</a>' +
        '<a class="btn" href="#attendance">勤怠申請</a>' +
        '<a class="btn" href="#requests" style="background:transparent;color:var(--accent)">自分の申請を見る</a>' +
      '</div>';
  }


  I.views.apply = viewApply;
})();
