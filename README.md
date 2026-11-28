# IPPO管理ナビ（画面）

株式会社IPPO の職員向けアプリ「IPPO管理ナビ」の、LINE の中で開く画面（LIFF）です。素の HTML/CSS/JS でビルドはありません。GitHub Pages で `https://takemarn.github.io/ippo-navi/` として公開しています。

データの受け取りや保存は、非公開リポジトリ kiroku-app にある GAS（Google Apps Script）が行います。この画面は LINE の本人情報を GAS に渡すだけで、データを持ちません。GAS とのやりとりの決まりは kiroku-app の `docs/api.md` が正です。

## このリポジトリは公開です

次のものは**絶対に置かない**でください。

- チャネルシークレット、アクセストークン、パスワードなどの秘密の値
- 職員・利用者の氏名、写真、病歴、電話番号、住所、保険番号などの個人情報（見本データは「見本 太郎」のように明らかに架空のものだけ）
- スプレッドシートやドライブの URL・ID
- 他社の名前・ロゴ・絵（画面づくりで参考にしたアプリは、コメントでは「参考アプリ」とだけ書く）

置いてよいのは、画面のコード、自社で作った画像、LIFF ID と GAS の受付 URL（どちらも画面から見える前提の値）だけです。

## 見本モード

`config.js` の `API_URL` が空のときは、架空のデータで画面だけ動きます（画面上部に「見本モード」と表示）。見本の返事は `core.js` の `Demo` と、`views/*-demo.js`（`IPPO.demo[action]` に登録したものが先に使われる）が作ります。どれも GAS と同じ形を返すので、画面を直すときは見本も同じ形に保ってください。

手元で見る: このフォルダで `python3 -m http.server 8765` → `http://localhost:8765/#menu`（見本モードでは LIFF の初期化もログインもしないので、ふつうのブラウザで開ける）。

## ファイル

| ファイル | 中身 |
| --- | --- |
| `index.html` | 入口。CSS と JS を読む順もここ（`core.js` → `richmenu/tiles.js`・`art.js` → `views/*.js`） |
| `config.js` | LIFF ID と GAS の URL |
| `core.js` | 共通の部品: GAS とのやりとり `IPPO.api(action, data)`、見本データ `Demo`、画面の切り替え（`#ハッシュ` → `IPPO.views[名前]`）、メニュー画面の部品 `subMenu`、読み込み中・エラー・トースト |
| `style.css` | 共通の見た目（淡い水色→ラベンダーの背景、すりガラスのカード、濃紺の主ボタン） |
| `css/*.css` | 画面ごとの見た目（menu / expense / attendance / approvals / shift / clients / portal） |
| `richmenu/` | LINE のリッチメニュー（画像・定義・登録手順。`richmenu/README.md`） |
| `richmenu/tiles.js` | 6タイルの名前・色・アイコン。リッチメニュー画像とホームの両方が使う（`window.IPPO_TILES`） |
| `richmenu/art.js` | 6タイルの立体風イラスト（自作 SVG）。リッチメニュー画像（`make.js`）と、ホームのタイル・各メニューの見出し（`window.IPPO_ART`）が共用。直すとどちらにも効く |

### 画面（views/）

リッチメニューの6つと行き先:

| # | メニュー | ハッシュ | ファイル | 主な決まり |
| --- | --- | --- | --- | --- |
| — | ホーム | `#menu` | `views/menu.js` | あいさつ → 今やること（承認待ち・差戻し・結果待ち。`myRequests`・`pendingApprovals` から数える）→ リッチメニューと同じ6タイル → 近道。各メニュー画面の見出し（絵＋名前）を作る `IPPO.menuHead` もここ（`core.js` の `subMenu` が呼ぶ） |
| 1 | 経費勤怠申請 | `#apply` → `#expense` `#attendance` | `views/apply.js` `expense.js` `attendance.js` | 送信 → 項目の下に赤字 → 確認カード → 送信中 → 完了カード。確認カードを出すときに `送信ID` を作り、同じ ID の再送は GAS が前の返事を返す（二重登録しない）。勤怠の遅延証明書は先に `uploadAttachment` で送り、返る `添付ファイルID` を付ける。差戻しの「出し直す」は sessionStorage `ippo.redo` で中身を受け渡す |
| 2 | 申請状況 | `#status` → `#requests` | `views/menu.js`（メニュー）・`requests.js` | 自分の申請を状態で絞り込み、差戻しは理由と「出し直す」、承認待ちは取り消せる（`cancelRequest`） |
| — | 承認待ち一覧 | `#approvals` | `views/approvals.js` | 各メニューの最下段から。承認者・管理者だけ。件数のまとめ → 承認者ごと → 申請カード（承認は確認つき、差戻しは理由必須）。管理者だけ「削除」（理由必須で `deleteRequest`） |
| 3 | タスク管理 | `#task` → `#task-office` | `views/task.js`（見た目は `css/expense.css` の `exp-*`・`tk-*`） | 施設→本部事務の依頼。タスクを選ぶまで日程から下は使えない。日程は「1日」か「期間」かをタスクごとに決める（`dateMode`） |
| 4 | 利用者一覧 | `#users` `#user` `#user-*` `#users-result` `#records-result` | `views/clients.js`・`clients-demo.js` | 自分が見られる施設（`me.見られる施設`）の利用者だけ。情報閲覧・記録・記録一覧・写真・データ修正（登録・修正は申請になり、承認で反映） |
| 5 | シフト管理 | `#shift` `#shift-submit` `#shift-view` `#shift-make` | `views/shift.js`・`shift-demo.js` | 提出（希望を4つのボタンで）・確認（確定した勤務）・作成（承認者・管理者。必要人数と比べて足りない日を赤、施設が2つ以上なら施設タブ、確定と取消） |
| 6 | 相談AI | `#portal` `#rules` `#rules-list` `#rule-read` `#org` `#manual` `#manual-urgent` `#manual-guide` `#parking` `#ai` | `views/portal.js` `manual.js` `parking.js` `ai.js`・`portal-demo.js` | 読み込む順は portal-demo → portal → manual → parking → ai（manual・parking は portal.js の `I.portalTools` を使う）。`portal.js` が `menu.js` の `#portal` を上書きする。規程・マニュアルの見本の文はすべて新しく書いたもの |

