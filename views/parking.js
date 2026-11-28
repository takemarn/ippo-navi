/* 駐車場ナビ（第4段階）。参考動画 5:20〜
   #parking … 上に 空き／使用中／まもなく／予定超過 の台数 → 「今すぐ停めるなら○番が空いています」→ 駐車場ごとのカード
              カードには 名前・説明・地図で開く・区画ごとの状態。空きは「停める」、自分（と関係事業者）の車は「出庫」
   「停める」を押した時刻から、選んだ時間（ふつう8時間）後を空き予定にする。予定を過ぎた車は「予定超過」
   GAS とのやりとり: parking / parkIn / parkOut（kiroku-app の docs/api.md「相談AI」） */
(function () {
  'use strict';
  var I = window.IPPO, app = I.app, api = I.api, esc = I.esc;
  var T = function () { return I.portalTools; };
  var SOON_MIN = 60; // 空き予定まで これ以内なら「まもなく」
  var st = null;

  function toDate(s) { return new Date(String(s).replace(' ', 'T')); }
  function hm(s) { var d = toDate(s); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2); }
  function mins(a, b) { return Math.round((b - a) / 60000); }
  function dur(m) { m = Math.abs(m); return (m >= 60 ? Math.floor(m / 60) + '時間' : '') + (m % 60) + '分'; }

  // 区画の状態: 空き / まもなく / 使用中 / 予定超過
  function slotState(p, now) {
    if (!p) return { k: 'free', label: '空き' };
    var left = mins(now, toDate(p.予定));
    if (left < 0) return { k: 'over', label: '予定超過', left: left };
    if (left <= SOON_MIN) return { k: 'soon', label: 'まもなく', left: left };
    return { k: 'used', label: '使用中', left: left };
  }

  function viewParking() {
    app.innerHTML = '<div id="pk">' + skeleton() + '</div>' + I.backHtml();
    app.addEventListener('click', onClick);
    I.cleanup.push(function () { app.removeEventListener('click', onClick); });
    load('parking');
  }
  function skeleton() {
    return '<section class="pk-head"><h1>駐車場ナビ</h1><p>— 読み込み中 —</p><div class="pk-counts">' +
      ['空き', '使用中', 'まもなく', '予定超過'].map(function (l) { return '<div><b>–</b><small>' + l + '</small></div>'; }).join('') + '</div></section>' +
      T().loading('読み込み中...');
  }
  function load(action, d) {
    return api(action, d).then(function (res) { st = res; render(); })
      .catch(function (e) { var box = document.getElementById('pk'); if (box) box.innerHTML = T().failBox(e); throw e; });
  }

  function render() {
    var box = document.getElementById('pk');
    if (!box || !st) return;
    var now = st.現在 ? toDate(st.現在) : new Date();
    var me = I.state.me || {};
    var c = { free: 0, used: 0, soon: 0, over: 0 }, firstFree = null;
    var lots = (st.駐車場 || []).map(function (l) {
      var slots = (l.区画 || []).map(function (name) {
        var p = (l.駐車中 || []).filter(function (x) { return x.区画 === name; })[0];
        var s = slotState(p, now);
        c[s.k]++;
        if (s.k === 'free' && !firstFree) firstFree = l.名前 + ' の ' + name;
        return { name: name, p: p, s: s };
      });
      return { l: l, slots: slots };
    });
    var d = now;
    box.innerHTML =
      '<section class="pk-head"><h1>駐車場ナビ</h1><p>' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2) + ' 現在</p>' +
        '<div class="pk-counts">' +
          '<div class="free"><b>' + c.free + '</b><small>空き</small></div><div class="used"><b>' + c.used + '</b><small>使用中</small></div>' +
          '<div class="soon"><b>' + c.soon + '</b><small>まもなく</small></div><div class="over"><b>' + c.over + '</b><small>予定超過</small></div></div></section>' +
      '<p class="pk-best' + (firstFree ? '' : ' none') + '" role="status">' + (firstFree
        ? '✓ 今すぐ停めるなら <b>' + esc(firstFree) + '</b> が空いています。'
        : 'いま空いている場所はありません。「まもなく」の場所を見てください。') + '</p>' +
      '<div class="row pk-listhead"><h2 class="ptl-sec">駐車場一覧（どこに停めて・だれが・いつから）</h2><button type="button" class="small sub" data-reload="1">更新</button></div>' +
      lots.map(function (x) {
        return '<section class="pk-lot"><div class="pk-lot-h"><div><b>' + esc(x.l.名前) + '</b><small>' + esc(x.l.説明 || '') + '</small></div>' +
          (x.l.地図 ? '<a class="pk-map" href="' + esc(x.l.地図) + '" target="_blank" rel="noopener">地図で開く</a>' : '') + '</div>' +
          x.slots.map(function (sl) { return slotRow(x.l, sl, me); }).join('') + '</section>';
      }).join('') +
      '<ul class="pk-legend" aria-label="色の見かた"><li class="free">空き</li><li class="soon">まもなく空く（' + SOON_MIN + '分以内）</li><li class="used">使用中</li><li class="over">予定超過</li></ul>' +
      '<p class="ptl-note">「停める」を押した時刻から、選んだ時間（ふつう8時間）後を空く予定として表示します。予定を過ぎると「予定超過」になります。</p>';
  }

  function slotRow(l, sl, me) {
    var p = sl.p, s = sl.s;
    if (!p) {
      return '<div class="pk-slot free"><span class="pk-no">' + esc(sl.name) + '</span><div class="pk-who"><b>空き</b><small>すぐ停められます</small></div>' +
        '<button type="button" class="small pk-in" data-lot="' + esc(l.駐車場ID) + '" data-slot="' + esc(sl.name) + '">停める</button></div>';
    }
    var mine = p.停めた職員ID ? p.停めた職員ID === me.職員ID : p.氏名 === me.氏名;
    var when = s.k === 'over' ? '予定 ' + hm(p.予定) + ' を ' + dur(s.left) + ' 超過' : '空き予定 ' + hm(p.予定) + '（あと ' + dur(s.left) + '）';
    return '<div class="pk-slot ' + s.k + '"><span class="pk-no">' + esc(sl.name) + '</span>' +
      '<div class="pk-who"><span class="pk-st">' + esc(s.label) + '</span><b>' + esc(p.氏名) + '</b>' +
        '<small>' + (p.車 ? esc(p.車) + ' ／ ' : '') + '停めた ' + hm(p.停めた) + '</small><small>' + esc(when) + '</small></div>' +
      // 出庫は本人のほか、運営（承認者・管理者）が代わりに押せる（関係事業者の車や押し忘れのため）
      (mine || I.canApprove() ? '<button type="button" class="small sub pk-out" data-out="' + esc(p.記録ID) + '">出庫</button>' : '') + '</div>';
  }

  // 「停める」: 下に小さなフォームを開く（時間・車の目印・関係事業者の代わりに）
  function openIn(btn) {
    var row = btn.closest('.pk-slot');
    var open = document.querySelector('.pk-form');
    if (open) { var same = open.previousElementSibling === row; open.remove(); if (same) return; }
    var f = document.createElement('form');
    f.className = 'pk-form'; f.setAttribute('novalidate', '');
    f.innerHTML = '<label>停める時間<select id="pk-h">' + [1, 2, 3, 4, 6, 8, 10, 12, 16, 24].map(function (h) {
        return '<option value="' + h + '"' + (h === 8 ? ' selected' : '') + '>' + h + '時間</option>'; }).join('') + '</select></label>' +
      '<label>車の目印 <span class="opt">任意</span><input id="pk-car" maxlength="40" placeholder="例）白い軽"></label>' +
      (I.canApprove() ? '<label class="ptl-check"><input type="checkbox" id="pk-proxy"> 関係事業者の方の車として登録する</label>' : '') +
      '<div id="pk-err"></div><div class="actions"><button type="button" class="sub" data-cancel="1">やめる</button><button type="submit">ここに停める</button></div>';
    row.after(f);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var go = f.querySelector('button[type=submit]');
      go.disabled = true; go.textContent = '送信中…';
      var px = document.getElementById('pk-proxy');
      api('parkIn', { 駐車場ID: btn.dataset.lot, 区画: btn.dataset.slot, 時間: Number(document.getElementById('pk-h').value),
        車: document.getElementById('pk-car').value.trim(), 代理: !!(px && px.checked) })
        .then(function (res) { st = res; render(); I.toast(btn.dataset.slot + ' に停めました'); })
        .catch(function (e2) {
          go.disabled = false; go.textContent = 'ここに停める';
          document.getElementById('pk-err').innerHTML = e2.details && e2.details.length ? I.errorsBox(e2.details) : T().failBox(e2);
        });
    });
  }

  function onClick(e) {
    var b = e.target.closest('button');
    if (!b || !app.contains(b)) return;
    if (b.dataset.reload) { b.disabled = true; return load('parking').catch(function () {}); }
    if (b.dataset.cancel) { var f = b.closest('.pk-form'); if (f) f.remove(); return; }
    if (b.classList.contains('pk-in')) return openIn(b);
    if (b.dataset.out) {
      b.disabled = true; b.textContent = '出庫中…';
      api('parkOut', { 記録ID: b.dataset.out }).then(function (res) { st = res; render(); I.toast('出庫しました'); })
        .catch(function (e2) { b.disabled = false; b.textContent = '出庫'; I.toast(e2.message); });
    }
  }

  I.views.parking = viewParking;
})();
