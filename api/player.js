/**
 * POST /api/player  單一席位的選手資料維護（僅限管理計分員）
 *   { pin, mode: 'update', lane, id, player: { name, title, nickname, gender, club, identity } }
 *       → 只改基本資料（姓名、職稱、Nickname、性別、所屬社、身份），分數與獎項完全不動
 *   { pin, mode: 'move', from: { lane, id }, to: { lane, id } }
 *       → 把選手（含已打的分數）搬到另一個球道/席位；目標席位已有人就「兩人互換」
 *   { pin, mode: 'clear', lane, id }
 *       → 把該席位清成空白（姓名與分數一起清掉）
 * 回傳 { ok, lanes: { [lane]: players[] }, swapped }
 */
const { getSupabase, send, requirePost, getBody, requireRole, logAction, toPlayerRow, fetchLane, cleanText, cleanGender, cleanIdentity } = require('./_lib');

function parseSeat(obj) {
    if (!obj) return null;
    const lane = parseInt(obj.lane, 10);
    const order = parseInt(obj.id !== undefined ? obj.id : obj.player_order, 10);
    if (isNaN(lane) || lane < 1 || lane > 60 || isNaN(order) || order < 1 || order > 4) return null;
    return { lane, order };
}

/** 讀單一席位的原始資料列；不存在就回 null */
async function fetchRow(sb, seat) {
    const { data, error } = await sb.from('bowling_players').select('*')
        .eq('lane', seat.lane).eq('player_order', seat.order).maybeSingle();
    if (error) throw new Error(error.message);
    return data || null;
}

/** 把一列資料的「內容」（不含座位鍵）複製到另一個座位 */
function rowAtSeat(seat, src) {
    const base = src || {};
    return toPlayerRow(seat.lane, seat.order, {
        name: base.name, title: base.title, nickname: base.nickname, gender: base.gender,
        club: base.club, identity: base.identity,
        g1: base.g1, g2: base.g2, g3: base.g3, turkeys: base.turkeys, flowers: base.flowers
    });
}

module.exports = async (req, res) => {
    if (!requirePost(req, res)) return;
    const body = getBody(req);
    const role = await requireRole(req, res, body, ['admin']);
    if (!role) return;

    const mode = String(body.mode || '').trim();
    try {
        const sb = getSupabase();

        // ---------- 修改基本資料 ----------
        if (mode === 'update') {
            const seat = parseSeat(body);
            if (!seat) return send(res, 400, { ok: false, error: '球道或席位編號不正確' });
            const p = body.player || {};
            const update = {
                name: cleanText(p.name),
                title: cleanText(p.title, 30),
                nickname: cleanText(p.nickname),
                gender: cleanGender(p.gender),
                club: cleanText(p.club),
                identity: cleanIdentity(p.identity)
            };
            // 席位可能還不存在（例如剛調大球道數），用 upsert 但只帶基本欄位 → 已存在的分數不會被動到
            const { error } = await sb.from('bowling_players')
                .upsert(Object.assign({ lane: seat.lane, player_order: seat.order }, update), { onConflict: 'lane,player_order' });
            if (error) throw new Error(error.message);
            await logAction({ lane: seat.lane, playerOrder: seat.order, action: 'PLAYER_UPDATE', details: update, role });
            const players = await fetchLane(seat.lane);
            return send(res, 200, { ok: true, lanes: { [seat.lane]: players } });
        }

        // ---------- 換球道 / 調整順序（目標有人就互換） ----------
        if (mode === 'move') {
            const from = parseSeat(body.from);
            const to = parseSeat(body.to);
            if (!from || !to) return send(res, 400, { ok: false, error: '來源或目標的球道/席位編號不正確' });
            if (from.lane === to.lane && from.order === to.order) {
                return send(res, 400, { ok: false, error: '目標席位與目前位置相同，不需要移動' });
            }
            const [srcRow, dstRow] = await Promise.all([fetchRow(sb, from), fetchRow(sb, to)]);
            if (!srcRow || (!srcRow.name && !srcRow.nickname)) {
                return send(res, 400, { ok: false, error: '來源席位是空的，沒有選手可以移動' });
            }
            const swapped = !!(dstRow && (dstRow.name || dstRow.nickname));
            // 一次 upsert 兩列 → 單一 SQL 敘述，不會出現「搬到一半」的狀態
            const rows = [rowAtSeat(to, srcRow), rowAtSeat(from, dstRow)];
            const { error } = await sb.from('bowling_players').upsert(rows, { onConflict: 'lane,player_order' });
            if (error) throw new Error(error.message);
            await logAction({
                lane: from.lane, playerOrder: from.order, action: 'PLAYER_MOVE',
                details: `${srcRow.name || srcRow.nickname}: ${from.lane}-P${from.order} → ${to.lane}-P${to.order}` + (swapped ? `（與 ${dstRow.name || dstRow.nickname} 互換）` : ''),
                role
            });
            const lanes = {};
            lanes[from.lane] = await fetchLane(from.lane);
            if (to.lane !== from.lane) lanes[to.lane] = await fetchLane(to.lane);
            return send(res, 200, {
                ok: true, swapped, lanes,
                message: swapped
                    ? `已將 ${srcRow.name || srcRow.nickname} 與 ${dstRow.name || dstRow.nickname} 互換位置`
                    : `已將 ${srcRow.name || srcRow.nickname} 移到第 ${to.lane} 道 P${to.order}`
            });
        }

        // ---------- 清空席位 ----------
        if (mode === 'clear') {
            const seat = parseSeat(body);
            if (!seat) return send(res, 400, { ok: false, error: '球道或席位編號不正確' });
            const before = await fetchRow(sb, seat);
            const { error } = await sb.from('bowling_players')
                .upsert(toPlayerRow(seat.lane, seat.order, {}), { onConflict: 'lane,player_order' });
            if (error) throw new Error(error.message);
            await logAction({ lane: seat.lane, playerOrder: seat.order, action: 'PLAYER_CLEAR', details: before ? `${before.name}|${before.g1}|${before.g2}|${before.g3}` : '', role });
            const players = await fetchLane(seat.lane);
            return send(res, 200, { ok: true, lanes: { [seat.lane]: players }, message: `第 ${seat.lane} 道 P${seat.order} 已清空` });
        }

        return send(res, 400, { ok: false, error: 'mode 必須是 update / move / clear' });
    } catch (e) {
        return send(res, 500, { ok: false, error: '操作失敗: ' + e.message });
    }
};
