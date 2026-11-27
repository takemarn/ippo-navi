/* attendance の画面 */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, state = I.state, api = I.api, esc = I.esc, today = I.today, yen = I.yen, toast = I.toast,
    errorsBox = I.errorsBox, pill = I.pill, backLink = I.backLink, selectHtml = I.selectHtml, submit = I.submit, showError = I.showError, route = I.route;

  function viewAttendance() {
    var kinds = state.options.勤怠項目 || [];
    app.innerHTML = backLink('#apply', '経費勤怠申請') + '<h1>勤怠申請</h1>' +
      '<form id="f" class="card" novalidate>' +
        '<label>申請者<input value="' + esc(state.me.氏名) + '" disabled></label>' +
        '<label>項目<span class="req">必須</span>' + selectHtml('項目', kinds) + '</label>' +
        '<label>対象日<span class="req">必須</span><input type="date" id="対象日" value="' + today() + '"></label>' +
        '<div class="two" id="range"><label>開始<span class="req">必須</span><input type="time" id="開始"></label><label>終了<span class="req">必須</span><input type="time" id="終了"></label></div>' +
        '<label id="stamp" hidden>打刻時刻<span class="req">必須</span><input type="time" id="打刻時刻"></label>' +
        '<label>備考<span class="opt">任意</span><textarea id="備考" placeholder="特別休暇の場合は詳細を書いてください"></textarea></label>' +
        '<div id="err"></div>' +
        '<button type="submit">送信</button>' +
      '</form>';
    var kind = document.getElementById('項目');
    kind.addEventListener('change', function () {
      var stamp = /^打刻修正/.test(kind.value);
      document.getElementById('range').hidden = stamp;
      document.getElementById('stamp').hidden = !stamp;
    });
    document.getElementById('f').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = function (id) { return document.getElementById(id).value; };
      var stamp = /^打刻修正/.test(v('項目'));
      var data = { 項目: v('項目'), 対象日: v('対象日'), 備考: v('備考') };
      if (stamp) data.打刻時刻 = v('打刻時刻'); else { data.開始 = v('開始'); data.終了 = v('終了'); }
      var errs = [];
      if (!data.項目) errs.push('項目を選んでください');
      if (!data.対象日) errs.push('対象日を入れてください');
      if (stamp && !data.打刻時刻) errs.push('打刻時刻を入れてください');
      if (!stamp && (!data.開始 || !data.終了)) errs.push('時間（開始〜終了）を入れてください');
      submit(errs, 'submitAttendance', data);
    });
  }


  I.views.attendance = viewAttendance;
})();
