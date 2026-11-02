#!/bin/bash
# 雙擊即可把目前的程式碼部署到正式網址 https://bowling-tournament.vercel.app
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
echo "=== 部署到正式網址（約 30 秒）==="
vercel deploy --prod --yes 2>&1 | tail -6
echo
echo "✅ 完成：https://bowling-tournament.vercel.app"
read -p "按 Enter 關閉此視窗..."
