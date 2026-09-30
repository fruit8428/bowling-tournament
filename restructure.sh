#!/bin/bash
set -e

echo "Creating directories..."
mkdir -p src
mkdir -p docs/screenshots
mkdir -p examples
mkdir -p scripts

echo "Moving screenshots..."
mv screenshot_*.png docs/screenshots/ 2>/dev/null || true

echo "Moving examples and test data..."
mv "保齡球.jpg" "未命名的筆記本*.jpg" "IMG_6970.PNG" examples/ 2>/dev/null || true
mv "地區保齡球yang.xlsx" "最新大會成績總表.xlsx" examples/ 2>/dev/null || true
mv eng.traineddata examples/ 2>/dev/null || true
# sample_players.xlsx is used by server? Let's check if it's hardcoded.
# Actually, excelService.js generates the template dynamically.
mv sample_players.xlsx examples/ 2>/dev/null || true
mv 密碼.md docs/ 2>/dev/null || true

echo "Moving scripts..."
mv bowling_ocr.py gemini-code-*.py scripts/ 2>/dev/null || true

echo "Moving frontend files..."
# index.html and bowling.html are already in public/ and root. We will keep public/ ones and move root ones to overwrite.
mv index.html public/ 2>/dev/null || true
mv bowling.html public/ 2>/dev/null || true

echo "Moving backend files..."
mv server.js src/
mv database.js src/
mv excelService.js src/
mv ocrService.js src/

echo "Restructure commands completed."
