// リッチメニュー画像 richmenu.png（2500×1686, LINE の「大」サイズ）を作り直すための道具。
// 使い方: node richmenu/make.js   （playwright が必要。FONT_DIR に noto500.woff2 / noto800.woff2 を置くと Noto Sans JP で描く）
// 中身（ラベル・色・アイコン）は richmenu/tiles.js。画面の入口(#menu)も同じものを使う。
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const TILES = require('./tiles.js');

const W = 2500, H = 1686, COLS = [0, 833, 1667, 2500], ROWS = [0, 843, 1686];
const fontDir = process.env.FONT_DIR;
const face = (w) => fontDir && fs.existsSync(path.join(fontDir, 'noto' + w + '.woff2'))
  ? `@font-face{font-family:RM;font-weight:${w};src:url(data:font/woff2;base64,${fs.readFileSync(path.join(fontDir, 'noto' + w + '.woff2')).toString('base64')}) format('woff2')}` : '';

const tiles = TILES.map((t, i) => {
  const c = i % 3, r = Math.floor(i / 3);
  const x = COLS[c], y = ROWS[r], w = COLS[c + 1] - x, h = ROWS[r + 1] - y;
  return `<div class="t" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;--tint:${t.tint};--c:${t.color};--b:${t.badge}">
    <i class="blob"></i><i class="blob2"></i><i class="halo"></i>
    <svg viewBox="0 0 64 64" style="color:${t.color}">${t.icon}</svg>
    <b>${t.label}</b><small>${t.en}</small><span>${t.no}</span></div>`;
}).join('');

const html = `<!doctype html><meta charset="utf-8"><style>
${face(500)}${face(800)}
*{box-sizing:border-box;margin:0}
body{width:${W}px;height:${H}px;background:#fff;position:relative;overflow:hidden;font-family:RM,"Noto Sans JP","Hiragino Sans",sans-serif}
.t{position:absolute;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:70px;
  background:linear-gradient(155deg,#fff 0%,#fff 42%,var(--tint) 100%);border:5px solid #fff;border-radius:34px}
.blob{position:absolute;left:-120px;top:-120px;width:330px;height:330px;border-radius:50%;background:var(--tint)}
.blob2{position:absolute;right:-90px;bottom:-140px;width:360px;height:300px;border-radius:50%;background:var(--tint);opacity:.8}
.halo{position:absolute;left:50%;top:92px;width:420px;height:420px;margin-left:-210px;border-radius:50%;background:radial-gradient(circle,var(--tint) 0%,rgba(255,255,255,0) 70%)}
svg{position:relative;width:430px;height:430px;margin-bottom:26px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
svg .f{fill:currentColor;fill-opacity:.14;stroke:none}
svg .w{fill:#fff}
b{position:relative;font-size:84px;font-weight:800;letter-spacing:.08em;color:#1b1f27;line-height:1.2}
small{position:relative;font-size:30px;font-weight:500;letter-spacing:.16em;color:#8f98a3;margin-top:10px}
span{position:relative;margin-top:30px;width:70px;height:70px;border-radius:50%;background:var(--b);color:#fff;font-size:40px;font-weight:800;display:grid;place-items:center;line-height:1}
</style>${tiles}`;

(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await pg.setContent(html);
  await pg.evaluate(() => document.fonts.ready);
  const out = path.join(__dirname, 'richmenu.png');
  await pg.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H } });
  await b.close();
  // LINE の上限は 1MB。ImageMagick があれば 256 色に減らして小さくする
  try { execFileSync('convert', [out, '-dither', 'FloydSteinberg', '-colors', '256', 'PNG8:' + out]); } catch (e) { console.warn('減色できませんでした（ImageMagick が無い）:', e.message); }
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log('wrote', out, kb + 'KB', kb > 1000 ? '← 1MB を超えています。減色してから登録してください' : '');
})();
