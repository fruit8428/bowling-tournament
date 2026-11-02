/**
 * /api/player 功能測試：透過 HTTP 呼叫已啟動的伺服器（預設本機 vercel dev）
 * 用法：BASE_URL=http://localhost:3344 node test/player-api-test.js
 * 只動第 39、40 球道，開始前先備份、結束時還原原本資料。
 */
const BASE = process.env.BASE_URL || 'http://localhost:3344';
const ADMIN = process.env.TEST_ADMIN_PIN || '2222';
const ASSIST = process.env.TEST_ASSIST_PIN || '3523';
let pass = 0, fail = 0;
function check(label, cond, detail) {
    if (cond) { pass++; console.log(`  ✅ ${label}`); }
    else { fail++; console.log(`  ❌ ${label}`, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : ''); }
}
async function post(path, body) {
    const res = await fetch(`${BASE}/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
}
const readLane = async (lane) => (await post('scores', { pin: ADMIN, lane, game: 1, players: [] })).body.players;

(async () => {
    console.log('0. 備份第 39、40 道');
    const backup39 = await readLane(39), backup40 = await readLane(40);
    check('讀到備份', Array.isArray(backup39) && Array.isArray(backup40), { backup39, backup40 });

    try {
        // 佈置測試名單
        await post('lane', { pin: ADMIN, lane: 40, players: [
            { id: 1, name: '甲', nickname: 'A', gender: '男', club: '01-1測試社', identity: '社友', g1: 100, g2: 110, g3: '', turkeys: 1, flowers: 0 },
            { id: 2, name: '乙', nickname: 'B', gender: '女', club: '01-1測試社', identity: '社友', g1: 90, g2: '', g3: '', turkeys: 0, flowers: 2 },
            { id: 3, name: '', nickname: '', gender: '男', club: '', identity: '社友', g1: '', g2: '', g3: '' },
            { id: 4, name: '丁', nickname: 'D', gender: '男', club: '02-2測試社', identity: '子女', g1: '', g2: '', g3: '' }
        ] });
        await post('lane', { pin: ADMIN, lane: 39, players: [1, 2, 3, 4].map(id => ({ id, name: '', nickname: '', gender: '男', club: '', identity: '社友', g1: '', g2: '', g3: '' })) });

        console.log('1. 權限');
        let r = await post('player', { pin: ASSIST, mode: 'update', lane: 40, id: 1, player: { name: 'X' } });
        check('助理 → 403', r.status === 403, r);
        r = await post('player', { pin: '0000', mode: 'update', lane: 40, id: 1, player: { name: 'X' } });
        check('錯誤密碼 → 401', r.status === 401, r);
        r = await post('player', { pin: ADMIN, mode: 'bogus', lane: 40, id: 1 });
        check('錯誤 mode → 400', r.status === 400, r);

        console.log('2. update：改基本資料，分數不動');
        r = await post('player', { pin: ADMIN, mode: 'update', lane: 40, id: 1, player: { name: '甲改', title: 'pp', nickname: 'A2', gender: '女', club: '03-3新社', identity: '寶尊眷' } });
        check('update 200', r.status === 200 && r.body.lanes && r.body.lanes[40], r);
        let p1 = r.body.lanes[40][0];
        check('姓名/職稱/性別/社團/身份都已更新', p1.name === '甲改' && p1.title === 'pp' && p1.nickname === 'A2' && p1.gender === '女' && p1.club === '03-3新社' && p1.identity === '寶尊眷', p1);
        check('分數與獎項保留 (100/110/火雞1)', p1.g1 === 100 && p1.g2 === 110 && p1.g3 === '' && p1.turkeys === 1, p1);
        r = await post('player', { pin: ADMIN, mode: 'update', lane: 40, id: 1, player: { name: '甲改', gender: '外星人', identity: '路人' } });
        check('不合法性別/身份回預設 男/社友', r.body.lanes[40][0].gender === '男' && r.body.lanes[40][0].identity === '社友', r.body.lanes[40][0]);
        r = await post('player', { pin: ADMIN, mode: 'update', lane: 40, id: 3, player: { name: '新丙', gender: '女' } });
        check('空位新增選手', r.body.lanes[40][2].name === '新丙' && r.body.lanes[40][2].gender === '女', r.body.lanes[40][2]);
        r = await post('player', { pin: ADMIN, mode: 'update', lane: 99, id: 1, player: { name: 'x' } });
        check('球道 99 → 400', r.status === 400, r);

        console.log('3. move：同道互換（調整順序）');
        r = await post('player', { pin: ADMIN, mode: 'move', from: { lane: 40, id: 1 }, to: { lane: 40, id: 2 } });
        check('互換 200 且 swapped=true', r.status === 200 && r.body.swapped === true, r);
        let L = r.body.lanes[40];
        check('P1 變成乙(90分)、P2 變成甲改(100/110)', L[0].name === '乙' && L[0].g1 === 90 && L[0].flowers === 2 && L[1].name === '甲改' && L[1].g1 === 100 && L[1].g2 === 110 && L[1].turkeys === 1, L);

        console.log('4. move：搬到其他球道的空位');
        r = await post('player', { pin: ADMIN, mode: 'move', from: { lane: 40, id: 4 }, to: { lane: 39, id: 2 } });
        check('跨道移動 200 且 swapped=false', r.status === 200 && r.body.swapped === false, r);
        check('回傳兩個球道', r.body.lanes[39] && r.body.lanes[40], Object.keys(r.body.lanes || {}));
        check('第 39 道 P2 = 丁(子女)', r.body.lanes[39][1].name === '丁' && r.body.lanes[39][1].identity === '子女', r.body.lanes[39][1]);
        check('第 40 道 P4 變空', r.body.lanes[40][3].name === '' && r.body.lanes[40][3].nickname === '', r.body.lanes[40][3]);

        console.log('5. move：跨道互換');
        r = await post('player', { pin: ADMIN, mode: 'move', from: { lane: 39, id: 2 }, to: { lane: 40, id: 1 } });
        check('跨道互換 200 swapped=true', r.status === 200 && r.body.swapped === true, r);
        check('第 40 道 P1 = 丁、第 39 道 P2 = 乙(90分跟著走)', r.body.lanes[40][0].name === '丁' && r.body.lanes[39][1].name === '乙' && r.body.lanes[39][1].g1 === 90, r.body);

        console.log('6. move：錯誤情況');
        r = await post('player', { pin: ADMIN, mode: 'move', from: { lane: 40, id: 1 }, to: { lane: 40, id: 1 } });
        check('同位置 → 400', r.status === 400, r);
        r = await post('player', { pin: ADMIN, mode: 'move', from: { lane: 40, id: 4 }, to: { lane: 39, id: 1 } });
        check('來源空位 → 400', r.status === 400, r);
        r = await post('player', { pin: ADMIN, mode: 'move', from: { lane: 40, id: 1 }, to: { lane: 61, id: 1 } });
        check('目標球道 61 → 400', r.status === 400, r);

        console.log('7. clear');
        r = await post('player', { pin: ADMIN, mode: 'clear', lane: 40, id: 2 });
        check('clear 200 且 P2 清空（姓名與分數）', r.status === 200 && r.body.lanes[40][1].name === '' && r.body.lanes[40][1].g1 === '' && r.body.lanes[40][1].turkeys === 0, r.body.lanes && r.body.lanes[40][1]);
        r = await post('player', { pin: ASSIST, mode: 'clear', lane: 40, id: 1 });
        check('助理 clear → 403', r.status === 403, r);
    } finally {
        console.log('8. 還原第 39、40 道');
        const r39 = await post('lane', { pin: ADMIN, lane: 39, players: backup39 });
        const r40 = await post('lane', { pin: ADMIN, lane: 40, players: backup40 });
        check('還原成功', r39.status === 200 && r40.status === 200, { r39: r39.status, r40: r40.status });
        const now40 = await readLane(40);
        check('第 40 道與備份一致', JSON.stringify(now40.map(p => [p.name, p.g1, p.g2, p.g3])) === JSON.stringify(backup40.map(p => [p.name, p.g1, p.g2, p.g3])), { now40, backup40 });
    }
    console.log(`\n結果：${pass} 通過，${fail} 失敗`);
    process.exit(fail ? 1 : 0);
})();
