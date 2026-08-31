/**
 * Bowling Tournament Real-Time Full-Stack Backend Server
 * Express + Socket.IO + SQLite (better-sqlite3) + Excel Engine
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
let QRCode;
try {
    QRCode = require('qrcode');
} catch (e) {
    QRCode = null;
}

const db = require('./database');
const excelService = require('./excelService');
const ocrService = require('./ocrService');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    // Prioritize en0, wlan0, eth0, or Wi-Fi
    const candidates = [];
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                candidates.push({ devName, address: alias.address });
            }
        }
    }
    // Prefer Wi-Fi / en0 or typical 192.168 / 10.0 / 172.16 ranges
    const preferred = candidates.find(c => c.devName.startsWith('en') || c.devName.startsWith('wlan') || c.devName.startsWith('eth')) || candidates[0];
    return preferred ? preferred.address : 'localhost';
}

function getAllLocalIpAddresses() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                ips.push({
                    name: devName,
                    address: alias.address,
                    netmask: alias.netmask,
                    isDefault: alias.address === getLocalIpAddress()
                });
            }
        }
    }
    return ips;
}

// Configure Multer for Excel file upload (in-memory buffer)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10 MB limit
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
const PUBLIC_DIR = path.join(__dirname, 'public');
if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}
app.use(express.static(PUBLIC_DIR));

// Also serve the root directory for backward compatibility with bowling.html
app.get('/bowling.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'bowling.html'));
});

// Redirect root to public/index.html
app.get('/', (req, res) => {
    const indexPath = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.sendFile(path.join(__dirname, 'bowling.html'));
    }
});

// ==========================================
// REST API Routes
// ==========================================

// 1. System Status & Stats
app.get('/api/status', (req, res) => {
    try {
        const settings = db.getSettings();
        const stats = db.getStats();
        const localIp = getLocalIpAddress();
        const allIps = getAllLocalIpAddresses();
        res.json({
            ok: true,
            status: 'online',
            time: new Date().toISOString(),
            settings,
            stats,
            localIp,
            allIps,
            port: PORT,
            mobileUrl: `http://${localIp}:${PORT}`,
            connectedClients: io.engine.clientsCount
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// 1.1 Network IPs List
app.get('/api/network-ips', (req, res) => {
    try {
        const localIp = getLocalIpAddress();
        const ips = getAllLocalIpAddresses();
        res.json({
            ok: true,
            defaultIp: localIp,
            port: PORT,
            ips,
            defaultMobileUrl: `http://${localIp}:${PORT}`
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// 1.2 Generate High-Quality Dynamic QR Code
app.get('/api/qrcode', async (req, res) => {
    try {
        const text = req.query.text || req.query.url || `http://${getLocalIpAddress()}:${PORT}/?view=scorekeeper&pwd=2222`;
        const format = req.query.format || 'svg';
        
        if (QRCode) {
            if (format === 'png') {
                const buffer = await QRCode.toBuffer(text, {
                    width: parseInt(req.query.size, 10) || 300,
                    margin: 2,
                    color: { dark: '#0f172a', light: '#ffffff' }
                });
                res.type('image/png').send(buffer);
            } else {
                const svg = await QRCode.toString(text, {
                    type: 'svg',
                    width: parseInt(req.query.size, 10) || 300,
                    margin: 2,
                    color: { dark: '#0f172a', light: '#ffffff' }
                });
                res.type('image/svg+xml').send(svg);
            }
        } else {
            // Fallback redirect if QRCode package not available
            res.redirect(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`);
        }
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// 1.3 Batch QR Code Data for all 40 lanes
app.get('/api/qrcode/batch', async (req, res) => {
    try {
        const totalLanes = parseInt(db.getSetting('total_lanes') || '40', 10);
        const hostIp = req.query.ip || getLocalIpAddress();
        const pwd = req.query.pwd || db.getSetting('scorekeeper_password') || '2222';
        const list = [];

        for (let lane = 1; lane <= totalLanes; lane++) {
            const url = `http://${hostIp}:${PORT}/?view=scorekeeper&lane=${lane}&pwd=${encodeURIComponent(pwd)}`;
            let svg = '';
            if (QRCode) {
                svg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 180 });
            }
            list.push({ lane, url, svg });
        }

        res.json({ ok: true, totalLanes, hostIp, port: PORT, list });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// 1.4 Printable 40 Lanes QR Code Stickers Page
app.get('/print-lanes-qr', async (req, res) => {
    try {
        const totalLanes = parseInt(db.getSetting('total_lanes') || '40', 10);
        const eventName = db.getSetting('event_name') || '保齡球賽事';
        const hostIp = req.query.ip || getLocalIpAddress();
        const pwd = req.query.pwd || db.getSetting('scorekeeper_password') || '2222';
        
        let cardsHtml = '';
        for (let lane = 1; lane <= totalLanes; lane++) {
            const url = `http://${hostIp}:${PORT}/?view=scorekeeper&lane=${lane}&pwd=${encodeURIComponent(pwd)}`;
            let svg = '';
            if (QRCode) {
                svg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 140 });
            } else {
                svg = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(url)}" style="width:140px;height:140px;" />`;
            }

            cardsHtml += `
                <div class="qr-card">
                    <div class="card-header">
                        <div class="event-title">${eventName}</div>
                        <div class="lane-badge">第 ${lane} 球道</div>
                    </div>
                    <div class="qr-box">
                        ${svg}
                    </div>
                    <div class="card-footer">
                        <div class="guide-title">📱 手機相機掃描即連</div>
                        <div class="url-text">${hostIp}:${PORT}/?lane=${lane}</div>
                        <div class="pwd-tag">密碼: <b>${pwd}</b> (已自動帶入)</div>
                    </div>
                </div>
            `;
        }

        const html = `
            <!DOCTYPE html>
            <html lang="zh-TW">
            <head>
                <meta charset="UTF-8">
                <title>${eventName} — 1~${totalLanes}球道 QR Code 桌貼列印</title>
                <style>
                    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang TC", "Microsoft JhengHei", sans-serif; }
                    body { margin: 0; padding: 20px; background: #f8fafc; color: #1e293b; }
                    .no-print-bar { background: #0284c7; color: #fff; padding: 14px 20px; border-radius: 12px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; font-weight: bold; }
                    .btn-print { background: #fff; color: #0284c7; border: none; padding: 8px 20px; font-size: 15px; font-weight: 900; border-radius: 8px; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.15); }
                    .grid-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 16px; }
                    .qr-card { background: #fff; border: 2px dashed #94a3b8; border-radius: 16px; padding: 14px; text-align: center; display: flex; flex-direction: column; align-items: center; page-break-inside: avoid; }
                    .card-header { width: 100%; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 8px; }
                    .event-title { font-size: 11px; font-weight: 700; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                    .lane-badge { font-size: 20px; font-weight: 900; color: #1d4ed8; margin-top: 2px; }
                    .qr-box { margin: 4px 0; background: #fff; padding: 4px; border-radius: 8px; }
                    .qr-box svg { display: block; margin: 0 auto; max-width: 140px; height: auto; }
                    .card-footer { width: 100%; border-top: 1.5px solid #e2e8f0; padding-top: 8px; margin-top: 4px; }
                    .guide-title { font-size: 11px; font-weight: 900; color: #059669; }
                    .url-text { font-size: 9px; font-family: monospace; color: #64748b; margin: 2px 0; word-break: break-all; }
                    .pwd-tag { font-size: 10px; color: #334155; }
                    @media print {
                        body { background: #fff; padding: 0; }
                        .no-print-bar { display: none; }
                        .grid-container { grid-template-columns: repeat(3, 1fr); gap: 12px; }
                        .qr-card { border: 1.5px dashed #64748b; }
                    }
                </style>
            </head>
            <body>
                <div class="no-print-bar">
                    <div>🎳 <strong>${eventName}</strong> — 1 ~ ${totalLanes} 球道手機記分員專屬 QR Code 桌貼 (連線 IP: <u>${hostIp}</u>)</div>
                    <button class="btn-print" onclick="window.print()">🖨️ 立即列印全部 A4 桌貼</button>
                </div>
                <div class="grid-container">
                    ${cardsHtml}
                </div>
            </body>
            </html>
        `;

        res.send(html);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// 2. Get All Lanes Data
app.get('/api/lanes', (req, res) => {
    try {
        const lanesData = db.getAllLanes();
        const settings = db.getSettings();
        res.json({ ok: true, data: lanesData, settings });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// 3. Get Single Lane Data
app.get('/api/lanes/:lane', (req, res) => {
    try {
        const lane = parseInt(req.params.lane, 10);
        if (isNaN(lane)) {
            return res.status(400).json({ ok: false, error: 'Invalid lane number' });
        }
        const players = db.getLanePlayers(lane);
        res.json({ ok: true, lane, players });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// 4. Update a single field of a player
app.post('/api/player/field', (req, res) => {
    try {
        const { lane, playerOrder, field, value } = req.body;
        if (!lane || !playerOrder || !field) {
            return res.status(400).json({ ok: false, error: 'Missing required parameters' });
        }
        const updatedPlayers = db.updatePlayerField(parseInt(lane, 10), parseInt(playerOrder, 10), field, value);
        
        // Broadcast change in real-time
        io.emit('lane_updated', {
            lane: parseInt(lane, 10),
            players: updatedPlayers,
            updatedField: { playerOrder, field, value },
            timestamp: Date.now()
        });

        res.json({ ok: true, lane, players: updatedPlayers });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// 5. Update full player record
app.post('/api/player/update', (req, res) => {
    try {
        const { lane, playerOrder, data } = req.body;
        if (!lane || !playerOrder || !data) {
            return res.status(400).json({ ok: false, error: 'Missing required parameters' });
        }
        const updatedPlayers = db.updatePlayer(parseInt(lane, 10), parseInt(playerOrder, 10), data);
        
        // Broadcast change in real-time
        io.emit('lane_updated', {
            lane: parseInt(lane, 10),
            players: updatedPlayers,
            timestamp: Date.now()
        });

        res.json({ ok: true, lane, players: updatedPlayers });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// 5.1 Photo OCR Scoreboard Recognition
app.post('/api/scorekeeper/recognize-photo', upload.single('photo'), async (req, res) => {
    try {
        let imageBuffer = null;
        if (req.file && req.file.buffer) {
            imageBuffer = req.file.buffer;
        } else if (req.body.image) {
            const base64Data = req.body.image.replace(/^data:image\/\w+;base64,/, '');
            imageBuffer = Buffer.from(base64Data, 'base64');
        }

        if (!imageBuffer) {
            return res.status(400).json({ ok: false, error: '請提供要辨識的計分板照片檔案或圖片資料' });
        }

        const selectedLane = parseInt(req.body.lane || req.query.lane, 10) || 1;
        const selectedGame = parseInt(req.body.game || req.query.game, 10) || 1;

        const settings = db.getSettings();
        const apiKey = req.body.apiKey || settings.gemini_api_key || process.env.GEMINI_API_KEY;

        const result = await ocrService.recognizeScoreboard(imageBuffer, {
            selectedLane,
            selectedGame,
            apiKey
        });

        const targetLane = result.detectedLane || selectedLane;
        const currentPlayers = db.getLanePlayers(targetLane);

        const players = currentPlayers.map((p, idx) => {
            const detectedScore = result.scores && result.scores[idx] !== undefined ? result.scores[idx] : '';
            const detectedTurkeys = result.turkeys && result.turkeys[idx] !== undefined ? result.turkeys[idx] : (p.turkeys || 0);
            const detectedFlowers = result.flowers && result.flowers[idx] !== undefined ? result.flowers[idx] : (p.flowers || 0);
            return {
                id: p.id,
                name: p.name || '',
                title: p.title || '',
                nickname: p.nickname || '',
                gender: p.gender || '男',
                club: p.club || '',
                identity: p.identity || '社友',
                score: detectedScore,
                currentScore: p[`g${selectedGame}`],
                turkeys: detectedTurkeys,
                flowers: detectedFlowers
            };
        });

        res.json({
            ok: true,
            detectedLane: targetLane,
            selectedLane,
            laneMatched: targetLane === selectedLane,
            selectedGame,
            engine: result.engine,
            confidence: result.confidence,
            message: result.message,
            players
        });
    } catch (err) {
        console.error('OCR Recognition Error:', err);
        res.status(500).json({ ok: false, error: err.message || '照片辨識過程中發生錯誤' });
    }
});

// 5.2 Batch Save Game Scores (from Photo OCR or scorekeeper)
app.post('/api/scorekeeper/batch-save-scores', (req, res) => {
    try {
        const { lane, game, players } = req.body;
        if (!lane || !game || !Array.isArray(players)) {
            return res.status(400).json({ ok: false, error: '缺少必要的球道、局數或選手成績資料' });
        }

        const laneNum = parseInt(lane, 10);
        const gameNum = parseInt(game, 10);

        if (isNaN(laneNum) || laneNum < 1 || laneNum > 40) {
            return res.status(400).json({ ok: false, error: '無效的球道編號' });
        }
        if (isNaN(gameNum) || gameNum < 1 || gameNum > 3) {
            return res.status(400).json({ ok: false, error: '無效的局數編號 (1~3)' });
        }

        const updatedPlayers = db.batchSaveGameScores(laneNum, gameNum, players);

        // Broadcast real-time update to all live boards
        io.emit('lane_updated', {
            lane: laneNum,
            players: updatedPlayers,
            game: gameNum,
            action: 'batch_photo_scores_saved',
            timestamp: Date.now()
        });

        res.json({
            ok: true,
            message: `第 ${laneNum} 球道第 ${gameNum} 局 4 位選手成績已成功登錄！`,
            lane: laneNum,
            game: gameNum,
            players: updatedPlayers
        });
    } catch (err) {
        console.error('Batch Save Scores Error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// 6. Batch update a whole lane (e.g. Save Game)
app.post('/api/lane/batch-update', (req, res) => {
    try {
        const { lane, players } = req.body;
        if (!lane || !Array.isArray(players)) {
            return res.status(400).json({ ok: false, error: 'Invalid lane or players payload' });
        }
        const updatedPlayers = db.batchUpdateLane(parseInt(lane, 10), players);

        // Broadcast change in real-time
        io.emit('lane_updated', {
            lane: parseInt(lane, 10),
            players: updatedPlayers,
            timestamp: Date.now()
        });

        res.json({ ok: true, lane, players: updatedPlayers });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// 7. Get / Update Settings
app.get('/api/settings', (req, res) => {
    try {
        const settings = db.getSettings();
        res.json({ ok: true, settings });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Verify Scorekeeper Password
app.post('/api/verify-scorekeeper', (req, res) => {
    try {
        const { password } = req.body;
        const currentPassword = db.getSetting('scorekeeper_password') || '2222';
        if (String(password).trim() === String(currentPassword).trim()) {
            res.json({ ok: true, valid: true });
        } else {
            res.json({ ok: true, valid: false, message: '密碼錯誤' });
        }
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/api/settings', (req, res) => {
    try {
        const settings = db.updateSettings(req.body);
        io.emit('settings_updated', settings);
        res.json({ ok: true, settings });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// 8. Reset Data
app.post('/api/reset', (req, res) => {
    try {
        const mode = req.body.mode || 'seed'; // 'seed' (reseed full sample) or 'clear_scores'
        const lanesData = db.resetAllData(mode);
        io.emit('bulk_updated', {
            data: lanesData,
            message: mode === 'clear_scores' ? '分數已重置為空' : '已重新載入預設示範名冊'
        });
        res.json({ ok: true, message: 'Reset successful', data: lanesData });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// 9. Export Excel Report
app.get('/api/export/excel', (req, res) => {
    try {
        const lanesData = db.getAllLanes();
        const settings = db.getSettings();
        const buffer = excelService.generateExcelReport(lanesData, settings);

        const filename = encodeURIComponent(`${settings.event_name || '保齡球聯誼賽'}_大會總成績表.xlsx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${filename}`);
        res.send(buffer);
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// 10. Download Sample Roster Template Excel
app.get('/api/template/excel', (req, res) => {
    try {
        const settings = db.getSettings();
        const totalLanes = parseInt(settings.total_lanes || '40', 10);
        const playersPerLane = parseInt(settings.players_per_lane || '4', 10);
        const buffer = excelService.generateRosterTemplate(totalLanes, playersPerLane);

        const filename = encodeURIComponent(`保齡球選手名冊匯入範本.xlsx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${filename}`);
        res.send(buffer);
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// 11. Import Roster from Excel / CSV
app.post('/api/import/excel', upload.single('file'), (req, res) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ ok: false, error: '請選擇要上傳的 Excel 或 CSV 檔案' });
        }
        const rows = excelService.parseUploadedExcel(req.file.buffer);
        if (!rows || rows.length === 0) {
            return res.status(400).json({ ok: false, error: '檔案內未包含有效資料' });
        }

        const result = db.importRoster(rows);
        io.emit('bulk_updated', {
            data: result.data,
            message: `成功匯入 ${result.count} 位選手名單`
        });

        res.json({ ok: true, message: `成功匯入 ${result.count} 位選手`, count: result.count });
    } catch (err) {
        res.status(500).json({ ok: false, error: '匯入失敗: ' + err.message });
    }
});

// 12. Broadcast Announcement Banner
app.post('/api/broadcast', (req, res) => {
    try {
        const { message, type = 'info', duration = 8000 } = req.body;
        if (!message) {
            return res.status(400).json({ ok: false, error: 'Message cannot be empty' });
        }
        io.emit('announcement', { message, type, duration, timestamp: Date.now() });
        res.json({ ok: true, message: 'Broadcast sent' });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ==========================================
// Socket.IO Real-Time Engine
// ==========================================
io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    // Send initial snapshot
    socket.emit('initial_sync', {
        data: db.getAllLanes(),
        settings: db.getSettings(),
        stats: db.getStats()
    });

    // Scorekeeper updates a specific field live
    socket.on('player:field_change', (payload) => {
        try {
            const { lane, playerOrder, field, value } = payload;
            const updatedPlayers = db.updatePlayerField(parseInt(lane, 10), parseInt(playerOrder, 10), field, value);
            // Broadcast to all other clients
            socket.broadcast.emit('lane_updated', {
                lane: parseInt(lane, 10),
                players: updatedPlayers,
                updatedField: { playerOrder, field, value },
                from: socket.id
            });
        } catch (err) {
            console.error('[Socket.IO Error] player:field_change:', err);
            socket.emit('error_message', { error: err.message });
        }
    });

    // Scorekeeper saves an entire lane/game
    socket.on('lane:save_scores', (payload) => {
        try {
            const { lane, players, game } = payload;
            const updatedPlayers = db.batchUpdateLane(parseInt(lane, 10), players);
            // Broadcast to everyone including sender
            io.emit('lane_updated', {
                lane: parseInt(lane, 10),
                players: updatedPlayers,
                game,
                saved: true,
                from: socket.id
            });
        } catch (err) {
            console.error('[Socket.IO Error] lane:save_scores:', err);
            socket.emit('error_message', { error: err.message });
        }
    });

    // Client requests stats refresh
    socket.on('request_stats', () => {
        socket.emit('stats_updated', db.getStats());
    });

    socket.on('disconnect', () => {
        console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
    console.log('====================================================');
    console.log(`🎳 保齡球賽事記分與大會總表系統 已成功啟動！`);
    console.log(`🌐 本地伺服器網址: http://localhost:${PORT}`);
    console.log(`📱 局域網訪問 (手機記分員): http://${getLocalIpAddress()}:${PORT}`);
    console.log('====================================================');
});
