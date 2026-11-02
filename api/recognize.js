/**
 * POST /api/recognize  { pin, lane, game, image: "data:image/jpeg;base64,..." }
 * 用 Google Gemini 視覺模型讀取計分板照片：球道號碼、4 位選手第 10 格最終總分、火雞與霸王花。
 * Gemini API Key 只放在伺服器環境變數，前端完全接觸不到。
 * 管理計分員與助理計分員皆可使用。
 */
const { GoogleGenAI, Type } = require('@google/genai');
const { send, requirePost, getBody, requireRole, logAction, fetchLane, cleanScore } = require('./_lib');

// 依序嘗試的模型（第一個失敗就換下一個）
const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];

function buildPrompt(selectedLane) {
    return `你是保齡球賽事的計分板影像辨識專家。這張照片拍的是保齡球館某一球道的電視計分螢幕，上方或旁邊可能有紅色的球道號碼牌。

請讀出以下資訊：
1. lane：球道號碼。優先看螢幕上方懸掛或牆上的紅色大字球道號碼牌；若看不到或不確定，填 ${selectedLane}。
2. 四位選手的「最終累積總分」p1_score ~ p4_score：
   - 螢幕由上到下有 4 列，分別是第 1~4 位選手。
   - 每一列最右邊是第 10 格，第 10 格「下方」的大字數字才是該局最終總分（0~300）。
   - 第 10 格「上方」的 2~3 個小格是每球擊倒瓶數（例如 9 -、X 7 2），絕對不要讀那些。
   - 數字可能是空心字體（白色外框、黑色內部），請依線條形狀判讀。
   - 若某一列沒有選手或總分看不清楚，該欄位填 null，不要猜。
3. 每位選手的 turkeys（連續三次全倒 X X X 的次數）與 flowers（第一球剩 5、7、10 號瓶的次數）。看不出來就填 0。

只輸出 JSON，不要任何說明文字。`;
}

const RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        lane: { type: Type.INTEGER, nullable: true },
        p1_score: { type: Type.INTEGER, nullable: true },
        p2_score: { type: Type.INTEGER, nullable: true },
        p3_score: { type: Type.INTEGER, nullable: true },
        p4_score: { type: Type.INTEGER, nullable: true },
        p1_turkeys: { type: Type.INTEGER }, p2_turkeys: { type: Type.INTEGER },
        p3_turkeys: { type: Type.INTEGER }, p4_turkeys: { type: Type.INTEGER },
        p1_flowers: { type: Type.INTEGER }, p2_flowers: { type: Type.INTEGER },
        p3_flowers: { type: Type.INTEGER }, p4_flowers: { type: Type.INTEGER },
        confidence: { type: Type.NUMBER },
        description: { type: Type.STRING }
    },
    required: ['p1_score', 'p2_score', 'p3_score', 'p4_score']
};

async function recognizeWithGemini(apiKey, base64, mimeType, selectedLane) {
    const ai = new GoogleGenAI({ apiKey });
    let lastErr = null;
    for (const model of MODELS) {
        try {
            const response = await ai.models.generateContent({
                model,
                contents: [{
                    role: 'user',
                    parts: [
                        { text: buildPrompt(selectedLane) },
                        { inlineData: { mimeType, data: base64 } }
                    ]
                }],
                config: {
                    temperature: 0.1,
                    responseMimeType: 'application/json',
                    responseSchema: RESPONSE_SCHEMA
                }
            });
            let text = (response.text || '').trim();
            const m = text.match(/\{[\s\S]*\}/);
            if (m) text = m[0];
            const data = JSON.parse(text);
            return { model, data, raw: text };
        } catch (e) {
            lastErr = e;
            console.warn(`[recognize] ${model} 失敗:`, e.message);
        }
    }
    throw lastErr || new Error('所有 Gemini 模型皆無回應');
}

module.exports = async (req, res) => {
    if (!requirePost(req, res)) return;
    const body = getBody(req);
    const role = await requireRole(req, res, body, ['admin', 'assistant']);
    if (!role) return;

    const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
    if (!apiKey) return send(res, 503, { ok: false, error: '伺服器尚未設定 Gemini API Key（GEMINI_API_KEY），無法使用拍照辨識，請改用手動輸入。' });

    const selectedLane = parseInt(body.lane, 10) || 1;
    const selectedGame = parseInt(body.game, 10) || 1;
    const image = String(body.image || '');
    const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) return send(res, 400, { ok: false, error: '沒有收到照片資料，請重新拍攝' });
    const mimeType = match[1];
    const base64 = match[2];
    if (base64.length > 6 * 1024 * 1024) return send(res, 413, { ok: false, error: '照片太大，請重新拍攝（系統會自動壓縮，若仍過大請換較低解析度）' });

    try {
        const { model, data, raw } = await recognizeWithGemini(apiKey, base64, mimeType, selectedLane);

        let detectedLane = parseInt(data.lane, 10);
        if (isNaN(detectedLane) || detectedLane < 1 || detectedLane > 60) detectedLane = selectedLane;

        const scores = [data.p1_score, data.p2_score, data.p3_score, data.p4_score].map(s => {
            const c = cleanScore(s);
            return c === null ? '' : c;
        });
        const turkeys = [data.p1_turkeys, data.p2_turkeys, data.p3_turkeys, data.p4_turkeys].map(v => Math.max(0, parseInt(v, 10) || 0));
        const flowers = [data.p1_flowers, data.p2_flowers, data.p3_flowers, data.p4_flowers].map(v => Math.max(0, parseInt(v, 10) || 0));

        const targetLane = detectedLane;
        let players = [];
        try { players = await fetchLane(targetLane); } catch (e) { players = []; }

        await logAction({ lane: targetLane, action: 'AI_RECOGNIZE', details: `model=${model} game=${selectedGame} scores=${scores.join(',')} raw=${raw}`, role });

        return send(res, 200, {
            ok: true,
            engine: `Google ${model}`,
            detectedLane,
            selectedLane,
            laneMatched: detectedLane === selectedLane,
            selectedGame,
            scores,
            turkeys,
            flowers,
            confidence: typeof data.confidence === 'number' ? data.confidence : 0.9,
            message: data.description || 'AI 已讀取計分板',
            players
        });
    } catch (e) {
        console.error('[recognize] 失敗:', e);
        const msg = /API key|PERMISSION_DENIED|API_KEY_INVALID/i.test(e.message)
            ? 'Gemini API Key 無效或已失效，請通知大會管理員更新金鑰；目前請改用手動輸入。'
            : ('AI 辨識失敗：' + e.message);
        await logAction({ lane: selectedLane, action: 'AI_RECOGNIZE_FAIL', details: e.message, role });
        return send(res, 502, { ok: false, error: msg });
    }
};
