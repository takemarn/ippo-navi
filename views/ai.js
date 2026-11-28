/* AI相談（第4段階）。参考アプリの「相談AI」には AI と話す画面が映っていなかったので、自社用に作った
   #ai … 質問を入れると、規程とマニュアルから近いところを探して「根拠」として見せる（いまは無料の検索だけ）
         規程の本文は閲覧前の確認が要るので、ここでは題と見出しだけ出し、「この規程を開く」で確認画面へ進む
         将来、文章で答える AI（有料の API）をつなぐときも、画面はこのままで GAS の askAi の中だけを変える
   GAS とのやりとり: askAi（kiroku-app の docs/api.md「相談AI」） */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, api = I.api, esc = I.esc;
  var EXAMPLES = ['有給休暇は何日もらえる？', '残業の申請はどうする？', '夜間に急変したら？', '転倒したときは？', '給料日はいつ？'];
  var log = []; // この画面を開いている間の やりとり（保存はしない）

  function bubbleQ(q) { return '<div class="ai-q"><p>' + esc(q) + '</p></div>'; }
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
    return '<div class="ai-a"><p>' + esc(a.回答) + '</p>' + (rows ? '<ol class="ai-hits">' + rows + '</ol>' : '') +
      '<p class="ai-small">答えは規程・マニュアルの文章が正しいものです。迷ったら上長に確認してください。</p></div>';
  }

  function viewAi() {
    app.innerHTML = '<h1>AI相談</h1>' +
      '<section class="card ai-intro"><p><b>規程やマニュアルのことを、ふだんの言葉で聞けます。</b></p>' +
        '<p class="muted">いまは「近いところを探して見せる」しくみです（無料）。文章で答える AI は準備中です。</p>' +
        '<p class="muted">利用者さんの名前など、個人の情報は入れないでください。</p></section>' +
      '<div id="ai-log" class="ai-log" aria-live="polite"></div>' +
      '<div class="ai-ex" id="ai-ex">' + EXAMPLES.map(function (q) { return '<button type="button" data-ex="' + esc(q) + '">' + esc(q) + '</button>'; }).join('') + '</div>' +
      '<form id="ai-f" class="ai-form"><label><span class="sr">質問</span><textarea id="ai-in" rows="2" maxlength="200" placeholder="例）有給休暇は何日もらえる？"></textarea></label>' +
        '<button type="submit">聞く</button></form>' +
      '<div id="err"></div>' + I.backHtml();
    var box = document.getElementById('ai-log');
    box.innerHTML = log.map(function (x) { return bubbleQ(x.q) + (x.a ? bubbleA(x.a) : ''); }).join('');
    document.getElementById('ai-f').addEventListener('submit', function (e) { e.preventDefault(); ask(document.getElementById('ai-in').value); });
    document.getElementById('ai-in').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(this.value); }
    });
    app.addEventListener('click', onClick);
    I.cleanup.push(function () { app.removeEventListener('click', onClick); });
  }

  function ask(q) {
    q = String(q || '').trim();
    var err = document.getElementById('err');
    if (!q) { err.innerHTML = I.errorsBox(['質問を入れてください']); return; }
    err.innerHTML = '';
    var input = document.getElementById('ai-in'), btn = document.querySelector('#ai-f button');
    input.value = ''; btn.disabled = true; btn.textContent = '探しています…';
    var item = { q: q, a: null };
    log.push(item);
    var box = document.getElementById('ai-log');
    box.insertAdjacentHTML('beforeend', bubbleQ(q) + '<div class="ai-a ai-wait" id="ai-wait"><span class="spin" aria-hidden="true"></span>探しています…</div>');
    box.lastElementChild.scrollIntoView({ block: 'end', behavior: 'smooth' });
    api('askAi', { 質問: q }).then(function (a) {
      item.a = a;
      var w = document.getElementById('ai-wait');
      if (w) w.outerHTML = bubbleA(a);
    }).catch(function (e) {
      log.pop();
      var w = document.getElementById('ai-wait');
      if (w) { w.previousElementSibling && w.previousElementSibling.remove(); w.remove(); }
      if (input) input.value = q;
      err.innerHTML = e.details && e.details.length ? I.errorsBox(e.details) : '<div class="errors" role="alert">' + esc(e.message) + '</div>';
    }).then(function () { if (btn) { btn.disabled = false; btn.textContent = '聞く'; } });
  }

  function onClick(e) {
    var b = e.target.closest('button');
    if (!b || !app.contains(b)) return;
    if (b.dataset.ex) return ask(b.dataset.ex);
    if (b.dataset.rule) { I.pickRule(b.dataset.rule); location.hash = '#rule-read'; return; }
    if (b.dataset.guide) I.openGuide(b.dataset.guide);
  }

  I.views.ai = viewAi;
})();
