# 🎳 保齡球賽事即時記分與大會總表系統 (Bowling Tournament Live System)

> 🌟 **Vercel 線上正式版**：[https://code-test-nu-wheat.vercel.app/](https://code-test-nu-wheat.vercel.app/)
> 
> 📲 **Vercel 手機記分員直達**：[https://code-test-nu-wheat.vercel.app/?room=bowling2026&view=scorekeeper&pwd=2222&auth=true](https://code-test-nu-wheat.vercel.app/?room=bowling2026&view=scorekeeper&pwd=2222&auth=true)
> 
> 🌐 **GitHub Pages 備援鏡像**：[https://fruit8428.github.io/bowling-tournament/](https://fruit8428.github.io/bowling-tournament/)

本系統是一套專為保齡球聯誼賽／錦標賽打造的**全端即時記分與大會總表管理系統**。前端基於 `bowling.html` 進行全方位升級，後端採用 **Node.js (Express + Socket.IO + SQLite / better-sqlite3 + Excel Engine)**，具備毫秒級雙向即時同步、雙視窗／多設備協同、離線備援與完整的 Excel 報表匯出入功能。

---

## ✨ 核心特色與功能模組

### 1. 📱 記分員登錄端 (手機專用介面 • 支援兩大計分模式)
- **4 位數密碼保護 (預設: `2222`)**：手機使用者在進入記分端前需於專屬數字鍵盤輸入授權密碼 `2222`，確保只有現場授權記分員方可輸入成績。
- **⚡ 兩大計分方式自由切換**：
  - **✍️ 方式一：手動填入分數**：選擇球道及局數後，使用大數字鍵盤或 +10 / -10 / 滿分 300 / 清除快捷按鈕手動輸入選手成績。
  - **📸 方式二：手機拍照完賽照片智慧辨識登錄 (AI Vision / CV OCR)**：
    - 支援手機直接**拍照**或從相簿上傳包含**「上方球道號碼牌」**與**「電視螢幕 10 局完賽分數」**之照片（如 `保齡球.jpg`）。
    - 系統自動解析球道編號與 4 位參賽者第 10 格累計總分，並提供互動式核對視窗（含微調按鈕與球道比對）。
    - 點擊「一鍵直接登錄」即可瞬間為 4 位選手建檔存檔並即時廣播至大螢幕！
- **一鍵登出/鎖定**：頂部導覽列提供 🔒 鎖定按鈕，離開手機時可一鍵快速鎖定。
- **球道與局數切換**：支援 1~40 號球道快速切換，提供「上一道 / 下一道」一鍵跳轉。
- **一鍵切換性別**：男 👨 / 女 👩 即時切換並套用專屬色系識別。
- **特別獎項計數**：火雞 (Turkey 🦃) 與 霸王花 (Flower 🌺) 一鍵增減記分。
- **防誤觸鎖定模式**：避免手機放口袋或現場操作時誤改分數。
- **即時廣播通知**：接收大會後台推送的即時公告與提醒。

### 2. 💻 大會即時總表看板 (大螢幕 / 投影機 / 電視模式)
- **40 球道 160 選手全覽 (15 欄位完整顯示)**：橫欄完整包含：`球道`、`序號`、`所屬社`、`姓名`、`職稱`、`社名`、`性別`、`身份`、`第 1 局`、`第 2 局`、`第 3 局`、`加分`、`總計`、`火雞 🦃`、`霸王花 🌺`。
- **智慧女子加分**：選手實際出賽後自動計算女子加分（預設每位出賽女性 +36 分）。
- **即時視覺高亮動畫**：任一球道成績更新時，總表該行自動以綠光漸變高亮。
- **多維度搜尋與篩選**：支援姓名、英文名/社名、職稱 (PP/PE/CP等)、身份 (社友/寶尊眷/子女)、所屬社團、分區、球道編號搜尋，以及性別篩選。
- **大螢幕自動循環滾動**：專為電視牆與投影機設計之平滑自動巡迴展示。
- **友善列印格式 (Print CSS)**：按 `Ctrl+P` / `Cmd+P` 可直接列印整齊的大會總表成績單。

### 3. 🏆 即時排行榜與獎項榜 (Live Leaderboard)
- 👑 **綜合個人總排行榜**：自動按總分、單局最高分、原分排序，標註 🥇 冠軍、🥈 亞軍、🥉 季軍。
- 👨 **男子組個人排名** / 👩 **女子組個人排名**。
- 🏛️ **分區團體獎賽排名榜 (Top 7 跨區總分)**：自動根據社團名稱前綴（例：`12-1`~`12-8` 為第 12 分區；`04-1`~`04-5` 為第 4 分區）自動歸屬各分區，選出各分區個人總分最高的前 7 位選手總分加總跨區排名，並提供前三名頒獎台與各分區 Top 7 選手貢獻明細。
- 🏢 **社團團體積分榜**：統計各球會參賽人數、出賽人數、團體總分、人均平均分與團隊獎項。
- 🎯 **特別獎項得主榜**：
  - 🦃 火雞王榜 (Most Turkeys)
  - 🌺 霸王花后榜 (Most Flowers)
  - 🎯 單局最高分獎 (High Game Award)

### 4. ⚙️ 賽事管理與 Excel 匯出入 (Admin)
- **多工作表 Excel 報表匯出**：一鍵下載包含《大會總成績表》、《個人總分排名》、《男子組排名》、《女子組排名》、《分區團體排名》、《社團團體積分榜》、《特別獎項名單》之正式 `.xlsx`。
- **選手名冊批次匯入**：支援上傳 `.xlsx` 或 `.csv` 快速覆蓋或更新全場選手資料。
- **下載空白範本**：內建提供標準選手名冊匯入範本檔 (`sample_players.xlsx`)。
- **全場即時推播廣播**：即時推送跑馬燈訊息給現場所有記分員與大螢幕看板。
- **自訂規則參數**：可線上調整賽事名稱、女子加分標準（例如 +36）、總球道數。
- **資料庫維護**：支援「一鍵清空分數保留名冊」或「重置為預設示範名冊」。

---

## 🚀 快速啟動指南

### 方式一：使用一鍵啟動腳本 (推薦)

#### macOS / Linux：
```bash
./start.sh
```

#### Windows：
雙擊執行 `start.bat` 或在終端機執行：
```cmd
start.bat
```

---

### 方式二：使用 npm 指令啟動

1. **安裝依賴套件**：
   ```bash
   npm install
   ```

2. **啟動伺服器**：
   ```bash
   npm start
   ```

3. **開啟瀏覽器**：
   - 瀏覽器打開：[http://localhost:3000](http://localhost:3000)
   - 手機記分員連接（需在同一 Wi-Fi 區域網路）：`http://<你的電腦IP>:3000`

---

### 方式三：單機離線模式 (無需伺服器)
直接雙擊開啟 `bowling.html` 檔案即可在任何瀏覽器中單機運行，資料將自動保存在瀏覽器的 `localStorage` 中，並支援跨瀏覽器分頁即時連動。

---

## 📁 專案目錄結構

```text
code-test/
├── server.js               # Node.js Express + Socket.IO 後端伺服器
├── database.js             # SQLite (better-sqlite3) 資料庫管理模組
├── excelService.js         # Excel 多工作表報表匯出、範本產生與檔案解析模組
├── public/                 # 前端靜態資源
│   └── index.html          # 主應用程式 (包含首頁、記分員、總表、排行榜、管理後台)
├── bowling.html            # 支援獨立開啟與伺服器雙模運行的前端檔案
├── sample_players.xlsx     # 產生的標準 40 球道 160 選手名冊 Excel 範本
├── start.sh                # macOS / Linux 一鍵啟動腳本
├── start.bat               # Windows 一鍵啟動腳本
├── package.json            # 專案套件配置
└── data/                   # 本地 SQLite 資料庫存放目錄
    └── bowling.db          # 賽事資料庫 (自動產生)
```

---

## 🔌 RESTful API 與 WebSocket 介面說明

| 方法 | 路徑 | 說明 |
|---|---|---|
| `GET` | `/api/status` | 取得伺服器狀態、連線人數與賽況統計 |
| `GET` | `/api/lanes` | 取得全場所有球道與選手資料 |
| `GET` | `/api/lanes/:lane` | 取得指定球道之選手資料 |
| `POST` | `/api/player/field` | 更新單一選手特定欄位 (即時同步) |
| `POST` | `/api/player/update` | 更新單一選手整筆資料 |
| `POST` | `/api/lane/batch-update` | 批次更新整球道成績 (記分員存檔) |
| `GET` | `/api/settings` | 取得賽事參數設定 |
| `POST` | `/api/settings` | 儲存賽事參數設定 |
| `POST` | `/api/reset` | 重置資料 (清空分數或恢復示範名單) |
| `GET` | `/api/export/excel` | 下載完整 6 工作表大會 Excel 成績單 |
| `GET` | `/api/template/excel` | 下載選手名冊 Excel 範本 |
| `POST` | `/api/import/excel` | 上傳 Excel / CSV 批次匯入名冊 |
| `POST` | `/api/broadcast` | 發送全場跑馬燈即時廣播訊息 |

### WebSocket (Socket.IO) 即時事件：
- `initial_sync`: 連線成功時下發初始資料與設定。
- `lane_updated`: 任一球道成績變更時廣播至所有客戶端。
- `bulk_updated`: 批次匯入或重置時廣播全場。
- `settings_updated`: 賽事規則變更時廣播。
- `announcement`: 接收大會全場廣播跑馬燈。

---

## 🛠️ 技術棧說明
- **前端 (Frontend)**：HTML5, Tailwind CSS, JavaScript (ES6+), Socket.IO Client.
- **後端 (Backend)**：Node.js, Express, Socket.IO, CORS, Multer.
- **資料庫 (Database)**：SQLite 3 (`better-sqlite3` WAL 高並發模式).
- **報表引擎 (Excel)**：SheetJS (`xlsx`).
