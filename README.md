# IPPO管理ナビ（画面）

株式会社IPPO の職員向けアプリ「IPPO管理ナビ」の、LINE の中で開く画面です。GitHub Pages で `https://takemarn.github.io/ippo-navi/` として公開しています。

データの受け取りや保存は、非公開リポジトリにある GAS（Google Apps Script）が行います。この画面は LINE の本人情報を GAS に渡すだけで、データを持ちません。

## このリポジトリは公開です

次のものは**絶対に置かない**でください。

- チャネルシークレット、アクセストークン、パスワードなどの秘密の値
- 職員・利用者の氏名、写真、病歴、保険番号などの個人情報（見本データは架空のものだけ）
- スプレッドシートやドライブの URL・ID

置いてよいのは、画面のコード、自社で作った画像、LIFF ID と GAS の受付 URL（どちらも画面から見える前提の値）だけです。

## 見本モード

`config.js` の `LIFF_ID` と `API_URL` が空のときは、架空のデータで画面だけ動きます（画面上部に「見本モード」と表示）。

## ファイル

- `index.html` … 画面の入口
- `core.js` … 共通の部品（GAS とのやりとり、見本データ、画面の切り替え）
- `views/*.js` … 画面ごとの動き（menu, apply, expense, attendance, requests, approvals）
- `style.css` … 見た目
- `config.js` … LIFF ID と GAS の URL
