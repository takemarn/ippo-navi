/* 駐車場ナビ（第4段階）。参考動画 5:20〜
   #parking … 上に固定の 空き／使用中／まもなく／予定超過 の台数 → 「今すぐ停めるなら○が空いています」→ 駐車場ごとのカード
              カード: 写真（あれば）・名前・説明・目安の札・地図で開く・区画ごとの状態。空きは「停める」、自分の車は「出庫」
              番号の無い駐車場（区画が空で 台数 だけある）は、停まっている車と「空きスペースあり あと約N台」の行を出す
   「停める」を押した時刻から、選んだ時間（ふつう8時間）後を空き予定にする。予定を過ぎた車は「予定超過」
   開いている間は1分ごとに表示をし直す（「まもなく」「予定超過」が時間で変わるため）
   views/portal.js（I.portalTools）を先に読み込むこと
   GAS とのやりとり: parking / parkIn / parkOut（kiroku-app の docs/api.md「相談AI」） */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, api = I.api, esc = I.esc;
  var T = function () { return I.portalTools; };
  var SOON_MIN = 60;   // 空き予定まで これ以内なら「まもなく」
  var FREE = '空きスペース'; // 番号の無い駐車場に停めるときの区画名
  var st = null, skew = 0;
  var flt = ''; // 上の台数を押したときの絞り込み（free / used / soon / over）。もう一度押すと解除
  var LABEL = { free: '空き', used: '使用中', soon: 'まもなく', over: '予定超過' };
  var WD = ['日', '月', '火', '水', '木', '金', '土']; // skew: サーバーの時刻 − 端末の時刻（ミリ秒）。端末の時計がずれていても正しく数える

  // 'yyyy-MM-dd HH:mm(:ss)' を日本時間として読む（Safari でも同じ結果になるよう、自分で分けて読む）
  function toDate(s) {
    // 時刻がちょうど 0:00 のとき、シートからは日付だけが届くので、時刻は省略可
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(s || '').trim());
    if (!m) return new Date(s);
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }
  // 今日なら時刻だけ（7:08）、ほかの日は 11/27 23:47。途中で折り返さないよう1つのかたまりにする
  function hm(s) {
    var d = toDate(s), n = now();
    var t = d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2);
    var same = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
    return '<span class="ptl-nw">' + (same ? t : (d.getMonth() + 1) + '/' + d.getDate() + ' ' + t) + '</span>';
  }
  function mins(a, b) { return Math.round((b - a) / 60000); }
  function dur(m) {
    m = Math.abs(m);
    var h = Math.floor(m / 60), r = m % 60;
    return '<span class="ptl-nw">' + (h ? h + '時間' : '') + (r || !h ? r + '分' : '') + '</span>';
  }
  function now() { return new Date(Date.now() + skew); }

  // 区画の状態: 空き / まもなく / 使用中 / 予定超過
  function slotState(p, at) {
    if (!p) return { k: 'free', label: '空き' };
    var left = mins(at, toDate(p.予定));
    if (left < 0) return { k: 'over', label: '予定超過', left: left };
    if (left <= SOON_MIN) return { k: 'soon', label: 'まもなく', left: left };
    return { k: 'used', label: '使用中', left: left };
  }

  function viewParking() {
    app.innerHTML = '<div id="pk" class="ptl-stack">' + skeleton() + '</div>' + I.backHtml();
    app.addEventListener('click', onClick);
    var timer = setInterval(function () { if (st && !document.querySelector('.pk-form')) render(); }, 60000);
    I.cleanup.push(function () { app.removeEventListener('click', onClick); clearInterval(timer); document.getElementById('toast').hidden = true; });
    load('parking');
  }
  function skeleton() {
    return '<section class="pk-head" aria-busy="true"><h1><span class="pk-p" aria-hidden="true">P</span>駐車場ナビ</h1><p>— 読み込み中 —</p><div class="pk-counts">' +
      ['空き', '使用中', 'まもなく', '予定超過'].map(function (l) { return '<div><b>–</b><small>' + l + '</small></div>'; }).join('') + '</div></section>' +
      // 読み込み中は、カードの形だけ先に見せる（参考アプリも同じ形で待つ）
      '<div class="pk-skel" aria-hidden="true"><i></i><i></i><i></i></div>' + T().loading('駐車場の空きを確かめています…');
  }
  function take(res) {
    st = res;
    if (res && res.現在) skew = toDate(res.現在).getTime() - Date.now();
  }
  function load(action, d) {
    var ok = T().alive();
    return api(action, d).then(function (res) { if (!ok()) return; take(res); render(); })
      .catch(function (e) { var box = document.getElementById('pk'); if (box && ok()) box.innerHTML = T().failBox(e, true); });
  }

  // 1つの駐車場の行（区画ごと、または番号なしの駐車場は 停まっている車＋空きスペース）
  function lotRows(l, at, c, best) {
    var parked = l.駐車中 || [];
    var rows = [];
    if ((l.区画 || []).length) {
      l.区画.forEach(function (name) {
        var p = parked.filter(function (x) { return x.区画 === name; })[0];
        var s = slotState(p, at);
        c[s.k]++;
        if (s.k === 'free' && !best.name) best.name = l.名前 + ' の ' + name;
        rows.push({ name: name, p: p, s: s });
      });
    } else {
      parked.forEach(function (p) { var s = slotState(p, at); c[s.k]++; rows.push({ name: '', p: p, s: s }); });
      var left = Math.max(0, Number(l.台数 || 0) - parked.length);
      c.free += left;
      if (left && !best.name) best.name = l.名前;
      if (left) rows.push({ name: '', p: null, s: { k: 'free', label: '空き' }, space: left });
    }
    return rows;
  }

  function render() {
    var box = document.getElementById('pk');
    if (!box || !st) return;
    var at = now();
    var me = I.state.me || {};
    var c = { free: 0, used: 0, soon: 0, over: 0 }, best = {};
    var lots = (st.駐車場 || []).map(function (l) { return { l: l, rows: lotRows(l, at, c, best) }; });
    if (flt && !c[flt]) flt = ''; // 絞り込んだ状態の車がいなくなったら解除
    box.innerHTML =
      '<section class="pk-head"><h1><span class="pk-p" aria-hidden="true">P</span>駐車場ナビ</h1><p>' + (at.getMonth() + 1) + '月' + at.getDate() + '日（' + WD[at.getDay()] + '） ' + at.getHours() + ':' + ('0' + at.getMinutes()).slice(-2) + ' 現在</p>' +
        '<div class="pk-counts" role="group" aria-label="台数（押すと、その状態だけ出します）">' + ['free', 'used', 'soon', 'over'].map(function (k) {
          return '<button type="button" class="' + k + (flt === k ? ' on' : '') + '" data-flt="' + k + '" aria-pressed="' + (flt === k) + '"' + (c[k] ? '' : ' disabled') + '><b>' + c[k] + '</b><small>' + LABEL[k] + '</small></button>';
        }).join('') + '</div></section>' +
      '<div class="pk-best' + (best.name ? '' : ' none') + '" role="status">' + (best.name
        ? '<p><span class="pk-okic" aria-hidden="true">✓</span>今すぐ停めるなら <b>' + esc(best.name) + '</b> が空いています。</p><small>空き ' + c.free + ' 台 ／ 場所は各カードの「地図で開く」から</small>'
        : '<p>いま空いている場所はありません。「まもなく」の場所を見てください。</p>') + '</div>' +
      '<div class="pk-listhead"><h2 class="ptl-sec">駐車場一覧 <small>どこに・だれが・いつから</small></h2><button type="button" class="sub pk-reload" data-reload="1">↻ 更新</button></div>' +
      (flt ? '<div class="pk-flt" role="status"><span>「' + LABEL[flt] + '」だけ表示中（' + c[flt] + '台）</span><button type="button" class="small sub" data-flt="' + flt + '">すべて表示</button></div>' : '') +
      (lots.length ? lots.filter(function (x) { return !flt || x.rows.some(function (r) { return r.s.k === flt; }); }).map(function (x) {
        var map = T().safeUrl(x.l.地図), photo = T().safeUrl(x.l.写真);
        return '<section class="pk-lot">' +
          (photo ? '<div class="pk-photo"><img src="' + esc(photo) + '" alt="' + esc(x.l.名前) + 'の写真" loading="lazy">' +
            (x.l.目安 ? '<span class="pk-cap">' + esc(x.l.目安) + '</span>' : '') + '</div>' : '') +
          '<div class="pk-lot-h"><div><b>' + esc(x.l.名前) + '</b><small>' + esc(x.l.説明 || '') + '</small>' +
            (!photo && x.l.目安 ? '<span class="pk-cap inline">' + esc(x.l.目安) + '</span>' : '') + '</div>' +
          (map ? '<a class="pk-map" href="' + esc(map) + '" target="_blank" rel="noopener">📍 地図で開く</a>' : '') + '</div>' +
          strip(x.l, x.rows) +
          x.rows.filter(function (r) { return !flt || r.s.k === flt; }).map(function (r) { return slotRow(x.l, r, me); }).join('') + '</section>';
      }).join('') : '<div class="loading">駐車場がまだ登録されていません。</div>') +
      '<ul class="pk-legend" aria-label="色の見かた"><li class="free">空き</li><li class="soon">まもなく空く（' + SOON_MIN + '分以内）</li><li class="used">使用中</li><li class="over">予定超過</li></ul>' +
      '<p class="ptl-note">「停める」を押した時刻から、選んだ時間（ふつう8時間）後を空く予定として表示します。予定を過ぎると「予定超過」になります。</p>';
  }

  // 区画の並び: 番号つきの駐車場は、区画を色の四角で横に並べる（ひと目で空きが分かる）。
  // 番号なしの駐車場は「N台中 M台」の棒で見せる
  function strip(l, rows) {
    if ((l.区画 || []).length) {
      return '<div class="pk-strip" aria-label="区画の並び">' + rows.map(function (r) {
        return '<span class="' + r.s.k + '" title="' + esc(r.name + ' ' + r.s.label) + '">' + esc(String(r.name).replace(/番$/, '')) + '</span>';
      }).join('') + '</div>';
    }
    var cap = Number(l.台数 || 0), used = (l.駐車中 || []).length;
    if (!cap) return '';
    var pct = Math.min(100, Math.round(used / cap * 100));
    return '<div class="pk-bar" role="img" aria-label="' + cap + '台中 ' + used + '台 使用中"><i style="width:' + pct + '%"></i></div>' +
      '<p class="pk-barl">' + cap + '台中 <b>' + used + '台</b> 使用中' + (used >= cap ? '（満車）' : '') + '</p>';
  }

  function slotRow(l, r, me) {
    var p = r.p, s = r.s;
    var no = r.name ? '<span class="pk-no">' + esc(r.name) + '</span>' : '<span class="pk-no" aria-hidden="true">' + (p ? '🚗' : '＋') + '</span>';
    if (!p) {
      return '<div class="pk-slot free">' + no + '<div class="pk-who"><b>' + (r.space ? '空きスペースあり' : '空き') + '</b>' +
        '<small>' + (r.space ? 'あと約' + r.space + '台（番号なし）' : 'すぐ停められます') + '</small></div>' +
        '<button type="button" class="pk-in" data-lot="' + esc(l.駐車場ID) + '" data-slot="' + esc(r.name || FREE) + '">停める</button></div>';
    }
    var mine = p.停めた職員ID ? p.停めた職員ID === me.職員ID : p.氏名 === me.氏名;
    var when = s.k === 'over' ? '予定 ' + hm(p.予定) + ' を ' + dur(s.left) + ' 超過' : '空く予定 ' + hm(p.予定) + '（あと ' + dur(s.left) + '）';
    return '<div class="pk-slot ' + s.k + (mine ? ' mine' : '') + '">' + no +
      '<div class="pk-who"><span class="pk-st">' + esc(s.label) + '</span><b>' + esc(p.氏名) + (mine ? ' <span class="ptl-you">' + (p.氏名 === me.氏名 ? 'あなた' : 'あなたが登録') + '</span>' : '') + '</b>' +
        '<small>' + (p.車 ? esc(p.車) + ' ／ ' : '') + '停めた ' + hm(p.停めた) + '</small><small>' + when + '</small></div>' +
      // 出庫は本人のほか、運営（承認者・管理者）が代わりに押せる（関係事業者の車や押し忘れのため）。押しまちがい防止で2回押す
      (mine || I.canApprove() ? '<button type="button" class="sub pk-out" data-out="' + esc(p.記録ID) + '" data-where="' + esc(l.名前 + (r.name ? 'の' + r.name : '')) + '"' + (mine ? '' : ' data-who="' + esc(p.氏名) + '"') + '>出庫</button>' : '') + '</div>';
  }

  // 「停める」: 行の下に小さなフォームを開く（時間・車の目印・関係事業者の代わりに）
  function openIn(btn) {
    var row = btn.closest('.pk-slot');
    var open = document.querySelector('.pk-form');
    if (open) { var same = open.previousElementSibling === row; open.remove(); if (same) return; }
    var f = document.createElement('form');
    f.className = 'pk-form'; f.setAttribute('novalidate', '');
    f.innerHTML = (I.canApprove() ? '<label class="ptl-check"><input type="checkbox" id="pk-proxy"> 関係事業者の方の車として登録する</label>' : '') +
      '<label>停める時間<select id="pk-h">' + [1, 2, 3, 4, 6, 8, 10, 12, 16, 24].map(function (h) {
        return '<option value="' + h + '"' + (h === 8 ? ' selected' : '') + '>' + h + '時間</option>'; }).join('') + '</select></label>' +
      '<label><span>車の目印 <span class="opt">任意</span></span><input id="pk-car" maxlength="40" placeholder="例）白い軽"></label>' +
      '<div class="pk-err"></div><div class="actions"><button type="button" class="sub" data-cancel="1">やめる</button><button type="submit">ここに停める</button></div>';
    row.after(f);
    f.scrollIntoView({ block: 'nearest' });
    var lotName = (row.closest('.pk-lot').querySelector('.pk-lot-h b') || {}).textContent || '';
    var pxBox = f.querySelector('#pk-proxy');
    if (pxBox) pxBox.addEventListener('change', function () { f.querySelector('#pk-car').placeholder = pxBox.checked ? '例）訪問入浴の車・○○社' : '例）白い軽';
      f.querySelector('#pk-h').value = pxBox.checked ? '2' : '8'; }); // 訪問の車は短いことが多いので2時間に
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var go = f.querySelector('button[type=submit]');
      if (go.disabled) return;
      go.disabled = true; go.textContent = '送信中…';
      var px = f.querySelector('#pk-proxy'), ok = T().alive();
      api('parkIn', { 駐車場ID: btn.dataset.lot, 区画: btn.dataset.slot, 時間: Number(f.querySelector('#pk-h').value),
        車: f.querySelector('#pk-car').value.trim(), 代理: !!(px && px.checked) })
        .then(function (res) { if (!ok()) return; take(res); render(); var where = lotName + (btn.dataset.slot === FREE ? '' : 'の' + btn.dataset.slot);
          I.toast(px && px.checked ? where + 'に関係事業者の車を登録しました' : where + 'に停めました'); })
        .catch(function (e2) {
          if (!f.isConnected) { I.toast(e2.message); return; }
          go.disabled = false; go.textContent = 'ここに停める';
          f.querySelector('.pk-err').innerHTML = e2.details && e2.details.length ? I.errorsBox(e2.details) : T().failBox(e2);
        });
    });
  }

  function onClick(e) {
    var b = e.target.closest('button');
    if (!b || !app.contains(b) || b.disabled) return;
    if (b.dataset.flt) { flt = flt === b.dataset.flt ? '' : b.dataset.flt; render(); return; }
    if (b.dataset.reload) { b.disabled = true; b.textContent = '更新中…'; return load('parking'); }
    if (b.dataset.cancel) { var f = b.closest('.pk-form'); if (f) f.remove(); return; }
    if (b.classList.contains('pk-in')) return openIn(b);
    if (b.dataset.out) {
      // 1回目は「もう一度押すと出庫」に変わるだけ。4秒以内にもう一度押すと出庫する
      if (!b.dataset.armed) {
        b.dataset.armed = '1'; b.textContent = b.dataset.who ? b.dataset.who + 'の車を出庫' : 'もう一度押すと出庫'; b.classList.add('armed');
        setTimeout(function () { if (b.isConnected && b.dataset.armed) { delete b.dataset.armed; b.textContent = '出庫'; b.classList.remove('armed'); } }, 4000);
        return;
      }
      b.disabled = true; b.textContent = '出庫中…';
      var ok = T().alive();
      api('parkOut', { 記録ID: b.dataset.out }).then(function (res) { if (!ok()) return; take(res); render(); I.toast(b.dataset.where + (b.dataset.who ? 'の ' + b.dataset.who + 'さんの車を' : 'から') + '出庫しました'); })
        .catch(function (e2) { if (!b.isConnected) return; b.disabled = false; delete b.dataset.armed; b.textContent = '出庫'; b.classList.remove('armed'); I.toast(e2.message); });
    }
  }

  I.views.parking = viewParking;
})();
