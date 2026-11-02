/**
 * POST /api/scores  { pin, lane, game(1~3), players: [ {id, score, turkeys, flowers} ], photoPath? }
 *   photoPath：拍照辨識時已備份的照片鍵；若核對時改了球道或局數，會把照片複製成正確的「第x球道第x局.JPG」
 * 只寫入某一局的分數與獎項，不動選手基本資料。管理計分員與助理計分員都可用（拍照辨識登錄走這裡）。
 */
const { getSupabase, send, requirePost, getBody, requireRole, logAction, cleanScore, cleanCount, fetchLane, relocatePhoto } = require('./_lib');

module.exports = async (req, res) => {
    if (!requirePost(req, res)) return;
    const body = getBody(req);
    const role = await requireRole(req, res, body, ['admin', 'assistant']);
    if (!role) return;

    const lane = parseInt(body.lane, 10);
    const game = parseInt(body.game, 10);
    if (isNaN(lane) || lane < 1 || lane > 60) return send(res, 400, { ok: false, error: '球道編號不正確' });
    if (![1, 2, 3].includes(game)) return send(res, 400, { ok: false, error: '局數必須是 1、2 或 3' });
    if (!Array.isArray(body.players)) return send(res, 400, { ok: false, error: '缺少成績資料' });

    const gameField = `g${game}`;
    try {
        const sb = getSupabase();
        for (let idx = 0; idx < Math.min(body.players.length, 4); idx++) {
            const item = body.players[idx] || {};
            let order = parseInt(item.id, 10);
            if (isNaN(order) || order < 1 || order > 4) order = idx + 1;

            const update = {};
            // 只有「有填分數」才覆寫；空值代表沒辨識到，絕不抹掉既有成績
            const score = cleanScore(item.score);
            if (score !== null) update[gameField] = score;
            if (item.clear === true) update[gameField] = null;
            if (item.turkeys !== undefined && item.turkeys !== null) update.turkeys = cleanCount(item.turkeys);
            if (item.flowers !== undefined && item.flowers !== null) update.flowers = cleanCount(item.flowers);
            if (Object.keys(update).length === 0) continue;

            const { error } = await sb.from('bowling_players').update(update).eq('lane', lane).eq('player_order', order);
            if (error) throw new Error(error.message);
        }
        let photo = null;
        if (body.photoPath) {
            try { photo = await relocatePhoto(String(body.photoPath), lane, game); }
            catch (e) { console.warn('[scores] 照片改名失敗:', e.message); photo = { error: e.message }; }
        }
        await logAction({ lane, action: 'SCORES_SAVE', details: `G${game} ` + body.players.map((p, i) => `${p.id || i + 1}:${p.score}`).join(',') + (photo && photo.path ? ` photo=${photo.path}` : ''), role });
        const players = await fetchLane(lane);
        return send(res, 200, { ok: true, lane, game, players, photo });
    } catch (e) {
        return send(res, 500, { ok: false, error: '儲存失敗: ' + e.message });
    }
};
