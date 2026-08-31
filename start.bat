@echo off
chcp 65001 > nul
echo ====================================================
echo 🎳 正在啟動 保齡球賽事記分與大會總表系統...
echo ====================================================

if not exist node_modules (
    echo 📦 偵測到初次運行，正在安裝所需套件...
    call npm install
)

echo 🌐 本地伺服器位址: http://localhost:3000
echo ====================================================
echo 💡 提示: 按 Ctrl+C 可停止伺服器
echo ====================================================

start http://localhost:3000
node server.js
pause
