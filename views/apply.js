/* apply の画面: 経費勤怠申請のメニュー（参考アプリと同じく 経費申請／勤怠申請 ＋ 最下段に承認待ち一覧） */
(function () {
  'use strict';
  var I = window.IPPO;

  function viewApply() {
    I.subMenu([
      { label: '経費申請', href: '#expense' },
      { label: '勤怠申請', href: '#attendance' }
    ]);
  }

  I.views.apply = viewApply;
})();
