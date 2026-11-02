/**
 * POST /api/lane  { pin, lane, players: [ {id, name, title, nickname, gender, club, identity, g1, g2, g3, turkeys, flowers} ] }
 * 整個球道 4 位選手完整覆寫（姓名、社團、成績全部）。僅限管理計分員。
 */
const { getSupabase, send, requirePost, getBody, requireRole, logAction, toPlayerRow, fetchLane } = require('./_lib');

module.exports = async (req, res) => {
    if (!requirePost(req, res)) return;
    const body = getBody(req);
    const role = await requireRole(req, res, body, ['admin']);
    if (!role) return;

    const lane = parseInt(body.lane, 10);
    if (isNaN(lane) || lane < 1 || lane > 60) return send(res, 400, { ok: false, error: '球道編號不正確' });
    if (!Array.isArray(body.players) || body.players.length === 0) return send(res, 400, { ok: false, error: '缺少選手資料' });

    try {
        const rows = body.players.slice(0, 4).map((p, idx) => {
            let order = parseInt(p.id, 10);
            if (isNaN(order) || order < 1 || order > 4) order = idx + 1;
            return toPlayerRow(lane, order, p);
        });
        const sb = getSupabase();
        const { error } = await sb.from('bowling_players').upsert(rows, { onConflict: 'lane,player_order' });
        if (error) throw new Error(error.message);
        await logAction({ lane, action: 'LANE_SAVE', details: rows.map(r => `${r.player_order}:${r.name}|${r.g1}|${r.g2}|${r.g3}`).join(' / '), role });
        const players = await fetchLane(lane);
        return send(res, 200, { ok: true, lane, players });
    } catch (e) {
        return send(res, 500, { ok: false, error: '儲存失敗: ' + e.message });
    }
};
