/**
 * POST /api/roster
 *   { pin, mode: 'import', players: [ {lane, id, name, title, nickname, gender, club, identity, g1, g2, g3, turkeys, flowers} ] }
 *     → 以匯入的 Excel 名冊覆寫全部球道（沒出現在檔案裡的席位會清成空白）
 *   { pin, mode: 'clear_scores' } → 清空全場分數與獎項 + 刪除全部計分板照片備份，保留名單（比賽開始歸零）
 *   { pin, mode: 'reset' }        → 全部席位清成空白（名單也清掉）+ 刪除全部照片備份
 * 僅限管理計分員。
 */
const { getSupabase, send, requirePost, getBody, requireRole, logAction, toPlayerRow, deleteAllPhotos } = require('./_lib');

async function getTotalLanes(sb) {
    const { data } = await sb.from('bowling_settings').select('value').eq('key', 'total_lanes').maybeSingle();
    const n = parseInt(data && data.value, 10);
    return isNaN(n) ? 40 : Math.max(1, Math.min(60, n));
}

/** 刪照片失敗不應讓「清空分數」整個失敗，所以包起來回傳結果 */
async function removePhotosSafely() {
    try { return { deleted: await deleteAllPhotos(), error: '' }; }
    catch (e) { console.warn('[roster] 刪除照片失敗:', e.message); return { deleted: 0, error: e.message }; }
}

module.exports = async (req, res) => {
    if (!requirePost(req, res)) return;
    const body = getBody(req);
    const role = await requireRole(req, res, body, ['admin']);
    if (!role) return;

    const mode = String(body.mode || '').trim();
    try {
        const sb = getSupabase();
        const totalLanes = await getTotalLanes(sb);

        if (mode === 'clear_scores') {
            const { error } = await sb.from('bowling_players')
                .update({ g1: null, g2: null, g3: null, turkeys: 0, flowers: 0 })
                .gte('lane', 1);
            if (error) throw new Error(error.message);
            // 會清分數的都是測試資料，照片備份一併清掉，正式比賽從零開始
            const photos = await removePhotosSafely();
            await logAction({ action: 'CLEAR_SCORES', details: `清空全場分數與獎項，保留名單；刪除照片 ${photos.deleted} 張${photos.error ? '（失敗: ' + photos.error + '）' : ''}`, role });
            return send(res, 200, { ok: true, photosDeleted: photos.deleted, photosError: photos.error, message: `全場分數已歸零，選手名單保留；已刪除 ${photos.deleted} 張計分板照片備份` + (photos.error ? `（照片刪除失敗：${photos.error}）` : '') });
        }

        if (mode === 'reset' || mode === 'import') {
            // 先組出 totalLanes × 4 的空白席位
            const map = new Map();
            for (let l = 1; l <= totalLanes; l++) {
                for (let p = 1; p <= 4; p++) map.set(`${l}-${p}`, toPlayerRow(l, p, {}));
            }
            let named = 0;
            if (mode === 'import') {
                if (!Array.isArray(body.players) || body.players.length === 0) {
                    return send(res, 400, { ok: false, error: '匯入檔內沒有選手資料' });
                }
                for (const p of body.players) {
                    const lane = parseInt(p.lane, 10);
                    const order = parseInt(p.id !== undefined ? p.id : p.player_order, 10);
                    if (isNaN(lane) || lane < 1 || lane > totalLanes || isNaN(order) || order < 1 || order > 4) continue;
                    const row = toPlayerRow(lane, order, p);
                    const key = `${lane}-${order}`;
                    // 同一席位重複出現時，保留有名字的那筆
                    if (!map.get(key).name || row.name) map.set(key, row);
                }
                named = [...map.values()].filter(r => r.name || r.nickname).length;
            }
            const rows = [...map.values()];
            // 超過球道數的舊資料一併清掉
            await sb.from('bowling_players').delete().gt('lane', totalLanes);
            const { error } = await sb.from('bowling_players').upsert(rows, { onConflict: 'lane,player_order' });
            if (error) throw new Error(error.message);
            // 全部重置時照片也一併清掉（匯入名冊不動照片）
            const photos = mode === 'reset' ? await removePhotosSafely() : { deleted: 0, error: '' };
            await logAction({ action: mode === 'import' ? 'ROSTER_IMPORT' : 'ROSTER_RESET', details: `lanes=${totalLanes} named=${named}` + (mode === 'reset' ? ` photosDeleted=${photos.deleted}` : ''), role });
            return send(res, 200, {
                ok: true,
                count: named,
                photosDeleted: photos.deleted,
                message: mode === 'import' ? `成功匯入 ${named} 位選手（${totalLanes} 球道 × 4 席位）` : `已清空全部 ${totalLanes} 球道名冊，並刪除 ${photos.deleted} 張照片備份`
            });
        }

        return send(res, 400, { ok: false, error: 'mode 必須是 import / clear_scores / reset' });
    } catch (e) {
        return send(res, 500, { ok: false, error: '操作失敗: ' + e.message });
    }
};
