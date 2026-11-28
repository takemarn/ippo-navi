/* AI相談（第4段階）。参考アプリの「相談AI」には AI と話す画面が映っていなかったので、自社用に作った
   #ai … 質問を入れると、規程とマニュアルから近いところを探して「根拠」として見せる（いまは無料の検索だけ）
         規程の本文は閲覧前の確認が要るので、ここでは題と見出しだけ出し、「この規程を開く」で確認画面へ進む
         将来、文章で答える AI（有料の API）をつなぐときも、画面はこのままで GAS の askAi の中だけを変える
   GAS とのやりとり: askAi（kiroku-app の docs/api.md「相談AI」） */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, api = I.api, esc = I.esc;
  var EXAMPLES = ['有給休暇は何日もらえる？', '残業の申請はどうする？', '給料日はいつ？', '育児休業はとれる？'];
  var NURSE_EXAMPLES = ['夜間に急変したら？', '転倒したときは？'];
  // 看護マニュアルを見られる人（GAS の「マニュアル閲覧職種」と同じ初期値）。見られない人には看護の例を出さない
  function nurse() { var me = I.state.me || {}; return ['看護師', '准看護師'].indexOf(me.職種) >= 0 || I.canApprove(); }
  var log = []; // この画面を開いている間の やりとり（保存はしない）。{n, q, a}。a が null なら返事待ち
  var seq = 0, waiting = false;

  function bubbleQ(q) { return '<div class="ai-q"><p>' + esc(q) + '</p></div>'; }
  function bubbleWait(n) { return '<div class="ai-a ai-wait" id="ai-wait-' + n + '"><span class="spin" aria-hidden="true"></span>探しています…</div>'; }
  function bubbleA(a) {
    var rows = (a.根拠 || []).map(function (h, i) {
      var open = h.種類 === '規程'
        ? '<button type="button" class="small sub" data-rule="' + esc(h.ID) + '">この規程を開く</button>'
        : '<button type="button" class="small sub" data-guide="' + esc(h.ID) + '">マニュアルを開く</button>';
      return '<li><span class="ai-kind ' + (h.種類 === '規程' ? 'r' : 'm') + '">' + esc(h.種類) + '</span>' +
        '<b>' + esc(h.題) + '</b>' + (h.見出し ? '<small>' + esc(h.見出し) + '</small>' : '') +
        (h.抜粋 ? '<q>' + esc(h.抜粋) + '</q>' : (h.種類 === '規程' ? '<small class="ai-lock">本文は「閲覧前のご確認」のあとで読めます</small>' : '')) +
        open + '</li>';
    }).join('');
    var none = !(a.根拠 || []).length
      ? (!nurse() ? '<p class="ai-small">急変・看護のことは看護マニュアル（看護職向け）にあります。急ぐときは、まず看護師・オンコール当番へ。</p>' : '') +
        '<a class="ai-help" href="#org">困ったときの窓口を見る（組織図）</a>' : '';
    return '<div class="ai-a"><p>' + esc(a.回答) + '</p>' + (rows ? '<ol class="ai-hits">' + rows + '</ol>' : '') + none +
      '<p class="ai-small">答えは規程・マニュアルの文章が正しいものです。迷ったら上長に確認してください。</p></div>';
  }

  function viewAi() {
    app.innerHTML = '<h1>AI相談</h1>' +
      '<section class="card ai-intro"><p><b>規程やマニュアルのことを、ふだんの言葉で聞けます。</b></p>' +
        '<p class="muted">いまは、規程とマニュアルの中から関係がありそうなところを探して見せます。文章で答える AI は準備中です。</p>' +
        '<p class="muted">利用者さんの名前など、個人の情報は入れないでください。</p></section>' +
      '<div id="ai-log" class="ai-log" aria-live="polite"></div>' +
      '<div class="ai-ex" id="ai-ex"' + (log.length ? ' hidden' : '') + '>' + (nurse() ? NURSE_EXAMPLES.concat(EXAMPLES) : EXAMPLES).map(function (q) { return '<button type="button" data-ex="' + esc(q) + '">' + esc(q) + '</button>'; }).join('') + '</div>' +
      '<form id="ai-f" class="ai-form"><label><span class="sr">質問</span><textarea id="ai-in" rows="2" maxlength="200" placeholder="例）有給休暇は何日もらえる？"></textarea></label>' +
        '<button type="submit">聞く</button></form>' +
      '<div id="err"></div>' + I.backHtml();
    var box = document.getElementById('ai-log');
    box.innerHTML = log.map(function (x) { return bubbleQ(x.q) + (x.a ? bubbleA(x.a) : bubbleWait(x.n)); }).join('');
    syncBtn();
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
      var w = document.getElementById('ai-wait-' + item.n);
      if (w) { if (w.previousElementSibling) w.previousElementSibling.remove(); w.remove(); }
      var inp = document.getElementById('ai-in'), er = document.getElementById('err');
      if (inp && !inp.value) inp.value = q;
      if (er) er.innerHTML = e.details && e.details.length ? I.errorsBox(e.details) : '<div class="errors" role="alert">' + esc(e.message) + '</div>';
    }).then(function () { waiting = false; syncBtn(); });
  }

  function onClick(e) {
    var b = e.target.closest('button');
    if (!b || !app.contains(b)) return;
    if (b.dataset.ex) return ask(b.dataset.ex);
    if (b.dataset.rule) { I.pickRule(b.dataset.rule); I.setPortalFrom('#ai'); location.hash = '#rule-read'; return; }
    if (b.dataset.guide) { I.setPortalFrom('#ai'); I.openGuide(b.dataset.guide); }
  }

  I.views.ai = viewAi;
})();
