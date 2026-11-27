/* approvals の画面 */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, state = I.state, api = I.api, esc = I.esc, today = I.today, yen = I.yen, toast = I.toast,
    errorsBox = I.errorsBox, pill = I.pill, backLink = I.backLink, selectHtml = I.selectHtml, submit = I.submit, showError = I.showError, route = I.route;

  function viewApprovals() {
    app.innerHTML = backLink('#menu', 'メニュー') + '<h1>承認待ち</h1><div id="list" class="list"><p class="loading">読み込み中…</p></div>';
    api('pendingApprovals').then(function (list) {
      var box = document.getElementById('list');
      if (!list.length) { box.innerHTML = '<p class="muted">承認待ちの申請はありません。</p>'; return; }
      box.innerHTML = list.map(function (r) {
        var lines = (r.明細 || []).map(function (d) {
          if (r.申請種類 === '経費') return '<dt>' + esc(d.物品) + ' ×' + esc(d.個数) + '</dt><dd>' + yen(d.金額) + '</dd>';
          return '<dt>' + esc(d.項目) + '</dt><dd>' + esc(d.対象日) + ' ' + esc(d.打刻時刻 || (d.開始 + '〜' + d.終了)) + (d.備考 ? '　' + esc(d.備考) : '') + '</dd>';
        }).join('');
        var total = r.申請種類 === '経費' ? (r.明細 || []).reduce(function (s, d) { return s + Number(d.金額 || 0); }, 0) : null;
        return '<div class="card" data-id="' + esc(r.申請ID) + '">' +
          '<div class="row"><h2>' + esc(r.申請種類) + '申請　' + esc(r.申請者) + '</h2><span class="muted">' + esc(r.現在段階) + '段目</span></div>' +
          '<p class="muted">' + esc(r.申請日時) + '　' + esc(r.申請ID) + '</p>' +
          '<dl class="detail">' + lines + (total !== null ? '<dt><strong>合計</strong></dt><dd><strong>' + yen(total) + '</strong></dd>' : '') + '</dl>' +
          '<label>コメント<span class="opt">差戻しのときは必須</span><textarea class="cmt"></textarea></label>' +
          '<div class="actions"><button class="sub danger" data-act="差戻し">差戻し</button><button data-act="承認">承認</button></div>' +
          '<div class="err"></div></div>';
      }).join('');
    }).catch(showError);
    app.addEventListener('click', onDecide);
    I.cleanup.push(function () { app.removeEventListener('click', onDecide); });
  }
  function onDecide(e) {
    var act = e.target.dataset && e.target.dataset.act;
    if (!act) return;
    var card = e.target.closest('.card');
    var cmt = card.querySelector('.cmt').value.trim();
    var err = card.querySelector('.err');
    if (act === '差戻し' && !cmt) { err.innerHTML = '<div class="errors">差戻しの理由をコメントに書いてください</div>'; return; }
    card.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    api('decide', { 申請ID: card.dataset.id, 結果: act, コメント: cmt }).then(function () {
      toast(act === '承認' ? '承認しました' : '差し戻しました'); card.remove();
      if (!document.querySelector('#list .card')) document.getElementById('list').innerHTML = '<p class="muted">承認待ちの申請はありません。</p>';
    }).catch(function (x) {
      card.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
      err.innerHTML = '<div class="errors">' + esc(x.message) + '</div>';
    });
  }


  I.views.approvals = viewApprovals;
})();
