// リッチメニュー画像 richmenu.jpg（2500×1686, LINE の「大」サイズ、1MB 未満）を作り直すための道具。
// 使い方: FONT_DIR=<フォントの置き場> node richmenu/make.js
//   playwright が必要。FONT_DIR に noto500.woff2 / noto800.woff2（Noto Sans JP）を置くとその字で描く。
//   ImageMagick（convert）があれば JPEG の画質を調整して 1MB 未満にする。
// 見た目: 白いカード 3列×2段。上にふっくらしたイラスト、下に「日本語の名前」「英語の小見出し」「＞の丸ボタン」。
// 中身（名前・色）は tiles.js、イラストは art.js。
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const TILES = require('./tiles.js');
const ART = require('./art.js');

const W = 2500, H = 1686;
const M = 32; // 外側の余白とカードどうしのすき間
const CW = (W - 4 * M) / 3, CH = (H - 3 * M) / 2; // カード 1 枚の大きさ（タップ範囲は richmenu.json の 3 等分のまま）
const fontDir = process.env.FONT_DIR;
const face = (w) => fontDir && fs.existsSync(path.join(fontDir, 'noto' + w + '.woff2'))
  ? `@font-face{font-family:RM;font-weight:${w};src:url(data:font/woff2;base64,${fs.readFileSync(path.join(fontDir, 'noto' + w + '.woff2')).toString('base64')}) format('woff2')}` : '';

// カードの背景の飾り（角の色面・波）。色はタイルごとの tint / color から作る
const DECO = [
  // 1: 左上に金の角（外へ向かって薄く）、右上に細い金の L 字線、下にごく淡い波
  (t) => `<path d="M0 0H210C125 45 55 105 0 200Z" fill="url(#gc)" filter="url(#sb)"/><path d="M640 52H760V200" fill="none" stroke="${t.color}" stroke-opacity=".35" stroke-width="4"/>
    <path d="M0 620C180 560 360 700 805 560V815H0Z" fill="${t.tint}" opacity=".3" filter="url(#s)"/>`,
  // 2: 左上にやわらかな面、右下に波
  (t) => `<path d="M0 0H330C230 60 120 120 0 260Z" fill="${t.tint}" opacity=".7" filter="url(#s)"/><path d="M805 470C700 560 640 700 430 815H805Z" fill="url(#g1)" opacity=".5" filter="url(#s)"/>`,
  // 3: 右下に波
  (t) => `<path d="M805 600C720 700 600 760 470 815H805Z" fill="url(#g1)" opacity=".5" filter="url(#s)"/>`,
  // 4: 下に大きな波
  (t) => `<path d="M0 560C200 520 420 640 805 470V815H0Z" fill="url(#g1)" opacity=".45" filter="url(#s)"/>`,
  // 5: 下に淡い波＋右下に濃い波
  (t) => `<path d="M0 640C220 580 420 740 805 640V815H0Z" fill="${t.tint}" opacity=".45" filter="url(#s)"/><path d="M805 420C700 600 560 760 380 815H805Z" fill="url(#g1)" opacity=".6" filter="url(#s)"/>`,
  // 6: 下に重なる波
  (t) => `<path d="M0 600C200 560 330 700 805 560V815H0Z" fill="#dcecef" opacity=".7" filter="url(#s)"/><path d="M0 700C260 650 520 780 805 680V815H0Z" fill="url(#g1)" opacity=".4" filter="url(#s)"/>`
];

// SVG の id はページ全体で 1 つずつにする（カードごとに番号を付ける）
const uniq = (i, svg) => svg.replace(/id="(\w+)"/g, 'id="$1_' + i + '"').replace(/url\(#(\w+)\)/g, 'url(#$1_' + i + ')');

const cards = TILES.map((t, i) => {
  const c = i % 3, r = Math.floor(i / 3);
  const x = M + c * (CW + M), y = M + r * (CH + M), w = CW, h = CH;
  return `<div class="t" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;--c:${t.color};--b:${t.badge};--tint:${t.tint}">
    ${uniq(i, `<svg class="bg" viewBox="0 0 ${Math.round(w)} ${Math.round(h)}" preserveAspectRatio="none"><defs>
      <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.tint}"/><stop offset="1" stop-color="${t.color}" stop-opacity=".3"/></linearGradient>
      <linearGradient id="gc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6bd7c"/><stop offset=".6" stop-color="#e6bd7c" stop-opacity=".55"/><stop offset="1" stop-color="#e6bd7c" stop-opacity="0"/></linearGradient>
      <filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter><filter id="sb"><feGaussianBlur stdDeviation="6"/></filter></defs>
      ${DECO[i](t)}</svg>`)}
    <svg class="art" viewBox="0 0 240 200">${ART[i]}</svg>
    <b>${t.label}</b><small>${t.en}</small>
    <span><svg viewBox="0 0 24 24"><path d="M10 7l5 5-5 5"/></svg></span></div>`;
}).join('');

const html = `<!doctype html><meta charset="utf-8"><style>
${face(500)}${face(800)}
*{box-sizing:border-box;margin:0}
body{width:${W}px;height:${H}px;background:#f5f5f6;position:relative;overflow:hidden;font-family:RM,"Noto Sans JP",sans-serif}
.t{position:absolute;overflow:hidden;border-radius:26px;background:linear-gradient(170deg,#ffffff 0%,#fafafa 55%,#f4f4f4 100%);
  box-shadow:0 4px 14px rgba(20,30,50,.08),0 1px 2px rgba(0,0,0,.05),inset 0 0 0 1px rgba(0,0,0,.03)}
.bg{position:absolute;inset:0;width:100%;height:100%}
.art{position:absolute;left:50%;top:70px;width:600px;height:500px;margin-left:-300px;filter:drop-shadow(0 16px 18px rgba(30,40,60,.20))}
b{position:absolute;left:0;right:0;top:548px;text-align:center;font-size:58px;font-weight:800;letter-spacing:.2em;text-indent:.2em;color:#25272c;line-height:1}
small{position:absolute;left:0;right:0;top:626px;text-align:center;font-size:23px;font-weight:800;letter-spacing:.24em;text-indent:.24em;color:var(--c);opacity:.95;line-height:1}
span{position:absolute;left:50%;top:680px;width:80px;height:80px;margin-left:-40px;border-radius:50%;
  background:radial-gradient(circle at 40% 35%,color-mix(in srgb,var(--b) 88%,#fff) 0%,var(--b) 70%);
  box-shadow:0 4px 10px color-mix(in srgb,var(--b) 35%,transparent);display:grid;place-items:center}
span svg{width:36px;height:36px;fill:none;stroke:#fff;stroke-width:3.6;stroke-linecap:round;stroke-linejoin:round}
</style>${cards}`;

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await pg.setContent(html);
  await pg.evaluate(() => document.fonts.ready);
  const png = path.join(__dirname, '.richmenu-full.png');
  const out = path.join(__dirname, 'richmenu.jpg');
  await pg.screenshot({ path: png, clip: { x: 0, y: 0, width: W, height: H } });
  await b.close();
  // LINE の上限は 1MB。画質を下げながら 1MB 未満に収める
  let q = 92;
  try {
    do { execFileSync('convert', [png, '-strip', '-sampling-factor', '4:4:4', '-quality', String(q), out]); q -= 4; }
    while (fs.statSync(out).size > 1000 * 1024 && q > 60);
  } catch (e) { console.warn('JPEG にできませんでした（ImageMagick が無い）:', e.message); }
  fs.rmSync(png, { force: true });
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log('wrote', out, kb + 'KB', 'quality', q + 4);
})();
