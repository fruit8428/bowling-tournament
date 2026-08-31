/**
 * Bowling Event Management System - SQLite Database Manager
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'bowling.db');
const db = new Database(DB_PATH);

// Enable WAL mode for high performance & concurrency
db.pragma('journal_mode = WAL');

function initDb() {
    // 1. Settings Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);

    // Default settings
    const defaultSettings = {
        event_name: '保齡球聯誼賽',
        total_lanes: '40',
        players_per_lane: '4',
        female_bonus: '36',
        scorekeeper_password: '2222',
        banner_announcement: ''
    };

    const insertSetting = db.prepare(`
        INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
    `);

    for (const [key, value] of Object.entries(defaultSettings)) {
        insertSetting.run(key, value);
    }

    // 2. Players Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS players (
            lane INTEGER NOT NULL,
            player_order INTEGER NOT NULL,
            name TEXT NOT NULL,
            title TEXT DEFAULT '',
            nickname TEXT DEFAULT '',
            gender TEXT NOT NULL DEFAULT '男',
            club TEXT DEFAULT '',
            identity TEXT DEFAULT '社友',
            g1 INTEGER DEFAULT NULL,
            g2 INTEGER DEFAULT NULL,
            g3 INTEGER DEFAULT NULL,
            turkeys INTEGER DEFAULT 0,
            flowers INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (lane, player_order)
        );
    `);

    // Schema migration for existing DB
    try {
        const tableInfo = db.prepare('PRAGMA table_info(players)').all();
        const colNames = tableInfo.map(c => c.name);
        if (!colNames.includes('title')) {
            db.exec("ALTER TABLE players ADD COLUMN title TEXT DEFAULT ''");
        }
        if (!colNames.includes('nickname')) {
            db.exec("ALTER TABLE players ADD COLUMN nickname TEXT DEFAULT ''");
        }
        if (!colNames.includes('identity')) {
            db.exec("ALTER TABLE players ADD COLUMN identity TEXT DEFAULT '社友'");
        }
    } catch (e) {
        console.error('Migration notice:', e.message);
    }

    // 3. Activity Logs Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lane INTEGER,
            player_order INTEGER,
            action TEXT,
            details TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Check if players table is empty, seed if so
    const count = db.prepare('SELECT COUNT(*) as count FROM players').get().count;
    if (count === 0) {
        seedSampleData();
    }
}

function seedSampleData() {
    const totalLanes = parseInt(getSetting('total_lanes') || '40', 10);
    const playersPerLane = parseInt(getSetting('players_per_lane') || '4', 10);

    const yangFile = path.join(__dirname, '地區保齡球yang.xlsx');
    const standardFile = path.join(__dirname, '地區保齡球參賽名單.xlsx');
    const sampleFile = path.join(__dirname, 'sample_players.xlsx');
    const targetFile = fs.existsSync(yangFile) ? yangFile : (fs.existsSync(standardFile) ? standardFile : (fs.existsSync(sampleFile) ? sampleFile : null));

    if (targetFile) {
        try {
            const excelService = require('./excelService');
            const fileBuf = fs.readFileSync(targetFile);
            const parsed = excelService.parseUploadedExcel(fileBuf);
            if (parsed && parsed.length > 0) {
                importRoster(parsed);
                logAction(0, 0, 'SEED_DATA', `Initialized standard roster from ${path.basename(targetFile)}.`);
                return;
            }
        } catch (e) {
            console.error('Error loading default roster file:', e);
        }
    }

    const insertPlayer = db.prepare(`
        INSERT OR REPLACE INTO players (lane, player_order, name, title, nickname, gender, club, identity, g1, g2, g3, turkeys, flowers, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const insertMany = db.transaction(() => {
        for (let lane = 1; lane <= totalLanes; lane++) {
            for (let p = 1; p <= playersPerLane; p++) {
                insertPlayer.run(lane, p, '', '', '', '男', '', '社友', null, null, null, 0, 0);
            }
        }
    });

    insertMany();
    logAction(0, 0, 'SEED_DATA', `Initialized blank roster with ${totalLanes} lanes.`);
}

function getSettings() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const r of rows) {
        settings[r.key] = r.value;
    }
    return settings;
}

function getSetting(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
}

function updateSettings(settingsObj) {
    const stmt = db.prepare(`
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    const updateTx = db.transaction((settings) => {
        for (const [key, val] of Object.entries(settings)) {
            stmt.run(key, String(val));
        }
    });
    updateTx(settingsObj);
    return getSettings();
}

function getAllLanes() {
    const totalLanes = Math.min(40, parseInt(getSetting('total_lanes') || '40', 10));
    const rows = db.prepare(`
        SELECT lane, player_order, name, title, nickname, gender, club, identity, g1, g2, g3, turkeys, flowers, updated_at
        FROM players
        WHERE lane <= ?
        ORDER BY lane ASC, player_order ASC
    `).all(totalLanes);

    const lanesData = {};
    for (let l = 1; l <= totalLanes; l++) {
        lanesData[l] = [];
    }

    for (const row of rows) {
        if (lanesData[row.lane]) {
            lanesData[row.lane].push({
                id: row.player_order,
                name: row.name || '',
                title: row.title || '',
                nickname: row.nickname || '',
                gender: row.gender || '男',
                club: row.club || '',
                identity: row.identity || '社友',
                g1: row.g1 === null || row.g1 === undefined ? '' : row.g1,
                g2: row.g2 === null || row.g2 === undefined ? '' : row.g2,
                g3: row.g3 === null || row.g3 === undefined ? '' : row.g3,
                turkeys: row.turkeys || 0,
                flowers: row.flowers || 0,
                updated_at: row.updated_at
            });
        }
    }

    // Ensure 4 slots per lane
    for (let l = 1; l <= totalLanes; l++) {
        while (lanesData[l].length < 4) {
            lanesData[l].push({
                id: lanesData[l].length + 1,
                name: '',
                title: '',
                nickname: '',
                gender: '男',
                club: '',
                identity: '社友',
                g1: '',
                g2: '',
                g3: '',
                turkeys: 0,
                flowers: 0
            });
        }
    }

    return lanesData;
}

function getLanePlayers(lane) {
    const rows = db.prepare(`
        SELECT lane, player_order, name, title, nickname, gender, club, identity, g1, g2, g3, turkeys, flowers, updated_at
        FROM players
        WHERE lane = ?
        ORDER BY player_order ASC
    `).all(lane);

    return rows.map(row => ({
        id: row.player_order,
        name: row.name || '',
        title: row.title || '',
        nickname: row.nickname || '',
        gender: row.gender || '男',
        club: row.club || '',
        identity: row.identity || '社友',
        g1: row.g1 === null || row.g1 === undefined ? '' : row.g1,
        g2: row.g2 === null || row.g2 === undefined ? '' : row.g2,
        g3: row.g3 === null || row.g3 === undefined ? '' : row.g3,
        turkeys: row.turkeys || 0,
        flowers: row.flowers || 0,
        updated_at: row.updated_at
    }));
}

function updatePlayer(lane, playerOrder, data) {
    const player = db.prepare(`
        SELECT * FROM players WHERE lane = ? AND player_order = ?
    `).get(lane, playerOrder);

    if (!player) {
        db.prepare(`
            INSERT INTO players (lane, player_order, name, title, nickname, gender, club, identity, g1, g2, g3, turkeys, flowers, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
            lane,
            playerOrder,
            data.name || `選手${playerOrder}`,
            data.title || '',
            data.nickname || '',
            data.gender || '男',
            data.club || '',
            data.identity || '社友',
            data.g1 === '' || data.g1 === undefined ? null : parseInt(data.g1, 10),
            data.g2 === '' || data.g2 === undefined ? null : parseInt(data.g2, 10),
            data.g3 === '' || data.g3 === undefined ? null : parseInt(data.g3, 10),
            parseInt(data.turkeys, 10) || 0,
            parseInt(data.flowers, 10) || 0
        );
    } else {
        const name = data.name !== undefined ? data.name : player.name;
        const title = data.title !== undefined ? data.title : player.title;
        const nickname = data.nickname !== undefined ? data.nickname : player.nickname;
        const gender = data.gender !== undefined ? data.gender : player.gender;
        const club = data.club !== undefined ? data.club : player.club;
        const identity = data.identity !== undefined ? data.identity : player.identity;
        const g1 = data.g1 !== undefined ? (data.g1 === '' ? null : parseInt(data.g1, 10)) : player.g1;
        const g2 = data.g2 !== undefined ? (data.g2 === '' ? null : parseInt(data.g2, 10)) : player.g2;
        const g3 = data.g3 !== undefined ? (data.g3 === '' ? null : parseInt(data.g3, 10)) : player.g3;
        const turkeys = data.turkeys !== undefined ? Math.max(0, parseInt(data.turkeys, 10) || 0) : player.turkeys;
        const flowers = data.flowers !== undefined ? Math.max(0, parseInt(data.flowers, 10) || 0) : player.flowers;

        db.prepare(`
            UPDATE players
            SET name = ?, title = ?, nickname = ?, gender = ?, club = ?, identity = ?, g1 = ?, g2 = ?, g3 = ?, turkeys = ?, flowers = ?, updated_at = CURRENT_TIMESTAMP
            WHERE lane = ? AND player_order = ?
        `).run(name, title || '', nickname || '', gender, club, identity || '社友', g1, g2, g3, turkeys, flowers, lane, playerOrder);
    }

    logAction(lane, playerOrder, 'UPDATE_PLAYER', JSON.stringify(data));
    return getLanePlayers(lane);
}

function updatePlayerField(lane, playerOrder, field, value) {
    const allowedFields = ['name', 'title', 'nickname', 'gender', 'club', 'identity', 'g1', 'g2', 'g3', 'turkeys', 'flowers'];
    if (!allowedFields.includes(field)) {
        throw new Error(`Invalid field: ${field}`);
    }

    let val = value;
    if (['g1', 'g2', 'g3'].includes(field)) {
        val = (value === '' || value === null || value === undefined) ? null : parseInt(value, 10);
        if (val !== null) {
            val = Math.max(0, Math.min(300, val));
        }
    } else if (['turkeys', 'flowers'].includes(field)) {
        val = Math.max(0, parseInt(value, 10) || 0);
    }

    db.prepare(`
        UPDATE players
        SET ${field} = ?, updated_at = CURRENT_TIMESTAMP
        WHERE lane = ? AND player_order = ?
    `).run(val, lane, playerOrder);

    logAction(lane, playerOrder, 'UPDATE_FIELD', `${field} = ${val}`);
    return getLanePlayers(lane);
}

function batchUpdateLane(lane, playersList) {
    const updateTx = db.transaction((players) => {
        for (const p of players) {
            updatePlayer(lane, p.id, p);
        }
    });
    updateTx(playersList);
    return getLanePlayers(lane);
}

function batchSaveGameScores(lane, game, scoresList) {
    const gameField = `g${game}`;
    const updateTx = db.transaction((list) => {
        for (const item of list) {
            const pId = item.id;
            let scoreVal = (item.score === '' || item.score === null || item.score === undefined) ? null : parseInt(item.score, 10);
            if (scoreVal !== null) {
                scoreVal = Math.max(0, Math.min(300, scoreVal));
            }
            const turkeys = (item.turkeys !== undefined && item.turkeys !== null) ? Math.max(0, parseInt(item.turkeys, 10) || 0) : null;
            const flowers = (item.flowers !== undefined && item.flowers !== null) ? Math.max(0, parseInt(item.flowers, 10) || 0) : null;

            if (turkeys !== null && flowers !== null) {
                db.prepare(`
                    UPDATE players
                    SET ${gameField} = ?, turkeys = ?, flowers = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE lane = ? AND player_order = ?
                `).run(scoreVal, turkeys, flowers, lane, pId);
            } else {
                db.prepare(`
                    UPDATE players
                    SET ${gameField} = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE lane = ? AND player_order = ?
                `).run(scoreVal, lane, pId);
            }
        }
    });
    updateTx(scoresList);
    logAction(lane, 0, 'PHOTO_OCR_SCORES_LOGGED', `Batch logged Game ${game} scores via Photo Recognition.`);
    return getLanePlayers(lane);
}

function resetAllData(mode = 'seed') {
    if (mode === 'clear_scores') {
        db.prepare('UPDATE players SET g1 = NULL, g2 = NULL, g3 = NULL, turkeys = 0, flowers = 0, updated_at = CURRENT_TIMESTAMP').run();
        logAction(0, 0, 'CLEAR_SCORES', 'Cleared all player scores and awards.');
    } else {
        db.prepare('DELETE FROM players').run();
        seedSampleData();
        logAction(0, 0, 'RESET_ALL', 'Reset all players with sample seed roster.');
    }
    return getAllLanes();
}

function importRoster(rows) {
    const totalLanes = 40;
    const playersPerLane = 4;

    // Clean up any rogue lanes > 40
    db.prepare('DELETE FROM players WHERE lane > 40').run();
    updateSettings({ total_lanes: '40' });

    // Map input rows by `${lane}-${player_order}`
    const rowMap = new Map();
    for (const r of rows) {
        const lane = parseInt(r.lane || r['球道'] || r['Lane'], 10);
        const pOrder = parseInt(r.player_order || r.id || r['序號'] || r['選手編號'] || r['Player'] || 1, 10);
        if (!lane || lane < 1 || lane > 40 || pOrder < 1 || pOrder > 4) continue;

        const name = String(r.name || r['姓名'] || r['選手名稱'] || r['Name'] || '').trim();
        const title = String(r.title || r['英文職稱'] || r['職稱'] || r['Title'] || r['Role'] || '').trim();
        const nickname = String(r.nickname || r['社名'] || r['英文名'] || r['暱稱'] || r['Nickname'] || '').trim();
        const gender = (r.gender || r['性別'] || r['Gender'] || '男').includes('女') ? '女' : '男';
        const club = String(r.club || r['所屬社'] || r['社團'] || r['Club'] || '').trim();
        const identity = String(r.identity || r['身份'] || r['身分'] || r['Identity'] || r['Type'] || '社友').trim();

        const parseScore = (v) => {
            if (v === '' || v === null || v === undefined) return null;
            const n = parseInt(v, 10);
            return isNaN(n) ? null : Math.max(0, Math.min(300, n));
        };

        const g1 = parseScore(r.g1 || r['第1局'] || r['第 1 局'] || r['第一局'] || r['G1']);
        const g2 = parseScore(r.g2 || r['第2局'] || r['第 2 局'] || r['第二局'] || r['G2']);
        const g3 = parseScore(r.g3 || r['第3局'] || r['第 3 局'] || r['第三局'] || r['G3']);
        const turkeys = Math.max(0, parseInt(r.turkeys || r['火雞'] || r['Turkeys'] || 0, 10) || 0);
        const flowers = Math.max(0, parseInt(r.flowers || r['霸王花'] || r['Flowers'] || 0, 10) || 0);

        const key = `${lane}-${pOrder}`;
        if (!rowMap.has(key) || (name && !rowMap.get(key).name)) {
            rowMap.set(key, { lane, pOrder, name, title, nickname, gender, club, identity, g1, g2, g3, turkeys, flowers });
        }
    }

    const insertOrReplace = db.prepare(`
        INSERT OR REPLACE INTO players (lane, player_order, name, title, nickname, gender, club, identity, g1, g2, g3, turkeys, flowers, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    let namedCount = 0;
    const importTx = db.transaction(() => {
        for (let lane = 1; lane <= totalLanes; lane++) {
            for (let p = 1; p <= playersPerLane; p++) {
                const key = `${lane}-${p}`;
                if (rowMap.has(key)) {
                    const data = rowMap.get(key);
                    insertOrReplace.run(
                        lane,
                        p,
                        data.name,
                        data.title || '',
                        data.nickname || '',
                        data.gender,
                        data.club,
                        data.identity || '社友',
                        data.g1,
                        data.g2,
                        data.g3,
                        data.turkeys,
                        data.flowers
                    );
                    if (data.name || data.nickname) namedCount++;
                } else {
                    // Blank slot
                    insertOrReplace.run(lane, p, '', '', '', '男', '', '社友', null, null, null, 0, 0);
                }
            }
        }
    });

    importTx();
    logAction(0, 0, 'IMPORT_ROSTER', `Imported ${namedCount} players across 40 lanes.`);
    return { success: true, count: namedCount, settings: getSettings(), data: getAllLanes() };
}

function getStats() {
    const femaleBonus = parseInt(getSetting('female_bonus') || '36', 10);
    const rows = db.prepare('SELECT * FROM players WHERE lane <= 40').all();
    
    let totalPlayers = rows.filter(p => p.name && p.name.trim() !== '').length;
    let playersWithScores = 0;
    let totalG1 = 0, totalG2 = 0, totalG3 = 0;
    let totalTurkeys = 0, totalFlowers = 0;
    let highestSingleGame = { score: 0, player: null, game: 1, lane: 0 };
    let highestTotalSeries = { score: 0, player: null, lane: 0 };

    for (const p of rows) {
        const hasName = p.name && p.name.trim() !== '';
        const s1 = p.g1 !== null ? p.g1 : null;
        const s2 = p.g2 !== null ? p.g2 : null;
        const s3 = p.g3 !== null ? p.g3 : null;

        const hasPlayed = s1 !== null || s2 !== null || s3 !== null;
        if (hasPlayed && hasName) playersWithScores++;

        if (s1 !== null && hasName) totalG1++;
        if (s2 !== null && hasName) totalG2++;
        if (s3 !== null && hasName) totalG3++;

        if (hasName) {
            totalTurkeys += (p.turkeys || 0);
            totalFlowers += (p.flowers || 0);
        }

        // Check high game
        if (hasName) {
            [s1, s2, s3].forEach((s, idx) => {
                if (s !== null && s > highestSingleGame.score) {
                    highestSingleGame = {
                        score: s,
                        player: p.name,
                        gender: p.gender,
                        club: p.club,
                        game: idx + 1,
                        lane: p.lane
                    };
                }
            });

            // Check total series
            if (hasPlayed) {
                const bonus = (p.gender === '女' && hasPlayed) ? femaleBonus : 0;
                const total = (s1 || 0) + (s2 || 0) + (s3 || 0) + bonus;
                if (total > highestTotalSeries.score) {
                    highestTotalSeries = {
                        score: total,
                        scratch: (s1 || 0) + (s2 || 0) + (s3 || 0),
                        bonus: bonus,
                        player: p.name,
                        gender: p.gender,
                        club: p.club,
                        lane: p.lane
                    };
                }
            }
        }
    }

    return {
        totalPlayers,
        playersWithScores,
        totalG1,
        totalG2,
        totalG3,
        totalTurkeys,
        totalFlowers,
        highestSingleGame,
        highestTotalSeries
    };
}

function logAction(lane, playerOrder, action, details) {
    try {
        db.prepare(`
            INSERT INTO logs (lane, player_order, action, details) VALUES (?, ?, ?, ?)
        `).run(lane, playerOrder, action, details);
    } catch (e) {
        console.error('Failed to write log:', e);
    }
}

// Initialize tables
initDb();

module.exports = {
    db,
    initDb,
    getSettings,
    getSetting,
    updateSettings,
    getAllLanes,
    getLanePlayers,
    updatePlayer,
    updatePlayerField,
    batchUpdateLane,
    batchSaveGameScores,
    resetAllData,
    importRoster,
    getStats
};
