/* requests の画面（自分の申請。リッチメニュー2「申請状況」→「自分の申請」）
   承認待ち一覧（views/approvals.js）と同じ質感のカードで、自分が出した申請の今を見せる。
     - まとめ: 件数と状態の絞り込み（すべて・承認待ち・承認済み・差戻し・取消）。差し戻された申請があれば赤い案内を上に出す
     - カード: 種類の札・状態の札・何日前の申請か・進み具合（申請 → 承認 → 完了）・中身（明細）
     - 差戻し: 理由を目立たせ、同じ種類の申請画面へ「出し直す」ボタン
     - 承認待ち: 取り消せる（確認はカードの中で）
     - 読み込み中は仮の行（スケルトン）、空のとき・エラーのときの案内
   myRequests の形は変えていない（「明細」「コメント」「承認者」「現在段階」があれば使う）。 */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, api = I.api, esc = I.esc, yen = I.yen, toast = I.toast;

  // 「メニューに戻る」は core の共通部品（来たメニューへ戻る）。まだ無いときは同じ見た目の文字リンクで代用
  function backHtml(fallback) {
    if (I.backHtml) return I.backHtml();
    var href = (I.lastMenu && I.lastMenu()) || fallback;
    return '<a class="ipp-back" href="' + href + '">‹ メニューに戻る</a>';
  }

  var STATUS = ['承認待ち', '承認済み', '差戻し', '取消'];
  var CLS = { '承認待ち': 'wait', '承認済み': 'ok', '差戻し': 'back', '取消': 'cancel' };
  var TYPE_CLS = { 経費: 'exp', 勤怠: 'att', 利用者登録: 'cli', 利用者修正: 'cli', タスク: 'tsk' };
  // 差し戻された申請を出し直す画面（種類ごと）
  var REDO = { 経費: '#expense', 勤怠: '#attendance', 利用者登録: '#users', 利用者修正: '#users', タスク: '#task' };
  // sending = 取り消しを送っている申請ID（{ id: true }）。絞り込みなどで描き直しても押せないままにする（二重送信を防ぐ）
  var view = { list: [], filter: 'すべて', confirm: null, sending: {} };

  // ---------- 日付の道具 ----------
  function dayOf(s) {
    var m = String(s || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function waitText(s) {
    var d = dayOf(s); if (!d) return '';
    var t = new Date(); t = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    var n = Math.max(0, Math.round((t - d) / 86400000));
    return n === 0 ? '今日' : n === 1 ? '昨日' : n + '日前';
  }
  function when(s) {
    var m = String(s || '').match(/^\d{4}-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
    return m ? (+m[1]) + '/' + (+m[2]) + (m[3] ? ' ' + m[3] + ':' + m[4] : '') : String(s || '');
  }

  // 読み込み中: 本番と同じ形の仮の行
  function skeleton() {
    return '<div class="apv-skel" role="status" aria-label="自分の申請を読み込み中">' +
      '<div class="apv-sum"><span class="apv-sk apv-sk-l"></span><span class="apv-sk apv-sk-chips"></span></div>' +
      '<div class="apv-detail">' + [1, 2].map(function () {
        return '<div class="apv-sk-card"><span class="apv-sk apv-sk-m"></span><span class="apv-sk apv-sk-s"></span><span class="apv-sk apv-sk-box"></span></div>';
      }).join('') + '</div>' +
      '<p class="apv-sk-text"><span class="apv-spin" aria-hidden="true"></span>読み込み中...</p></div>';
  }
  function count(s) { return view.list.filter(function (r) { return r.状態 === s; }).length; }
  function typeBadge(t) { return '<span class="apv-type apv-type-' + (TYPE_CLS[t] || 'etc') + '">' + esc(t) + '</span>'; }

  function summary() {
    var back = count('差戻し'), wait = count('承認待ち');
    return '<section class="apv-sum" aria-label="件数のまとめ">' +
      '<p class="apv-sum-main">申請 ' + view.list.length + '件 / 承認待ち ' + wait + '件</p>' +
      (back && view.filter !== '差戻し'
        ? '<button type="button" class="req-alert" data-filter="差戻し"><span class="req-alert-ic" aria-hidden="true">!</span>' +
          '<span><b>差し戻された申請が ' + back + '件あります</b><small>理由を見て、出し直してください</small></span><span class="apv-chev" aria-hidden="true">›</span></button>'
        : '') +
      '<div class="req-chips" role="group" aria-label="状態で絞り込む">' +
        ['すべて'].concat(STATUS).map(function (s) {
          var n = s === 'すべて' ? view.list.length : count(s);
          return '<button type="button" class="req-chip req-chip-' + (CLS[s] || 'all') + (view.filter === s ? ' is-on' : '') + '" data-filter="' + s + '" aria-pressed="' + (view.filter === s) + '"' + (n || s === 'すべて' ? '' : ' data-zero="1"') + '>' +
            s + ' <span class="req-chip-n">' + n + '</span></button>';
        }).join('') +
      '</div>' +
    '</section>';
  }

  function contentLines(r) {
    var d = r.明細 || [];
    // 経費・勤怠以外（利用者登録・利用者修正・タスク）の中身は views/clients.js が描く
    if (r.申請種類 !== '経費' && r.申請種類 !== '勤怠' && I.bodyLines) return I.bodyLines(r);
    if (!d.length) return '';
    if (r.申請種類 === '経費') {
      var total = d.reduce(function (s, x) { return s + Number(x.金額 || 0); }, 0);
      var memo = r.備考 || d[0].備考;
      return '<dl class="apv-dl"><dt>対象日</dt><dd>' + esc(d[0].対象日 || '—') + '</dd>' +
        '<dt>経費区分</dt><dd>' + esc(d[0].経費区分 || '—') + '</dd>' +
        ((r.小口先出 || d[0].小口先出) ? '<dt>小口先出</dt><dd>' + esc(r.小口先出 || d[0].小口先出) + '</dd>' : '') +
        d.map(function (x) {
          return '<dt class="apv-line">' + esc(x.物品) + ' <span class="apv-qty">×' + esc(x.個数) + '</span></dt><dd class="apv-num">' + yen(x.金額) + '</dd>';
        }).join('') +
        '<dt class="apv-total">合計</dt><dd class="apv-num apv-total">' + yen(total) + '</dd>' +
        (memo ? '<dt class="apv-wide">備考</dt><dd class="apv-wide">' + esc(memo) + '</dd>' : '') + '</dl>';
    }
    return '<dl class="apv-dl">' + d.map(function (x) {
      var time = x.打刻時刻 ? '打刻 ' + x.打刻時刻 : (x.開始 || x.終了 ? (x.開始 || '') + '〜' + (x.終了 || '') : '');
      return '<dt>項目</dt><dd>' + esc(x.項目) + '</dd><dt>対象日</dt><dd>' + esc(x.対象日) + '</dd>' +
        (time ? '<dt>時間</dt><dd class="apv-num">' + esc(time) + '</dd>' : '') +
        (x.備考 ? '<dt class="apv-wide">備考</dt><dd class="apv-wide">' + esc(x.備考) + '</dd>' : '');
    }).join('') + '</dl>';
  }

  // 進み具合（申請 → 承認 → 完了）。今どこで止まっているかを一目で
  function steps(r) {
    var s = r.状態, mid = { 承認待ち: '承認中', 承認済み: '承認', 差戻し: '差戻し', 取消: '取消' }[s] || s;
    if (s === '承認待ち') mid += r.承認者 ? '<small>' + esc(r.承認者) + ' さん</small>' : (r.現在段階 ? '<small>段階 ' + esc(r.現在段階) + '</small>' : '');
    // 3つの点それぞれの色（済み・今ここ・差戻し・取消・まだ）
    var cls = { 承認待ち: ['is-done', 'is-now', ''], 承認済み: ['is-done', 'is-done', 'is-done'],
      差戻し: ['is-done', 'is-back', ''], 取消: ['is-done', 'is-cancel', ''] }[s] || ['', '', ''];
    return '<ol class="req-steps" aria-label="進み具合">' + ['申請', mid, '完了'].map(function (label, i) {
      return '<li class="req-step ' + cls[i] + '"><span class="req-step-dot" aria-hidden="true"></span><span class="req-step-l">' + label + '</span></li>';
    }).join('') + '</ol>';
  }

  function item(r) {
    var id = esc(r.申請ID), s = r.状態, ops = '';
    if (s === '承認待ち') {
      if (view.sending[r.申請ID]) {
        ops = '<div class="req-ops"><button type="button" class="req-cancelbtn" disabled aria-busy="true"><span class="apv-spin" aria-hidden="true"></span>取り消し中…</button></div>';
      } else if (view.confirm === r.申請ID) {
        ops = '<div class="apv-confirm is-back" role="group" aria-label="取り消しの確認">' +
          '<p>この' + esc(r.申請種類) + '申請を取り消します。取り消すと元に戻せません。もう一度出すときは新しく申請してください。</p>' +
          '<div class="apv-btns"><button type="button" class="apv-btn apv-btn-ghost" data-act="やめる">やめる</button>' +
          '<button type="button" class="apv-btn apv-btn-back" data-act="確定">取り消す</button></div></div>';
      } else {
        ops = '<div class="req-ops"><button type="button" class="req-cancelbtn" data-act="取消">申請を取り消す</button></div>';
      }
    }
    var note = '';
    if (s === '差戻し') {
      note = '<div class="req-note req-note-back"><p class="req-note-h">差戻しの理由' + (r.承認者 ? '（' + esc(r.承認者) + ' さん）' : '') + '</p><p class="req-note-b">' +
        esc(r.コメント || r.差戻しコメント || '理由は承認者に確認してください。') + '</p></div>' +
        (REDO[r.申請種類] ? '<a class="req-redo" href="' + REDO[r.申請種類] + '">' + esc(r.申請種類) + 'を出し直す<span aria-hidden="true">›</span></a>' : '');
    } else if (s === '承認済み') note = '<p class="req-msg req-msg-ok">すべての承認が終わりました。</p>';
    else if (s === '取消') note = '<p class="req-msg">取り消した申請です。</p>';
    var ago = waitText(r.申請日時);
    return '<article class="apv-item req-item req-is-' + (CLS[s] || 'cancel') + '" data-id="' + id + '">' +
      '<div class="apv-item-head"><h3>' + typeBadge(r.申請種類) + '<span>' + esc(r.申請種類) + '申請</span></h3>' + I.pill(s) + '</div>' +
      '<p class="apv-meta"><span>申請日時：' + esc(when(r.申請日時)) + (ago ? '（' + ago + '）' : '') + '</span><span>申請ID：' + id + '</span></p>' +
      steps(r) + contentLines(r) + note + ops +
      '<div class="apv-err" role="alert"></div>' +
    '</article>';
  }

  function render() {
    var body = document.getElementById('req-body'); if (!body) return;
    var list = view.filter === 'すべて' ? view.list : view.list.filter(function (r) { return r.状態 === view.filter; });
    var cards;
    if (!view.list.length) {
      cards = '<div class="apv-empty"><span class="apv-empty-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 4h10a2 2 0 012 2v13a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"/><path d="M9 9h6M9 13h6M9 17h3"/></svg></span>' +
        '<p class="apv-empty-h">まだ申請はありません</p><p>出した申請（経費・勤怠・利用者の登録や修正・タスク依頼）は、ここで進み具合を見られます。</p></div>';
    } else if (!list.length) {
      cards = '<div class="apv-empty"><p class="apv-empty-h">「' + esc(view.filter) + '」の申請はありません</p>' +
        '<button type="button" class="apv-btn apv-btn-ghost" data-filter="すべて">すべての申請を見る</button></div>';
    } else cards = '<section class="apv-detail" aria-label="申請の一覧">' + list.map(item).join('') + '</section>';
    body.innerHTML = summary() + cards;
  }

  function load() {
    var gen = I.gen;
    api('myRequests').then(function (list) {
      if (gen !== I.gen) return;
      // 新しい順に並べる（GAS の返す順に頼らない）
      view.list = (list || []).slice().sort(function (a, b) { return String(b.申請日時 || '').localeCompare(String(a.申請日時 || '')); });
      render();
    }).catch(function (e) {
      if (gen !== I.gen) return;
      var body = document.getElementById('req-body'); if (!body) return;
      body.innerHTML = '<div class="apv-fail" role="alert"><span class="apv-fail-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/></svg></span>' +
        '<p class="apv-fail-title">自分の申請を開けませんでした</p><p>' +
        esc(e.message || '通信できませんでした。') + '<br>電波の良い所で、もう一度読み込んでください。</p>' +
        '<button type="button" class="apv-btn apv-btn-ghost" data-act="再読み込み">もう一度読み込む</button></div>';
    });
  }

  function viewRequests() {
    view = { list: [], filter: 'すべて', confirm: null, sending: {} };
    app.innerHTML = '<h1 class="apv-title">自分の申請</h1>' +
      '<div class="apv-shell" id="req-body">' + skeleton() + '</div>' +
      '<a class="req-new" href="#apply"><span aria-hidden="true">＋</span> 経費・勤怠を申請する</a>' + backHtml('#status');
    load();
    app.addEventListener('click', onClick);
    I.cleanup.push(function () { app.removeEventListener('click', onClick); });
  }

  function onClick(e) {
    var t = e.target.closest('button'); if (!t || !app.contains(t)) return;
    if (t.dataset.filter) {
      view.filter = t.dataset.filter; view.confirm = null; render();
      var on = document.querySelector('.req-chip.is-on'); if (on) on.focus();
      return;
    }
    var act = t.dataset.act; if (!act) return;
    if (act === '再読み込み') { document.getElementById('req-body').innerHTML = skeleton(); load(); return; }
    var card = t.closest('.apv-item'); if (!card) return;
    var id = card.dataset.id;
    if (act === '取消') { view.confirm = id; render(); focus(id, '[data-act="確定"]'); return; }
    if (act === 'やめる') { view.confirm = null; render(); focus(id, '[data-act="取消"]'); return; }
    if (act === '確定') {
      if (view.sending[id]) return;
      view.sending[id] = true; view.confirm = null; render();
      var gen = I.gen;
      api('cancelRequest', { 申請ID: id }).then(function (res) {
        if (gen !== I.gen) return;
        delete view.sending[id];
        toast('取り消しました');
        view.list.forEach(function (r) { if (r.申請ID === id) { r.状態 = (res && res.状態) || '取消'; r.現在段階 = ''; } });
        render();
      }).catch(function (x) {
        if (gen !== I.gen) return;
        delete view.sending[id]; render();
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
