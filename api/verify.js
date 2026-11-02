/**
 * POST /api/verify  { pin }
 * 回傳 { ok, role: 'admin' | 'assistant' }；密碼錯誤回 401
 */
const { send, requirePost, getBody, resolveRole } = require('./_lib');

module.exports = async (req, res) => {
    if (!requirePost(req, res)) return;
    const body = getBody(req);
    try {
        const role = await resolveRole(body.pin);
        if (!role) return send(res, 401, { ok: false, error: '密碼錯誤，請重新輸入' });
        return send(res, 200, { ok: true, role });
    } catch (e) {
        return send(res, 500, { ok: false, error: e.message });
    }
};
