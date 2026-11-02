/**
 * POST /api/announce  { pin, message, duration }
 * 寫入一筆全場公告；所有裝置透過 Realtime 收到後顯示跑馬燈。僅限管理計分員。
 */
const { getSupabase, send, requirePost, getBody, requireRole, logAction, cleanText } = require('./_lib');

module.exports = async (req, res) => {
    if (!requirePost(req, res)) return;
    const body = getBody(req);
    const role = await requireRole(req, res, body, ['admin']);
    if (!role) return;

    const message = cleanText(body.message, 300);
    if (!message) return send(res, 400, { ok: false, error: '廣播內容不能空白' });
    const duration = Math.max(3000, Math.min(60000, parseInt(body.duration, 10) || 8000));
    try {
        const sb = getSupabase();
        const { error } = await sb.from('bowling_announcements').insert({ message, duration });
        if (error) throw new Error(error.message);
        await logAction({ action: 'ANNOUNCE', details: message, role });
        return send(res, 200, { ok: true });
    } catch (e) {
        return send(res, 500, { ok: false, error: '廣播失敗: ' + e.message });
    }
};
