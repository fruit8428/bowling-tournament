/**
 * 後端共用工具：Supabase 連線（secret key）、密碼驗證、回應格式、操作紀錄
 * 檔名以底線開頭 → Vercel 不會把它當成 API 路由
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
// 後端用「secret key」（可繞過 RLS 寫入）；舊名稱 SUPABASE_KEY 保留相容
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

let _client = null;
function getSupabase() {
    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
        throw new Error('伺服器尚未設定 SUPABASE_URL / SUPABASE_SECRET_KEY 環境變數');
    }
    if (!_client) {
        _client = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
            auth: { persistSession: false, autoRefreshToken: false }
        });
    }
    return _client;
}

/** 統一的 JSON 回應 */
function send(res, status, body) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(status).send(JSON.stringify(body));
}

/** 只接受 POST，其餘回 405 */
function requirePost(req, res) {
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return false;
    }
    if (req.method !== 'POST') {
        send(res, 405, { ok: false, error: '只接受 POST 請求' });
        return false;
    }
    return true;
}

/** 取得 body（Vercel 已自動解析 JSON；保險起見處理字串） */
function getBody(req) {
    if (!req.body) return {};
    if (typeof req.body === 'string') {
        try { return JSON.parse(req.body); } catch (e) { return {}; }
    }
    return req.body;
}

/**
 * 驗證密碼並回傳角色：'admin' | 'assistant' | null
 * 密碼存在 bowling_auth 表，前端讀不到
 */
async function resolveRole(pin) {
    const clean = String(pin || '').trim();
    if (!clean) return null;
    const sb = getSupabase();
    const { data, error } = await sb.from('bowling_auth').select('role, pin');
    if (error) throw new Error('讀取密碼設定失敗: ' + error.message);
    const hit = (data || []).find(r => String(r.pin).trim() === clean);
    return hit ? hit.role : null;
}

/**
 * 要求特定權限。allowed 例如 ['admin'] 或 ['admin','assistant']
 * 失敗時直接回應 401/403 並回傳 null
 */
async function requireRole(req, res, body, allowed) {
    const pin = body.pin || req.headers['x-bowling-pin'];
    let role;
    try {
        role = await resolveRole(pin);
    } catch (e) {
        send(res, 500, { ok: false, error: e.message });
        return null;
    }
    if (!role) {
        send(res, 401, { ok: false, error: '密碼錯誤或尚未登入，請重新輸入授權密碼', code: 'UNAUTHORIZED' });
        return null;
    }
    if (!allowed.includes(role)) {
        send(res, 403, { ok: false, error: '您的身分（' + (role === 'assistant' ? '助理計分員' : role) + '）沒有執行此操作的權限', code: 'FORBIDDEN' });
        return null;
    }
    return role;
}

async function logAction({ lane = null, playerOrder = null, action, details = '', role = null }) {
    try {
        const sb = getSupabase();
        await sb.from('bowling_logs').insert({
            lane, player_order: playerOrder, action,
            details: typeof details === 'string' ? details.slice(0, 2000) : JSON.stringify(details).slice(0, 2000),
            actor_role: role
        });
    } catch (e) {
        console.warn('[log] 寫入操作紀錄失敗:', e.message);
    }
}

/** 分數清理：'' / null → null；其餘 0~300 整數 */
function cleanScore(v) {
    if (v === '' || v === null || v === undefined) return null;
    const n = parseInt(v, 10);
    if (isNaN(n)) return null;
    return Math.max(0, Math.min(300, n));
}
function cleanCount(v) {
    const n = parseInt(v, 10);
    return isNaN(n) ? 0 : Math.max(0, n);
}
function cleanText(v, max = 100) {
    return String(v === null || v === undefined ? '' : v).trim().slice(0, max);
}
function cleanGender(v) {
    return String(v || '').includes('女') ? '女' : '男';
}
function cleanIdentity(v) {
    const s = String(v || '').trim();
    return ['社友', '寶尊眷', '子女'].includes(s) ? s : '社友';
}

/** 把前端的 player 物件轉成資料表欄位（完整覆寫用） */
function toPlayerRow(lane, order, p) {
    return {
        lane,
        player_order: order,
        name: cleanText(p.name),
        title: cleanText(p.title, 30),
        nickname: cleanText(p.nickname),
        gender: cleanGender(p.gender),
        club: cleanText(p.club),
        identity: cleanIdentity(p.identity),
        g1: cleanScore(p.g1),
        g2: cleanScore(p.g2),
        g3: cleanScore(p.g3),
        turkeys: cleanCount(p.turkeys),
        flowers: cleanCount(p.flowers)
    };
}

/** 讀取整個球道（回傳給前端的格式） */
async function fetchLane(lane) {
    const sb = getSupabase();
    const { data, error } = await sb.from('bowling_players').select('*').eq('lane', lane).order('player_order');
    if (error) throw new Error(error.message);
    return (data || []).map(rowToPlayer);
}

function rowToPlayer(row) {
    return {
        id: row.player_order,
        name: row.name || '',
        title: row.title || '',
        nickname: row.nickname || '',
        gender: row.gender || '男',
        club: row.club || '',
        identity: row.identity || '社友',
        g1: row.g1 === null || row.g1 === undefined ? '' : row.g1,
        g2: row.g2 === null || row.g2 === undefined ? '' : row.g2,
        g3: row.g3 === null || row.g3 === undefined ? '' : row.g3,
        turkeys: row.turkeys || 0,
        flowers: row.flowers || 0,
        updated_at: row.updated_at
    };
}

module.exports = {
    getSupabase, send, requirePost, getBody, resolveRole, requireRole, logAction,
    cleanScore, cleanCount, cleanText, cleanGender, cleanIdentity, toPlayerRow, fetchLane, rowToPlayer
};
