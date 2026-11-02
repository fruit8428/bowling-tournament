/**
 * POST /api/roster
 *   { pin, mode: 'import', players: [ {lane, id, name, title, nickname, gender, club, identity, g1, g2, g3, turkeys, flowers} ] }
 *     → 以匯入的 Excel 名冊覆寫全部球道（沒出現在檔案裡的席位會清成空白）
 *   { pin, mode: 'clear_scores' } → 清空全場分數與獎項，保留名單（比賽開始歸零）
 *   { pin, mode: 'reset' }        → 全部席位清成空白（名單也清掉）
 * 僅限管理計分員。
 */
const { getSupabase, send, requirePost, getBody, requireRole, logAction, toPlayerRow } = require('./_lib');

async function getTotalLanes(sb) {
    const { data } = await sb.from('bowling_settings').select('value').eq('key', 'total_lanes').maybeSingle();
    const n = parseInt(data && data.value, 10);
    return isNaN(n) ? 40 : Math.max(1, Math.min(60, n));
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
            await logAction({ action: 'CLEAR_SCORES', details: '清空全場分數與獎項，保留名單', role });
            return send(res, 200, { ok: true, message: '全場分數已歸零，選手名單保留' });
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
            await logAction({ action: mode === 'import' ? 'ROSTER_IMPORT' : 'ROSTER_RESET', details: `lanes=${totalLanes} named=${named}`, role });
            return send(res, 200, {
                ok: true,
                count: named,
                message: mode === 'import' ? `成功匯入 ${named} 位選手（${totalLanes} 球道 × 4 席位）` : `已清空全部 ${totalLanes} 球道名冊`
            });
        }

        return send(res, 400, { ok: false, error: 'mode 必須是 import / clear_scores / reset' });
    } catch (e) {
        return send(res, 500, { ok: false, error: '操作失敗: ' + e.message });
    }
};
