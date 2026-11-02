/**
 * GET /api/health
 * 回報伺服器設定狀態：Supabase 連線是否正常、Gemini 金鑰是否已設定。
 * 不洩漏任何金鑰內容。
 */
const { getSupabase, send } = require('./_lib');

module.exports = async (req, res) => {
    const out = {
        ok: true,
        time: new Date().toISOString(),
        supabase: { configured: !!(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY)), reachable: false, players: null },
        gemini: { configured: !!(process.env.GEMINI_API_KEY || process.env.GEMINI_KEY) },
        openai: { configured: !!(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY) }
    };
    if (out.supabase.configured) {
        try {
            const sb = getSupabase();
            const { count, error } = await sb.from('bowling_players').select('*', { count: 'exact', head: true });
            if (error) throw new Error(error.message);
            out.supabase.reachable = true;
            out.supabase.players = count;
        } catch (e) {
            out.supabase.error = e.message;
            out.ok = false;
        }
    } else {
        out.ok = false;
    }
    return send(res, out.ok ? 200 : 503, out);
};
