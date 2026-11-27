/* requests の画面 */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, state = I.state, api = I.api, esc = I.esc, today = I.today, yen = I.yen, toast = I.toast,
    errorsBox = I.errorsBox, pill = I.pill, backLink = I.backLink, selectHtml = I.selectHtml, submit = I.submit, showError = I.showError, route = I.route;

  function viewRequests() {
    app.innerHTML = backLink('#apply', '経費勤怠申請') + '<h1>自分の申請</h1><div id="list" class="list"><p class="loading">読み込み中…</p></div>';
    api('myRequests').then(function (list) {
      var box = document.getElementById('list');
      if (!list.length) { box.innerHTML = '<p class="muted">まだ申請はありません。</p>'; return; }
      box.innerHTML = list.map(function (r) {
        return '<div class="card"><div class="row"><h2>' + esc(r.申請種類) + '申請</h2>' + pill(r.状態) + '</div>' +
          '<p class="muted">' + esc(r.申請日時) + '　' + esc(r.申請ID) + '</p>' +
          (r.状態 === '承認待ち' ? '<button class="small danger" data-cancel="' + esc(r.申請ID) + '">取り消す</button>' : '') + '</div>';
      }).join('');
    }).catch(showError);
    app.addEventListener('click', onCancel);
    I.cleanup.push(function () { app.removeEventListener('click', onCancel); });
  }
  function onCancel(e) {
    var id = e.target.dataset && e.target.dataset.cancel;
    if (!id) return;
    if (e.target.dataset.sure !== '1') { e.target.dataset.sure = '1'; e.target.textContent = 'もう一度押すと取り消します'; return; }
    e.target.disabled = true;
    api('cancelRequest', { 申請ID: id }).then(function () { toast('取り消しました'); route(); }).catch(showError);
  }


  I.views.requests = viewRequests;
})();
