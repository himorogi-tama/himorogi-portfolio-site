#!/bin/zsh

# file://ではブラウザがJSON読込を拒否するため、siteをWebサーバーとして表示する。
SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR" || exit 1

echo "ポートフォリオ確認用"
echo "ブラウザで http://127.0.0.1:4173/ を開いてください。"
echo "終了するときは Control + C を押してください。"
python3 -m http.server 4173 --bind 127.0.0.1
