/* approvals の画面（承認待ち一覧）。運営の承認者が毎日使う管理側の画面。
   構成は参考アプリと同じ3段: ①件数のまとめ → ②承認者ごとの件数 → ③その人の申請カード（承認・差戻しつき）。
   参考アプリより足したもの（「だれの・何を・いつまでに」が一目で分かるように）:
     - まとめに「あなたが承認する件数」「3日以上たっている件数」「種類ごとの件数」と、自分の分へすぐ行くボタン・最新にするボタン
     - 承認者の行に 種類の内訳 と いちばん古い申請が何日前か（古いものは橙の印）
     - 申請カードは古い順。申請者を大きく、何日前の申請か・予定日まであと何日か を札で出す
     - 承認は確認つき（だれの何を承認するかを文で出す）、差戻しは理由必須＋よく使う理由の一言ボタン
     - 読み込み中は形だけの仮の行（スケルトン）、空のとき・エラーのとき（権限なし／通信）を分けて案内
   データの形（GAS の pendingApprovals / decide）は変えていない。
   pendingApprovals の各行に「承認者」（いまの段階の承認者の氏名）と「担当」（自分が承認できるか）があれば使う。
   無いとき（今の GAS）は「自分が承認する段階の申請」とみなし、承認者は自分として数える。 */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, state = I.state, api = I.api, esc = I.esc, yen = I.yen, toast = I.toast;

  var OLD_DAYS = 3; // この日数以上たった申請を「早めに見てほしい」印にする
  var TYPE_CLS = { 経費: 'exp', 勤怠: 'att', 利用者登録: 'cli', 利用者修正: 'cli', タスク: 'tsk' };
  // 差戻しの理由によく使う一言（押すと理由の欄に足す）
  var PHRASES = ['金額を確認してください', '日付・時間を確認してください', '領収書を確認させてください', '内容をもう少し詳しく書いてください'];

  // who = 明細を開いている承認者名、confirm = 確認を出している { id, act }、cmts = 書きかけの差戻し理由、at = 読み込んだ時刻
  var view = { list: [], who: null, confirm: null, cmts: {}, at: null };

  // ---------- 日付の道具（GAS は 'YYYY-MM-DD HH:mm:ss' の文字で返す） ----------
  function dayOf(s) {
    var m = String(s || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function todayDate() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function diffDays(a, b) { return Math.round((b - a) / 86400000); }
  function md(s) { var d = dayOf(s); return d ? (d.getMonth() + 1) + '/' + d.getDate() : ''; }
  function hm(s) { var m = String(s || '').match(/(\d{1,2}):(\d{2})/); return m ? m[1] + ':' + m[2] : ''; }
  // 申請から何日たったか（日付だけで数える。読めないときは 0）
  function waitDays(r) { var d = dayOf(r.申請日時); return d ? Math.max(0, diffDays(d, todayDate())) : 0; }
  function waitText(n) { return n === 0 ? '今日' : n === 1 ? '昨日' : n + '日前'; }
  // 予定のある申請（有給などの勤怠・タスク）は、その日が来る前に見てほしいので「予定日」を返す
  function dueDate(r) {
    var b = (r.明細 || [])[0] || {};
    if (r.申請種類 === '勤怠') return b.対象日 || '';
    if (r.申請種類 === 'タスク') return b.日程開始 || '';
    return '';
  }

  // ---------- データの組み立て ----------
  function meName() { return (state.me && state.me.氏名) || '自分'; }
  function approverOf(r) { return r.承認者 || r.承認者氏名 || (mine(r) ? meName() : '承認者未設定'); }
  function mine(r) {
    if (state.me && r.申請者職員ID && r.申請者職員ID === state.me.職員ID) return false; // 自分の申請は承認できない
    return r.担当 === undefined ? true : !!r.担当;
  }
  // 予定日まであと何日か（予定の無い申請・すぎた予定は null）
  function dueLeft(r) { var d = dayOf(dueDate(r)); if (!d) return null; var n = diffDays(todayDate(), d); return n >= 0 ? n : null; }
  function isSoon(r) { var n = dueLeft(r); return n !== null && n <= 1; }
  // 並び順: 予定日が今日・明日のもの → 古い申請 の順（先に見るべきものが上）
  function byOld(a, b) { return (isSoon(b) - isSoon(a)) || String(a.申請日時 || '').localeCompare(String(b.申請日時 || '')); }
  function groups(list) {
    var map = {}, order = [];
    list.forEach(function (r) {
      var k = approverOf(r);
      if (!map[k]) { map[k] = { name: k, items: [], mine: 0, oldest: 0, types: {} }; order.push(k); }
      var g = map[k];
      g.items.push(r);
      if (mine(r)) g.mine++;
      g.oldest = Math.max(g.oldest, waitDays(r));
      g.types[r.申請種類] = (g.types[r.申請種類] || 0) + 1;
    });
    // 自分が担当する承認者（＝自分）を先頭に、あとは件数の多い順
    return order.map(function (k) { map[k].items.sort(byOld); return map[k]; }).sort(function (a, b) {
      return (b.mine > 0) - (a.mine > 0) || (b.name === meName()) - (a.name === meName()) || b.items.length - a.items.length;
    });
  }
  function typeCounts(list) {
    var c = {}, order = [];
    list.forEach(function (r) { if (!c[r.申請種類]) { c[r.申請種類] = 0; order.push(r.申請種類); } c[r.申請種類]++; });
    return order.map(function (t) { return { type: t, n: c[t] }; });
  }

  // ---------- 表示の部品 ----------
  // 読み込み中: 本番と同じ形の仮の行（まとめ1枚＋承認者3行）。文字は読み上げ用に残す
  function skeleton() {
    return '<div class="apv-skel" role="status" aria-label="承認待ちを読み込み中">' +
      '<div class="apv-sum"><span class="apv-sk apv-sk-l"></span><span class="apv-sk apv-sk-s"></span></div>' +
      '<div class="apv-who">' + [1, 2, 3].map(function () {
        return '<div class="apv-sk-row"><span class="apv-sk apv-sk-m"></span><span class="apv-sk apv-sk-n"></span></div>';
      }).join('') + '</div>' +
      '<p class="apv-sk-text"><span class="apv-spin" aria-hidden="true"></span>読み込み中...</p></div>';
  }
  function typeBadge(t) { return '<span class="apv-type apv-type-' + (TYPE_CLS[t] || 'etc') + '">' + esc(t) + '</span>'; }

  function summary(list) {
    var g = groups(list), my = list.filter(mine), old = my.filter(function (r) { return waitDays(r) >= OLD_DAYS; }).length;
    var soon = my.filter(isSoon).length;
    var at = view.at ? ('0' + view.at.getHours()).slice(-2) + ':' + ('0' + view.at.getMinutes()).slice(-2) : '';
    var types = typeCounts(my);
    return '<section class="apv-sum" aria-label="件数のまとめ">' +
      '<div class="apv-sum-top"><p class="apv-sum-main">未承認 ' + list.length + '件 / 承認者 ' + g.length + '名</p>' +
        '<button type="button" class="apv-reload" data-act="再読み込み" aria-label="最新にする（' + at + ' に読み込み）">' +
          '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 10a6 6 0 11-1.8-4.3M16 3v3.5h-3.5"/></svg>' + esc(at) + '</button></div>' +
      (!list.length ? '' : '<div class="apv-mine' + (my.length ? '' : ' is-zero') + '">' +
        '<p class="apv-mine-n"><span>あなたが承認</span><strong>' + my.length + '</strong>件</p>' +
        (soon ? '<p class="apv-mine-old"><span class="apv-dot" aria-hidden="true"></span>予定日が今日・明日の申請 ' + soon + '件</p>' : '') +
        (old ? '<p class="apv-mine-old"><span class="apv-dot" aria-hidden="true"></span>' + OLD_DAYS + '日以上たっている申請 ' + old + '件</p>' : '') +
        (types.length ? '<p class="apv-mine-types">' + types.map(function (x) { return '<span class="apv-mine-t">' + typeBadge(x.type) + '<span class="apv-mine-tn">' + x.n + '</span></span>'; }).join('') + '</p>' : '') +
        (my.length && view.who !== meName() && g.some(function (x) { return x.name === meName(); })
          ? '<button type="button" class="apv-btn apv-btn-ok apv-mine-go" data-who="' + esc(meName()) + '">あなたの承認待ちを開く</button>' : '') +
        (!my.length ? '<p class="apv-mine-none">いま、あなたが承認する申請はありません。</p>' : '') +
      '</div>') +
    '</section>';
  }
  function approverList(list) {
    var g = groups(list);
    if (!g.length) {
      return '<div class="apv-empty"><span class="apv-empty-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>' +
        '<p class="apv-empty-h">承認待ちの申請はありません</p><p>新しい申請が届くと、ここに承認者ごとに出ます。</p></div>';
    }
    return '<ul class="apv-who" aria-label="承認者ごとの件数">' + g.map(function (x) {
      var types = Object.keys(x.types).map(function (t) { return '<span class="apv-nw">' + esc(t) + ' ' + x.types[t] + '</span>'; }).join('');
      var warn = x.oldest >= OLD_DAYS;
      return '<li><button type="button" class="apv-who-row" data-who="' + esc(x.name) + '" aria-label="' + esc(x.name) + 'さん ' + x.items.length + '件' + (warn ? '、' + x.oldest + '日たった申請あり' : '') + '">' +
        '<span class="apv-who-main">' +
          '<span class="apv-who-name">' + esc(x.name) + (x.mine ? '<span class="apv-you">あなた</span>' : '') + '</span>' +
          '<span class="apv-who-sub">' + types + '<span class="apv-who-age' + (warn ? ' is-old' : '') + '">' + (warn ? '<span class="apv-dot" aria-hidden="true"></span>' : '') +
            'いちばん古い申請 ' + waitText(x.oldest) + '</span></span>' +
        '</span>' +
        '<span class="apv-who-count"><b>' + x.items.length + '</b>件<span class="apv-chev" aria-hidden="true">›</span></span>' +
      '</button></li>';
    }).join('') + '</ul>';
  }
  function fmtDate(s) { return String(s || '').slice(0, 16); }
  function total(r) { return (r.明細 || []).reduce(function (s, x) { return s + Number(x.金額 || 0); }, 0); }
  function contentLines(r) {
    var d = r.明細 || [];
    // 経費・勤怠以外（利用者登録・利用者修正・タスク）の中身は views/clients.js が描く
    if (r.申請種類 !== '経費' && r.申請種類 !== '勤怠' && I.bodyLines) return I.bodyLines(r);
    if (!d.length) return '<p class="apv-note">明細がありません。</p>';
    if (r.申請種類 === '経費') {
      var head = d[0] || {}, kind = r.小口先出 || head.小口先出, memo = r.備考 || head.備考;
      return '<dl class="apv-dl">' +
        '<dt>対象日</dt><dd>' + esc(head.対象日 || '—') + '</dd>' +
        '<dt>経費区分</dt><dd>' + esc(head.経費区分 || '—') + '</dd>' +
        (kind ? '<dt>小口先出</dt><dd>' + esc(kind) + '</dd>' : '') +
        d.map(function (x) {
          return '<dt class="apv-line">' + esc(x.物品 === 'フリー入力' && x.自由入力 ? x.自由入力 : x.物品) + ' <span class="apv-qty">×' + esc(x.個数) + '</span></dt><dd class="apv-num">' + yen(x.金額) + '</dd>';
        }).join('') +
        '<dt class="apv-total">合計</dt><dd class="apv-num apv-total">' + yen(total(r)) + '</dd>' +
        (memo ? '<dt class="apv-wide">備考</dt><dd class="apv-wide">' + esc(memo) + '</dd>' : '') +
      '</dl>';
    }
    return '<dl class="apv-dl">' + d.map(function (x) {
      var time = x.打刻時刻 ? '打刻 ' + x.打刻時刻 : (x.開始 || x.終了 ? (x.開始 || '') + '〜' + (x.終了 || '') : '');
      return '<dt>項目</dt><dd>' + esc(x.項目) + '</dd>' +
        '<dt>対象日</dt><dd>' + esc(x.対象日) + '</dd>' +
        (time ? '<dt>時間</dt><dd class="apv-num">' + esc(time) + '</dd>' : '') +
        (x.備考 ? '<dt class="apv-wide">備考</dt><dd class="apv-wide">' + esc(x.備考) + '</dd>' : '');
    }).join('') + '</dl>';
  }
  // 申請カードの見出しの下に出す札（何日前の申請か・予定日まであと何日か）
  function flags(r) {
    var w = waitDays(r), out = [];
    out.push('<span class="apv-flag' + (w >= OLD_DAYS ? ' is-old' : '') + '">' + (w >= OLD_DAYS ? w + '日たっています' : waitText(w) + 'の申請') + '</span>');
    var due = dueDate(r), left = dueLeft(r);
    if (left !== null) {
      out.push('<span class="apv-flag apv-flag-due' + (left <= 1 ? ' is-soon' : '') + '">予定日 ' + md(due) + '（' + (left === 0 ? '今日' : left === 1 ? '明日' : 'あと' + left + '日') + '）</span>');
    }
    return '<p class="apv-flags">' + out.join('') + '</p>';
  }
  // 確認の文に入れる「何を」（経費は合計、勤怠は項目と日付）
  function what(r) {
    var b = (r.明細 || [])[0] || {};
    if (r.申請種類 === '経費') return '経費申請（合計 ' + yen(total(r)) + '）';
    if (r.申請種類 === '勤怠') return '勤怠申請（' + (b.項目 || '') + (b.対象日 ? ' ' + md(b.対象日) : '') + '）';
    return r.申請種類 + '申請';
  }
  function item(r) {
    var can = mine(r), id = esc(r.申請ID);
    var ops;
    if (!can) {
      ops = '<p class="apv-note">' + esc(approverOf(r)) + ' さんが承認する段階です。あなたは見るだけです。</p>';
    } else if (view.confirm && view.confirm.id === r.申請ID && view.confirm.act === '差戻し') {
      // 差戻し: 押したときだけ理由の欄を開く（理由は必須。申請者の「自分の申請」に出る）
      ops = '<div class="apv-confirm is-back" role="group" aria-label="差戻しの理由">' +
        '<p>' + esc(r.申請者 || '申請者') + ' さんに差し戻します</p>' +
        '<div class="apv-label"><label for="cmt-' + id + '">差戻しの理由</label><span class="apv-opt">(必須)</span></div>' +
        '<div class="apv-phrases" aria-label="よく使う理由">' + PHRASES.map(function (p) {
          return '<button type="button" class="apv-phrase" data-phrase="' + esc(p) + '">' + esc(p) + '</button>';
        }).join('') + '</div>' +
        '<textarea id="cmt-' + id + '" class="apv-cmt" rows="3" maxlength="300" placeholder="申請者に届きます。直してほしい点を書いてください">' + esc(view.cmts[r.申請ID] || '') + '</textarea>' +
        '<div class="apv-err" role="alert"></div>' +
        '<div class="apv-btns"><button type="button" class="apv-btn apv-btn-ghost" data-act="やめる">やめる</button>' +
        '<button type="button" class="apv-btn apv-btn-back" data-act="確定">差し戻す</button></div>' +
      '</div>';
    } else if (view.confirm && view.confirm.id === r.申請ID) {
      ops = '<div class="apv-confirm" role="group" aria-label="承認の確認">' +
        '<p>' + esc(r.申請者 || '申請者') + ' さんの' + esc(what(r)) + 'を承認します。よろしいですか？</p>' +
        '<div class="apv-btns"><button type="button" class="apv-btn apv-btn-ghost" data-act="やめる">やめる</button>' +
        '<button type="button" class="apv-btn apv-btn-ok" data-act="確定">承認する</button></div>' +
      '</div>';
    } else {
      ops = '<div class="apv-btns"><button type="button" class="apv-btn apv-btn-backline" data-act="差戻し">差戻し</button>' +
        '<button type="button" class="apv-btn apv-btn-ok" data-act="承認">承認</button></div>';
    }
    return '<article class="apv-item apv-k-' + (TYPE_CLS[r.申請種類] || 'etc') + (can ? '' : ' is-view') + '" data-id="' + id + '">' +
      '<div class="apv-item-head"><h3>' + typeBadge(r.申請種類) + '<span class="apv-who-big">' + esc(r.申請者 || '—') + '<small> さん</small></span></h3>' +
        (can ? '<span class="apv-tag apv-tag-mine">あなたが承認</span>' : '<span class="apv-tag">閲覧のみ</span>') + '</div>' +
      flags(r) +
      // 申請日時・承認段階・申請ID は区切りの「/」を使わず、ひとかたまりずつ折り返す（行末に「/」だけ残らないように）
      '<p class="apv-meta"><span>申請日時：' + esc(md(r.申請日時)) + ' ' + esc(hm(r.申請日時)) + '</span>' +
        '<span>承認段階：' + esc(r.現在段階 || '—') + '</span><span>申請ID：' + id + '</span></p>' +
      contentLines(r) + ops +
      (ops.indexOf('apv-err') < 0 ? '<div class="apv-err" role="alert"></div>' : '') +
    '</article>';
  }
  function detail(list) {
    var g = groups(list).filter(function (x) { return x.name === view.who; })[0];
    var items = g ? g.items : [];
    return '<button type="button" class="apv-backpill" data-act="戻る"><span aria-hidden="true">‹</span> 承認者一覧へ戻る</button>' +
      '<section class="apv-detail" aria-label="' + esc(view.who) + 'さんの承認待ち"><h2>' + esc(view.who) + '（' + items.length + '件）</h2>' +
      '<p class="apv-detail-sub">' + (g && g.mine ? '予定日が近いもの、古い申請の順に並べています。' : 'ほかの承認者の分です。見るだけで、承認はできません。') + '</p>' +
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
    view = { list: [], who: null, confirm: null, cmts: {}, at: null };
    app.innerHTML = '<h1 class="apv-title">承認待ち一覧</h1>' +
      '<div class="apv-shell" id="apv-body" aria-busy="true">' + skeleton() + '</div>' +
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
    var gen = I.gen, body = document.getElementById('apv-body');
    if (body) body.setAttribute('aria-busy', 'true');
    api('pendingApprovals').then(function (list) {
      if (gen !== I.gen) return; // 読み込み中に別の画面へ移ったら捨てる
      view.list = list || []; view.at = new Date(); render();
      var b = document.getElementById('apv-body'); if (b) b.removeAttribute('aria-busy');
    }).catch(function (e) {
      if (gen !== I.gen) return;
      var b = document.getElementById('apv-body'); if (!b) return;
      b.removeAttribute('aria-busy');
      var no = e.code === 403;
      b.innerHTML = '<div class="apv-fail" role="alert"><span class="apv-fail-ic" aria-hidden="true">' + (no ? '🔒' : '!') + '</span>' +
        '<p class="apv-fail-title">' + (no ? '承認待ち一覧は承認者・管理者だけが開けます' : '承認待ち一覧を開けませんでした') + '</p>' +
        '<p>' + (no ? '承認の担当になる必要があるときは、管理者へ確認してください。' : esc(e.message || '通信できませんでした。') + '<br>電波の良い所で、もう一度読み込んでください。') + '</p>' +
        (no ? '' : '<button type="button" class="apv-btn apv-btn-ghost" data-act="再読み込み">もう一度読み込む</button>') + '</div>';
    });
  }

  function onClick(e) {
    var t = e.target.closest('button'); if (!t || !app.contains(t)) return;
    if (t.dataset.who) { saveComments(); view.who = t.dataset.who; view.confirm = null; render(); window.scrollTo(0, 0); return; }
    if (t.dataset.phrase) {
      var ta = t.closest('.apv-confirm').querySelector('.apv-cmt');
      ta.value = ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n' + t.dataset.phrase : t.dataset.phrase;
      ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); return;
    }
    var act = t.dataset.act; if (!act) return;
    if (act === '再読み込み') { saveComments(); document.getElementById('apv-body').innerHTML = skeleton(); load(); return; }
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
      var gen = I.gen, who = view.who;
      api('decide', { 申請ID: c.id, 結果: c.act, コメント: cmt }).then(function () {
        if (gen !== I.gen) return;
        view.list = view.list.filter(function (r) { return r.申請ID !== c.id; });
        delete view.cmts[c.id]; view.confirm = null;
        var left = view.list.filter(function (r) { return approverOf(r) === who; }).length;
        // 消える前に一瞬たたむ（どのカードが片づいたか目で追えるように）
        card.classList.add('is-done');
        setTimeout(function () {
          if (gen !== I.gen) return;
          render();
          if (!left) { window.scrollTo(0, 0); toast((c.act === '承認' ? '承認しました' : '差し戻しました') + '。' + who + ' さんの分はすべて終わりました'); }
          else toast((c.act === '承認' ? '承認しました' : '差し戻しました') + '（残り ' + left + '件）');
        }, 260);
      }).catch(function (x) {
        if (gen !== I.gen) return;
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