どの画面も、読み込み中は形だけの仮の表示、空のとき・読めなかったとき（もう一度読み込むボタン付き）を出し分けます。各ファイルの先頭コメントに、その画面の並び・決まり・GAS とのやりとりを書いています。

## 画面が GAS に求める形（今回足したもの）

画面の作り込みで、次の action と項目を新しく使うようになりました。**GAS 側（kiroku-app）にも同じものが要ります。** 項目はどれも「無ければ今までどおりに動く」ように作ってあります（action が無いときは、その操作だけがエラーになる）。

### 新しい action

| action | 送る data | 返してほしいもの | 使う画面 |
| --- | --- | --- | --- |
| `uploadAttachment` | `{ ファイル: 'data:<型>;base64,…' }`（画像は長い辺1600pxの JPEG、または PDF。2MB まで） | `{ 添付ファイルID }` | 勤怠申請の遅延証明書 |
| `deleteRequest` | `{ 申請ID, 理由 }`（承認待ちの申請だけ。管理者だけが押せる） | `{ 申請ID, 状態: '取消' }`（もう承認待ちでなければ 400「この申請はもう承認待ちではありません…」） | 承認待ち一覧 |
| `unfixShifts` | `{ 年月: 'YYYY-MM' }` | 何でもよい。その月を「作成中」に戻し、職員のシフト確認から勤務を消す（入れた勤務は残す） | シフト作成 |

### 今ある action に足した項目

| action | 足した項目 | 意味 |
| --- | --- | --- |
| `submitExpense` | data.`施設名`、data.`送信ID` | 選んだ施設（`options.施設` のどれか）。送信ID が同じ2回目は前の返事を返す（二重登録しない） |
| `submitAttendance` | data.`施設名`、data.`送信ID`、data.`添付ファイルID?` | 同上。添付ファイルID は `uploadAttachment` が返したもの |
| `shiftForm`（返事） | `状態`、`提出可` | `提出可: false` の月は提出画面で入力を止め、`状態`（作成中・確定など）を出す |
| `shiftBoard`（返事） | `職員[].所属施設`（配列） | 施設が2つ以上あれば作成画面に施設タブを出す |
| `shiftBoard`（返事） | `必要人数`（任意） | `{ 日中: 数, 夜勤: 数 }` か、日ごとの `{ 'YYYY-MM-DD': { 日中, 夜勤 } }`。無ければ画面で決めた数（端末に覚える。初めは日中3・夜勤1） |
| `saveShifts` | data.`割当[].施設名`（任意） | 施設タブで入れたマスだけ付く。無ければ本人の所属施設にする |
| `manual`（返事） | `連絡先[].施設`（任意） | 施設ごとに番号がちがうとき。2つ以上あると急変の画面で「どの施設ですか？」を出す。空の行はどの施設でも出す |
| `manual`（返事） | `ガイド[].絵`（任意） | 場面カードの絵の名前（fall・note・pill・home・bath・thermo・bandage・eye・phone・ambulance・steth・sprout・book）。空なら題やキーワードから画面が選ぶ |

ほかに、`fixShifts` は1マスも無い月だと 400 を返す前提です（画面でも先に止める）。くわしい形は各画面ファイルの先頭コメントと、見本（`core.js` の `Demo`、`views/*-demo.js`）を見てください。

## リッチメニュー

並び: 上段「経費勤怠申請 `#apply`」「申請状況 `#status`」「タスク管理 `#task`」、下段「利用者一覧 `#users`」「シフト管理 `#shift`」「相談AI `#portal`」。画像の作り直しと登録は `richmenu/README.md`。
