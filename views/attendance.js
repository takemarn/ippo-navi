/* 勤怠申請の画面（#attendance）
   参考アプリの並び: 申請者（N月の残業合計）→ 施設名 → 項目 → 対象日 → 時間（～）→ 打刻時間 → 備考 → 遅延証明書、カードの外に「送信」。
   時間・打刻時間は最初は使えない。項目を選ぶと、打刻修正なら打刻時間、それ以外なら時間が使えるようになる
   （GAS の validateAttendance と同じ決まり: 打刻修正は 打刻時刻、それ以外は 開始・終了 が必須）。
   送信の流れ: 送信 → 入力チェック（項目の下に赤字） → ページ内の確認カード → 送信中 → 完了カード。
   GAS に送る data の形は docs/api.md のまま: {項目, 対象日, 開始?, 終了?, 打刻時刻?, 備考?}。欠勤・有給・各種休暇は時間が任意 */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, state = I.state, api = I.api, esc = I.esc, today = I.today, toast = I.toast;

  // 施設名は options.施設 から（無ければ モア一津屋）。表示と確認のためだけで、送るデータには入れない（GAS の形を変えないため）。
  // 1つだけなら最初から選んでおく。2つ以上なら参考アプリと同じく空から選ぶ
  function facilities() { var f = state.options && state.options.施設; return f && f.length ? f : ['モア一津屋']; }
  // 'YYYY-MM-DD' → '2026年11月28日（土）'。確認カードで日付の読み間違いを防ぐ
  function fmtDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
    if (!m) return v || '';
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return m[1] + '年' + Number(m[2]) + '月' + Number(m[3]) + '日（' + '日月火水木金土'.charAt(d.getDay()) + '）';
  }
  var isStamp = function (k) { return /^打刻修正/.test(k || ''); };

  function sel(id, list, value, blank) {
    return '<select id="' + id + '">' + (blank ? '<option value=""></option>' : '') +
      list.map(function (v) { return '<option' + (v === value ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('') +
      '</select>';
  }
  function head(forId, label, req) {
    return '<div class="att-lab"><label for="' + forId + '">' + label + '</label>' +
      '<span class="' + (req ? 'att-req">(必須)' : 'att-opt">(任意)') + '</span></div>';
  }
  function field(key, inner, extraCls) {
    return '<div class="att-field' + (extraCls ? ' ' + extraCls : '') + '" data-f="' + key + '">' + inner +
      '<p class="att-err" id="att-err-' + key + '" hidden></p></div>';
  }

  // 終日の項目は時間が任意（GAS の FULL_DAY_KINDS と同じ）
  var FULL_DAY = ['欠勤', '有給', '冬期休暇', '夏季休暇', '特別休暇'];
  var isFullDay = function (k) { return FULL_DAY.indexOf(k) >= 0; };

  // 当月の残業合計。me の返事の 当月残業合計（'H:mm'）を出す。値が無いときは誤解を避けて何も出さない
  function overtimeLabel() {
    var v = state.me && state.me.当月残業合計;
    if (v === undefined || v === null || v === '') return '';
    return '（' + (new Date().getMonth() + 1) + '月の残業合計：' + esc(v) + '）';
  }
  function fmtSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB'; }

  function viewAttendance() {
    var kinds = (state.options && state.options.勤怠項目) || [];
    var FACILITIES = facilities(), oneFac = FACILITIES.length === 1;

    app.innerHTML =
      '<h1 class="att-title">勤怠申請</h1>' +
      '<div id="att-stage">' +
      '<form id="att-form" class="att-form" novalidate>' +
        '<div class="card att-card">' +
          field('申請者', head('att-申請者', '申請者' + overtimeLabel(), true) +
            '<input id="att-申請者" value="' + esc(state.me && state.me.氏名) + '" readonly aria-readonly="true">') +
          field('施設名', head('att-施設名', '施設名', true) + (oneFac ? sel('att-施設名', FACILITIES, FACILITIES[0], false) : sel('att-施設名', FACILITIES, '', true).replace('<select', '<select class="att-empty"'))) +
          field('項目', head('att-項目', '項目', true) + sel('att-項目', kinds, '', true).replace('<select', '<select class="att-empty"')) +
          field('対象日', head('att-対象日', '対象日', true) + '<input type="date" id="att-対象日" value="' + today() + '">') +
          '<div class="att-field att-off" data-f="時間" role="group" aria-labelledby="att-時間-lab">' +
            '<div class="att-lab"><span class="att-lab-name" id="att-時間-lab">時間</span><span class="att-req" id="att-時間-mark">(必須)</span></div>' +
            '<div class="att-range">' +
              '<input type="time" id="att-開始" aria-label="開始時刻" disabled>' +
              '<span class="att-tilde" aria-hidden="true">～</span>' +
              '<input type="time" id="att-終了" aria-label="終了時刻" disabled>' +
            '</div>' +
            '<p class="att-err" id="att-err-時間" hidden></p>' +
          '</div>' +
          field('打刻時間', head('att-打刻時刻', '打刻時間', true) + '<div class="att-range"><input type="time" id="att-打刻時刻" disabled></div>', 'att-off') +
          field('備考', head('att-備考', '備考', false) +
            '<input id="att-備考" placeholder="特別休暇の場合は備考欄に詳細を表示" aria-describedby="att-備考-hint">' +
            '<p class="att-hint" id="att-備考-hint">特別休暇の場合は備考欄に詳細を表示</p>') +
          // 遅延証明書: 見た目と選択（カメラ・写真・ファイル）まで。
          // 未実装: 送信には含めない。GAS 側にファイルを受け取る操作ができたら、アップロードして 添付ファイルID を data に足す。
          field('遅延証明書', head('att-file', '遅延証明書', false) +
            '<div class="att-file">' +
              '<input type="file" id="att-file" accept="image/*,application/pdf" class="att-file-input" aria-describedby="att-file-hint">' +
              '<label for="att-file" class="att-file-btn" id="att-file-name">ファイルを選択</label>' +
              '<button type="button" class="att-file-clear" id="att-file-clear" aria-label="選んだファイルを外す" hidden>×</button>' +
            '</div>' +
            '<p class="att-hint" id="att-file-hint">ある場合は添付してください</p>') +
        '</div>' +
        '<p class="att-formerr" id="att-formerr" role="alert" hidden></p>' +
        '<button type="submit" class="att-send">送信</button>' +
        (I.backHtml ? I.backHtml('#apply') : '') +
      '</form>' +
      '<div id="att-after"></div>' +
      '</div>';

    var form = document.getElementById('att-form');
    var after = document.getElementById('att-after');
    function $(id) { return document.getElementById('att-' + id); }

    // ---------- 項目に応じて 時間／打刻時間 を切り替える ----------
    function syncKind() {
      var k = $('項目').value;
      var useRange = !!k && !isStamp(k), useStamp = isStamp(k), optional = isFullDay(k);
      $('開始').disabled = !useRange; $('終了').disabled = !useRange; $('打刻時刻').disabled = !useStamp;
      form.querySelector('[data-f="時間"]').classList.toggle('att-off', !useRange);
      form.querySelector('[data-f="打刻時間"]').classList.toggle('att-off', !useStamp);
      $('項目').classList.toggle('att-empty', !k);
      // 欠勤・有給・各種休暇は時間を任意にする（使えるが (任意) 表示）
      $('時間-mark').className = optional ? 'att-opt' : 'att-req';
      $('時間-mark').textContent = optional ? '(任意)' : '(必須)';
      // 項目を変えたら、時間・打刻時間の古いエラーは消す（必須・任意が変わるため）
      clearErr($('開始')); clearErr($('打刻時刻'));
    }
    $('項目').addEventListener('change', syncKind);
    syncKind();

    // ---------- 遅延証明書（選ぶだけ。送らない） ----------
    var file = $('file');
    function syncFile() {
      var f = file.files && file.files[0];
      $('file-name').textContent = f ? f.name + '（' + fmtSize(f.size) + '）' : 'ファイルを選択';
      $('file-name').classList.toggle('att-picked', !!f);
      $('file-clear').hidden = !f;
    }
    file.addEventListener('change', syncFile);
    $('file-clear').addEventListener('click', function () { file.value = ''; syncFile(); file.focus(); });

    // ---------- エラー表示（項目の下に赤字） ----------
    function clearErr(el) {
      var f = el && el.closest && el.closest('.att-field');
      if (!f || !f.classList.contains('att-bad')) return;
      f.classList.remove('att-bad');
      var p = f.querySelector(':scope > .att-err'); if (p) { p.hidden = true; p.textContent = ''; }
      var left = form.querySelectorAll('.att-bad').length;
      $('formerr').hidden = !left;
      if (left) $('formerr').textContent = '入力を確認してください（' + left + '件）';
    }
    function showErr(key, msg) {
      var p = $('err-' + key); if (!p) return;
      p.textContent = msg; p.hidden = false; p.parentNode.classList.add('att-bad');
    }
    form.addEventListener('input', function (e) { clearErr(e.target); });
    form.addEventListener('change', function (e) {
      if (e.target.tagName === 'SELECT') e.target.classList.toggle('att-empty', !e.target.value);
      clearErr(e.target);
    });

    function readData() {
      var k = $('項目').value;
      var d = { 項目: k, 対象日: $('対象日').value };
      if (isStamp(k)) d.打刻時刻 = $('打刻時刻').value;
      else if (isFullDay(k)) { if ($('開始').value) d.開始 = $('開始').value; if ($('終了').value) d.終了 = $('終了').value; }
      else if (k) { d.開始 = $('開始').value; d.終了 = $('終了').value; }
      var memo = $('備考').value.trim(); if (memo) d.備考 = memo;
      return d;
    }
    function validate(d) {
      var n = 0;
      if (!$('施設名').value) { showErr('施設名', '施設名を選んでください'); n++; }
      if (!d.項目) { showErr('項目', '項目を選んでください'); n++; }
      if (!d.対象日) { showErr('対象日', '対象日を入れてください'); n++; }
      if (d.項目 && isStamp(d.項目)) {
        if (!d.打刻時刻) { showErr('打刻時間', '打刻時間を入れてください'); n++; }
      } else if (isFullDay(d.項目)) {
        if (!!d.開始 !== !!d.終了) { showErr('時間', '時間は開始と終了の両方を入れるか、両方空にしてください'); n++; }
        else if (d.開始 && d.開始 >= d.終了) { showErr('時間', '終了は開始より後にしてください'); n++; }
      } else if (d.項目) {
        if (!d.開始 || !d.終了) { showErr('時間', '時間（開始～終了）を入れてください'); n++; }
        else if (d.開始 >= d.終了 && d.項目 !== '残業・前残業') { showErr('時間', '終了は開始より後にしてください'); n++; }
      }
      return n;
    }

    // ---------- 送信 → 確認 → 送信中 → 完了 ----------
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      form.querySelectorAll('.att-bad').forEach(function (f) { f.classList.remove('att-bad'); });
      form.querySelectorAll('.att-err').forEach(function (p) { p.hidden = true; p.textContent = ''; });
      $('formerr').hidden = true;
      var d = readData();
      var n = validate(d);
      if (n) {
        $('formerr').textContent = '入力を確認してください（' + n + '件）';
        $('formerr').hidden = false;
        var first = form.querySelector('.att-bad');
        if (first) { first.scrollIntoView({ block: 'center' }); var f = first.querySelector('select, input:not([type=file])'); if (f && !f.disabled) f.focus({ preventScroll: true }); }
        return;
      }
      showConfirm(d);
    });

    function showConfirm(d) {
      var f = file.files && file.files[0];
      var time = isFullDay(d.項目) && !d.開始 ? '' : d.打刻時刻 ? '<dt>打刻時間</dt><dd>' + esc(d.打刻時刻) + '</dd>' :
        '<dt>時間</dt><dd>' + esc(d.開始) + ' ～ ' + esc(d.終了) + (d.開始 >= d.終了 ? '<span class="att-note">（翌日にまたがる）</span>' : '') + '</dd>';
      form.hidden = true;
      after.innerHTML =
        '<section class="card att-card att-confirm" aria-labelledby="att-cf-h">' +
          '<h2 id="att-cf-h" class="att-cf-h">この内容で送信しますか？</h2>' +
          '<dl class="att-dl">' +
            '<dt>申請者</dt><dd>' + esc(state.me && state.me.氏名) + '</dd>' +
            '<dt>施設名</dt><dd>' + esc($('施設名').value) + '</dd>' +
            '<dt>項目</dt><dd>' + esc(d.項目) + '</dd>' +
            '<dt>対象日</dt><dd>' + esc(fmtDate(d.対象日)) + '</dd>' +
            time +
            '<dt>備考</dt><dd>' + (d.備考 ? esc(d.備考) : '<span class="att-none">なし</span>') + '</dd>' +
            (f ? '<dt>遅延証明書</dt><dd>' + esc(f.name) + '<span class="att-note">添付ファイルの送信は準備中のため、今回は送られません。</span></dd>' : '') +
          '</dl>' +
          '<div class="att-senderr" id="att-senderr" role="alert" hidden></div>' +
        '</section>' +
        '<div class="att-actions">' +
          '<button type="button" class="att-send" id="att-go">この内容で送信</button>' +
          '<button type="button" class="att-back" id="att-fix">戻って直す</button>' +
        '</div>';
      window.scrollTo(0, 0);
      $('fix').addEventListener('click', function () { after.innerHTML = ''; form.hidden = false; window.scrollTo(0, 0); });
      $('go').addEventListener('click', function () { send(d); });
      $('go').focus({ preventScroll: true });
    }

    function send(d) {
      var go = $('go'), fix = $('fix'), box = $('senderr');
      go.disabled = true; fix.disabled = true; box.hidden = true;
      go.innerHTML = '<span class="att-spin" aria-hidden="true"></span>送信中…';
      go.setAttribute('aria-busy', 'true');
      if (I.busy) I.busy(true); // 送信中は画面全体をぼかして「読み込み中・・・」（core.js）
      var g = I.gen; // 送信中に別の画面へ移ったら、結果は画面に書かない
      api('submitAttendance', d).then(function (res) {
        if (I.busy) I.busy(false); // 完了カードを同じ画面に出すので自分で消す
        if (g !== I.gen) { toast('勤怠申請を送信しました'); return; }
        showDone(res || {}, d);
        toast('送信しました');
      }).catch(function (e) {
        if (I.busy) I.busy(false);
        if (g !== I.gen) { toast((e && e.message) || '送信できませんでした'); return; }
        go.disabled = false; fix.disabled = false; go.textContent = 'もう一度送信する'; go.removeAttribute('aria-busy');
        var list = e && e.details && e.details.length ? e.details : [];
        box.innerHTML = '<strong>' + esc((e && e.message) || '送信できませんでした') + '</strong>' +
          (list.length ? '<ul>' + list.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p>通信の状態を確かめて、もう一度送信してください。</p>');
        box.hidden = false;
      });
    }

    function showDone(res, d) {
      var when = d.打刻時刻 ? '打刻 ' + d.打刻時刻 : d.開始 ? d.開始 + '～' + d.終了 : '';
      after.innerHTML =
        '<section class="card att-card att-done" aria-labelledby="att-done-h">' +
          '<svg class="att-done-ic" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21"/><path d="M14 24.5l7 7 13-14"/></svg>' +
          '<h2 id="att-done-h">勤怠申請を送信しました</h2>' +
          '<p class="att-done-sum">' + esc(d.項目) + '　' + esc(fmtDate(d.対象日)) + (when ? '　' + esc(when) : '') + '</p>' +
          '<p class="att-done-id">申請番号 ' + esc(res.申請ID || '—') + '</p>' +
          (res.状態 ? '<p>' + I.pill(res.状態) + '</p>' : '') +
          '<p class="att-done-note">承認されると「自分の申請」の状態が変わります。</p>' +
        '</section>' +
        '<div class="att-actions">' +
          '<a class="att-send" href="#requests">自分の申請を見る</a>' +
          '<button type="button" class="att-back" id="att-again">続けて勤怠申請する</button>' +
          (I.backHtml ? I.backHtml('#apply') : '') +
        '</div>';
      window.scrollTo(0, 0);
      $('done-h').setAttribute('tabindex', '-1'); $('done-h').focus();
      $('again').addEventListener('click', viewAttendance);
    }
  }

  I.views.attendance = viewAttendance;
})();
