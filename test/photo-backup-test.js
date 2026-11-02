/**
 * 照片備份功能測試：透過 HTTP 呼叫已啟動的伺服器（預設本機 vercel dev）
 * 用法：BASE_URL=http://localhost:3344 node test/photo-backup-test.js
 * 流程：用一張 1x1 的小 JPEG 送 /api/recognize（本機沒有 AI 金鑰也沒關係，照片一樣會備份）
 *       → 查清單 → 取簽名網址下載 → 用 /api/scores 改球道局數看檔名是否跟著改 → 刪除測試照片
 * 只動第 40 道第 3 局與第 39 道第 2 局的「照片」，不會寫入任何分數（players 傳空陣列）。
 */
const BASE = process.env.BASE_URL || 'http://localhost:3344';
const ADMIN = process.env.TEST_ADMIN_PIN || '2222';
const ASSIST = process.env.TEST_ASSIST_PIN || '3523';
// 1x1 像素的 JPEG
const TINY_JPEG = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpgA//Z';
let pass = 0, fail = 0;
function check(label, cond, detail) {
    if (cond) { pass++; console.log(`  ✅ ${label}`); }
    else { fail++; console.log(`  ❌ ${label}`, detail !== undefined ? JSON.stringify(detail).slice(0, 400) : ''); }
}
async function post(path, body) {
    const res = await fetch(`${BASE}/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
}
(async () => {
    console.log('1. 助理拍照辨識 → 照片備份（第 40 道第 3 局）');
    let r = await post('recognize', { pin: ASSIST, lane: 40, game: 3, image: 'data:image/jpeg;base64,' + TINY_JPEG });
    console.log('   recognize 回應狀態:', r.status, r.body.engine ? `AI=${r.body.engine}` : `（${(r.body.error || '').slice(0, 60)}）`);
    check('回應帶有 backup.saved=true', r.body.backup && r.body.backup.saved === true, r.body.backup || r.body);
    check('備份檔名顯示為 第40球道第3局.JPG', r.body.backup && r.body.backup.label === '第40球道第3局.JPG', r.body.backup);
    const photoPath = r.body.backup && r.body.backup.path;

    console.log('2. 權限');
    r = await post('photos', { pin: ASSIST, mode: 'list' }); check('助理查照片 → 403', r.status === 403, r);

    console.log('3. 管理者查清單');
    r = await post('photos', { pin: ADMIN, mode: 'list', lane: 40 });
    check('清單 200', r.status === 200, r);
    const hit = (r.body.photos || []).find(p => p.lane === 40 && p.game === 3);
    check('清單內有 第40球道第3局.JPG', !!hit && hit.label === '第40球道第3局.JPG', r.body.photos);
    r = await post('photos', { pin: ADMIN, mode: 'list', history: true, lane: 40 });
    const histHit = (r.body.photos || []).find(p => p.lane === 40 && p.game === 3 && p.stamp);
    check('歷史留存也有一份（含時間戳）', !!histHit, r.body.photos);

    console.log('4. 簽名網址可下載');
    r = await post('photos', { pin: ADMIN, mode: 'url', path: photoPath });
    check('url 200 且檔名正確', r.status === 200 && r.body.label === '第40球道第3局.JPG' && /^https?:/.test(r.body.url || ''), r);
    if (r.body.url) {
        const img = await fetch(r.body.url);
        const buf = Buffer.from(await img.arrayBuffer());
        check('下載回來是 JPEG（FFD8 開頭）', img.status === 200 && buf[0] === 0xFF && buf[1] === 0xD8, { status: img.status, len: buf.length });
    }

    console.log('5. 儲存時改成第 39 道第 2 局 → 照片檔名跟著改（不寫分數）');
    r = await post('scores', { pin: ASSIST, lane: 39, game: 2, players: [], photoPath });
    check('scores 200 且 photo.moved=true', r.status === 200 && r.body.photo && r.body.photo.moved === true && r.body.photo.label === '第39球道第2局.JPG', r.body.photo || r.body);
    r = await post('photos', { pin: ADMIN, mode: 'list', lane: 39 });
    check('第 39 道清單有 第39球道第2局.JPG', (r.body.photos || []).some(p => p.lane === 39 && p.game === 2), r.body.photos);

    console.log('6. 清理測試照片');
    r = await post('photos', { pin: ADMIN, mode: 'list', history: true });
    const toDelete = (r.body.photos || []).filter(p => (p.lane === 40 && p.game === 3) || (p.lane === 39 && p.game === 2)).map(p => p.path);
    toDelete.push('lane-40/game-3.JPG', 'lane-39/game-2.JPG');
    let delOk = true;
    for (const path of toDelete) { const d = await post('photos', { pin: ADMIN, mode: 'delete', path }); if (d.status !== 200) delOk = false; }
    check(`刪除 ${toDelete.length} 個測試檔案`, delOk);
    r = await post('photos', { pin: ADMIN, mode: 'list', lane: 40 });
    check('第 40 道第 3 局已不存在', !(r.body.photos || []).some(p => p.lane === 40 && p.game === 3), r.body.photos);

    console.log(`\n結果：${pass} 通過，${fail} 失敗`);
    process.exit(fail ? 1 : 0);
})();
