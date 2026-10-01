/**
 * Bowling Event Management System - Supabase Database Manager
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ SUPABASE_URL or SUPABASE_KEY is missing! Make sure they are set in environment variables.');
}

const supabase = createClient(supabaseUrl || 'http://localhost', supabaseKey || 'dummy');

async function initDb() {
    // Schema is handled in Supabase SQL editor.
    // Check if players are empty, seed if so
    const { count, error } = await supabase.from('players').select('*', { count: 'exact', head: true });
    if (!error && count === 0) {
        await seedSampleData();
    }
}

async function seedSampleData() {
    const totalLanes = parseInt(await getSetting('total_lanes') || '40', 10);
    const playersPerLane = parseInt(await getSetting('players_per_lane') || '4', 10);

    const yangFile = path.join(__dirname, '..', 'examples', '地區保齡球yang.xlsx');
    const standardFile = path.join(__dirname, '..', 'examples', '地區保齡球參賽名單.xlsx');
    const sampleFile = path.join(__dirname, '..', 'examples', 'sample_players.xlsx');
    const targetFile = fs.existsSync(yangFile) ? yangFile : (fs.existsSync(standardFile) ? standardFile : (fs.existsSync(sampleFile) ? sampleFile : null));

    if (targetFile) {
        try {
            const excelService = require('./excelService');
            const fileBuf = fs.readFileSync(targetFile);
            const parsed = excelService.parseUploadedExcel(fileBuf);
            if (parsed && parsed.length > 0) {
                await importRoster(parsed);
                await logAction(0, 0, 'SEED_DATA', `Initialized standard roster from ${path.basename(targetFile)}.`);
                return;
            }
        } catch (e) {
            console.error('Error loading default roster file:', e);
        }
    }

    const playersToInsert = [];
    for (let lane = 1; lane <= totalLanes; lane++) {
        for (let p = 1; p <= playersPerLane; p++) {
            playersToInsert.push({
                lane,
                player_order: p,
                name: '', title: '', nickname: '', gender: '男', club: '', identity: '社友',
                g1: null, g2: null, g3: null, turkeys: 0, flowers: 0
            });
        }
    }
    
    await supabase.from('players').upsert(playersToInsert, { onConflict: 'lane, player_order' });
    await logAction(0, 0, 'SEED_DATA', `Initialized blank roster with ${totalLanes} lanes.`);
}

async function getSettings() {
    const { data, error } = await supabase.from('settings').select('key, value');
    const settings = {};
    if (data) {
        for (const r of data) {
            settings[r.key] = r.value;
        }
    }
    return settings;
}

async function getSetting(key) {
    const { data, error } = await supabase.from('settings').select('value').eq('key', key).single();
    return data ? data.value : null;
}

async function updateSettings(settingsObj) {
    const updates = Object.entries(settingsObj).map(([key, value]) => ({ key, value: String(value) }));
    await supabase.from('settings').upsert(updates, { onConflict: 'key' });
    return await getSettings();
}

async function getAllLanes() {
    const totalLanesStr = await getSetting('total_lanes');
    const totalLanes = Math.min(40, parseInt(totalLanesStr || '40', 10));
    
    const { data: rows, error } = await supabase
        .from('players')
        .select('*')
        .lte('lane', totalLanes)
        .order('lane', { ascending: true })
        .order('player_order', { ascending: true });

    const lanesData = {};
    for (let l = 1; l <= totalLanes; l++) {
        lanesData[l] = [];
    }

    if (rows) {
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
    }

    // Ensure 4 slots per lane
    for (let l = 1; l <= totalLanes; l++) {
        while (lanesData[l].length < 4) {
            lanesData[l].push({
                id: lanesData[l].length + 1,
                name: '', title: '', nickname: '', gender: '男', club: '', identity: '社友',
                g1: '', g2: '', g3: '', turkeys: 0, flowers: 0
            });
        }
    }

    return lanesData;
}

async function getLanePlayers(lane) {
    const { data: rows, error } = await supabase
        .from('players')
        .select('*')
        .eq('lane', lane)
        .order('player_order', { ascending: true });

    return (rows || []).map(row => ({
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

async function updatePlayer(lane, playerOrder, data) {
    const { data: player, error: getErr } = await supabase
        .from('players')
        .select('*')
        .eq('lane', lane)
        .eq('player_order', playerOrder)
        .maybeSingle();

    if (!player) {
        await supabase.from('players').insert({
            lane,
            player_order: playerOrder,
            name: data.name || `選手${playerOrder}`,
            title: data.title || '',
            nickname: data.nickname || '',
            gender: data.gender || '男',
            club: data.club || '',
            identity: data.identity || '社友',
            g1: data.g1 === '' || data.g1 === undefined ? null : parseInt(data.g1, 10),
            g2: data.g2 === '' || data.g2 === undefined ? null : parseInt(data.g2, 10),
            g3: data.g3 === '' || data.g3 === undefined ? null : parseInt(data.g3, 10),
            turkeys: parseInt(data.turkeys, 10) || 0,
            flowers: parseInt(data.flowers, 10) || 0
        });
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

        await supabase.from('players').update({
            name, title: title || '', nickname: nickname || '', gender, club, identity: identity || '社友',
            g1, g2, g3, turkeys, flowers
        }).eq('lane', lane).eq('player_order', playerOrder);
    }

    await logAction(lane, playerOrder, 'UPDATE_PLAYER', JSON.stringify(data));
    return await getLanePlayers(lane);
}

async function updatePlayerField(lane, playerOrder, field, value) {
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

    await supabase.from('players').update({
        [field]: val
    }).eq('lane', lane).eq('player_order', playerOrder);

    await logAction(lane, playerOrder, 'UPDATE_FIELD', `${field} = ${val}`);
    return await getLanePlayers(lane);
}

async function batchUpdateLane(lane, playersList) {
    const updates = [];
    for (let i = 0; i < playersList.length; i++) {
        const p = playersList[i];
        let pOrder = parseInt(p.id, 10);
        if (isNaN(pOrder) || pOrder < 1 || pOrder > 4) {
            pOrder = i + 1;
        }
        await updatePlayer(lane, pOrder, p);
    }
    return await getLanePlayers(lane);
}

async function batchSaveGameScores(lane, game, scoresList) {
    const gameField = `g${game}`;
    for (let i = 0; i < scoresList.length; i++) {
        const item = scoresList[i];
        let pId = parseInt(item.id, 10);
        if (isNaN(pId) || pId < 1 || pId > 4) {
            pId = i + 1;
        }
        let scoreVal = (item.score === '' || item.score === null || item.score === undefined) ? null : parseInt(item.score, 10);
        if (scoreVal !== null) {
            scoreVal = Math.max(0, Math.min(300, scoreVal));
        }
        const turkeys = (item.turkeys !== undefined && item.turkeys !== null) ? Math.max(0, parseInt(item.turkeys, 10) || 0) : null;
        const flowers = (item.flowers !== undefined && item.flowers !== null) ? Math.max(0, parseInt(item.flowers, 10) || 0) : null;

        const updateData = { [gameField]: scoreVal };
        if (turkeys !== null && flowers !== null) {
            updateData.turkeys = turkeys;
            updateData.flowers = flowers;
        }
        
        await supabase.from('players').update(updateData).eq('lane', lane).eq('player_order', pId);
    }
    
    await logAction(lane, 0, 'PHOTO_OCR_SCORES_LOGGED', `Batch logged Game ${game} scores via Photo Recognition.`);
    return await getLanePlayers(lane);
}

async function resetAllData(mode = 'seed') {
    if (mode === 'clear_scores') {
        await supabase.from('players').update({ g1: null, g2: null, g3: null, turkeys: 0, flowers: 0 }).neq('lane', 0); // Update all
        await logAction(0, 0, 'CLEAR_SCORES', 'Cleared all player scores and awards.');
    } else {
        await supabase.from('players').delete().neq('lane', 0); // Delete all
        await seedSampleData();
        await logAction(0, 0, 'RESET_ALL', 'Reset all players with sample seed roster.');
    }
    return await getAllLanes();
}

async function importRoster(rows) {
    const totalLanes = 40;
    const playersPerLane = 4;

    // Clean up any rogue lanes > 40
    await supabase.from('players').delete().gt('lane', 40);
    await updateSettings({ total_lanes: '40' });

    // Map input rows
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

    let namedCount = 0;
    const upserts = [];
    for (let lane = 1; lane <= totalLanes; lane++) {
        for (let p = 1; p <= playersPerLane; p++) {
            const key = `${lane}-${p}`;
            if (rowMap.has(key)) {
                const data = rowMap.get(key);
                upserts.push({
                    lane, player_order: p, name: data.name, title: data.title || '',
                    nickname: data.nickname || '', gender: data.gender, club: data.club,
                    identity: data.identity || '社友', g1: data.g1, g2: data.g2, g3: data.g3,
                    turkeys: data.turkeys, flowers: data.flowers
                });
                if (data.name || data.nickname) namedCount++;
            } else {
                upserts.push({
                    lane, player_order: p, name: '', title: '', nickname: '', gender: '男',
                    club: '', identity: '社友', g1: null, g2: null, g3: null, turkeys: 0, flowers: 0
                });
            }
        }
    }

    await supabase.from('players').upsert(upserts, { onConflict: 'lane, player_order' });
    await logAction(0, 0, 'IMPORT_ROSTER', `Imported ${namedCount} players across 40 lanes.`);
    return { success: true, count: namedCount, settings: await getSettings(), data: await getAllLanes() };
}

async function getStats() {
    const femaleBonusStr = await getSetting('female_bonus');
    const femaleBonus = parseInt(femaleBonusStr || '36', 10);
    
    const { data: rows, error } = await supabase.from('players').select('*').lte('lane', 40);
    if (!rows) return {};

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

async function logAction(lane, playerOrder, action, details) {
    try {
        await supabase.from('logs').insert({
            lane, player_order: playerOrder, action, details
        });
    } catch (e) {
        console.error('Failed to write log:', e);
    }
}

// Export Supabase instance instead of SQLite db
module.exports = {
    supabase,
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
