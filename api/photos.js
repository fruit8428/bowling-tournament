/**
 * POST /api/photos  計分板照片備份查驗（僅限管理計分員）
 *   { pin, mode: 'list', lane?, history? }  → 列出照片：預設列「每球道每局最新一張」；history=true 列所有歷史留存
 *   { pin, mode: 'url', path }               → 回傳 60 分鐘有效的簽名網址，下載檔名為「第x球道第x局.JPG」
 *   { pin, mode: 'delete', path }            → 刪除一張備份（測試清理 / 誤拍）
 */
const { getSupabase, send, requirePost, getBody, requireRole, PHOTO_BUCKET, parsePhotoKey, photoLabel } = require('./_lib');

async function listAll(sb, prefix) {
    const out = [];
    let offset = 0;
    while (true) {
        const { data, error } = await sb.storage.from(PHOTO_BUCKET).list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
        if (error) {
            if (/not found|does not exist/i.test(error.message)) return out;   // bucket 還沒建立 = 還沒有任何照片
            throw new Error(error.message);
        }
        // 檔案有 id；資料夾的 id 是 null（根目錄列出的 lane-xx 就是資料夾）
        (data || []).forEach(f => out.push(Object.assign({ fullPath: prefix ? `${prefix}/${f.name}` : f.name, isFolder: !f.id }, f)));
        if (!data || data.length < 1000) break;
        offset += 1000;
    }
    return out;
}

module.exports = async (req, res) => {
    if (!requirePost(req, res)) return;
    const body = getBody(req);
    const role = await requireRole(req, res, body, ['admin']);
    if (!role) return;
    const mode = String(body.mode || 'list');
    try {
        const sb = getSupabase();
        if (mode === 'list') {
            const wantHistory = body.history === true || body.history === 'true';
            const laneFilter = parseInt(body.lane, 10);
            let files = [];
            if (wantHistory) {
                files = await listAll(sb, 'history');
            } else {
                const folders = await listAll(sb, '');
                for (const f of folders) {
                    if (!f.isFolder || !f.name.startsWith('lane-')) continue;
                    if (!isNaN(laneFilter) && parseInt(f.name.slice(5), 10) !== laneFilter) continue;
                    files.push(...await listAll(sb, f.name));
                }
            }
            const photos = files.filter(f => !f.isFolder).map(f => {
                const info = parsePhotoKey(f.fullPath);
                if (!info) return null;
                if (!isNaN(laneFilter) && info.lane !== laneFilter) return null;
                return {
                    path: f.fullPath,
                    lane: info.lane, game: info.game,
                    label: photoLabel(info.lane, info.game),
                    stamp: info.stamp,
                    size: (f.metadata && f.metadata.size) || null,
                    updated_at: f.updated_at || f.created_at || null
                };
            }).filter(Boolean).sort((a, b) => a.lane - b.lane || a.game - b.game || String(b.stamp || '').localeCompare(String(a.stamp || '')));
            return send(res, 200, { ok: true, photos, history: wantHistory });
        }
        if (mode === 'url') {
            const path = String(body.path || '');
            const info = parsePhotoKey(path);
            if (!info) return send(res, 400, { ok: false, error: '照片路徑不正確' });
            const downloadName = info.stamp ? `第${info.lane}球道第${info.game}局_${info.stamp}.JPG` : photoLabel(info.lane, info.game);
            const { data, error } = await sb.storage.from(PHOTO_BUCKET).createSignedUrl(path, 3600, { download: downloadName });
            if (error) throw new Error(error.message);
            return send(res, 200, { ok: true, url: data.signedUrl, label: downloadName });
        }
        if (mode === 'delete') {
            const path = String(body.path || '');
            if (!parsePhotoKey(path)) return send(res, 400, { ok: false, error: '照片路徑不正確' });
            const { error } = await sb.storage.from(PHOTO_BUCKET).remove([path]);
            if (error) throw new Error(error.message);
            return send(res, 200, { ok: true, deleted: path });
        }
        return send(res, 400, { ok: false, error: 'mode 必須是 list / url / delete' });
    } catch (e) {
        return send(res, 500, { ok: false, error: '讀取照片失敗: ' + e.message });
    }
};
