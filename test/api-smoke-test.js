/**
 * 後端 API 煙霧測試：不經 Vercel，直接在本機呼叫 api/*.js 的處理函式，連線真實 Supabase。
 * 用法：SUPABASE_URL=... SUPABASE_SECRET_KEY=... node test/api-smoke-test.js
 * 會建立/修改第 39、40 球道的測試資料，結束時清回空白。
 */
const path = require('path');
const api = {};
for (const n of ['health', 'verify', 'lane', 'scores', 'settings', 'roster', 'announce', 'recognize']) {
    api[n] = require(path.join(__dirname, '..', 'api', n + '.js'));
}
function call(name, body, method = 'POST') {
    return new Promise((resolve) => {
        const req = { method, body, headers: {} };
        const res = {
            _status: 200,
            setHeader() {},
            status(c) { this._status = c; return this; },
            send(b) { resolve({ status: this._status, body: typeof b === 'string' ? JSON.parse(b) : b }); },
            end() { resolve({ status: this._status, body: null }); }
        };
        Promise.resolve(api[name](req, res)).catch(e => resolve({ status: 'EXC', body: { error: e.message } }));
    });
}
let pass = 0, fail = 0;
function check(label, cond, detail) {
    if (cond) { pass++; console.log(`  ✅ ${label}`); }
    else { fail++; console.log(`  ❌ ${label}`, detail !== undefined ? JSON.stringify(detail).slice(0, 300) : ''); }
}
(async () => {
    const ADMIN = process.env.TEST_ADMIN_PIN || '2222';
    const ASSIST = process.env.TEST_ASSIST_PIN || '3523';

    console.log('1. health');
    let r = await call('health', {}, 'GET');
    check('health 200 且 Supabase 可連', r.status === 200 && r.body.supabase.reachable, r.body);

    console.log('2. verify');
    r = await call('verify', { pin: '0000' }); check('錯誤密碼 → 401', r.status === 401, r);
    r = await call('verify', { pin: ADMIN }); check('管理密碼 → admin', r.status === 200 && r.body.role === 'admin', r);
    r = await call('verify', { pin: ASSIST }); check('助理密碼 → assistant', r.status === 200 && r.body.role === 'assistant', r);
    r = await call('verify', {}); check('沒給密碼 → 401', r.status === 401, r);

    console.log('3. lane（整道儲存）');
    const players = [
        { id: 1, name: '測試甲', title: 'PP', nickname: 'Alpha', gender: '男', club: '12-1龍門社', identity: '社友', g1: 150, g2: '', g3: '', turkeys: 1, flowers: 0 },
        { id: 2, name: '測試乙', title: '', nickname: 'Beta', gender: '女', club: '12-1龍門社', identity: '社友', g1: 120, g2: 130, g3: '', turkeys: 0, flowers: 1 },
        { id: 3, name: '測試丙', title: '', nickname: '', gender: '女', club: '12-2龍華社', identity: '寶尊眷', g1: 999, g2: -5, g3: 'abc', turkeys: 0, flowers: 0 },
        { id: 4, name: '', title: '', nickname: '', gender: '男', club: '', identity: '社友', g1: '', g2: '', g3: '', turkeys: 0, flowers: 0 }
    ];
    r = await call('lane', { pin: ASSIST, lane: 40, players }); check('助理整道儲存 → 403', r.status === 403, r);
    r = await call('lane', { pin: ADMIN, lane: 40, players });
    check('管理員整道儲存 200', r.status === 200 && r.body.players.length === 4, r);
    check('分數超出範圍被夾到 0~300、非數字變空', r.body.players[2].g1 === 300 && r.body.players[2].g2 === 0 && r.body.players[2].g3 === '', r.body.players[2]);
    check('身分不合法時回預設', r.body.players[2].identity === '寶尊眷' && r.body.players[0].identity === '社友');
    r = await call('lane', { pin: ADMIN, lane: 99, players }); check('球道 99 → 400', r.status === 400, r);

    console.log('4. scores（單局，助理可用）');
    r = await call('scores', { pin: ASSIST, lane: 40, game: 2, players: [{ id: 1, score: 180, turkeys: 2, flowers: 0 }, { id: 2, score: '', turkeys: 0, flowers: 1 }, { id: 3, score: 95 }, { id: 4, score: 100 }] });
    check('助理單局儲存 200', r.status === 200, r);
    check('P1 第 2 局 = 180、火雞 2', r.body.players[0].g2 === 180 && r.body.players[0].turkeys === 2, r.body.players[0]);
    check('P2 空分數不覆蓋原本 130', r.body.players[1].g2 === 130, r.body.players[1]);
    check('P1 第 1 局 150 未被動到', r.body.players[0].g1 === 150, r.body.players[0]);
    r = await call('scores', { pin: ASSIST, lane: 40, game: 4, players: [] }); check('局數 4 → 400', r.status === 400, r);

    console.log('5. settings');
    r = await call('settings', { pin: ASSIST, settings: { event_name: 'x' } }); check('助理改設定 → 403', r.status === 403, r);
    r = await call('settings', { pin: ADMIN, settings: { event_name: '煙霧測試賽事', female_bonus_per_game: 12, total_lanes: 40 } });
    check('管理員改設定 200', r.status === 200 && r.body.settings.event_name === '煙霧測試賽事', r);
    r = await call('settings', { pin: ADMIN, settings: {}, admin_pin: '12' }); check('密碼太短 → 400', r.status === 400, r);
    r = await call('settings', { pin: ADMIN, settings: {}, assistant_pin: ADMIN }); check('助理密碼撞管理密碼 → 400', r.status === 400, r);
    r = await call('settings', { pin: ADMIN, settings: { event_name: '國際扶輪3523地區 2026-27年度地區保齡球聯誼賽' } }); check('賽事名稱還原', r.status === 200);

    console.log('6. announce');
    r = await call('announce', { pin: ADMIN, message: '煙霧測試廣播' }); check('廣播 200', r.status === 200, r);
    r = await call('announce', { pin: ADMIN, message: '' }); check('空白廣播 → 400', r.status === 400, r);

    console.log('7. roster');
    r = await call('roster', { pin: ADMIN, mode: 'import', players: [{ lane: 39, id: 1, name: '匯入甲', gender: '女', club: '04-2松山社', identity: '社友', g1: 100 }] });
    check('匯入 200、算出 1 位', r.status === 200 && r.body.count === 1, r);
    r = await call('scores', { pin: ADMIN, lane: 39, game: 1, players: [] });   // 不改任何東西，只讀回該道
    check('匯入後第 39 道 P1 = 匯入甲 女', r.body.players[0].name === '匯入甲' && r.body.players[0].gender === '女', r.body.players[0]);
    r = await call('roster', { pin: ADMIN, mode: 'clear_scores' }); check('清空分數 200', r.status === 200, r);
    r = await call('scores', { pin: ADMIN, lane: 39, game: 1, players: [] });
    check('清空後分數為空、名字保留', r.body.players[0].g1 === '' && r.body.players[0].name === '匯入甲', r.body.players[0]);
    r = await call('roster', { pin: ADMIN, mode: 'bogus' }); check('錯誤 mode → 400', r.status === 400, r);

    console.log('8. recognize（沒有圖片的錯誤處理）');
    r = await call('recognize', { pin: ASSIST, lane: 1, game: 1, image: 'not-an-image' });
    check('無效圖片 → 400 或 503(無金鑰)', r.status === 400 || r.status === 503, r);
    if (process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || process.env.GEMINI_API_KEY || process.env.GEMINI_KEY) {
        const fs = require('fs');
        const img = process.env.TEST_IMAGE;
        if (img && fs.existsSync(img)) {
            const b64 = fs.readFileSync(img).toString('base64');
            const t0 = Date.now();
            r = await call('recognize', { pin: ASSIST, lane: 24, game: 1, image: 'data:image/jpeg;base64,' + b64 });
            console.log('   AI 結果:', JSON.stringify({ status: r.status, engine: r.body.engine, lane: r.body.detectedLane, scores: r.body.scores, msg: r.body.message || r.body.error, secs: ((Date.now() - t0) / 1000).toFixed(1) }));
            check('AI 辨識回 200 且有 4 個分數', r.status === 200 && Array.isArray(r.body.scores) && r.body.scores.length === 4, r.body);
        }
    } else {
        console.log('   （本機沒有 AI 金鑰，略過真實辨識；部署後再測）');
    }

    console.log('9. 清理測試資料');
    r = await call('roster', { pin: ADMIN, mode: 'reset' }); check('reset 200', r.status === 200, r);

    console.log(`\n結果：${pass} 通過，${fail} 失敗`);
    process.exit(fail ? 1 : 0);
})();
