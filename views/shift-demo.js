/* シフトの見本データ（見本モードのときだけ使う。名前はすべて架空）。
   GAS の shifts.js と同じ返事の形を返す。決まりは kiroku-app の docs/api.md 「シフト」。
   今月は確定済み、来月は希望が集まっている作成中、という状態を作る */
(function () {
  'use strict';
  var I = window.IPPO;
  if (!I.DEMO) return;

  var FAC = 'モア一津屋';
  var KINDS = ['日勤', '早出', '遅出', '夜勤', '明け', '公休'];
  var STAFF = [
    { 職員ID: 'STF-0001', 氏名: '見本 太郎', 職種: '看護師', 雇用形態: '常勤', 可能勤務: '日勤、早出、遅出、夜勤', 資格: '正看護師' },
    { 職員ID: 'STF-0002', 氏名: '見本 花子', 職種: '看護師', 雇用形態: '非常勤', 可能勤務: '日勤、早出', 資格: '正看護師' },
    { 職員ID: 'STF-0003', 氏名: '見本 次郎', 職種: '介護職', 雇用形態: '常勤', 可能勤務: '日勤、遅出、夜勤', 資格: '介護福祉士' },
    { 職員ID: 'STF-0004', 氏名: '見本 三郎', 職種: '介護職', 雇用形態: '常勤', 可能勤務: '日勤、早出、遅出、夜勤', 資格: '' },
    { 職員ID: 'STF-0005', 氏名: '見本 四郎', 職種: '准看護師', 雇用形態: 'パート', 可能勤務: '日勤', 資格: '准看護師' },
    { 職員ID: 'STF-0006', 氏名: '見本 さくら', 職種: '介護職', 雇用形態: '非常勤', 可能勤務: '日勤、早出', 資格: '初任者研修' },
    { 職員ID: 'STF-0007', 氏名: '見本 ひなた', 職種: '介護職', 雇用形態: '常勤', 可能勤務: '日勤、遅出、夜勤', 資格: '' },
    { 職員ID: 'STF-0008', 氏名: '見本 一郎', 職種: '事務', 雇用形態: '常勤', 可能勤務: '日勤', 資格: '' }
  ];

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function dates(ym) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7), n = new Date(y, m, 0).getDate(), out = [];
    for (var i = 1; i <= n; i++) out.push(ym + '-' + pad(i));
    return out;
  }
  function dow(date) { return new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)).getDay(); }
  var now = new Date();
  var THIS = ymOf(now), NEXT = ymOf(new Date(now.getFullYear(), now.getMonth() + 1, 1));

  var wishes = {}, shifts = {}, months = {};
  function put(map, id, date, v) { (map[id] = map[id] || {})[date] = v; }

  // 今月: 確定済みのシフト（ずらした決まった並び）
  var cycle = ['日勤', '日勤', '早出', '遅出', '公休', '夜勤', '明け', '公休', '日勤', '日勤'];
  STAFF.forEach(function (s, si) {
    var can = s.可能勤務.split('、');
    dates(THIS).forEach(function (d, di) {
      var k = cycle[(di + si * 3) % cycle.length];
      if (k !== '公休' && k !== '明け' && can.indexOf(k) < 0) k = '日勤';
      if ((k === '明け') && can.indexOf('夜勤') < 0) k = '公休';
      put(shifts, s.職員ID, d, { 施設名: FAC, 勤務: k });
    });
  });
  months[THIS] = { 状態: '確定', 確定日時: THIS + '-20 18:00:00' };

  // 来月: みんなの希望（本人 STF-0001 は少しだけ出してある）。シフトはまだ無い
  STAFF.forEach(function (s, si) {
    dates(NEXT).forEach(function (d, di) {
      var r = (di * 7 + si * 5) % 11;
      var w = r === 0 ? '休み希望' : (r < 3 ? '出勤不可' : (r < 9 ? '出勤可' : ''));
      if (s.職員ID === 'STF-0001') w = di < 6 ? (dow(d) === 0 ? '出勤不可' : '出勤可') : '';
      if (w) put(wishes, s.職員ID, d, { 希望: w, メモ: w === '出勤可' && r === 4 ? '9:00〜15:00 なら可' : '' });
    });
  });
  months[NEXT] = { 状態: '作成中', 確定日時: '' };

  function stateOf(ym) { return months[ym] || { 状態: '作成中', 確定日時: '' }; }
  function staffOf(id) { return STAFF.filter(function (s) { return s.職員ID === id; })[0]; }
  function needYm(ym) { if (!/^\d{4}-\d{2}$/.test(ym || '')) throw new Error('年月を選んでください'); return ym; }

  I.demo.shiftForm = function (data, me) {
    var ym = needYm(data.年月), mine = wishes[me.職員ID] || {}, s = staffOf(me.職員ID) || me;
    return {
      職員: { 氏名: me.氏名, 職種: s.職種, 雇用形態: s.雇用形態, 可能勤務: s.可能勤務, 資格: s.資格 },
      年月: ym,
      希望: Object.keys(mine).filter(function (d) { return d.slice(0, 7) === ym; }).sort()
        .map(function (d) { return { 対象日: d, 希望: mine[d].希望, メモ: mine[d].メモ }; })
    };
  };
  I.demo.submitShiftWishes = function (data, me) {
    (data.日 || []).forEach(function (d) {
      if (d.希望 || d.メモ) put(wishes, me.職員ID, d.対象日, { 希望: d.希望 || '', メモ: d.メモ || '' });
      else if (wishes[me.職員ID]) delete wishes[me.職員ID][d.対象日];
    });
    return { 年月: data.年月, 件数: (data.日 || []).length };
  };
  I.demo.dayOffs = function (data, me) {
    var date = data.対象日, ym = date.slice(0, 7), fixed = stateOf(ym).状態 === '確定', list = [];
    STAFF.forEach(function (s) {
      if (s.職員ID === me.職員ID) return;
      var w = (wishes[s.職員ID] || {})[date], sh = fixed ? (shifts[s.職員ID] || {})[date] : null;
      var wishOff = w && (w.希望 === '出勤不可' || w.希望 === '休み希望') ? w.希望 : '';
      var off = sh && sh.勤務 === '公休' ? '公休' : (wishOff || (sh && sh.勤務 === '明け' ? '明け' : ''));
      if (off) list.push({ 氏名: s.氏名, 施設名: (sh && sh.施設名) || FAC, 休み: off, 明け: !!(sh && sh.勤務 === '明け') });
    });
    return { 対象日: date, 施設: [FAC], 一覧: list };
  };
  I.demo.myShifts = function (data, me) {
    var ym = needYm(data.年月), fixed = stateOf(ym).状態 === '確定';
    var sh = fixed ? (shifts[me.職員ID] || {}) : {}, w = wishes[me.職員ID] || {};
    return {
      職員番号: me.職員ID, 所属: [FAC], 年月: ym, 確定: fixed,
      日: dates(ym).map(function (d) {
        if (sh[d] && sh[d].勤務) return { 対象日: d, 種類: '勤務', 勤務: sh[d].勤務, 施設名: sh[d].施設名 };
        if (w[d] && (w[d].希望 === '出勤不可' || w[d].希望 === '休み希望')) return { 対象日: d, 種類: '希望', 勤務: w[d].希望 };
        return { 対象日: d, 種類: '未設定', 勤務: '勤務未設定' };
      })
    };
  };
  I.demo.shiftBoard = function (data) {
    var ym = needYm(data.年月);
    function only(map) {
      var o = {};
      Object.keys(map || {}).forEach(function (d) { if (d.slice(0, 7) === ym) o[d] = map[d]; });
      return o;
    }
    return {
      年月: ym, 状態: stateOf(ym), 勤務区分: KINDS, 施設: [FAC],
      職員: STAFF.map(function (s) {
        return Object.assign({}, s, { 希望: only(wishes[s.職員ID]), シフト: only(shifts[s.職員ID]) });
      })
    };
  };
  I.demo.saveShifts = function (data) {
    (data.割当 || []).forEach(function (a) {
      if (a.勤務) put(shifts, a.職員ID, a.対象日, { 施設名: FAC, 勤務: a.勤務 });
      else if (shifts[a.職員ID]) delete shifts[a.職員ID][a.対象日];
    });
    return { 年月: data.年月, 件数: (data.割当 || []).length, 状態: stateOf(data.年月) };
  };
  I.demo.fixShifts = function (data) {
    var t = new Date();
    months[data.年月] = { 状態: '確定', 確定日時: I.today() + ' ' + pad(t.getHours()) + ':' + pad(t.getMinutes()) + ':00' };
    return { 年月: data.年月, 状態: months[data.年月] };
  };
})();
