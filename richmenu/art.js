/* リッチメニュー画像（richmenu.jpg）用の立体風イラスト。make.js だけが使う。
   どれも自作の SVG（viewBox 0 0 240 200）。グラデーションと影で「ふっくら」見せる。
   並びは tiles.js と同じ: 1 経費勤怠申請 / 2 申請状況 / 3 タスク管理 / 4 利用者一覧 / 5 シフト管理 / 6 相談AI */

// 小さな点の並び（飾り）。x,y を左上に cols×rows 個
function dots(x, y, cols, rows, color, gap, r) {
  gap = gap || 6; r = r || 1.3;
  let s = '';
  const ci = (cols - 1) / 2, cj = (rows - 1) / 2, far = Math.hypot(ci, cj) || 1;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const d = Math.hypot(i - ci, j - cj) / far;
    if (d > 0.95) continue; // 四隅は描かない（丸く集まって見えるように）
    s += `<circle cx="${x + i * gap}" cy="${y + j * gap}" r="${r}" fill="${color}" opacity="${(0.55 - 0.45 * d).toFixed(2)}"/>`;
  }
  return s;
}

// 時計（白い文字盤＋色の縁）
function clock(cx, cy, r, rim, rimDark, hand, id) {
  let ticks = '';
  for (let k = 0; k < 12; k++) {
    const a = k * Math.PI / 6, long = k % 3 === 0;
    const r1 = r * 0.78, r2 = r * (long ? 0.62 : 0.7);
    ticks += `<line x1="${(cx + r1 * Math.sin(a)).toFixed(1)}" y1="${(cy - r1 * Math.cos(a)).toFixed(1)}" x2="${(cx + r2 * Math.sin(a)).toFixed(1)}" y2="${(cy - r2 * Math.cos(a)).toFixed(1)}" stroke="${hand}" stroke-width="${long ? 3 : 1.6}" stroke-linecap="round" opacity="${long ? 0.9 : 0.5}"/>`;
  }
  return `<defs><linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${rim}"/><stop offset="1" stop-color="${rimDark}"/></linearGradient>
    <radialGradient id="${id}f" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#eef0f4"/></radialGradient></defs>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}r)"/>
    <circle cx="${cx}" cy="${cy}" r="${r - 3.5}" fill="url(#${id}f)"/>
    ${ticks}
    <path d="M${cx} ${cy}L${cx} ${cy - r * 0.5}M${cx} ${cy}L${cx + r * 0.42} ${cy - r * 0.22}" stroke="${hand}" stroke-width="4" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="3.6" fill="${hand}"/>`;
}

