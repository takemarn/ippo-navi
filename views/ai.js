/* AI相談（第4段階）。参考アプリの「相談AI」には AI と話す画面が映っていなかったので、自社用に作った
   #ai … 質問を入れると、規程とマニュアルから近いところを探して「根拠」として見せる（いまは無料の検索だけ）
         規程の本文は閲覧前の確認が要るので、ここでは題と見出しだけ出し、「この規程を開く」で確認画面へ進む
         将来、文章で答える AI（有料の API）をつなぐときも、画面はこのままで GAS の askAi の中だけを変える
   views/portal.js（I.pickRule・setPortalFrom）と views/manual.js（I.openGuide）を先に読み込むこと
   GAS とのやりとり: askAi（kiroku-app の docs/api.md「相談AI」） */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, api = I.api, esc = I.esc;
  var EXAMPLES = ['夜間に急変したら？', '有給休暇は何日もらえる？', '残業の申請はどうする？', '給料日はいつ？', '転倒したときは？', '育児休業はとれる？'];
  var log = []; // この画面を開いている間の やりとり（保存はしない）。{n, q, a}。a が null なら返事待ち
  var seq = 0, waiting = false;
  var retryQ = ''; // ほかの画面に移っている間に失敗した質問。戻ってきたら入力欄に戻す

  function bubbleQ(q) { return '<div class="ai-q"><p>' + esc(q) + '</p></div>'; }
  function bubbleWait(n) { return '<div class="ai-a ai-wait" id="ai-wait-' + n + '"><span class="spin" aria-hidden="true"></span>探しています…</div>'; }
  function bubbleA(a) {
    var rows = (a.根拠 || []).map(function (h, i) {
      var open = h.種類 === '窓口' ? '<a class="ai-help" href="#org">組織図で見る</a>'
        : h.種類 === '規程'
        ? '<button type="button" class="small sub" data-rule="' + esc(h.ID) + '" data-sec="' + esc(h.見出し || '') + '">この規程を開く</button>'
        : '<button type="button" class="small sub" data-guide="' + esc(h.ID) + '">マニュアルを開く</button>';
      return '<li><span class="ai-kind ' + (h.種類 === '規程' ? 'r' : h.種類 === '窓口' ? 'h' : 'm') + '">' + esc(h.種類) + '</span>' +
        '<b>' + esc(h.題) + (h.対象 ? '<span class="ai-tag">' + esc(h.対象) + '</span>' : '') + '</b>' + (h.見出し ? '<small>' + esc(h.見出し) + '</small>' : '') +
        (h.抜粋 ? '<q>' + esc(h.抜粋) + '</q>' : (h.種類 === '規程' ? '<small class="ai-lock">本文は「閲覧前のご確認」のあとで読めます</small>' : '')) +
        open + '</li>';
    }).join('');
    var none = !(a.根拠 || []).length
      ? '<a class="ai-help" href="#manual-urgent">急ぐときは「様子がおかしい・急変」のページへ</a>' +
        '<a class="ai-help" href="#org">困ったときの窓口を見る（組織図）</a>' : '';
    var urgent = a.急ぎ ? '<div class="ai-urgent"><b>急ぐときは、まず看護師・オンコール当番へ。</b>命に関わるときは迷わず119番。' +
      '<div class="ai-urgent-btns"><a class="btn" href="tel:119">119番に電話</a><a class="btn sub-link" href="#manual-urgent">急変のときの流れ</a></div></div>' : '';
    return '<div class="ai-a">' + urgent + '<p>' + esc(a.回答) + '</p>' + (rows ? '<ol class="ai-hits">' + rows + '</ol>' : '') + none +
      '<p class="ai-small">答えは規程・マニュアルの文章が正しいものです。迷ったら上長に確認してください。</p></div>';
  }

  function viewAi() {
    app.innerHTML = '<h1>AIに聞く</h1>' +
      '<section class="card ai-intro"><p><b>規程やマニュアルのことを、ふだんの言葉で聞けます。</b></p>' +
        '<p class="muted">いまは、規程とマニュアルの中から関係がありそうなところを探して見せます。文章で答える AI は準備中です。</p>' +
        '<p class="muted">利用者さんの名前など、個人の情報は入れないでください。</p></section>' +
      '<div id="ai-log" class="ai-log" aria-live="polite"></div>' +
      '<div class="ai-ex" id="ai-ex"' + (log.length ? ' hidden' : '') + '>' + EXAMPLES.map(function (q) { return '<button type="button" data-ex="' + esc(q) + '">' + esc(q) + '</button>'; }).join('') + '</div>' +
      '<form id="ai-f" class="ai-form"><label><span class="ptl-sr">質問</span><textarea id="ai-in" rows="2" maxlength="200" placeholder="例）有給休暇は何日もらえる？"></textarea></label>' +
        '<button type="submit">聞く</button></form>' +
      '<div id="err"></div>' + I.backHtml();
    var box = document.getElementById('ai-log');
    box.innerHTML = log.map(function (x) { return bubbleQ(x.q) + (x.a ? bubbleA(x.a) : bubbleWait(x.n)); }).join('');
    syncBtn();
    if (retryQ) { document.getElementById('ai-in').value = retryQ; retryQ = ''; }
    document.getElementById('ai-f').addEventListener('submit', function (e) { e.preventDefault(); ask(document.getElementById('ai-in').value); });
    document.getElementById('ai-in').addEventListener('keydown', function (e) {
      // 日本語の変換を確定する Enter では送らない（Safari は isComposing が false のまま keyCode 229 を送る）
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); ask(this.value); }
    });
    app.addEventListener('click', onClick);
    I.cleanup.push(function () { app.removeEventListener('click', onClick); });
  }

  function syncBtn() {
    var btn = document.querySelector('#ai-f button');
    if (btn) { btn.disabled = waiting; btn.textContent = waiting ? '探しています…' : '聞く'; }
  }

  function ask(q) {
    if (waiting) return; // 返事を待っている間は次を送らない
    q = String(q || '').trim();
    var err = document.getElementById('err');
    if (!q) { err.innerHTML = I.errorsBox(['質問を入れてください']); return; }
    err.innerHTML = '';
    var input = document.getElementById('ai-in');
    input.value = '';
    var item = { n: ++seq, q: q, a: null };
    log.push(item); waiting = true; syncBtn();
    var ex = document.getElementById('ai-ex'); if (ex) ex.hidden = true;
    var box = document.getElementById('ai-log');
    box.insertAdjacentHTML('beforeend', bubbleQ(q) + bubbleWait(item.n));
    box.lastElementChild.scrollIntoView({ block: 'end', behavior: 'smooth' });
    api('askAi', { 質問: q }).then(function (a) {
      item.a = a;
      var w = document.getElementById('ai-wait-' + item.n);
      if (w) w.outerHTML = bubbleA(a);
    }).catch(function (e) {
      log.splice(log.indexOf(item), 1);
      // もう別の画面にいるときは、その画面のエラー欄に出さない（同じ id の欄がほかの画面にもあるため）
      if (location.hash !== '#ai') { retryQ = q; return; }
      var w = document.getElementById('ai-wait-' + item.n);
      if (w) { if (w.previousElementSibling) w.previousElementSibling.remove(); w.remove(); }
      var inp = document.getElementById('ai-in'), er = document.getElementById('err');
      if (inp && !inp.value) inp.value = q;
      if (er) er.innerHTML = e.details && e.details.length ? I.errorsBox(e.details) : '<div class="errors" role="alert">' + esc(e.message) + '</div>';
    }).then(function () { waiting = false; syncBtn(); });
  }

  function onClick(e) {
    // 急変の流れ・組織図へのリンクも、戻るときは AI相談へ
    var a = e.target.closest('a[href="#manual-urgent"], a[href="#org"]');
    if (a && app.contains(a)) { I.setPortalFrom('#ai'); return; }
    var b = e.target.closest('button');
    if (!b || !app.contains(b)) return;
    if (b.dataset.ex) return ask(b.dataset.ex);
    if (b.dataset.rule) { I.pickRule(b.dataset.rule, b.dataset.sec); I.setPortalFrom('#ai'); location.hash = '#rule-read'; return; }
    if (b.dataset.guide) { I.setPortalFrom('#ai'); I.openGuide(b.dataset.guide); }
  }

  I.views.ai = viewAi;
})();
