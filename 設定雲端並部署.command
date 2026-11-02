#!/bin/bash
# ============================================================
# 保齡球即時計分看板：雙擊即可執行
#   1. 在 Supabase 建立資料表（可重複執行，已存在會略過）
#   2. 把 Supabase 連線資料寫進 Vercel 環境變數
#   3. （可選）設定 OpenAI / Gemini 金鑰
#   4. 部署到 Vercel「預覽網址」供測試（不影響正式網址）
# ============================================================
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

echo "========================================================"
echo "  保齡球即時計分看板 雲端設定與部署"
echo "========================================================"
echo
for tool in supabase vercel python3; do
  if ! command -v $tool >/dev/null 2>&1; then
    echo "❌ 找不到 $tool 指令，請先安裝後再執行。"; read -p "按 Enter 關閉..."; exit 1
  fi
done

read -p "OpenAI 金鑰（sk-...）；沒有要改就直接按 Enter： " OPENAI_INPUT
read -p "Gemini 金鑰（AIzaSy...）；沒有要改就直接按 Enter： " GEMINI_INPUT
echo
GEMINI_ARG="${GEMINI_INPUT:--}"
if ! bash setup/一鍵設定雲端.sh "$GEMINI_ARG" "$OPENAI_INPUT"; then
  echo; echo "❌ 設定過程發生錯誤，請把上面的訊息貼給 Claude。"; read -p "按 Enter 關閉..."; exit 1
fi

echo
read -p "要直接部署到正式網址 bowling-tournament.vercel.app 嗎？(y = 正式 / 直接 Enter = 只部署預覽版)： " PROD_ANS
if [ "$PROD_ANS" = "y" ] || [ "$PROD_ANS" = "Y" ]; then
  echo "=== 部署到正式網址 ==="
  vercel deploy --prod --yes 2>&1 | tail -8
  echo
  echo "========================================================"
  echo "✅ 完成。正式網址：https://bowling-tournament.vercel.app"
  echo "========================================================"
else
  echo "=== 部署預覽版到 Vercel（測試用網址）==="
  vercel deploy --yes 2>&1 | tail -15
  echo
  echo "========================================================"
  echo "✅ 完成。預覽網址請見上方（受 Vercel 登入保護，Claude 會用指令測試）。"
  echo "========================================================"
fi
read -p "按 Enter 關閉此視窗..."
