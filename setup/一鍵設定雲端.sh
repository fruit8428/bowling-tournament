#!/bin/bash
# ============================================================
# 保齡球即時計分看板：雲端一鍵設定
# 做兩件事：
#   1. 在 Supabase 專案 Rotary-3523 建立 bowling_ 資料表、權限、即時訂閱
#   2. 在 Vercel 專案 bowling-tournament 設定正確的 Supabase 連線變數
# 用法：在專案資料夾執行
#   bash setup/一鍵設定雲端.sh                       （不更動 AI 金鑰）
#   bash setup/一鍵設定雲端.sh AIzaSy....             （同時設定 Gemini 金鑰）
#   bash setup/一鍵設定雲端.sh - sk-....              （只設定 OpenAI 金鑰；第一個參數用 - 跳過 Gemini）
#   bash setup/一鍵設定雲端.sh AIzaSy.... sk-....     （兩個都設；辨識時先用 OpenAI、失敗換 Gemini）
# ============================================================
set -e
cd "$(dirname "$0")/.."
REF="ncrvmhfggfczicpyebvn"
URL="https://${REF}.supabase.co"
GEMINI_KEY_ARG="$1"; [ "$GEMINI_KEY_ARG" = "-" ] && GEMINI_KEY_ARG=""
OPENAI_KEY_ARG="$2"

echo "=== 1/3 建立 Supabase 資料表（bowling_players / settings / auth / announcements / logs）==="
supabase db query -f supabase/migrations/20261102_bowling_schema.sql --linked --project-ref "$REF" --output-format json | grep -vE 'boundary|warning|Initialising' || true
echo "--- 驗證 ---"
supabase db query "select (select count(*) from bowling_players) as players, (select count(*) from bowling_settings) as settings, (select count(*) from bowling_auth) as auth_rows, (select string_agg(tablename, ',') from pg_publication_tables where pubname='supabase_realtime' and tablename like 'bowling%') as realtime_tables" --linked --project-ref "$REF" --output-format json | grep -vE 'boundary|warning|Initialising'

echo
echo "=== 2/3 連結 Vercel 專案 bowling-tournament ==="
vercel link --yes --project bowling-tournament >/dev/null
rm -f .env.local

echo "=== 3/3 設定 Vercel 環境變數（金鑰直接從 Supabase CLI 轉入，不會顯示在畫面）==="
vercel env rm SUPABASE_URL production --yes >/dev/null 2>&1 || true
vercel env rm SUPABASE_KEY production --yes >/dev/null 2>&1 || true
SECRET_KEY=$(supabase projects api-keys --project-ref "$REF" --reveal --output-format json | python3 -c 'import json,sys; d=json.load(sys.stdin); print([k["api_key"] for k in d["keys"] if k["type"]=="secret"][0])')
for ENVN in production preview development; do
  vercel env rm SUPABASE_URL "$ENVN" --yes >/dev/null 2>&1 || true
  vercel env rm SUPABASE_SECRET_KEY "$ENVN" --yes >/dev/null 2>&1 || true
  if printf '%s' "$URL" | vercel env add SUPABASE_URL "$ENVN" >/dev/null 2>/tmp/venv_err; then echo "  ✓ SUPABASE_URL → $ENVN"; else echo "  ✗ SUPABASE_URL → $ENVN 失敗: $(tail -1 /tmp/venv_err)"; fi
  if printf '%s' "$SECRET_KEY" | vercel env add SUPABASE_SECRET_KEY "$ENVN" --sensitive >/dev/null 2>/tmp/venv_err; then echo "  ✓ SUPABASE_SECRET_KEY → $ENVN"; else echo "  ✗ SUPABASE_SECRET_KEY → $ENVN 失敗: $(tail -1 /tmp/venv_err)"; fi
  if [ -n "$GEMINI_KEY_ARG" ]; then
    vercel env rm GEMINI_API_KEY "$ENVN" --yes >/dev/null 2>&1 || true
    printf '%s' "$GEMINI_KEY_ARG" | vercel env add GEMINI_API_KEY "$ENVN" --sensitive >/dev/null && echo "  ✓ GEMINI_API_KEY → $ENVN"
  fi
  if [ -n "$OPENAI_KEY_ARG" ]; then
    vercel env rm OPENAI_API_KEY "$ENVN" --yes >/dev/null 2>&1 || true
    printf '%s' "$OPENAI_KEY_ARG" | vercel env add OPENAI_API_KEY "$ENVN" --sensitive >/dev/null && echo "  ✓ OPENAI_API_KEY → $ENVN"
  fi
done
unset SECRET_KEY
echo
echo "--- 目前 Vercel 環境變數 ---"
vercel env ls | grep -E '^\s+[A-Z_]+' || true
echo
echo "✅ 雲端設定完成。接下來可執行：vercel deploy   （預覽網址）或  vercel --prod （正式網址）"
