# リッチメニュー（LINE トーク画面下の 6 タイル）

| ファイル | 中身 |
|---|---|
| `richmenu.jpg` | メニュー画像（2500×1686、LINE の「大」サイズ、1MB 未満）。白いカード 3 列×2 段に立体風イラスト・名前・英語・＞ボタン |
| `richmenu.json` | タップ先の設定（Messaging API のリッチメニュー定義） |
| `tiles.js` | 6 タイルのラベル・色・アイコン。画面の入口（`#menu`）もこれを使う |
| `art.js` | メニュー画像用の立体風イラスト（自作 SVG）。`make.js` と画面のホーム・各メニュー見出し（views/menu.js、window.IPPO_ART）が使う。直すと両方に効く |
| `register.sh` | 定義と画像を LINE に登録して既定メニューにする（`LINE_TOKEN=… sh richmenu/register.sh`） |
| `make.js` | 画像を作り直す道具（`FONT_DIR=<フォント置き場> node richmenu/make.js`、playwright と ImageMagick が必要。フォントは Noto Sans JP の 500/800 を `noto500.woff2` / `noto800.woff2` という名前で置く。npm の `@fontsource/noto-sans-jp` の `files/noto-sans-jp-japanese-{500,800}-normal.woff2` が使える） |

並び: 上段「経費勤怠申請 `#apply`」「申請状況 `#status`」「タスク管理 `#task`」、下段「利用者一覧 `#users`」「シフト管理 `#shift`」「相談AI `#portal`」。

## 登録のしかた

1. LINE Developers で LIFF アプリを作り、エンドポイント URL を `https://takemarn.github.io/ippo-navi/`、サイズを「Full」にする。
2. `richmenu.json` の `LIFF_ID`（6 か所）を、できた LIFF ID（例 `2001234567-AbCdEfGh`）に置き換える。
3. チャネルアクセストークンを手元の環境変数 `TOKEN` に入れ（ファイルには書かない）、次を順に実行する。

```sh
# ① 定義を登録 → 返ってきた richMenuId を控える
curl -X POST https://api.line.me/v2/bot/richmenu \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d @richmenu/richmenu.json
# ② 画像を載せる
curl -X POST https://api-data.line.me/v2/bot/richmenu/<richMenuId>/content \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: image/jpeg" -T richmenu/richmenu.jpg
# ③ 全員の既定メニューにする
curl -X POST https://api.line.me/v2/bot/user/all/richmenu/<richMenuId> -H "Authorization: Bearer $TOKEN"
```

LINE Official Account Manager の画面から作る場合は、テンプレート「大・6 分割」を選んで `richmenu.jpg` を載せ、各タイルのアクションを「リンク」にして上の URL（`https://liff.line.me/<LIFF ID>#apply` など）を入れる。

## メモ

- `#apply` などの行き先は LIFF が `liff.state` に入れて渡すことがあり、`core.js` が起動時に拾って同じ画面を開く。
- LIFF_ID を書き換えたファイルはそのまま公開してよい（LIFF ID は画面から見える値）。チャネルアクセストークンは絶対にコミットしない。
