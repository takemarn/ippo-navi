/* 利用者管理・記録・タスク依頼の見本データ（見本モードのときだけ使う）。
   名前・住所・電話番号・保険番号はすべて架空。GAS の clients.js と同じ返事の形を返す（kiroku-app の docs/api.md「利用者・記録」） */
(function () {
  'use strict';
  var I = window.IPPO;
  if (!I.DEMO) return;

  var FAC = 'モア一津屋';
  var CATS = [
    ['利用者データ', ['利用者ID', 'ステータス', '入居日', '退居日', '施設名', '部屋番号', '氏名', 'ふりがな', '性別', '生年月日', '年齢', 'ご逝去', '郵便番号', '住所', '住所よみがな']],
    ['医療保険情報', ['既往歴', '別表7,8', '医療保険 負担割合', '保険者', '保険者番号', '医療保険番号', '医療保険 本人／家族', '所得区分（適応区分）', '医療保険有効 終了年月日']],
    ['生活保護', ['生活保護', '対応市町村']],
    ['介護保険情報', ['認定日', '介護保険有効 開始年月日', '介護保険有効 終了年月日', '介護保険保険者名', '介護保険保険者番号', '介護保険被保険者番号', '介護度', '介護保険 負担割合', '手帳', '認知症']],
    ['緊急連絡先', ['緊急連絡先 氏名', '緊急連絡先 ふりがな', '緊急連絡先 続柄', '緊急連絡先 電話番号']],
    ['医療機関情報', ['指示書有効 開始期間', '指示書有効 終了期間', '指示区分', '医療機関名', '主治医名', '科', '担当Dr.', '住所', '連絡先', '施設側担当者']],
    ['ケアマネマスタ', ['事業所名', '担当者', '住所', '連絡先']],
    ['訪問診療マスタ', ['主治医名', '医療機関名', '科', '担当Dr.', '住所', '連絡先', '施設側担当者']],
    ['訪問薬局マスタ', ['主治医名', '医療機関名', '科', '担当Dr.', '住所', '連絡先', '施設側担当者']],
    ['福祉用具マスタ', ['事業所名', '担当者', '住所', '連絡先']],
    ['訪問歯科マスタ', ['主治医名', '医療機関名', '科', '担当Dr.', '住所', '連絡先', '施設側担当者']],
    ['訪問鍼灸マスタ', ['医療機関名', '担当Dr.', '住所', '連絡先', '施設側担当者']],
    ['訪問介護ステーションマスタ', ['事業所名', '事業所番号', '住所', '連絡先']]
  ];
  var MAIN = ['利用者ID', '施設名', '部屋番号', '氏名', 'ふりがな', 'ステータス'];
  I.CLIENT_CATEGORIES = CATS; // 新規登録・データ修正の入力欄にも使う（本番は GAS の options.利用者項目。並びは参考アプリの情報閲覧に合わせ、介護保険情報の「顔写真」は写真登録で別に持つので入れない）

  // 架空の利用者
  var clients = [
    { 利用者ID: '12', 氏名: '見本 一子', ふりがな: 'ミホン カズコ', 部屋番号: '101', ステータス: '居住中', タグ: ['生活保護'], 生: '1938-04-12', 性: '女', 介護度: '要介護3', 別表: 'なし', 保護: 'あり' },
    { 利用者ID: '15', 氏名: '見本 二郎', ふりがな: 'ミホン ジロウ', 部屋番号: '102', ステータス: '居住中', タグ: ['別表7'], 生: '1942-09-30', 性: '男', 介護度: '要介護5', 別表: '別表7', 保護: 'なし' },
    { 利用者ID: '18', 氏名: '試験 花代', ふりがな: 'シケン ハナヨ', 部屋番号: '105', ステータス: '入院中', タグ: [], 生: '1935-01-05', 性: '女', 介護度: '要介護2', 別表: 'なし', 保護: 'なし' },
    { 利用者ID: '21', 氏名: '架空 三吉', ふりがな: 'カクウ サンキチ', 部屋番号: '201', ステータス: '居住中', タグ: ['生活保護', '別表7'], 生: '1945-07-21', 性: '男', 介護度: '要介護4', 別表: '別表7', 保護: 'あり' },
    { 利用者ID: '24', 氏名: '例題 春子', ふりがな: 'レイダイ ハルコ', 部屋番号: '203', ステータス: '居住中', タグ: [], 生: '1940-03-03', 性: '女', 介護度: '要介護1', 別表: 'なし', 保護: 'なし' },
    { 利用者ID: '27', 氏名: '見本 四朗', ふりがな: 'ミホン シロウ', 部屋番号: '', ステータス: '退居', タグ: [], 生: '1939-12-24', 性: '男', 介護度: '要介護3', 別表: 'なし', 保護: 'なし' },
    { 利用者ID: '30', 氏名: '試験 秋江', ふりがな: 'シケン アキエ', 部屋番号: '206', ステータス: '居住中', タグ: ['別表7'], 生: '1937-10-10', 性: '女', 介護度: '要介護5', 別表: '別表7', 保護: 'なし' },
    { 利用者ID: '33', 氏名: '架空 冬彦', ふりがな: 'カクウ フユヒコ', 部屋番号: '', ステータス: '登録なし', タグ: [], 生: '1950-02-14', 性: '男', 介護度: '', 別表: 'なし', 保護: 'なし' }
  ];
  var info = {}, photos = {};
  clients.forEach(function (c, i) {
    c.施設名 = FAC;
    info[c.利用者ID] = {
      '利用者データ': { 入居日: '2024-0' + (i % 9 + 1) + '-15', 退居日: c.ステータス === '退居' ? '2026-10-31' : '', 性別: c.性, 生年月日: c.生,
        ご逝去: '', 郵便番号: '000-0000', 住所: '（見本）大阪府どこか市1-2-3', 住所よみがな: '（みほん）' },
      '医療保険情報': { 既往歴: ['高血圧症', '糖尿病、脳梗塞後遺症', '骨粗しょう症', '心不全'][i % 4], '別表7,8': c.別表, '医療保険 負担割合': '1割',
        保険者: '（見本）後期高齢者医療広域連合', 保険者番号: '39000000', 医療保険番号: '00000000', '医療保険 本人／家族': '本人', '所得区分（適応区分）': '一般', '医療保険有効 終了年月日': '2027-07-31' },
      '生活保護': { 生活保護: c.保護, 対応市町村: c.保護 === 'あり' ? '（見本）どこか市' : '' },
      '介護保険情報': { 認定日: '2025-10-01', '介護保険有効 開始年月日': '2025-11-01', '介護保険有効 終了年月日': '2027-10-31', 介護保険保険者名: '（見本）どこか市',
        介護保険保険者番号: '000000', 介護保険被保険者番号: '0000000000', 介護度: c.介護度, '介護保険 負担割合': '1割', 手帳: 'なし', 認知症: i % 2 ? 'あり' : 'なし' },
      '緊急連絡先': { '緊急連絡先 氏名': '見本 家族', '緊急連絡先 ふりがな': 'みほん かぞく', '緊急連絡先 続柄': '長女', '緊急連絡先 電話番号': '090-0000-0000' },
      '医療機関情報': { '指示書有効 開始期間': '2026-06-01', '指示書有効 終了期間': '2026-11-30', 指示区分: '訪問看護指示書', 医療機関名: '（見本）みほんクリニック', 主治医名: '見本 医師', 科: '内科', 住所: '（見本）どこか市4-5-6', 連絡先: '06-0000-0000', '施設側担当者': '見本 太郎' },
      'ケアマネマスタ': { 事業所名: '（見本）ケアプランみほん', 担当者: '見本 ケアマネ', 住所: '', 連絡先: '06-0000-0001' }
    };
  });
  // 写真は架空のイラスト（色つきの丸に名前の1文字）。本物の顔写真は使わない
  function fakePhoto(c, i) {
    var colors = ['#c9dcf6', '#f6d9c9', '#d9f0d9', '#e6d9f6'];
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" rx="18" fill="' + colors[i % 4] + '"/>' +
      '<circle cx="60" cy="48" r="22" fill="#fff" opacity=".9"/><rect x="26" y="76" width="68" height="36" rx="18" fill="#fff" opacity=".9"/>' +
      '<text x="60" y="56" font-size="22" text-anchor="middle" fill="#55657a" font-family="sans-serif">' + (c.ふりがな.split(' ')[1] || c.ふりがな).charAt(0) + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  clients.forEach(function (c, i) { if (i % 3 !== 1) photos[c.利用者ID] = fakePhoto(c, i); });

  var seq = 100;
  var records = [];
  var memos = [
    ['看護記録', '7時50分\n朝食前にバイタル測定。BP128/76 P72 KT36.4 SpO2 97%。特変なし。'],
    ['介護記録', '入浴介助。皮膚の状態に問題なし。本人より「気持ちよかった」と発言あり。'],
    ['看護記録', '20:45\n左下肢にむくみあり。足背動脈触知可。下肢挙上で様子を見る。'],
    ['往診', '定期往診。処方変更なし。次回は2週間後。'],
    ['施設記録', '居室の加湿器を交換。'],
    ['看護記録', '12時頃\n昼食は8割摂取。服薬確認済み。']
  ];
  clients.slice(0, 5).forEach(function (c, ci) {
    for (var k = 0; k < 4; k++) {
      var m = memos[(ci + k) % memos.length], d = new Date(); d.setDate(d.getDate() - (k * 3 + ci));
      records.push({ 記録ID: 'REC-DEMO' + (++seq), 利用者ID: c.利用者ID, 施設名: FAC, 種別: m[0], 記録日: ymd(d), 記録担当者: ['見本 太郎', '見本 花子', '見本 次郎'][k % 3],
        記録者職員ID: k % 3 === 0 ? 'STF-0001' : 'STF-000' + (k % 3 + 1), メモ: m[1], 更新日時: ymd(d) + ' 1' + k + ':00:00' });
    }
  });
  function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  function card(c) {
    return { 利用者ID: c.利用者ID, 氏名: c.氏名, ふりがな: c.ふりがな, 施設名: c.施設名, 部屋番号: c.部屋番号, ステータス: c.ステータス, タグ: c.タグ.slice(), 写真: !!photos[c.利用者ID] };
  }
  function find(id) {
    var c = clients.filter(function (x) { return x.利用者ID === String(id); })[0];
    if (!c) throw new Error('利用者が見つかりません');
    return c;
  }
  function kata(s) { return String(s || '').replace(/[\s　]/g, '').replace(/[ぁ-ゖ]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) + 0x60); }); }
  function age(b) {
    var m = String(b || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return '';
    var t = new Date(), a = t.getFullYear() - m[1];
    if ((t.getMonth() + 1) * 100 + t.getDate() < m[2] * 100 + +m[3]) a--;
    return String(a);
  }
  function recMatch(r, q) {
    if (q.種別 && q.種別.length && q.種別.indexOf(r.種別) < 0) return false;
    if (q.単日) { if (r.記録日 !== q.単日) return false; }
    else { if (q.開始日 && r.記録日 < q.開始日) return false; if (q.終了日 && r.記録日 > q.終了日) return false; }
    var s = String(q.文字 || '').trim();
    return !s || (r.種別 + ' ' + r.記録担当者 + ' ' + r.メモ).indexOf(s) >= 0;
  }
  function desc(a, b) { return (b.記録日 + b.更新日時).localeCompare(a.記録日 + a.更新日時); }
  function bad(msg, details) { var e = new Error(msg); e.code = 400; e.details = details || []; return e; } // GAS の入力エラーと同じく 400

  // 申請（利用者登録・利用者修正・タスク）は core の見本の申請一覧に足す（自分の申請・承認待ちに出る）
  var core = { push: function (type, prefix, body) {
    var id = prefix + '-' + I.today().replace(/-/g, '') + '-DEMO' + (++seq);
    I.demoRequests && I.demoRequests.unshift({ 申請ID: id, 申請種類: type, 申請者職員ID: 'STF-0001', 申請日時: I.today() + ' 12:00:00', 状態: '承認待ち', 現在段階: 1, コメント: '', 承認者: '見本 一郎', 明細: [body] });
    return { 申請ID: id, 状態: '承認待ち' };
  } };

  I.demo.searchClients = function (q) {
    var name = kata(q.氏名);
    return { 施設: [FAC], 一覧: clients.filter(function (c) {
      if (q.施設 && q.施設.length && q.施設.indexOf(c.施設名) < 0) return false;
      if (q.ステータス && q.ステータス.length && q.ステータス.indexOf(c.ステータス) < 0) return false;
      return !name || kata(c.氏名).indexOf(name) >= 0 || kata(c.ふりがな).indexOf(name) >= 0;
    }).map(card) };
  };
  I.demo.clientInfo = function (q) {
    var c = find(q.利用者ID), v = info[c.利用者ID] || {};
    return { 利用者: card(c), カテゴリ: CATS.map(function (cat) {
      return { 名前: cat[0], 項目: cat[1].map(function (k) {
        var val = cat[0] === '利用者データ' && MAIN.indexOf(k) >= 0 ? c[k] : (v[cat[0]] || {})[k];
        if (k === '年齢') val = age((v['利用者データ'] || {}).生年月日);
        return { 項目: k, 値: val === undefined || val === null ? '' : String(val) };
      }) };
    }) };
  };
  I.demo.clientPhoto = function (q) { find(q.利用者ID); return { 利用者ID: q.利用者ID, 写真: photos[q.利用者ID] || null }; };
  I.demo.uploadClientPhoto = function (q) {
    find(q.利用者ID);
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(q.写真 || '')) throw bad('写真を選んでください（jpg / png）');
    photos[q.利用者ID] = q.写真; return { 利用者ID: q.利用者ID, 写真: true };
  };
  I.demo.addRecord = function (q, me) {
    var e = [];
    if (['看護記録', '介護記録', '施設記録', '往診'].indexOf(q.種別) < 0) e.push('記録の種類が正しくありません');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.記録日 || '')) e.push('記録日を入れてください');
    if (!String(q.記録担当者 || '').trim()) e.push('記録担当者を入れてください');
    if (!String(q.メモ || '').trim()) e.push('メモを入れてください');
    if (e.length) throw bad('入力を確認してください', e);
    var c = find(q.利用者ID), r = { 記録ID: 'REC-DEMO' + (++seq), 利用者ID: c.利用者ID, 施設名: c.施設名, 種別: q.種別, 記録日: q.記録日,
      記録担当者: q.記録担当者.trim(), 記録者職員ID: me.職員ID, メモ: q.メモ.trim(), 更新日時: I.today() + ' 23:59:' + ('0' + (seq % 60)).slice(-2) };
    records.push(r); return { 記録ID: r.記録ID };
  };
  I.demo.clientRecords = function (q) {
    var c = find(q.利用者ID);
    return { 利用者: card(c), 一覧: records.filter(function (r) { return r.利用者ID === c.利用者ID && recMatch(r, q); }).sort(desc) };
  };
  I.demo.searchRecords = function (q) {
    var names = {}; clients.forEach(function (c) { names[c.利用者ID] = c.氏名; });
    return { 一覧: records.filter(function (r) { return (!q.施設 || !q.施設.length || q.施設.indexOf(r.施設名) >= 0) && recMatch(r, q); })
      .sort(desc).map(function (r) { return Object.assign({ 利用者氏名: names[r.利用者ID] }, r); }) };
  };
  I.demo.deleteRecord = function (q, me) {
    var r = records.filter(function (x) { return x.記録ID === q.記録ID; })[0];
    if (!r) throw bad('記録が見つかりません');
    if (r.記録者職員ID !== me.職員ID && me.役割 !== '管理者') throw bad('自分が書いた記録だけ削除できます');
    records = records.filter(function (x) { return x !== r; });
    return { 記録ID: q.記録ID, 状態: '削除' };
  };
  // GAS の requestClientChange_ と同じ決まり・同じ文言
  I.demo.requestClientChange = function (q) {
    var f = q.項目 || {}, e = [], NAME = '利用者データ/氏名', KANA = '利用者データ/ふりがな', FACK = '利用者データ/施設名', c = null;
    if (['新規', '置換', '削除'].indexOf(q.種類) < 0) throw bad('申請の種類が正しくありません');
    if (q.種類 === '新規') {
      if (!f[NAME]) e.push('名前を入れてください');
      if (!f[KANA]) e.push('ふりがなを入れてください');
      if (f[FACK] !== FAC) e.push('施設名を選んでください');
    } else {
      c = find(q.利用者ID);
      if (NAME in f && !f[NAME]) e.push('名前は空にできません');
      if (KANA in f && !f[KANA]) e.push('ふりがなは空にできません');
      if (FACK in f && f[FACK] !== FAC) e.push('施設名を選んでください');
    }
    if (e.length) throw bad('入力を確認してください', e);
    if (q.種類 === '置換' && !Object.keys(f).length) throw bad('直す項目を1つ以上入れてください');
    if (f['利用者データ/ステータス'] && ['居住中', '入院中', '退居', '登録なし'].indexOf(f['利用者データ/ステータス']) < 0) throw bad('ステータスを選んでください');
    return core.push(q.種類 === '新規' ? '利用者登録' : '利用者修正', 'CLI',
      { 種類: q.種類, 利用者ID: c ? c.利用者ID : '', 利用者氏名: c ? c.氏名 : f[NAME], 施設名: c ? c.施設名 : f[FACK], 項目: f, 変更前: q.種類 === '置換' ? beforeOf(c, f) : {}, 理由: q.理由 || '' });
  };
  // 変更前は GAS と同じく、画面から送られた値ではなく「いまの値」から作る（画面は 変更前 を送らない）
  function beforeOf(c, f) {
    var out = {}, v = info[c.利用者ID] || {};
    Object.keys(f).forEach(function (key) {
      var cat = key.split('/')[0], k = key.split('/').slice(1).join('/');
      var val = cat === '利用者データ' && MAIN.indexOf(k) >= 0 ? c[k] : (v[cat] || {})[k];
      out[key] = val === undefined || val === null ? '' : String(val);
    });
    return out;
  };
  I.demo.submitTask = function (q, me) {
    var e = [], d = /^\d{4}-\d{2}-\d{2}$/;
    if (!q.施設名) e.push('施設名を選んでください');
    if (!q.利用者ID) e.push('利用者名を選んでください');
    if (['介護保険', '医療保険'].indexOf(q.保険種類) < 0) e.push('保険種類を選んでください');
    if (['有', '無', '確認中'].indexOf(q.生活保護) < 0) e.push('生活保護を選んでください');
    if ((I.state.options.タスク種類 || []).indexOf(q.タスク) < 0) e.push('タスクを選んでください');
    if (!(d.test(q.日程開始 || '') && d.test(q.日程終了 || '')) && !d.test(q.日程 || '')) e.push('日程（期間か1日）を入れてください');
    if (String(q.タスク || '').indexOf('特指示') === 0) {
      if (['有', '無'].indexOf(q.訪問看護指示書変更) < 0) e.push('訪問看護指示書変更を選んでください');
      if (!d.test(q.期間開始 || '') || !d.test(q.期間終了 || '')) e.push('期間の始まりと終わりを入れてください');
      if (!String(q.状態 || '').trim()) e.push('状態を入れてください');
    }
    if (e.length) throw bad('入力を確認してください', e);
    var c = find(q.利用者ID);
    if (c.施設名 !== q.施設名) throw bad('入力を確認してください', ['利用者がこの施設にいません。施設名と利用者名を選び直してください']);
    var body = Object.assign({ 担当者: me.氏名, 利用者氏名: c.氏名 }, q); delete body.送信ID;
    return core.push('タスク', 'TSK', body);
  };
  // 送信ID: 同じIDの2回目は1回目の返事を返すだけ（GAS と同じ。「もう一度送信する」で2件にしない）
  var sentIds = {};
  ['addRecord', 'requestClientChange', 'submitTask'].forEach(function (name) {
    var fn = I.demo[name];
    I.demo[name] = function (q, me) {
      if (q && q.送信ID && sentIds[q.送信ID]) return sentIds[q.送信ID];
      var r = fn(q, me);
      if (q && q.送信ID) sentIds[q.送信ID] = r;
      return r;
    };
  });
  // ---------- 承認待ち一覧の見本（ほかの職員が出した 利用者登録・利用者修正・タスク）と、承認したときの反映 ----------
  var dc = I.demoCore;
  if (dc) {
    var t = I.today().replace(/-/g, '');
    dc.pending.push(
      { 申請ID: 'CLI-' + t + '-DEMO21', 申請種類: '利用者登録', 申請者: '見本 花子', 申請日時: I.today() + ' 08:40:00', 状態: '承認待ち', 現在段階: 1, 承認者: '見本 太郎', 担当: true,
        明細: [{ 種類: '新規', 利用者ID: '', 利用者氏名: '新規 見本子', 施設名: FAC, 項目: { '利用者データ/氏名': '新規 見本子', '利用者データ/ふりがな': 'シンキ ミホンコ', '利用者データ/施設名': FAC, '利用者データ/部屋番号': '208', '利用者データ/入居日': I.today() }, 理由: '（見本）新しく入居されたため' }] },
      { 申請ID: 'CLI-' + t + '-DEMO22', 申請種類: '利用者修正', 申請者: '見本 花子', 申請日時: I.today() + ' 08:30:00', 状態: '承認待ち', 現在段階: 1, 承認者: '見本 太郎', 担当: true,
        明細: [{ 種類: '置換', 利用者ID: '24', 利用者氏名: '例題 春子', 施設名: FAC, 項目: { '利用者データ/部屋番号': '204', '緊急連絡先/緊急連絡先 電話番号': '090-0000-0024' }, 理由: '（見本）部屋の移動' }] },
      { 申請ID: 'TSK-' + t + '-DEMO23', 申請種類: 'タスク', 申請者: '見本 花子', 申請日時: I.today() + ' 08:10:00', 状態: '承認待ち', 現在段階: 1, 承認者: '見本 太郎', 担当: true,
        明細: [{ 担当者: '見本 花子', 施設名: FAC, 利用者ID: '15', 利用者氏名: '見本 二郎', 保険種類: '医療保険', 生活保護: '無', タスク: '点滴', 日程開始: I.today(), 日程終了: I.today(), 日程: '', 時間開始: '10:00', 時間終了: '11:00', 備考: '（見本）主治医の指示あり' }] }
    );
    // 承認待ち一覧の「承認」「差戻し」。利用者登録・利用者修正は承認で利用者マスタに反映する（GAS の applyClientRequest_ と同じ考え方）
    I.demo.decide = function (q) {
      var r = dc.pending.filter(function (x) { return x.申請ID === q.申請ID; })[0];
      if (!r) throw bad('この申請はもう承認待ちではありません');
      if (q.結果 === '差戻し' && !q.コメント) throw bad('差戻しの理由を書いてください');
      for (var i = dc.pending.length - 1; i >= 0; i--) if (dc.pending[i] === r) dc.pending.splice(i, 1);
      if (q.結果 === '承認' && (r.申請種類 === '利用者登録' || r.申請種類 === '利用者修正')) applyDemo(r.明細[0]);
      return { 申請ID: r.申請ID, 状態: q.結果 === '承認' ? '承認済み' : '差戻し', 現在段階: '' };
    };
  }
  function applyDemo(b) {
    var c, f = b.項目 || {};
    if (b.種類 === '新規') {
      c = { 利用者ID: String(Math.max.apply(null, clients.map(function (x) { return +x.利用者ID; })) + 1), 施設名: FAC, ステータス: '居住中', タグ: [], 部屋番号: '' };
      clients.push(c);
    } else c = find(b.利用者ID);
    Object.keys(f).forEach(function (key) {
      var cat = key.split('/')[0], k = key.split('/').slice(1).join('/');
      if (cat === '利用者データ' && MAIN.indexOf(k) >= 0) { if (k !== '利用者ID') c[k] = f[key]; }
      else {
        var mine = info[c.利用者ID] = info[c.利用者ID] || {};
        (mine[cat] = mine[cat] || {})[k] = f[key];
      }
    });
    if (b.種類 === '削除') c.ステータス = '登録なし';
  }
})();
