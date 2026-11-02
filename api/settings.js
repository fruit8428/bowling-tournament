/**
 * POST /api/settings  { pin, settings: { event_name, female_bonus_per_game, total_lanes, ocr_enabled }, admin_pin?, assistant_pin? }
 * 更新公開賽事設定；若有帶 admin_pin / assistant_pin（4~8 位數字）則一併更改密碼。僅限管理計分員。
 */
const { getSupabase, send, requirePost, getBody, requireRole, logAction, cleanText } = require('./_lib');

module.exports = async (req, res) => {
    if (!requirePost(req, res)) return;
    const body = getBody(req);
    const role = await requireRole(req, res, body, ['admin']);
    if (!role) return;

    try {
        const sb = getSupabase();
        const s = body.settings || {};
        const updates = [];
        if (s.event_name !== undefined) updates.push({ key: 'event_name', value: cleanText(s.event_name, 80) || '保齡球聯誼賽' });
        if (s.female_bonus_per_game !== undefined) {
            const n = parseInt(s.female_bonus_per_game, 10);
            updates.push({ key: 'female_bonus_per_game', value: String(isNaN(n) ? 12 : Math.max(0, Math.min(100, n))) });
        }
        if (s.total_lanes !== undefined) {
            const n = parseInt(s.total_lanes, 10);
            updates.push({ key: 'total_lanes', value: String(isNaN(n) ? 40 : Math.max(1, Math.min(60, n))) });
        }
        if (s.ocr_enabled !== undefined) {
            // 拍照辨識開關：'1' 開啟、其他一律關閉
            updates.push({ key: 'ocr_enabled', value: (String(s.ocr_enabled) === '1' || s.ocr_enabled === true) ? '1' : '0' });
        }
        if (updates.length) {
            const { error } = await sb.from('bowling_settings').upsert(updates, { onConflict: 'key' });
            if (error) throw new Error(error.message);
        }

        const pinChanges = [];
        for (const [field, r] of [['admin_pin', 'admin'], ['assistant_pin', 'assistant']]) {
            const v = String(body[field] || '').trim();
            if (!v) continue;
            if (!/^\d{4,8}$/.test(v)) return send(res, 400, { ok: false, error: `${r === 'admin' ? '管理' : '助理'}計分員密碼必須是 4~8 位數字` });
            pinChanges.push({ role: r, pin: v });
        }
        if (pinChanges.length === 2 && pinChanges[0].pin === pinChanges[1].pin) {
            return send(res, 400, { ok: false, error: '管理與助理密碼不能相同' });
        }
        if (pinChanges.length) {
            // 避免新密碼與另一個角色現有密碼撞到
            const { data: existing } = await sb.from('bowling_auth').select('role, pin');
            for (const pc of pinChanges) {
                const clash = (existing || []).find(e => e.role !== pc.role && String(e.pin) === pc.pin && !pinChanges.find(x => x.role === e.role));
                if (clash) return send(res, 400, { ok: false, error: '新密碼與另一個角色的密碼相同，請換一組' });
            }
            const { error } = await sb.from('bowling_auth').upsert(pinChanges, { onConflict: 'role' });
            if (error) throw new Error(error.message);
        }

        await logAction({ action: 'SETTINGS_SAVE', details: { updates, pinRolesChanged: pinChanges.map(p => p.role) }, role });
        const { data } = await sb.from('bowling_settings').select('key, value');
        const settings = {};
        (data || []).forEach(r => settings[r.key] = r.value);
        return send(res, 200, { ok: true, settings, pinChanged: pinChanges.map(p => p.role) });
    } catch (e) {
        return send(res, 500, { ok: false, error: '儲存設定失敗: ' + e.message });
    }
};
