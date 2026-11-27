/* expense の画面 */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, state = I.state, api = I.api, esc = I.esc, today = I.today, yen = I.yen, toast = I.toast,
    errorsBox = I.errorsBox, pill = I.pill, backLink = I.backLink, selectHtml = I.selectHtml, submit = I.submit, showError = I.showError, route = I.route;

  function viewExpense() {
    var o = state.options;
    var rows = [{}];
    app.innerHTML = backLink('#apply', '経費勤怠申請') + '<h1>経費申請</h1>' +
      '<form id="f" class="card" novalidate>' +
        '<label>申請者<input value="' + esc(state.me.氏名) + '" disabled></label>' +
        '<div class="two">' +
          '<label>対象日<span class="req">必須</span><input type="date" id="対象日" value="' + today() + '"></label>' +
          '<label>小口先出<span class="req">必須</span>' + selectHtml('小口先出', o.小口先出 || []) + '</label>' +
        '</div>' +
        '<label>経費区分<span class="req">必須</span>' + selectHtml('経費区分', o.経費区分 || []) + '</label>' +
        '<div id="items" class="list"></div>' +
        '<button type="button" class="sub" id="add">＋ 物品を追加</button>' +
        '<div class="row"><strong>合計</strong><strong id="total">0円</strong></div>' +
        '<label>備考<span class="opt">任意</span><textarea id="備考"></textarea></label>' +
        '<div id="err"></div>' +
        '<button type="submit" id="send">送信</button>' +
      '</form>';

    function drawItems() {
      var box = document.getElementById('items');
      box.innerHTML = rows.map(function (r, i) {
        return '<div class="item" data-i="' + i + '">' +
          '<div class="item-head">物品 ' + (i + 1) + (rows.length > 1 ? '<button type="button" class="small danger" data-del="' + i + '">削除</button>' : '') + '</div>' +
          '<label>物品<span class="req">必須</span>' + selectHtml('物品_' + i, o.物品 || [], r.物品) + '</label>' +
          (r.物品 === 'フリー入力' ? '<label>物品名<span class="req">必須</span><input id="自由入力_' + i + '" value="' + esc(r.自由入力 || '') + '"></label>' : '') +
          '<div class="two">' +
            '<label>個数<span class="req">必須</span><input type="number" inputmode="numeric" min="1" id="個数_' + i + '" value="' + esc(r.個数 || '') + '"></label>' +
            '<label>金額（円）<span class="req">必須</span><input type="number" inputmode="numeric" min="0" id="金額_' + i + '" value="' + esc(r.金額 === undefined ? '' : r.金額) + '"></label>' +
          '</div></div>';
      }).join('');
      updateTotal();
    }
    function collect() {
      rows = rows.map(function (_, i) {
        var g = function (k) { var el = document.getElementById(k + '_' + i); return el ? el.value : undefined; };
        return { 物品: g('物品'), 自由入力: g('自由入力'), 個数: g('個数'), 金額: g('金額') };
      });
    }
    function updateTotal() {
      var sum = 0;
      rows.forEach(function (_, i) { var el = document.getElementById('金額_' + i); sum += Number(el && el.value || 0); });
      document.getElementById('total').textContent = yen(sum);
    }
    drawItems();
    var form = document.getElementById('f');
    form.addEventListener('input', function (e) { if (/^金額_/.test(e.target.id)) updateTotal(); });
    form.addEventListener('change', function (e) { if (/^物品_/.test(e.target.id)) { collect(); drawItems(); } });
    form.addEventListener('click', function (e) {
      if (e.target.id === 'add') { collect(); rows.push({}); drawItems(); }
      if (e.target.dataset && e.target.dataset.del !== undefined) { collect(); rows.splice(Number(e.target.dataset.del), 1); drawItems(); }
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault(); collect();
      var v = function (id) { return document.getElementById(id).value; };
      var data = { 対象日: v('対象日'), 小口先出: v('小口先出'), 経費区分: v('経費区分'), 物品: rows.map(function (r) {
        return { 物品: r.物品, 自由入力: r.自由入力, 個数: Number(r.個数), 金額: r.金額 === '' ? '' : Number(r.金額) };
      }), 備考: v('備考') };
      var errs = [];
      if (!data.対象日) errs.push('対象日を入れてください');
      if (!data.小口先出) errs.push('小口先出を選んでください');
      if (!data.経費区分) errs.push('経費区分を選んでください');
      data.物品.forEach(function (it, i) {
        if (!it.物品 || (it.物品 === 'フリー入力' && !it.自由入力)) errs.push((i + 1) + '行目の物品を選んでください');
        if (!(it.個数 > 0)) errs.push((i + 1) + '行目の個数を入れてください');
        if (it.金額 === '' || !(it.金額 >= 0)) errs.push((i + 1) + '行目の金額を入れてください');
      });
      submit(errs, 'submitExpense', data);
    });
  }


  I.views.expense = viewExpense;
})();
