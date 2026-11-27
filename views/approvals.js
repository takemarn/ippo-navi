/* approvals の画面（承認待ち一覧）
   3段構成: 未承認件数と承認者数 → 承認者ごとの件数 → 申請の明細（承認・差戻しボタンつき）
   pendingApprovals の各行に「承認者」（いまの段階の承認者の氏名）と「担当」（自分が承認できるか）があれば使う。
   無いとき（今の GAS）は「自分が承認する段階の申請」とみなし、承認者は自分として数える。 */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, state = I.state, api = I.api, esc = I.esc, yen = I.yen, toast = I.toast;

  var view = { list: [], who: null, open: null, confirm: null }; // who = 明細を開いている承認者名、open = 確認を出している申請ID

  // ---------- データの組み立て ----------
  function meName() { return (state.me && state.me.氏名) || '自分'; }
  function approverOf(r) { return r.承認者 || r.承認者氏名 || (mine(r) ? meName() : '承認者未設定'); }
  function mine(r) {
    if (state.me && r.申請者職員ID && r.申請者職員ID === state.me.職員ID) return false; // 自分の申請は承認できない
    return r.担当 === undefined ? true : !!r.担当;
  }
  function groups(list) {
    var map = {}, order = [];
    list.forEach(function (r) {
      var k = approverOf(r);
      if (!map[k]) { map[k] = { name: k, items: [], mine: 0 }; order.push(k); }
      map[k].items.push(r);
      if (mine(r)) map[k].mine++;
    });
    // 自分が担当する承認者（＝自分）を先頭に、あとは件数の多い順
    return order.map(function (k) { return map[k]; }).sort(function (a, b) {
      return (b.name === meName()) - (a.name === meName()) || b.items.length - a.items.length;
    });
  }

  // ---------- 表示の部品 ----------
  function loadingBar() {
    return '<div class="apv-loading" role="status"><span class="apv-spin" aria-hidden="true"></span>読み込み中...</div>';
  }
  function summary(list) {
    var g = groups(list), my = list.filter(mine).length;
    return '<section class="apv-sum">' +
      '<p class="apv-sum-main">未承認 ' + list.length + '件 / 承認者 ' + g.length + '名</p>' +
      '<p class="apv-sum-sub">あなたが承認する申請：<strong>' + my + '件</strong></p>' +
    '</section>';
  }
  function approverList(list) {
    var g = groups(list);
    if (!g.length) return '<div class="apv-empty">承認待ちの申請はありません。</div>';
    return '<ul class="apv-who">' + g.map(function (x) {
      return '<li><button type="button" class="apv-who-row" data-who="' + esc(x.name) + '">' +
        '<span class="apv-who-name">' + esc(x.name) + (x.mine ? '<span class="apv-you">あなた</span>' : '') + '</span>' +
        '<span class="apv-who-count">' + x.items.length + '件<span class="apv-chev" aria-hidden="true">›</span></span>' +
      '</button></li>';
    }).join('') + '</ul>';
  }
  function fmtDate(s) { return String(s || '').slice(0, 16); }
  function contentLines(r) {
    var d = r.明細 || [];
    if (r.申請種類 === '経費') {
      var total = d.reduce(function (s, x) { return s + Number(x.金額 || 0); }, 0);
      var head = d[0] || {}, kind = r.小口先出 || head.小口先出, memo = r.備考 || head.備考;
      return '<dl class="apv-dl">' +
        '<dt>対象日</dt><dd>' + esc(head.対象日 || '—') + '</dd>' +
        '<dt>経費区分</dt><dd>' + esc(head.経費区分 || '—') + '</dd>' +
        (kind ? '<dt>小口先出</dt><dd>' + esc(kind) + '</dd>' : '') +
        d.map(function (x) {
          return '<dt>' + esc(x.物品 === 'フリー入力' && x.自由入力 ? x.自由入力 : x.物品) + ' ×' + esc(x.個数) + '</dt><dd class="apv-num">' + yen(x.金額) + '</dd>';
        }).join('') +
        '<dt class="apv-total">合計</dt><dd class="apv-num apv-total">' + yen(total) + '</dd>' +
        (memo ? '<dt>備考</dt><dd>' + esc(memo) + '</dd>' : '') +
      '</dl>';
    }
    return '<dl class="apv-dl">' + d.map(function (x) {
      var time = x.打刻時刻 ? '打刻 ' + x.打刻時刻 : (x.開始 || x.終了 ? (x.開始 || '') + '〜' + (x.終了 || '') : '');
      return '<dt>項目</dt><dd>' + esc(x.項目) + '</dd>' +
        '<dt>対象日</dt><dd>' + esc(x.対象日) + '</dd>' +
        (time ? '<dt>時間</dt><dd class="apv-num">' + esc(time) + '</dd>' : '') +
        (x.備考 ? '<dt>備考</dt><dd>' + esc(x.備考) + '</dd>' : '');
    }).join('') + '</dl>';
  }
  function item(r) {
    var can = mine(r), id = esc(r.申請ID);
    var ops;
    if (!can) {
      ops = '<p class="apv-note">' + esc(approverOf(r)) + ' さんが承認する段階です。あなたは見るだけです。</p>';
    } else if (view.confirm && view.confirm.id === r.申請ID && view.confirm.act === '差戻し') {
      // 差戻し: 押したときだけコメント欄を開く（理由は必須）
      ops = '<div class="apv-confirm is-back" role="group" aria-label="差戻しの理由">' +
        '<div class="apv-label"><label for="cmt-' + id + '">差戻しの理由</label><span class="apv-opt">(必須)</span></div>' +
        '<textarea id="cmt-' + id + '" class="apv-cmt" rows="3" placeholder="申請者に届きます。直してほしい点を書いてください">' + esc(view.cmts[r.申請ID] || '') + '</textarea>' +
        '<div class="apv-err" role="alert"></div>' +
        '<div class="apv-btns"><button type="button" class="apv-btn apv-btn-ghost" data-act="やめる">やめる</button>' +
        '<button type="button" class="apv-btn apv-btn-back" data-act="確定">差し戻す</button></div>' +
      '</div>';
    } else if (view.confirm && view.confirm.id === r.申請ID) {
      ops = '<div class="apv-confirm" role="group" aria-label="確認">' +
        '<p>この申請を承認します。よろしいですか？</p>' +
        '<div class="apv-btns"><button type="button" class="apv-btn apv-btn-ghost" data-act="やめる">やめる</button>' +
        '<button type="button" class="apv-btn apv-btn-ok" data-act="確定">承認する</button></div>' +
      '</div>';
    } else {
      ops = '<div class="apv-btns"><button type="button" class="apv-btn apv-btn-backline" data-act="差戻し">差戻し</button>' +
        '<button type="button" class="apv-btn apv-btn-ok" data-act="承認">承認</button></div>';
    }
    return '<article class="apv-item' + (can ? '' : ' is-view') + '" data-id="' + id + '">' +
      '<div class="apv-item-head"><h3>' + esc(r.申請種類) + '申請</h3>' +
        (can ? '<span class="apv-tag apv-tag-mine">あなたが承認</span>' : '<span class="apv-tag">閲覧のみ</span>') + '</div>' +
      '<p class="apv-meta">申請者：' + esc(r.申請者 || '—') + ' / 申請日時：' + esc(fmtDate(r.申請日時)) +
        ' / <span class="apv-nw">申請ID：' + id + '</span> / <span class="apv-nw">承認段階：' + esc(r.現在段階 || '—') + '</span></p>' +
      contentLines(r) + ops +
      (ops.indexOf('apv-err') < 0 ? '<div class="apv-err" role="alert"></div>' : '') +
    '</article>';
  }
  function detail(list) {
    var g = groups(list).filter(function (x) { return x.name === view.who; })[0];
    var items = g ? g.items : [];
    return '<button type="button" class="apv-backpill" data-act="戻る"><span aria-hidden="true">‹</span> 承認者一覧へ戻る</button>' +
      '<section class="apv-detail"><h2>' + esc(view.who) + '（' + items.length + '件）</h2>' +
      (items.length ? items.map(item).join('') : '<div class="apv-empty">この承認者の承認待ちはありません。</div>') +
      '</section>';
  }

  // ---------- 描画 ----------
  function render() {
    var body = document.getElementById('apv-body');
    if (!body) return;
    if (view.who && !view.list.some(function (r) { return approverOf(r) === view.who; })) view.who = null;
    body.innerHTML = summary(view.list) + (view.who ? detail(view.list) : approverList(view.list));
  }
  function saveComments() {
    document.querySelectorAll('.apv-item').forEach(function (el) {
      var t = el.querySelector('.apv-cmt'); if (t) view.cmts[el.dataset.id] = t.value;
    });
  }

  // 「メニューに戻る」は core の共通部品（来たメニューへ戻る）。まだ無いときは同じ見た目の文字リンクで代用
  function backHtml() {
    if (I.backHtml) return I.backHtml();
    return '<a class="ipp-back" href="' + ((I.lastMenu && I.lastMenu()) || '#menu') + '">‹ メニューに戻る</a>';
  }

  function viewApprovals() {
    view = { list: [], who: null, confirm: null, cmts: {} };
    app.innerHTML = '<h1 class="apv-title">承認待ち一覧</h1>' +
      '<div class="apv-shell" id="apv-body">' + loadingBar() + '</div>' +
      backHtml();
    load();
    app.addEventListener('click', onClick);
    app.addEventListener('input', onInput);
    I.cleanup.push(function () { app.removeEventListener('click', onClick); app.removeEventListener('input', onInput); });
  }
  function onInput(e) {
    if (!e.target.classList.contains('apv-cmt') || !e.target.value.trim()) return;
    e.target.classList.remove('is-error');
    var err = e.target.closest('.apv-item').querySelector('.apv-err'); if (err) err.textContent = '';
  }
  function load() {
    api('pendingApprovals').then(function (list) {
      view.list = list || []; render();
    }).catch(function (e) {
      var body = document.getElementById('apv-body'); if (!body) return;
      var why = e.code === 403 ? '承認者・管理者だけが開けます。必要なときは管理者へ確認してください。' : esc(e.message || '通信できませんでした。');
      body.innerHTML = '<div class="apv-fail" role="alert"><p class="apv-fail-title">承認待ち一覧を開けませんでした。</p><p>' + why + '</p>' +
        (e.code === 403 ? '' : '<button type="button" class="apv-btn apv-btn-ghost" data-act="再読み込み">再読み込み</button>') + '</div>';
    });
  }

  function onClick(e) {
    var t = e.target.closest('button'); if (!t || !app.contains(t)) return;
    if (t.dataset.who) { view.who = t.dataset.who; view.confirm = null; render(); window.scrollTo(0, 0); return; }
    var act = t.dataset.act; if (!act) return;
    if (act === '再読み込み') { document.getElementById('apv-body').innerHTML = loadingBar(); load(); return; }
    if (act === '戻る') { saveComments(); view.who = null; view.confirm = null; render(); window.scrollTo(0, 0); return; }
    var card = t.closest('.apv-item'); if (!card) return;
    var id = card.dataset.id, err = card.querySelector('.apv-err');
    if (act === '承認' || act === '差戻し') {
      saveComments(); view.confirm = { id: id, act: act }; render();
      focusIn(id, act === '差戻し' ? '.apv-cmt' : '[data-act="確定"]'); return;
    }
    if (act === 'やめる') { saveComments(); view.confirm = null; render(); focusIn(id, '[data-act="承認"]'); return; }
    if (act === '確定') {
      var c = view.confirm; if (!c) return;
      var box = card.querySelector('.apv-cmt'), cmt = box ? box.value.trim() : '';
      if (c.act === '差戻し' && !cmt) {
        err.textContent = '差戻しの理由を書いてください。';
        box.classList.add('is-error'); box.focus(); return;
      }
      saveComments();
      card.querySelectorAll('button, textarea').forEach(function (b) { b.disabled = true; });
      t.innerHTML = '<span class="apv-spin" aria-hidden="true"></span>送信中…';
      api('decide', { 申請ID: c.id, 結果: c.act, コメント: cmt }).then(function () {
        toast(c.act === '承認' ? '承認しました' : '差し戻しました');
        view.list = view.list.filter(function (r) { return r.申請ID !== c.id; });
        delete view.cmts[c.id]; view.confirm = null; render();
      }).catch(function (x) {
        if (c.act !== '差戻し') view.confirm = null;
        render();
        var el = document.querySelector('.apv-item[data-id="' + cssEsc(c.id) + '"] .apv-err');
        if (el) el.textContent = x.message || '送信できませんでした。もう一度お試しください。';
      });
    }
  }
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"'); }
  function focusIn(id, sel) {
    var el = document.querySelector('.apv-item[data-id="' + cssEsc(id) + '"] ' + sel);
    if (el) el.focus();
  }

  I.views.approvals = viewApprovals;
})();
