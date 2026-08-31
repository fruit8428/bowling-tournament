/**
 * Excel Import / Export Service for Bowling Tournament System
 */

const XLSX = require('xlsx');

function generateExcelReport(lanesData, settings) {
    const femaleBonus = parseInt(settings.female_bonus || '36', 10);
    const eventName = settings.event_name || '保齡球聯誼賽';

    const wb = XLSX.utils.book_new();

    // 1. Sheet 1: 大會總成績表 (All 40 Lanes)
    const fullScoreboard = [];
    const allPlayersList = [];

    const laneKeys = Object.keys(lanesData).map(Number).sort((a, b) => a - b);
    for (const lane of laneKeys) {
        const players = lanesData[lane];
        players.forEach(p => {
            const s1 = p.g1 !== '' && p.g1 !== null ? parseInt(p.g1, 10) : null;
            const s2 = p.g2 !== '' && p.g2 !== null ? parseInt(p.g2, 10) : null;
            const s3 = p.g3 !== '' && p.g3 !== null ? parseInt(p.g3, 10) : null;
            const hasPlayed = s1 !== null || s2 !== null || s3 !== null;
            const scratch = (s1 || 0) + (s2 || 0) + (s3 || 0);
            const isFemale = p.gender === '女';
            const bonus = (isFemale && hasPlayed) ? femaleBonus : 0;
            const total = hasPlayed ? scratch + bonus : null;
            const highGame = hasPlayed ? Math.max(s1 || 0, s2 || 0, s3 || 0) : null;

            const playerRecord = {
                lane: lane,
                id: p.id,
                name: p.name || '',
                title: p.title || '',
                nickname: p.nickname || '',
                gender: p.gender || '男',
                club: p.club || '',
                identity: p.identity || '社友',
                g1: s1 !== null ? s1 : '',
                g2: s2 !== null ? s2 : '',
                g3: s3 !== null ? s3 : '',
                scratch: hasPlayed ? scratch : '',
                bonus: bonus > 0 ? bonus : 0,
                total: total !== null ? total : '',
                highGame: highGame !== null ? highGame : '',
                turkeys: p.turkeys || 0,
                flowers: p.flowers || 0,
                hasPlayed
            };

            allPlayersList.push(playerRecord);

            fullScoreboard.push({
                '球道': lane,
                '序號': `P${p.id}`,
                '所屬社團': p.club || '',
                '姓名': p.name || '',
                '職稱': p.title || '',
                '社名/英文名': p.nickname || '',
                '性別': p.gender || '男',
                '身份': p.identity || '社友',
                '第 1 局': s1 !== null ? s1 : '',
                '第 2 局': s2 !== null ? s2 : '',
                '第 3 局': s3 !== null ? s3 : '',
                '原分總計': hasPlayed ? scratch : '',
                '女子加分': bonus > 0 ? `+${bonus}` : '-',
                '最終總分': total !== null ? total : '',
                '單局最高': highGame !== null ? highGame : '',
                '火雞數 (Turkey)': p.turkeys || 0,
                '霸王花數': p.flowers || 0
            });
        });
    }

    const wsFull = XLSX.utils.json_to_sheet(fullScoreboard);
    XLSX.utils.book_append_sheet(wb, wsFull, '大會總成績表');

    // 2. Sheet 2: 個人總分排名 (Overall Individual Rankings)
    const overallRankings = allPlayersList
        .filter(p => p.hasPlayed && (p.name || p.nickname))
        .sort((a, b) => b.total - a.total || b.highGame - a.highGame || b.scratch - a.scratch)
        .map((p, idx) => ({
            '名次': idx + 1,
            '姓名': p.name,
            '職稱': p.title,
            '社名/英文名': p.nickname,
            '性別': p.gender,
            '身份': p.identity,
            '所屬社團': p.club,
            '球道': `第 ${p.lane} 道 (P${p.id})`,
            '第 1 局': p.g1,
            '第 2 局': p.g2,
            '第 3 局': p.g3,
            '原分總和': p.scratch,
            '女子加分': p.bonus > 0 ? `+${p.bonus}` : '-',
            '總成績 (含加分)': p.total,
            '單局最高分': p.highGame,
            '火雞數': p.turkeys,
            '霸王花': p.flowers
        }));

    const wsOverall = XLSX.utils.json_to_sheet(overallRankings.length > 0 ? overallRankings : [{ '訊息': '尚無個人成績紀錄' }]);
    XLSX.utils.book_append_sheet(wb, wsOverall, '個人總成績排名');

    // 3. Sheet 3: 男子組排名 (Men's Rankings)
    const menRankings = allPlayersList
        .filter(p => p.hasPlayed && p.gender === '男' && (p.name || p.nickname))
        .sort((a, b) => b.total - a.total || b.highGame - a.highGame)
        .map((p, idx) => ({
            '男子名次': idx + 1,
            '姓名': p.name,
            '職稱': p.title,
            '社名/英文名': p.nickname,
            '身份': p.identity,
            '所屬社團': p.club,
            '球道': `第 ${p.lane} 道 (P${p.id})`,
            '第 1 局': p.g1,
            '第 2 局': p.g2,
            '第 3 局': p.g3,
            '總成績': p.total,
            '單局最高': p.highGame,
            '火雞數': p.turkeys
        }));

    const wsMen = XLSX.utils.json_to_sheet(menRankings.length > 0 ? menRankings : [{ '訊息': '尚無男子組成績紀錄' }]);
    XLSX.utils.book_append_sheet(wb, wsMen, '男子組排名');

    // 4. Sheet 4: 女子組排名 (Women's Rankings)
    const womenRankings = allPlayersList
        .filter(p => p.hasPlayed && p.gender === '女' && (p.name || p.nickname))
        .sort((a, b) => b.total - a.total || b.scratch - a.scratch || b.highGame - a.highGame)
        .map((p, idx) => ({
            '女子名次': idx + 1,
            '姓名': p.name,
            '職稱': p.title,
            '社名/英文名': p.nickname,
            '身份': p.identity,
            '所屬社團': p.club,
            '球道': `第 ${p.lane} 道 (P${p.id})`,
            '第 1 局': p.g1,
            '第 2 局': p.g2,
            '第 3 局': p.g3,
            '原分總計': p.scratch,
            '大會加分': `+${p.bonus}`,
            '最終總成績': p.total,
            '單局最高': p.highGame,
            '霸王花數': p.flowers
        }));

    const wsWomen = XLSX.utils.json_to_sheet(womenRankings.length > 0 ? womenRankings : [{ '訊息': '尚無女子組成績紀錄' }]);
    XLSX.utils.book_append_sheet(wb, wsWomen, '女子組排名');

function getDistrictInfo(club) {
    if (!club) return { districtId: 'other', districtNumber: 999, districtName: '其他/未分配' };
    const match = String(club).trim().match(/^0*(\d+)[-_]/);
    if (match) {
        const num = parseInt(match[1], 10);
        return {
            districtId: `d_${num}`,
            districtNumber: num,
            districtName: `第 ${num} 分區`
        };
    }
    return { districtId: 'other', districtNumber: 999, districtName: club || '其他社團' };
}

    // 5. Sheet 5: 分區團體排名 (Top 7) (District Team Standings)
    const districtMap = {};
    for (const p of allPlayersList) {
        if (!p.name || p.name.trim() === '') continue;
        const dInfo = getDistrictInfo(p.club);
        if (!districtMap[dInfo.districtName]) {
            districtMap[dInfo.districtName] = {
                districtNumber: dInfo.districtNumber,
                districtName: dInfo.districtName,
                clubs: new Set(),
                totalPlayers: 0,
                activePlayers: 0,
                allPlayers: []
            };
        }
        const d = districtMap[dInfo.districtName];
        if (p.club) d.clubs.add(p.club);
        d.totalPlayers++;
        if (p.hasPlayed) {
            d.activePlayers++;
        }
        d.allPlayers.push(p);
    }

    const districtRankings = Object.values(districtMap).map(d => {
        const sortedPlayers = [...d.allPlayers].sort((a, b) => {
            if (a.hasPlayed && !b.hasPlayed) return -1;
            if (!a.hasPlayed && b.hasPlayed) return 1;
            return (b.total || 0) - (a.total || 0) || (b.highGame || 0) - (a.highGame || 0) || (b.scratch || 0) - (a.scratch || 0);
        });

        const top7 = sortedPlayers.slice(0, 7);
        const top7Played = top7.filter(p => p.hasPlayed);
        const top7Total = top7Played.reduce((sum, p) => sum + (p.total || 0), 0);
        const top7Scratch = top7Played.reduce((sum, p) => sum + (p.scratch || 0), 0);
        const top7Avg = top7Played.length > 0 ? (top7Total / top7Played.length).toFixed(1) : '0';

        const rowObj = {
            districtNumber: d.districtNumber,
            '分區名稱': d.districtName,
            '所屬社團': [...d.clubs].join('、'),
            '前 7 名總分 (含加分)': top7Total,
            '前 7 名原分總和': top7Scratch,
            '前 7 名平均分': top7Avg,
            '採計人數': `${top7Played.length} / 7 人`,
            '總出賽人數': d.activePlayers,
            '總報名人數': d.totalPlayers,
            top7Total,
            top7Scratch
        };

        for (let i = 0; i < 7; i++) {
            const p = top7[i];
            if (p) {
                const pDesc = p.hasPlayed 
                    ? `${p.name} (${p.club || ''}${p.gender === '女' ? ' 👩' : ''}) - 總分:${p.total} [${p.g1 || 0}-${p.g2 || 0}-${p.g3 || 0}${p.bonus ? `+${p.bonus}` : ''}]`
                    : `${p.name} (${p.club || ''}${p.gender === '女' ? ' 👩' : ''}) - 未出賽`;
                rowObj[`採計選手 ${i + 1}`] = pDesc;
            } else {
                rowObj[`採計選手 ${i + 1}`] = '-';
            }
        }

        return rowObj;
    }).sort((a, b) => b.top7Total - a.top7Total || b.top7Scratch - a.top7Scratch || a.districtNumber - b.districtNumber);

    const formattedDistrictRankings = districtRankings.map((d, idx) => {
        const { districtNumber, top7Total, top7Scratch, ...rest } = d;
        return {
            '分區名次': idx + 1,
            ...rest
        };
    });

    const wsDistrict = XLSX.utils.json_to_sheet(formattedDistrictRankings.length > 0 ? formattedDistrictRankings : [{ '訊息': '尚無分區資料' }]);
    XLSX.utils.book_append_sheet(wb, wsDistrict, '分區團體排名');

    // 6. Sheet 6: 社團團體積分榜 (Club Standings)
    const clubMap = {};
    for (const p of allPlayersList) {
        if (!p.club) continue;
        if (!clubMap[p.club]) {
            clubMap[p.club] = {
                club: p.club,
                totalPlayers: 0,
                activePlayers: 0,
                scratchSum: 0,
                totalSum: 0,
                turkeys: 0,
                flowers: 0
            };
        }
        clubMap[p.club].totalPlayers++;
        if (p.hasPlayed) {
            clubMap[p.club].activePlayers++;
            clubMap[p.club].scratchSum += p.scratch;
            clubMap[p.club].totalSum += p.total;
        }
        clubMap[p.club].turkeys += p.turkeys;
        clubMap[p.club].flowers += p.flowers;
    }

    const clubRankings = Object.values(clubMap)
        .sort((a, b) => b.totalSum - a.totalSum || (b.totalSum / (b.activePlayers || 1)) - (a.totalSum / (a.activePlayers || 1)))
        .map((c, idx) => ({
            '團體名次': idx + 1,
            '社團 / 隊伍名稱': c.club,
            '總人數': c.totalPlayers,
            '出賽人數': c.activePlayers,
            '團體總分 (含女子加分)': c.totalSum,
            '團體原分總和': c.scratchSum,
            '人均平均分': c.activePlayers > 0 ? (c.totalSum / c.activePlayers).toFixed(1) : '0',
            '團隊火雞總數': c.turkeys,
            '團隊霸王花總數': c.flowers
        }));

    const wsClub = XLSX.utils.json_to_sheet(clubRankings);
    XLSX.utils.book_append_sheet(wb, wsClub, '社團團體積分榜');

    // 6. Sheet 6: 特別獎項得主 (Special Awards)
    const specialAwards = [];
    
    // Turkey King
    const topTurkeys = [...allPlayersList].sort((a, b) => b.turkeys - a.turkeys).filter(p => p.turkeys > 0);
    if (topTurkeys.length > 0) {
        const maxT = topTurkeys[0].turkeys;
        const winners = topTurkeys.filter(p => p.turkeys === maxT);
        winners.forEach(w => {
            specialAwards.push({
                '獎項名稱': '🦃 火雞王獎 (Most Turkeys)',
                '獲獎選手': w.name,
                '性別': w.gender,
                '所屬社團': w.club,
                '球道': `第 ${w.lane} 道`,
                '成績紀錄': `${w.turkeys} 次火雞`
            });
        });
    }

    // Flower Queen
    const topFlowers = [...allPlayersList].sort((a, b) => b.flowers - a.flowers).filter(p => p.flowers > 0);
    if (topFlowers.length > 0) {
        const maxF = topFlowers[0].flowers;
        const winners = topFlowers.filter(p => p.flowers === maxF);
        winners.forEach(w => {
            specialAwards.push({
                '獎項名稱': '🌺 霸王花后獎 (Most Flowers)',
                '獲獎選手': w.name,
                '性別': w.gender,
                '所屬社團': w.club,
                '球道': `第 ${w.lane} 道`,
                '成績紀錄': `${w.flowers} 朵霸王花`
            });
        });
    }

    // High Game Award
    const highGameCandidates = [...allPlayersList].filter(p => p.highGame > 0).sort((a, b) => b.highGame - a.highGame);
    if (highGameCandidates.length > 0) {
        const maxHg = highGameCandidates[0].highGame;
        const winners = highGameCandidates.filter(p => p.highGame === maxHg);
        winners.forEach(w => {
            specialAwards.push({
                '獎項名稱': '🎯 單局最高分獎 (High Game Award)',
                '獲獎選手': w.name,
                '性別': w.gender,
                '所屬社團': w.club,
                '球道': `第 ${w.lane} 道`,
                '成績紀錄': `${w.highGame} 分`
            });
        });
    }

    const wsAwards = XLSX.utils.json_to_sheet(specialAwards.length > 0 ? specialAwards : [{ '訊息': '目前尚無特別獎項紀錄' }]);
    XLSX.utils.book_append_sheet(wb, wsAwards, '特別獎項名單');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function generateRosterTemplate(totalLanes = 40, playersPerLane = 4) {
    const wb = XLSX.utils.book_new();
    const rows = [];

    // Strictly 40 lanes and 4 players per lane = 160 rows
    const effectiveLanes = 40;
    const effectivePlayers = 4;

    for (let lane = 1; lane <= effectiveLanes; lane++) {
        for (let p = 1; p <= effectivePlayers; p++) {
            rows.push({
                '序號': p,
                '球道': lane,
                '所屬社': '',
                '姓名': '',
                '英文職稱': '',
                '社名': '',
                '性別': '男',
                '身份': '社友',
                '第一局': '',
                '第二局': '',
                '第三局': '',
                '火雞': '',
                '霸王花': ''
            });
        }
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, '參賽名單');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function parseUploadedExcel(buffer) {
    let wb;
    try {
        const isZip = buffer[0] === 0x50 && buffer[1] === 0x4B; // PK for .xlsx
        const isOle = buffer[0] === 0xD0 && buffer[1] === 0xCF; // OLE for .xls
        
        if (isZip || isOle) {
            wb = XLSX.read(buffer, { type: 'buffer' });
        } else {
            // CSV / TSV text format
            const text = buffer.toString('utf-8');
            wb = XLSX.read(text, { type: 'string', raw: false });
        }
    } catch (e) {
        try {
            wb = XLSX.read(buffer, { type: 'buffer', codepage: 65001, raw: false });
        } catch (e2) {
            throw new Error('無法讀取檔案格式，請確認為有效的 Excel (.xlsx, .xls) 或 CSV 檔案。');
        }
    }

    if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
        throw new Error('Excel 檔案內沒有任何工作表');
    }

    function normalizeKey(k) {
        if (!k) return '';
        return String(k).replace(/[\s\r\n\t_\-\(\)（）:：]/g, '').toLowerCase();
    }

    const rosterMap = new Map(); // key: `${lane}-${order}`
    let singleSheetBestList = [];

    // Prioritize sheets that are likely to contain full roster
    const sortedSheetNames = [...wb.SheetNames].sort((a, b) => {
        const aScore = /參賽|名單|名冊|選手|統計|總表|roster|player/i.test(a) ? 1 : 0;
        const bScore = /參賽|名單|名冊|選手|統計|總表|roster|player/i.test(b) ? 1 : 0;
        return bScore - aScore;
    });

    for (const sheetName of sortedSheetNames) {
        const ws = wb.Sheets[sheetName];
        if (!ws) continue;

        const sheetData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (!sheetData || sheetData.length < 2) continue;

        // Search for header row in top 25 rows
        let headerRowIndex = -1;
        let colMap = {};

        for (let r = 0; r < Math.min(sheetData.length, 25); r++) {
            const row = sheetData[r];
            if (!Array.isArray(row)) continue;

            const tempMap = {};
            row.forEach((cellVal, colIdx) => {
                const clean = normalizeKey(cellVal);
                if (!clean) return;
                
                if (clean.includes('球道') || clean.includes('道號') || clean.includes('道次') || clean === 'lane') {
                    tempMap.lane = colIdx;
                } else if (clean.includes('序號') || clean === 'no' || clean === 'order' || clean.includes('順序') || clean.includes('選手編號') || clean === 'id') {
                    tempMap.player_order = colIdx;
                } else if (clean.includes('姓名') || clean.includes('選手名稱') || clean.includes('選手姓名') || clean === 'name' || clean === 'player') {
                    tempMap.name = colIdx;
                } else if (clean.includes('職稱') || clean.includes('英文職稱') || clean === 'title' || clean === 'role') {
                    tempMap.title = colIdx;
                } else if (clean === '社名' || clean.includes('英文名') || clean.includes('暱稱') || clean === 'nickname') {
                    tempMap.nickname = colIdx;
                } else if (clean.includes('性別') || clean === 'gender' || clean === 'sex' || clean === '男女') {
                    tempMap.gender = colIdx;
                } else if (clean.includes('身份') || clean.includes('身分') || clean === 'identity' || clean === 'type') {
                    tempMap.identity = colIdx;
                } else if (clean.includes('所屬社') || clean.includes('社團') || clean.includes('隊伍') || clean.includes('單位') || clean === 'club' || clean === 'team') {
                    tempMap.club = colIdx;
                } else if (clean.includes('第一局') || clean.includes('第1局') || clean === 'g1' || clean === 'game1' || clean === 'score1' || clean === '1局') {
                    tempMap.g1 = colIdx;
                } else if (clean.includes('第二局') || clean.includes('第2局') || clean === 'g2' || clean === 'game2' || clean === 'score2' || clean === '2局') {
                    tempMap.g2 = colIdx;
                } else if (clean.includes('第三局') || clean.includes('第3局') || clean === 'g3' || clean === 'game3' || clean === 'score3' || clean === '3局') {
                    tempMap.g3 = colIdx;
                } else if (clean.includes('火雞') || clean.includes('turkey')) {
                    tempMap.turkeys = colIdx;
                } else if (clean.includes('霸王花') || clean.includes('flower')) {
                    tempMap.flowers = colIdx;
                }
            });

            if ((tempMap.name !== undefined || tempMap.nickname !== undefined) && (tempMap.lane !== undefined || tempMap.player_order !== undefined || tempMap.gender !== undefined || tempMap.club !== undefined)) {
                headerRowIndex = r;
                colMap = tempMap;
                break;
            }
        }

        if (headerRowIndex !== -1 && (colMap.name !== undefined || colMap.nickname !== undefined)) {
            let autoLane = 1;
            let autoOrder = 1;
            const currentSheetPlayers = [];

            for (let r = headerRowIndex + 1; r < sheetData.length; r++) {
                const row = sheetData[r];
                if (!row || row.length === 0) continue;

                let laneVal = colMap.lane !== undefined ? parseInt(row[colMap.lane], 10) : NaN;
                let orderVal = colMap.player_order !== undefined ? parseInt(row[colMap.player_order], 10) : NaN;

                if (isNaN(laneVal) || laneVal <= 0) {
                    laneVal = autoLane;
                } else {
                    autoLane = laneVal;
                }

                if (isNaN(orderVal) || orderVal <= 0 || orderVal > 4) {
                    orderVal = autoOrder;
                } else {
                    autoOrder = orderVal;
                }

                // Strictly cap lanes at 1 to 40
                if (laneVal < 1 || laneVal > 40 || orderVal < 1 || orderVal > 4) {
                    continue;
                }

                const nameRaw = colMap.name !== undefined ? String(row[colMap.name] || '').trim() : '';
                // Skip header re-occurrences
                if (nameRaw === '姓名' || nameRaw === '選手名稱' || nameRaw === 'Name' || nameRaw === '選手姓名') continue;

                const title = colMap.title !== undefined ? String(row[colMap.title] || '').trim() : '';
                const nickname = colMap.nickname !== undefined ? String(row[colMap.nickname] || '').trim() : '';
                const identity = colMap.identity !== undefined ? String(row[colMap.identity] || '').trim() : '社友';

                const genderRaw = colMap.gender !== undefined ? String(row[colMap.gender] || '') : '男';
                const gender = (genderRaw.includes('女') || genderRaw.toLowerCase().includes('f')) ? '女' : '男';

                const club = colMap.club !== undefined ? String(row[colMap.club] || '').trim() : '';

                const parseScore = (idx) => {
                    if (idx === undefined) return null;
                    const v = row[idx];
                    if (v === '' || v === null || v === undefined) return null;
                    const n = parseInt(v, 10);
                    return isNaN(n) ? null : Math.max(0, Math.min(300, n));
                };

                const g1 = parseScore(colMap.g1);
                const g2 = parseScore(colMap.g2);
                const g3 = parseScore(colMap.g3);
                const turkeys = colMap.turkeys !== undefined ? Math.max(0, parseInt(row[colMap.turkeys], 10) || 0) : 0;
                const flowers = colMap.flowers !== undefined ? Math.max(0, parseInt(row[colMap.flowers], 10) || 0) : 0;

                const playerObj = {
                    lane: laneVal,
                    player_order: orderVal,
                    name: nameRaw, // blank if empty
                    title,
                    nickname,
                    gender,
                    club,
                    identity: identity || '社友',
                    g1, g2, g3,
                    turkeys,
                    flowers
                };

                currentSheetPlayers.push(playerObj);

                const mapKey = `${laneVal}-${orderVal}`;
                if (!rosterMap.has(mapKey) || ((nameRaw || nickname) && !rosterMap.get(mapKey).name)) {
                    rosterMap.set(mapKey, playerObj);
                }

                autoOrder++;
                if (autoOrder > 4) {
                    autoOrder = 1;
                    autoLane++;
                }
            }

            if (currentSheetPlayers.filter(p => p.name || p.nickname).length > singleSheetBestList.filter(p => p.name || p.nickname).length) {
                singleSheetBestList = currentSheetPlayers;
            }
        }
    }

    const combinedList = Array.from(rosterMap.values());
    return combinedList.length > 0 ? combinedList : singleSheetBestList;
}

module.exports = {
    generateExcelReport,
    generateRosterTemplate,
    parseUploadedExcel
};
