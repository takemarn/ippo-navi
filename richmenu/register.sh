#!/bin/sh
# リッチメニューを LINE に登録して、全員の既定メニューにする。
# 使い方: LINE_TOKEN=<チャネルアクセストークン> sh richmenu/register.sh
#   トークンはファイルに書かない・コミットしない。古いメニューは消さない（LINE 管理画面か API で手で消す）。
set -eu
cd "$(dirname "$0")"
: "${LINE_TOKEN:?LINE_TOKEN を環境変数に入れてください}"
AUTH="Authorization: Bearer $LINE_TOKEN"
ID=$(curl -sS -X POST https://api.line.me/v2/bot/richmenu -H "$AUTH" -H "Content-Type: application/json" -d @richmenu.json \
  | sed -n 's/.*"richMenuId":"\([^"]*\)".*/\1/p')
[ -n "$ID" ] || { echo "メニュー定義の登録に失敗しました"; exit 1; }
curl -sS -f -X POST "https://api-data.line.me/v2/bot/richmenu/$ID/content" -H "$AUTH" -H "Content-Type: image/jpeg" --data-binary @richmenu.jpg
curl -sS -f -X POST "https://api.line.me/v2/bot/user/all/richmenu/$ID" -H "$AUTH"
echo "登録しました: $ID"