const ART = [
  // 1 経費勤怠申請: 紺の領収書（¥）＋金の縁の時計＋チェックの金貨
  `<defs>
    <linearGradient id="a1n" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#3d4a63"/><stop offset="1" stop-color="#1c2434"/></linearGradient>
    <linearGradient id="a1g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3d58e"/><stop offset="1" stop-color="#c3913a"/></linearGradient>
    <filter id="a1blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
    <radialGradient id="a1c" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#f0cf85"/><stop offset=".6" stop-color="#c99a45"/><stop offset="1" stop-color="#9c7027"/></radialGradient>
  </defs>
  <circle cx="70" cy="110" r="44" fill="#f6dcc0" opacity=".35" filter="url(#a1blur)"/>
  ${dots(18, 128, 6, 6, '#d2b072')}
  ${clock(170, 96, 50, '#e3c27c', '#b48535', '#a77a2e', 'a1k')}
  <path d="M52 33l8-7 8 7 8-7 8 7 8-7 8 7 8-7 8 7 8-7 8 7 8-7 8 7v126l-8 7-8-7-8 7-8-7-8 7-8-7-8 7-8-7-8 7-8-7-8 7-8-7z" fill="url(#a1n)"/>
  
  <text x="100" y="92" text-anchor="middle" font-size="54" font-weight="500" fill="url(#a1g)" font-family="RM,sans-serif">¥</text>
  <rect x="72" y="108" width="48" height="5" rx="2.5" fill="#8d97ab" opacity=".75"/>
  <rect x="72" y="122" width="34" height="5" rx="2.5" fill="#8d97ab" opacity=".55"/>
  <circle cx="134" cy="146" r="27" fill="#7a561c" opacity=".25" transform="translate(2 4)"/>
  <circle cx="134" cy="146" r="27" fill="url(#a1c)"/>
  <circle cx="134" cy="146" r="21" fill="none" stroke="#f6dc9f" stroke-width="2" opacity=".7"/>
  <path d="M123 146l8 8 15-16" fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>`,

  // 2 申請状況: 青い帯の申請書（済・済・待ち）＋虫めがね
  `<defs>
    <linearGradient id="a2b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b8ae6"/><stop offset="1" stop-color="#2c5bc4"/></linearGradient>
    <linearGradient id="a2p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e9eef7"/></linearGradient>
    <radialGradient id="a2l" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset="1" stop-color="#cfe0fb" stop-opacity=".6"/></radialGradient>
  </defs>
  ${dots(176, 40, 5, 6, '#9bb2dc')}
  <rect x="88" y="30" width="96" height="124" rx="9" fill="#dfe8f7"/>
  <rect x="58" y="22" width="104" height="138" rx="10" fill="url(#a2p)" stroke="#d3dbea" stroke-width="2"/>
  <path d="M68 22h84a10 10 0 0110 10v16H58V32a10 10 0 0110-10z" fill="url(#a2b)"/>
  <rect x="76" y="13" width="7" height="20" rx="3.5" fill="#2a4f9e"/><rect x="137" y="13" width="7" height="20" rx="3.5" fill="#2a4f9e"/>
  <circle cx="78" cy="70" r="8" fill="#36a46b"/><path d="M74 70l3 3 5-6" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="93" y="66" width="52" height="7" rx="3.5" fill="#c6cfdf"/>
  <circle cx="78" cy="96" r="8" fill="#36a46b"/><path d="M74 96l3 3 5-6" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="93" y="92" width="44" height="7" rx="3.5" fill="#c6cfdf"/>
  <circle cx="78" cy="122" r="8" fill="#e6a531"/><path d="M78 117v5l3 2" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <rect x="93" y="118" width="36" height="7" rx="3.5" fill="#c6cfdf"/>
  <rect x="140" y="146" width="12" height="40" rx="6" fill="#1f3f86" transform="rotate(-42 146 166)"/>
  <circle cx="148" cy="128" r="30" fill="#1d3f8f" opacity=".18" transform="translate(3 5)"/>
  <circle cx="148" cy="128" r="30" fill="url(#a2l)" stroke="url(#a2b)" stroke-width="9"/>
  <path d="M133 116a19 19 0 0112-8" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none"/>`,

  // 3 タスク管理: 緑のクリップボード（＋印・チェック）＋ペン＋薬びん＋錠剤シート
  `<defs>
    <linearGradient id="a3g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5aa684"/><stop offset="1" stop-color="#2e6f53"/></linearGradient>
    <linearGradient id="a3p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef3f0"/></linearGradient>
    <linearGradient id="a3w" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f4f6f5"/><stop offset=".55" stop-color="#ffffff"/><stop offset="1" stop-color="#d9e1dd"/></linearGradient>
    <linearGradient id="a3k" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1f2a3d"/><stop offset=".5" stop-color="#46546e"/><stop offset="1" stop-color="#1f2a3d"/></linearGradient>
    <linearGradient id="a3s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2f4f6"/><stop offset="1" stop-color="#cdd4dc"/></linearGradient>
  </defs>
  <circle cx="160" cy="88" r="62" fill="#e1efe7"/>
  ${dots(186, 8, 6, 4, '#9cc2ad')}
  <rect x="38" y="22" width="102" height="140" rx="10" fill="url(#a3p)" stroke="#2e6f53" stroke-width="4.5"/>
  <path d="M70 14h38a6 6 0 016 6v14H64V20a6 6 0 016-6z" fill="#3f7f63"/><circle cx="89" cy="14" r="6" fill="none" stroke="#3f7f63" stroke-width="4"/>
  <path d="M80 54h18M89 45v18" stroke="#3a9a6c" stroke-width="9" stroke-linecap="round"/>
  <rect x="58" y="86" width="60" height="6" rx="3" fill="#8fb3a0"/>
  <rect x="58" y="104" width="46" height="6" rx="3" fill="#8fb3a0"/>
  <g transform="rotate(32 128 110)"><rect x="122" y="48" width="13" height="92" rx="6" fill="url(#a3k)"/><path d="M122 140h13l-6.5 18z" fill="#d9b26a"/><rect x="122" y="66" width="13" height="5" fill="#d9b26a"/><rect x="133" y="52" width="3" height="34" rx="1.5" fill="#d9b26a"/></g>
  <rect x="168" y="68" width="44" height="74" rx="16" fill="url(#a3w)"/>
  <rect x="176" y="62" width="28" height="10" fill="#dfe6e2"/><rect x="170" y="50" width="40" height="16" rx="5" fill="url(#a3g)"/>
  <rect x="168" y="96" width="44" height="22" fill="#6fae8f"/>
  <g transform="rotate(-14 182 166)"><rect x="140" y="146" width="86" height="40" rx="9" fill="url(#a3s)" stroke="#c4ccd5" stroke-width="1.5"/>
    ${[0, 1, 2, 3].map(i => `<circle cx="${153 + i * 20}" cy="158" r="7" fill="#fff" stroke="#d6dce3" stroke-width="1.5"/><circle cx="${153 + i * 20}" cy="175" r="7" fill="#fff" stroke="#d6dce3" stroke-width="1.5"/>`).join('')}</g>`,

  // 4 利用者一覧: 車いすの人（左向き）と、うしろから押して歩く人（紫）
  `<defs>
    <linearGradient id="a4p" gradientUnits="userSpaceOnUse" x1="140" y1="20" x2="200" y2="180"><stop offset="0" stop-color="#9a7de8"/><stop offset="1" stop-color="#5a3db3"/></linearGradient>
    <linearGradient id="a4q" gradientUnits="userSpaceOnUse" x1="60" y1="50" x2="110" y2="160"><stop offset="0" stop-color="#b9a2f0"/><stop offset="1" stop-color="#7a5bd0"/></linearGradient>
  </defs>
  <circle cx="104" cy="80" r="48" fill="#efe9fb"/>
  ${dots(176, 36, 5, 6, '#b8a8e0')}
  <ellipse cx="122" cy="180" rx="76" ry="6" fill="#5a3db3" opacity=".1"/>
  <circle cx="96" cy="136" r="36" fill="none" stroke="#b9a2f0" stroke-width="5"/>
  <path d="M116 120V80l12-4" fill="none" stroke="#6b4cc4" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M70 124h46M72 126l-12 38" fill="none" stroke="#6b4cc4" stroke-width="5" stroke-linecap="round"/>
  <circle cx="60" cy="170" r="7" fill="none" stroke="#6b4cc4" stroke-width="4.5"/>
  <circle cx="96" cy="136" r="5" fill="#6b4cc4"/>
  <circle cx="94" cy="60" r="13" fill="url(#a4q)"/>
  <path d="M100 82l4 34H72l-4 34" fill="none" stroke="url(#a4q)" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M62 152h-10" stroke="#7a5bd0" stroke-width="9" stroke-linecap="round"/>
  <path d="M98 88l-6 18h-14" fill="none" stroke="#8a6cdc" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="168" cy="30" r="15" fill="url(#a4p)"/>
  <path d="M174 112l-24 62M174 112l10 30 12 32" fill="none" stroke="url(#a4p)" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M164 56l10 56" stroke="url(#a4p)" stroke-width="26" stroke-linecap="round"/>
  <path d="M160 62l-14 16-16 0" fill="none" stroke="#7a5bd0" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`,

  // 5 シフト管理: オレンジのカレンダー＋チェックのボード＋時計
  `<defs>
    <linearGradient id="a5o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f69a5c"/><stop offset="1" stop-color="#e0622a"/></linearGradient>
    <linearGradient id="a5p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef0f4"/></linearGradient>
  </defs>
  ${dots(186, 56, 5, 5, '#e8b597')}
  <rect x="74" y="20" width="112" height="128" rx="10" fill="url(#a5p)" stroke="#dde1e8" stroke-width="2"/>
  <path d="M84 20h92a10 10 0 0110 10v18H74V30a10 10 0 0110-10z" fill="url(#a5o)"/>
  <rect x="96" y="9" width="8" height="22" rx="4" fill="#9a4b25"/><rect x="156" y="9" width="8" height="22" rx="4" fill="#9a4b25"/>
  ${[0, 1, 2].map(r => [0, 1, 2, 3].map(c => `<rect x="${118 + c * 16}" y="${60 + r * 20}" width="11" height="11" rx="2.5" fill="${r === 1 && c === 1 ? '#e8692f' : '#d7dbe2'}"/>`).join('')).join('')}
  <rect x="34" y="70" width="70" height="92" rx="8" fill="#b86a3f" opacity=".2" transform="translate(3 5)"/>
  <rect x="34" y="70" width="70" height="92" rx="8" fill="url(#a5p)" stroke="#c9774a" stroke-width="4"/>
  <path d="M56 64h26a5 5 0 015 5v8H51v-8a5 5 0 015-5z" fill="#c9774a"/><circle cx="69" cy="63" r="5" fill="none" stroke="#c9774a" stroke-width="3"/>
  <path d="M52 116l12 12 24-26" stroke="#e0622a" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="176" cy="140" r="36" fill="#b0471a" opacity=".16" transform="translate(3 5)"/>
  ${clock(176, 140, 36, '#f58a4c', '#d9541d', '#c4501e', 'a5k')}`,

  // 6 相談AI: ヘッドホン＋「AI」の吹き出し＋きらきら
  `<defs>
    <linearGradient id="a6h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a5874"/><stop offset="1" stop-color="#1b2335"/></linearGradient>
    <radialGradient id="a6b" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#eef2f5"/><stop offset="1" stop-color="#d9e1e7"/></radialGradient>
    <filter id="a6s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
  </defs>
  <path d="M38 34l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" fill="#7cc6bd"/>
  <path d="M26 74l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#9ed6cf"/>
  <circle cx="214" cy="60" r="6" fill="#bfe2dd"/>
  <path d="M120 56c-31 0-52 19-52 46 0 19 11 33 28 41l-8 21 25-16c2 0 5 .5 7 .5 31 0 52-20 52-47s-21-45.5-52-45.5z" fill="#1f6c66" opacity=".16" filter="url(#a6s)" transform="translate(1 4)"/>
  <path d="M120 56c-31 0-52 19-52 46 0 19 11 33 28 41l-8 21 25-16c2 0 5 .5 7 .5 31 0 52-20 52-47s-21-45.5-52-45.5z" fill="url(#a6b)"/>
  <text x="120" y="122" text-anchor="middle" font-size="44" font-weight="800" fill="#2a9d8f" font-family="RM,sans-serif" letter-spacing="1">AI</text>
  <path d="M57 92a63 63 0 01126 0" fill="none" stroke="#3a4458" stroke-width="6" stroke-linecap="round"/>
  <rect x="43" y="84" width="27" height="56" rx="13" fill="url(#a6h)"/>
  <rect x="170" y="84" width="27" height="56" rx="13" fill="url(#a6h)"/>
  <rect x="49" y="92" width="5" height="38" rx="2.5" fill="#fff" opacity=".25"/><rect x="176" y="92" width="5" height="38" rx="2.5" fill="#fff" opacity=".25"/>
  <path d="M183 138c0 20-13 30-33 30" fill="none" stroke="#2b3549" stroke-width="5" stroke-linecap="round"/>
  <rect x="138" y="162" width="16" height="11" rx="5.5" fill="#2b3549"/>`
];

module.exports = ART;
