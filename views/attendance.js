/* 勤怠申請の画面（#attendance）
   参考アプリの並び: 申請者（N月の残業合計）→ 施設名 → 項目 → 対象日 → 時間（～）→ 打刻時間 → 備考 → 遅延証明書、カードの外に「送信」。
   時間・打刻時間は最初は使えない。項目を選ぶと、打刻修正なら打刻時間、それ以外なら時間が使えるようになる
   （GAS の validateAttendance と同じ決まり: 打刻修正は 打刻時刻、それ以外は 開始・終了 が必須）。
   送信の流れ: 送信 → 入力チェック（項目の下に赤字） → ページ内の確認カード → 送信中 → 完了カード。
   GAS に送る data は docs/api.md の {項目, 対象日, 開始?, 終了?, 打刻時刻?, 備考?} に 施設名・添付ファイルID?・送信ID を足したもの（下の data: の行）。
   欠勤・有給・各種休暇は時間が任意。足した項目は GAS側にも要る（今の GAS は知らない項目を無視するだけで害はない）。
   入力の決まり: 打刻修正・遅刻・早退・残業は今日より後の日付にできない（有給・休暇・休日出勤・欠勤は先の日付でよい）。
     残業は開始と終了が同じだとエラー、12時間を超えるとエラー（終了が開始より前なら日をまたぐとみなして数える）。
   遅延証明書: 選んだときに画面の中で送れる形にしておき（画像は長い辺1600pxまで縮めて JPEG に、PDF はそのまま。どちらも2MBまで）、
     送信のときに先に uploadAttachment {ファイル: 'data:…;base64,…'} → 返る 添付ファイルID を submitAttendance の data に足す。
     「もう一度送信する」では、送れた添付ファイルIDをそのまま使う（二度アップロードしない）。
     見本モードは core.js の Demo に uploadAttachment が無いので、ここで IPPO.demo に架空のIDを返すものを登録する。
   data: {項目, 施設名, 対象日, 開始?, 終了?, 打刻時刻?, 備考?, 添付ファイルID?, 送信ID}。送信ID は確認カードを出すときに作る（同じIDの2回目は GAS が前の返事を返す）。
   差し戻された申請の「出し直す」（views/requests.js）から来たときは、sessionStorage の ippo.redo の明細で入力を埋めて開く。 */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, state = I.state, api = I.api, esc = I.esc, today = I.today, toast = I.toast;

  // 施設名は options.施設 から（無ければ モア一津屋）。選んだ施設名を data.施設名 として送る（GAS側にも要る）。
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
  // 項目を選んだら、時間に何を入れるかを一言で出す（遅刻の「時間」が何時から何時なのか、などで迷わないように）
  // 見本データ（遅刻 09:00〜09:20）と同じ考え方: 遅刻は 本来の出勤時刻〜着いた時刻、早退は 帰った時刻〜本来の退勤時刻
  var KIND_HINT = {
    '残業・前残業': '残業した時間（始め～終わり）を入れてください。日をまたいでもそのまま入れられます。',
    '遅刻': '本来の出勤時刻 ～ 実際に着いた時刻 を入れてください。電車の遅れなら遅延証明書も添付できます。',
    '早退': '帰った時刻 ～ 本来の退勤時刻 を入れてください。',
    '休日出勤': '出勤した時間（始め～終わり）を入れてください。',
    '打刻修正出勤': '打刻を忘れた・間違えたときに、本当の出勤時刻を入れてください。',
    '打刻修正退勤': '打刻を忘れた・間違えたときに、本当の退勤時刻を入れてください。'
  };
  function kindHint(k) {
    if (!k) return '項目を選ぶと、時間の入れ方が出ます。';
    if (KIND_HINT[k]) return KIND_HINT[k];
    if (isFullDay(k)) return '1日休むときは時間は空のままでかまいません。半日などのときだけ時間を入れてください。' + (k === '特別休暇' ? '理由は備考に書いてください。' : '');
    return '';
  }

  // 当月の残業合計。me の返事の 当月残業合計（'H:mm'）を出す。値が無いときは誤解を避けて何も出さない
  function overtimeLabel() {
    var v = state.me && state.me.当月残業合計;
    if (v === undefined || v === null || v === '') return '';
    return '（' + (new Date().getMonth() + 1) + '月の残業合計：' + esc(v) + '）';
  }
  // ---------- 遅延証明書の下ごしらえ ----------
  var MAX_FILE = 2 * 1024 * 1024, MAX_SIDE = 1600;
  function fmtSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB'; }
  function dataUrlBytes(u) { var b = u.slice(u.indexOf(',') + 1); return Math.floor(b.length * 3 / 4) - (/==$/.test(b) ? 2 : /=$/.test(b) ? 1 : 0); }
  function readAsDataUrl(f) {
    return new Promise(function (ok, ng) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = function () { ng(new Error('ファイルを読めませんでした')); }; r.readAsDataURL(f); });
  }
  // 画像は縮めて JPEG に（写真のままだと大きすぎるため）。2MB を超えるときは画質を下げてやり直す
  function shrinkImage(f) {
    return new Promise(function (ok, ng) {
      var url = URL.createObjectURL(f), img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
        var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        var q = 0.85, out = c.toDataURL('image/jpeg', q);
        while (dataUrlBytes(out) > MAX_FILE && q > 0.4) { q -= 0.15; out = c.toDataURL('image/jpeg', q); }
        if (dataUrlBytes(out) > MAX_FILE) ng(new Error('画像が大きすぎます。もう少し小さく撮ってください')); else ok(out);
      };
      img.onerror = function () { URL.revokeObjectURL(url); ng(new Error('この画像は読めませんでした。JPEG・PNG の写真か PDF を選んでください')); };
      img.src = url;
    });
  }
  function prepareFile(f) {
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
      if (f.size > MAX_FILE) return Promise.reject(new Error('PDF は2MBまでです（このファイルは ' + fmtSize(f.size) + '）'));
      return readAsDataUrl(f).then(function (u) { return u.replace(/^data:[^;,]*/, 'data:application/pdf'); });
    }
    if (/^image\//.test(f.type) || !f.type) return shrinkImage(f);
    return Promise.reject(new Error('JPEG・PNG の写真か PDF を選んでください'));
  }
  // 見本モード: 架空の添付ファイルIDを返す（core.js の Demo は IPPO.demo に登録された操作を先に使う）
  if (I.DEMO && I.demo && !I.demo.uploadAttachment) {
    I.demo.uploadAttachment = function (d) {
      if (!/^data:(image\/(jpeg|png)|application\/pdf);base64,/.test((d && d.ファイル) || '')) throw new Error('JPEG・PNG・PDF のファイルを送ってください');
      return { 添付ファイルID: 'FILE-DEMO-' + Math.random().toString(36).slice(2, 8).toUpperCase() };
    };
  }

  // 済んだことの申請（今日より後の日付は不可）。有給・休暇・休日出勤・欠勤は先の予定を出せる
  var PAST_ONLY = ['遅刻', '早退', '残業・前残業'];
  var pastOnly = function (k) { return isStamp(k) || PAST_ONLY.indexOf(k) >= 0; };
  var MAX_OVERNIGHT_MIN = 12 * 60; // 残業の上限（分）。日をまたぐ場合も含む
  function minutes(t) { var m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; }
  // 差し戻された申請の出し直し: requests.js が sessionStorage に置いた中身を1回だけ取り出す（種類が違えば使わない）
  // 送信ID: 確認カードを出すときに作るランダムな文字。GAS は同じ送信IDの2回目には前の返事を返す（二重登録しない）。
  // 「もう一度送信する」では同じIDを使い、入力に戻って直したら次の確認で作り直す
  function newSendId() {
    try {
      var a = new Uint8Array(16); crypto.getRandomValues(a);
      return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    } catch (_) { return Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
  }
  function takeRedo(type) {
    try {
      var r = JSON.parse(sessionStorage.getItem('ippo.redo') || 'null');
      if (!r || r.種類 !== type) return null;
      sessionStorage.removeItem('ippo.redo'); return r;
    } catch (_) { return null; }
  }

  function viewAttendance() {
    var kinds = (state.options && state.options.勤怠項目) || [];
    var FACILITIES = facilities(), oneFac = FACILITIES.length === 1;
    var redo = takeRedo('勤怠'), rd = redo && (redo.明細 || [])[0] || {};
    if (rd.項目 && kinds.indexOf(rd.項目) < 0) rd = {}; // 今は無い項目なら埋めない

    app.innerHTML =
      '<h1 class="att-title">勤怠申請</h1>' +
      (redo ? '<div class="exp-redo" role="note"><b>差し戻された申請を出し直します</b>' +
        '<span>前の内容を入れてあります。下の理由のところを直して、「内容を確認する」を押してください。</span>' +
        (redo.コメント ? '<span class="exp-redo-why">差戻しの理由：' + esc(redo.コメント) + '</span>' : '') + '</div>' : '') +
      '<div id="att-stage">' +
      '<form id="att-form" class="att-form" novalidate>' +
        '<div class="card att-card">' +
          field('申請者', head('att-申請者', '申請者' + overtimeLabel(), true) +
            '<input id="att-申請者" value="' + esc(state.me && state.me.氏名) + '" readonly aria-readonly="true">') +
          field('施設名', head('att-施設名', '施設名', true) + (oneFac ? sel('att-施設名', FACILITIES, FACILITIES[0], false) : sel('att-施設名', FACILITIES, '', true).replace('<select', '<select class="att-empty"'))) +
          field('項目', head('att-項目', '項目', true) + sel('att-項目', kinds, rd.項目 || '', true).replace('<select', '<select class="att-empty" aria-describedby="att-項目-hint"').replace('<option value=""></option>', '<option value="">選んでください</option>') +
            '<p class="att-hint" id="att-項目-hint" aria-live="polite"></p>') +
          field('対象日', head('att-対象日', '対象日', true) + '<input type="date" id="att-対象日" value="' + esc(rd.対象日 || today()) + '">') +
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
            // 前は「特別休暇の場合は備考欄に詳細を表示」（参考アプリの文）で、何を書くのか分かりにくかった
            '<input id="att-備考" placeholder="例: 電車の遅れ、記録の入力" aria-describedby="att-備考-hint" value="' + esc(redo && (redo.備考 || rd.備考) || '') + '">' +
            '<p class="att-hint" id="att-備考-hint">理由をひとこと書くと、承認が早く進みます。特別休暇のときは、何の休暇かを書いてください。</p>') +
          // 遅延証明書: カメラ・写真・PDF から1つ。選んだときに送れる形にしておき、送信のときに先にアップロードする
          field('遅延証明書', head('att-file', '遅延証明書', false) +
            '<div class="att-file">' +
              '<input type="file" id="att-file" accept="image/jpeg,image/png,image/*,application/pdf" class="att-file-input" aria-describedby="att-file-hint">' +
              '<label for="att-file" class="att-file-btn" id="att-file-name">ファイルを選択</label>' +
              '<button type="button" class="att-file-clear" id="att-file-clear" aria-label="選んだファイルを外す" hidden>×</button>' +
            '</div>' +
            '<p class="att-hint" id="att-file-hint" aria-live="polite">電車などの遅れで遅刻したときに添付します（写真・PDF、2MBまで。写真は自動で小さくします）</p>') +
        '</div>' +
        '<p class="att-formerr" id="att-formerr" role="alert" hidden></p>' +
        // 押すとまず確認カードが出る。そのことが分かる名前にした（前は「送信」）
        '<button type="submit" class="att-send">内容を確認する</button>' +
        (I.backHtml ? I.backHtml('#apply') : '') +
      '</form>' +
      '<div id="att-after"></div>' +
      '</div>';

    var form = document.getElementById('att-form');
    var after = document.getElementById('att-after');
    function $(id) { return document.getElementById('att-' + id); }

    // ---------- ブラウザ（スマホ）の「戻る」 ----------
    // 確認カードを出すときに履歴を1つ積んである。戻るを押すと、書いた内容のまま入力に戻る（「戻って直す」も同じ動き）。
    // 完了カードで戻ると #apply へ（同じ申請をうっかり出し直さないように）。送信中の戻るは何もしない
    var leaving = false;
    function backToForm() { after.innerHTML = ''; form.hidden = false; window.scrollTo(0, 0); }
    function fixTap() {
      if (history.state && history.state.ippoStep === 'confirm') history.back(); // popstate → onPop → backToForm
      else backToForm();
    }
    function onPop() {
      if (leaving || !document.getElementById('att-form')) return;
      if ($('done-h')) { leaving = true; location.replace('#apply'); return; }
      if (form.hidden && $('go') && !$('go').disabled) backToForm();
    }
    window.addEventListener('popstate', onPop);
    I.cleanup.push(function () { window.removeEventListener('popstate', onPop); });
    // 「続けて…する」: 画面の切り替え（core の route）と同じく、後片付けをして番号を進めてから描き直す
    function restart() {
      I.cleanup.splice(0).forEach(function (f) { try { f(); } catch (_) {} });
      I.gen = (I.gen || 0) + 1;
      viewAttendance();
    }

    // ---------- 項目に応じて 時間／打刻時間 を切り替える ----------
    function syncKind() {
      var k = $('項目').value;
      var useRange = !!k && !isStamp(k), useStamp = isStamp(k), optional = isFullDay(k);
      $('開始').disabled = !useRange; $('終了').disabled = !useRange; $('打刻時刻').disabled = !useStamp;
      form.querySelector('[data-f="時間"]').classList.toggle('att-off', !useRange);
      form.querySelector('[data-f="打刻時間"]').classList.toggle('att-off', !useStamp);
      $('項目').classList.toggle('att-empty', !k);
      $('項目-hint').textContent = kindHint(k);
      // 済んだことの申請は、日付を今日までに（先の日付を選べないように）
      if (pastOnly(k)) $('対象日').max = today(); else $('対象日').removeAttribute('max');
      // 欠勤・有給・各種休暇は時間を任意にする（使えるが (任意) 表示）
      $('時間-mark').className = optional ? 'att-opt' : 'att-req';
      $('時間-mark').textContent = optional ? '(任意)' : '(必須)';
      // 項目を変えたら、時間・打刻時間の古いエラーは消す（必須・任意が変わるため）
      clearErr($('開始')); clearErr($('打刻時刻'));
    }
    $('項目').addEventListener('change', syncKind);
    syncKind();
    // ---------- 遅延証明書（選ぶと下ごしらえ。送るのは送信のとき） ----------
    // attach: { name, url（data URL）, id（アップロード済みの添付ファイルID）, busy（下ごしらえ中）, err }
    var attach = null, file = $('file'), HINT = $('file-hint').textContent;
    function syncFile() {
      var nm = $('file-name'), hint = $('file-hint');
      nm.textContent = attach ? attach.name + (attach.url ? '（' + fmtSize(dataUrlBytes(attach.url)) + '）' : '') : 'ファイルを選択';
      nm.classList.toggle('att-picked', !!attach);
      $('file-clear').hidden = !attach;
      hint.classList.toggle('att-hint-bad', !!(attach && attach.err));
      hint.textContent = !attach ? HINT : attach.busy ? '送れる形にしています…' : attach.err ? attach.err : '送信のときに一緒に送ります';
    }
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) { attach = null; syncFile(); return; }
      var mine = attach = { name: f.name, busy: true };
      syncFile(); clearErr(file);
      prepareFile(f).then(function (u) { if (attach === mine) { mine.busy = false; mine.url = u; syncFile(); } })
        .catch(function (e) { if (attach === mine) { mine.busy = false; mine.err = e.message; file.value = ''; syncFile(); } });
    });
    $('file-clear').addEventListener('click', function () { attach = null; file.value = ''; syncFile(); clearErr(file); file.focus(); });

    // 出し直し: 項目に合わせて使えるようになった時間の欄を埋める
    if (rd.項目) {
      if (rd.打刻時刻 && !$('打刻時刻').disabled) $('打刻時刻').value = rd.打刻時刻;
      if (!$('開始').disabled) { $('開始').value = rd.開始 || ''; $('終了').value = rd.終了 || ''; }
    }

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
      var d = { 項目: k, 対象日: $('対象日').value, 施設名: $('施設名').value };
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
      else if (pastOnly(d.項目) && d.対象日 > today()) { showErr('対象日', d.項目 + 'は今日より後の日付にできません'); n++; }
      if (d.項目 && isStamp(d.項目)) {
        if (!d.打刻時刻) { showErr('打刻時間', '打刻時間を入れてください'); n++; }
      } else if (isFullDay(d.項目)) {
        if (!!d.開始 !== !!d.終了) { showErr('時間', '時間は開始と終了の両方を入れるか、両方空にしてください'); n++; }
        else if (d.開始 && d.開始 >= d.終了) { showErr('時間', '終了は開始より後にしてください'); n++; }
      } else if (d.項目) {
        if (!d.開始 || !d.終了) { showErr('時間', '時間（開始～終了）を入れてください'); n++; }
        else if (d.開始 === d.終了) { showErr('時間', '開始と終了が同じです。時間を確かめてください'); n++; }
        else if (d.開始 > d.終了 && d.項目 !== '残業・前残業') { showErr('時間', '終了は開始より後にしてください'); n++; }
        // 残業は12時間まで（GAS と同じ）。終了が開始より前なら日をまたぐとみなして数える。長すぎるものは打ち間違いが多い
        else if (d.項目 === '残業・前残業' && (minutes(d.終了) - minutes(d.開始) + 1440) % 1440 > MAX_OVERNIGHT_MIN) {
          showErr('時間', '残業は12時間までです' + (d.開始 > d.終了 ? '（日をまたぐ場合も）' : '') + '。開始と終了を確かめてください'); n++;
        }
      }
      if (attach && attach.busy) { showErr('遅延証明書', 'ファイルを送れる形にしています。少し待ってから送信してください'); n++; }
      else if (attach && attach.err) { showErr('遅延証明書', attach.err + '（外すときは×）'); n++; }
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
      var time = isFullDay(d.項目) && !d.開始 ? '' : d.打刻時刻 ? '<dt>打刻時間</dt><dd>' + esc(d.打刻時刻) + '</dd>' :
        '<dt>時間</dt><dd>' + esc(d.開始) + ' ～ ' + esc(d.終了) + (d.開始 >= d.終了 ? '<span class="att-note">（翌日にまたがる）</span>' : '') + '</dd>';
      form.hidden = true;
      d.送信ID = newSendId();
      try { history.pushState({ ippoStep: 'confirm' }, ''); } catch (_) {} // ブラウザの「戻る」で入力に戻れるように
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
            (attach && attach.url ? '<dt>遅延証明書</dt><dd>' + esc(attach.name) + '<span class="att-note att-note-ok">送信のときに一緒に送ります</span></dd>' : '') +
          '</dl>' +
          '<div class="att-senderr" id="att-senderr" role="alert" hidden></div>' +
        '</section>' +
        '<div class="att-actions">' +
          '<button type="button" class="att-send" id="att-go">この内容で送信</button>' +
          '<button type="button" class="att-back" id="att-fix">戻って直す</button>' +
        '</div>';
      window.scrollTo(0, 0);
      $('fix').addEventListener('click', fixTap);
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
      var a = attach && attach.url ? attach : null;
      // 添付があれば先にアップロード（送れたIDは覚えておき、送り直しでは使い回す）
      var up = !a || a.id ? Promise.resolve() : api('uploadAttachment', { ファイル: a.url }).then(function (r) {
        if (!r || !r.添付ファイルID) throw new Error('遅延証明書を送れませんでした');
        a.id = r.添付ファイルID;
      }, function (e) { var x = new Error('遅延証明書を送れませんでした：' + ((e && e.message) || '通信できませんでした')); x.details = e && e.details; throw x; });
      up.then(function () {
        if (a) d.添付ファイルID = a.id; else delete d.添付ファイルID;
        return api('submitAttendance', d);
      }).then(function (res) {
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
      try { if (history.state && history.state.ippoStep === 'confirm') history.replaceState({ ippoStep: 'done' }, ''); } catch (_) {}
      var when = d.打刻時刻 ? '打刻 ' + d.打刻時刻 : d.開始 ? d.開始 + '～' + d.終了 : '';
      after.innerHTML =
        '<section class="card att-card att-done" aria-labelledby="att-done-h">' +
          '<svg class="att-done-ic" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21"/><path d="M14 24.5l7 7 13-14"/></svg>' +
          '<h2 id="att-done-h">勤怠申請を送信しました</h2>' +
          '<p class="att-done-sum">' + esc(d.項目) + '　' + esc(fmtDate(d.対象日)) + (when ? '　' + esc(when) : '') + '</p>' +
          '<p class="att-done-id">申請番号 ' + esc(res.申請ID || '—') + '</p>' +
          (res.状態 ? '<p>' + I.pill(res.状態) + '</p>' : '') +
          (d.添付ファイルID ? '<p class="att-done-note">遅延証明書も送りました。</p>' : '') +
          '<p class="att-done-note">承認されると「自分の申請」の状態が変わります。</p>' +
        '</section>' +
        '<div class="att-actions">' +
          '<a class="att-send" href="#requests">自分の申請を見る</a>' +
          '<button type="button" class="att-back" id="att-again">続けて勤怠申請する</button>' +
          (I.backHtml ? I.backHtml('#apply') : '') +
        '</div>';
      window.scrollTo(0, 0);
      $('done-h').setAttribute('tabindex', '-1'); $('done-h').focus();
      $('again').addEventListener('click', restart);
    }
  }

  I.views.attendance = viewAttendance;
})();
