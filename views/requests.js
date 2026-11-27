/* requests の画面（自分の申請）
   承認待ち一覧の明細と同じカードの見た目で、状態（承認待ち・承認済み・差戻し・取消）を色つきの札で出す。
   承認待ちは取り消せる（確認はカードの中で）。myRequests に「明細」「コメント」があれば中身も出す。 */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, api = I.api, esc = I.esc, yen = I.yen, toast = I.toast;

  // 来たメニューを覚える（「メニューに戻る」用。approvals.js も使う）。hashchange は core の route より先にここで受ける
  var lastMenu = '', moved = false, MENUS = I.MENUS || ['menu', 'apply', 'status', 'task', 'users', 'shift', 'portal'];
  function menuOf(url) { var h = String(url || '').split('#')[1] || ''; return MENUS.indexOf(h) >= 0 ? '#' + h : ''; }
  lastMenu = menuOf(location.href);
  window.addEventListener('hashchange', function (e) { moved = true; var m = menuOf(e.oldURL); if (m) lastMenu = m; });
  I.apvLastMenu = function () { return lastMenu; };
  I.apvCameFromApp = function () { return moved; };
  function backHref() { return lastMenu || '#status'; }

  var STATUS = ['承認待ち', '承認済み', '差戻し', '取消'];
  var CLS = { '承認待ち': 'wait', '承認済み': 'ok', '差戻し': 'back', '取消': 'cancel' };
  var view = { list: [], filter: 'すべて', confirm: null };

  function loadingBar() {
    return '<div class="apv-loading" role="status"><span class="apv-spin" aria-hidden="true"></span>読み込み中...</div>';
  }
  function badge(s) {
    return '<span class="req-badge req-' + (CLS[s] || 'cancel') + '"><span class="req-dot" aria-hidden="true"></span>' + esc(s || '—') + '</span>';
  }
  function count(s) { return view.list.filter(function (r) { return r.状態 === s; }).length; }

  function summary() {
    return '<section class="apv-sum">' +
      '<p class="apv-sum-main">申請 ' + view.list.length + '件 / 承認待ち ' + count('承認待ち') + '件</p>' +
      '<div class="req-chips" role="group" aria-label="状態で絞り込む">' +
        ['すべて'].concat(STATUS).map(function (s) {
          var n = s === 'すべて' ? view.list.length : count(s);
          return '<button type="button" class="req-chip' + (view.filter === s ? ' is-on' : '') + '" data-filter="' + s + '" aria-pressed="' + (view.filter === s) + '">' +
            s + ' <span class="req-chip-n">' + n + '</span></button>';
        }).join('') +
      '</div>' +
    '</section>';
  }

  function contentLines(r) {
    var d = r.明細 || [];
    if (!d.length) return '';
    if (r.申請種類 === '経費') {
      var total = d.reduce(function (s, x) { return s + Number(x.金額 || 0); }, 0);
      return '<dl class="apv-dl"><dt>対象日</dt><dd>' + esc(d[0].対象日 || '—') + '</dd>' +
        '<dt>経費区分</dt><dd>' + esc(d[0].経費区分 || '—') + '</dd>' +
        ((r.小口先出 || d[0].小口先出) ? '<dt>小口先出</dt><dd>' + esc(r.小口先出 || d[0].小口先出) + '</dd>' : '') +
        '<dt class="apv-total">合計</dt><dd class="apv-num apv-total">' + yen(total) + '（' + d.length + '品）</dd>' +
        ((r.備考 || d[0].備考) ? '<dt>備考</dt><dd>' + esc(r.備考 || d[0].備考) + '</dd>' : '') + '</dl>';
    }
    return '<dl class="apv-dl">' + d.map(function (x) {
      var time = x.打刻時刻 ? '打刻 ' + x.打刻時刻 : (x.開始 || x.終了 ? (x.開始 || '') + '〜' + (x.終了 || '') : '');
      return '<dt>項目</dt><dd>' + esc(x.項目) + '</dd><dt>対象日</dt><dd>' + esc(x.対象日) + '</dd>' +
        (time ? '<dt>時間</dt><dd class="apv-num">' + esc(time) + '</dd>' : '') +
        (x.備考 ? '<dt>備考</dt><dd>' + esc(x.備考) + '</dd>' : '');
    }).join('') + '</dl>';
  }

  function stageText(r) {
    if (r.状態 === '承認待ち') return '<span class="apv-nw">承認段階：' + esc(r.現在段階 || '—') + (r.承認者 ? '（' + esc(r.承認者) + ' さん）' : '') + '</span>';
    return '';
  }

  function item(r) {
    var id = esc(r.申請ID), s = r.状態, ops = '';
    if (s === '承認待ち') {
      if (view.confirm === r.申請ID) {
        ops = '<div class="apv-confirm is-back" role="group" aria-label="確認">' +
          '<p>この申請を取り消します。取り消すと元に戻せません。もう一度出すときは新しく申請してください。</p>' +
          '<div class="apv-btns"><button type="button" class="apv-btn apv-btn-ghost" data-act="やめる">やめる</button>' +
          '<button type="button" class="apv-btn apv-btn-back" data-act="確定">取り消す</button></div></div>';
      } else {
        ops = '<div class="req-ops"><button type="button" class="req-cancelbtn" data-act="取消">申請を取り消す</button></div>';
      }
    }
    var note = '';
    if (s === '差戻し') note = '<div class="req-note req-note-back"><p class="req-note-h">差戻しの理由</p><p>' +
      esc(r.コメント || r.差戻しコメント || '理由は承認者に確認してください。') + '</p></div>';
    else if (s === '承認済み') note = '<p class="req-msg req-msg-ok">すべての承認が終わりました。</p>';
    else if (s === '取消') note = '<p class="req-msg">取り消した申請です。</p>';
    var meta = ['申請日時：' + esc(String(r.申請日時 || '').slice(0, 16)), '<span class="apv-nw">申請ID：' + id + '</span>'];
    var st = stageText(r); if (st) meta.push(st);
    return '<article class="apv-item req-item req-is-' + (CLS[s] || 'cancel') + '" data-id="' + id + '">' +
      '<div class="apv-item-head"><h3>' + esc(r.申請種類) + '申請</h3>' + badge(s) + '</div>' +
      '<p class="apv-meta">' + meta.join(' / ') + '</p>' +
      contentLines(r) + note + ops +
      '<div class="apv-err" role="alert"></div>' +
    '</article>';
  }

  function render() {
    var body = document.getElementById('req-body'); if (!body) return;
    var list = view.filter === 'すべて' ? view.list : view.list.filter(function (r) { return r.状態 === view.filter; });
    var cards;
    if (!view.list.length) cards = '<div class="apv-empty">まだ申請はありません。<br>経費・勤怠の申請は「申請する」から出せます。</div>';
    else if (!list.length) cards = '<div class="apv-empty">「' + esc(view.filter) + '」の申請はありません。</div>';
    else cards = '<section class="apv-detail">' + list.map(item).join('') + '</section>';
    body.innerHTML = summary() + cards;
  }

  function load() {
    api('myRequests').then(function (list) { view.list = list || []; render(); }).catch(function (e) {
      var body = document.getElementById('req-body'); if (!body) return;
      body.innerHTML = '<div class="apv-fail" role="alert"><p class="apv-fail-title">自分の申請を開けませんでした。</p><p>' +
        esc(e.message || '通信できませんでした。') + '</p><button type="button" class="apv-btn apv-btn-ghost" data-act="再読み込み">再読み込み</button></div>';
    });
  }

  function viewRequests() {
    view = { list: [], filter: 'すべて', confirm: null };
    app.innerHTML = '<h1 class="apv-title">自分の申請</h1>' +
      '<div class="apv-shell" id="req-body">' + loadingBar() + '</div>' +
      '<div class="req-foot"><a class="apv-menu" href="#apply">申請する</a><a class="apv-menu" href="' + backHref() + '">メニューに戻る</a></div>';
    load();
    app.addEventListener('click', onClick);
    I.cleanup.push(function () { app.removeEventListener('click', onClick); });
  }

  function onClick(e) {
    var t = e.target.closest('button'); if (!t || !app.contains(t)) return;
    if (t.dataset.filter) { view.filter = t.dataset.filter; view.confirm = null; render(); return; }
    var act = t.dataset.act; if (!act) return;
    if (act === '再読み込み') { document.getElementById('req-body').innerHTML = loadingBar(); load(); return; }
    var card = t.closest('.apv-item'); if (!card) return;
    var id = card.dataset.id;
    if (act === '取消') { view.confirm = id; render(); focus(id, '[data-act="確定"]'); return; }
    if (act === 'やめる') { view.confirm = null; render(); focus(id, '[data-act="取消"]'); return; }
    if (act === '確定') {
      card.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
      t.innerHTML = '<span class="apv-spin" aria-hidden="true"></span>取り消し中…';
      api('cancelRequest', { 申請ID: id }).then(function (res) {
        toast('取り消しました');
        view.list.forEach(function (r) { if (r.申請ID === id) { r.状態 = (res && res.状態) || '取消'; r.現在段階 = ''; } });
        view.confirm = null; render();
      }).catch(function (x) {
        view.confirm = null; render();
        var el = document.querySelector('.apv-item[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"] .apv-err');
        if (el) el.textContent = x.message || '取り消せませんでした。もう一度お試しください。';
      });
    }
  }
  function focus(id, sel) {
    var el = document.querySelector('.apv-item[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"] ' + sel);
    if (el) el.focus();
  }

  I.views.requests = viewRequests;
})();
