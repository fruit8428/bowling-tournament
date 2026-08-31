#!/bin/bash
# 保齡球賽事記分系統一鍵啟動腳本 (macOS / Linux)

echo "===================================================="
echo "🎳 正在啟動 保齡球賽事記分與大會總表系統..."
echo "===================================================="

# 確保已安裝套件
if [ ! -d "node_modules" ]; then
    echo "📦 偵測到初次運行，正在安裝所需套件..."
    npm install
fi

# 取得本機 IP 方便手機連線
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo "🌐 本地伺服器位址: http://localhost:3000"
echo "📱 手機記分員連線位址: http://${LOCAL_IP}:3000"
echo "===================================================="
echo "💡 提示: 按 Ctrl+C 可停止伺服器"
echo "===================================================="

# 自動在預設瀏覽器開啟
if [[ "$OSTYPE" == "darwin"* ]]; then
    open "http://localhost:3000" &
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open "http://localhost:3000" &>/dev/null &
fi

# 啟動 Node.js 伺服器
node server.js
