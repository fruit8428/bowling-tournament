/**
 * ocrService.js
 * 智慧保齡球計分板照片辨識引擎 (AI Vision & Local Computer Vision)
 * 支援:
 * 1. Google Gemini Multimodal AI Vision (超高精度辨識球道號碼、4位選手10局完賽總分與獎項)
 * 2. Sharp + Tesseract 本機電腦視覺 (離線/無 API Key 自動備援解析)
 */

const sharp = require('sharp');
const Tesseract = require('tesseract.js');

class OcrService {
    constructor() {
        this.tesseractWorker = null;
    }

    /**
     * 辨識完賽計分板照片
     * @param {Buffer} imageBuffer 照片的二進位資料
     * @param {Object} options { selectedLane, selectedGame, apiKey }
     * @returns {Promise<Object>} 包含球道號碼、4位選手成績、獎項之物件
     */
    async recognizeScoreboard(imageBuffer, options = {}) {
        const { selectedLane = 1, selectedGame = 1, apiKey } = options;
        const geminiApiKey = apiKey || process.env.GEMINI_API_KEY;

        // 策略一：使用 Google Gemini AI Vision (如有設定 API Key)
        if (geminiApiKey) {
            try {
                const aiResult = await this.recognizeWithGemini(imageBuffer, geminiApiKey, options);
                if (aiResult && aiResult.ok) {
                    return aiResult;
                }
            } catch (aiErr) {
                console.warn('[OCR Service] Gemini AI Vision 辨識失敗，切換至本機電腦視覺辨識備援:', aiErr.message);
            }
        }

        // 策略二：使用 Sharp + 本機電腦視覺與 Tesseract OCR
        try {
            const cvResult = await this.recognizeWithLocalCV(imageBuffer, options);
            return cvResult;
        } catch (cvErr) {
            console.error('[OCR Service] 本機電腦視覺解析錯誤:', cvErr);
            return {
                ok: false,
                error: '無法辨識圖片內容，請確認拍攝清晰且包含球道螢幕與計分板。',
                detectedLane: selectedLane,
                scores: ['', '', '', ''],
                turkeys: [0, 0, 0, 0],
                flowers: [0, 0, 0, 0],
                engine: 'none'
            };
        }
    }

    /**
     * Google Gemini Multimodal AI Vision 辨識
     */
    async recognizeWithGemini(imageBuffer, apiKey, options = {}) {
        const { GoogleGenAI } = require('@google/genai');
        const ai = new GoogleGenAI({ apiKey });

        const base64Image = imageBuffer.toString('base64');
        
        let mimeType = 'image/jpeg';
        if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) mimeType = 'image/png';
        else if (imageBuffer[0] === 0x47 && imageBuffer[1] === 0x49) mimeType = 'image/gif';
        else if (imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49) mimeType = 'image/webp';

        const prompt = `
你是一位專業的保齡球賽事視覺辨識專家。
請仔細分析這張保齡球館完賽計分板照片（可能包含上方牆壁/燈箱上的球道牌數字，以及電視螢幕中的 4 位選手計分板）。

請精準讀取並擷取以下資訊：
1. lane: 球道號碼 (Lane Number，通常顯示在電視上方懸掛的球道號碼牌、燈箱或螢幕標題列，例如 24)。若完全無法判斷請填 null。
2. p1_score: 第 1 位選手（第 1 行）的最終總分（通常在第 10 格 Frame 10 下方累計總分欄位，分數介於 0 到 300 之間）。
3. p2_score: 第 2 位選手（第 2 行）的最終總分。
4. p3_score: 第 3 位選手（第 3 行）的最終總分。
5. p4_score: 第 4 位選手（第 4 行）的最終總分。
6. p1_turkeys, p2_turkeys, p3_turkeys, p4_turkeys: 各選手連續 3 次全倒 (Turkey) 的次數（若無或未出現則為 0）。
7. p1_flowers, p2_flowers, p3_flowers, p4_flowers: 各選手全中 (Spare/Strike) 或女性特殊獎項（若無則為 0）。

【輸出格式要求】：
請務必且只輸出合法的 JSON 字串，不要包含任何額外的 Markdown 代碼塊或說明文字，格式範例如下（請依照片實際內容填寫）：
{
  "lane": 8,
  "p1_score": 120,
  "p2_score": 135,
  "p3_score": 110,
  "p4_score": 145,
  "p1_turkeys": 0,
  "p2_turkeys": 0,
  "p3_turkeys": 0,
  "p4_turkeys": 0,
  "p1_flowers": 0,
  "p2_flowers": 0,
  "p3_flowers": 0,
  "p4_flowers": 0,
  "confidence": 0.95,
  "description": "成功識別照片中球道號碼與4位選手得分"
}
`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: prompt },
                        {
                            inlineData: {
                                mimeType,
                                data: base64Image
                            }
                        }
                    ]
                }
            ],
            config: {
                temperature: 0.1,
                responseMimeType: 'application/json'
            }
        });

        const rawText = response.text || '';
        const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(cleanJson);

        const sanitizeScore = (s) => {
            if (s === null || s === undefined || s === '') return '';
            const n = parseInt(s, 10);
            return isNaN(n) ? '' : Math.max(0, Math.min(300, n));
        };

        const laneVal = data.lane !== null && data.lane !== undefined ? parseInt(data.lane, 10) : (options.selectedLane || 1);

        return {
            ok: true,
            engine: 'gemini-ai',
            detectedLane: isNaN(laneVal) ? (options.selectedLane || 1) : laneVal,
            scores: [
                sanitizeScore(data.p1_score),
                sanitizeScore(data.p2_score),
                sanitizeScore(data.p3_score),
                sanitizeScore(data.p4_score)
            ],
            turkeys: [
                parseInt(data.p1_turkeys, 10) || 0,
                parseInt(data.p2_turkeys, 10) || 0,
                parseInt(data.p3_turkeys, 10) || 0,
                parseInt(data.p4_turkeys, 10) || 0
            ],
            flowers: [
                parseInt(data.p1_flowers, 10) || 0,
                parseInt(data.p2_flowers, 10) || 0,
                parseInt(data.p3_flowers, 10) || 0,
                parseInt(data.p4_flowers, 10) || 0
            ],
            confidence: data.confidence || 0.95,
            message: data.description || 'Gemini AI 成功辨識計分板成績'
        };
    }

    /**
     * 本機電腦視覺與圖像預處理 + Tesseract OCR (離線備援)
     */
    async recognizeWithLocalCV(imageBuffer, options = {}) {
        const meta = await sharp(imageBuffer).metadata();
        const width = meta.width;
        const height = meta.height;

        let detectedLane = options.selectedLane || 1;
        let laneCropUrl = '';
        const scores = ['', '', '', ''];
        const turkeys = [0, 0, 0, 0];
        const flowers = [0, 0, 0, 0];

        // 1. 智慧搜尋上方球道號碼牌 (Lane sign - 搜尋影像上方 0% ~ 22% 區塊)
        try {
            const scanH = Math.floor(height * 0.22);
            const { data } = await sharp(imageBuffer)
                .extract({ left: 0, top: 0, width, height: scanH })
                .raw()
                .toBuffer({ resolveWithObject: true });

            let minX = width, maxX = 0, minY = scanH, maxY = 0, redCount = 0;
            for (let y = 0; y < scanH; y++) {
                for (let x = Math.floor(width * 0.15); x < Math.floor(width * 0.85); x++) {
                    const idx = (y * width + x) * 3;
                    const r = data[idx], g = data[idx+1], b = data[idx+2];
                    if (r - Math.max(g, b) > 18) {
                        redCount++;
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }

            if (redCount > 100 && maxX > minX && maxY > minY) {
                const padX = Math.floor((maxX - minX) * 0.25);
                const padY = Math.floor((maxY - minY) * 0.25);
                const cX = Math.max(0, minX - padX);
                const cY = Math.max(0, minY - padY);
                const cW = Math.min(width - cX, (maxX - minX) + padX * 2);
                const cH = Math.min(scanH - cY, (maxY - minY) + padY * 2);

                const crop = await sharp(imageBuffer)
                    .extract({ left: cX, top: cY, width: cW, height: cH })
                    .raw()
                    .toBuffer({ resolveWithObject: true });

                const binarized = Buffer.alloc(cW * cH);
                for (let i = 0, j = 0; i < crop.data.length; i += 3, j++) {
                    const r = crop.data[i], g = crop.data[i+1], b = crop.data[i+2];
                    binarized[j] = (r - Math.max(g, b) > 18) ? 0 : 255;
                }

                const laneSnippet = await sharp(imageBuffer)
                    .extract({ left: cX, top: cY, width: cW, height: cH })
                    .resize(160, null)
                    .png()
                    .toBuffer();
                laneCropUrl = 'data:image/png;base64,' + laneSnippet.toString('base64');

                const imgBuf = await sharp(binarized, { raw: { width: cW, height: cH, channels: 1 } })
                    .resize(320, null, { kernel: 'nearest' })
                    .extend({ top: 30, bottom: 30, left: 30, right: 30, background: '#ffffff' })
                    .png()
                    .toBuffer();

                const res = await Tesseract.recognize(imgBuf, 'eng', { tessedit_char_whitelist: '0123456789' });
                const laneNum = parseInt(res.data.text.replace(/\D/g, ''), 10);
                if (laneNum >= 1 && laneNum <= 40) {
                    detectedLane = laneNum;
                }
            }
        } catch (e) {
            console.log('[OCR Local] Lane sign recognition error:', e.message);
        }

        // 2. 辨識 4 位選手的第 10 格累積總分 (Frame 10 final score)
        function cleanBowlingScore(raw) {
            if (!raw) return '';
            let s = raw.trim();
            s = s.replace(/\"/g, '5')
                 .replace(/[=\)\]\}]/g, '3')
                 .replace(/[CQq]/g, '9')
                 .replace(/[BG]/g, '8')
                 .replace(/[OoD]/g, '0')
                 .replace(/[Il|!]/g, '1')
                 .replace(/[Ss]/g, '5');
            const digits = s.replace(/\D/g, '');
            const num = parseInt(digits, 10);
            return (num >= 0 && num <= 300) ? num : '';
        }

        const configs = [
            { topPct: 0.472, hPct: 0.036 },
            { topPct: 0.600, hPct: 0.036 },
            { topPct: 0.724, hPct: 0.036 },
            { topPct: 0.840, hPct: 0.038 }
        ];
        const sLeft = Math.floor(width * 0.82);
        const sWidth = Math.floor(width * 0.10);
        const scoreCropUrls = ['', '', '', ''];

        for (let i = 0; i < configs.length; i++) {
            const cfg = configs[i];
            const sTop = Math.floor(height * cfg.topPct);
            const sHeight = Math.floor(height * cfg.hPct);

            try {
                const snip = await sharp(imageBuffer)
                    .extract({ left: sLeft, top: sTop, width: sWidth, height: sHeight })
                    .png()
                    .toBuffer();
                scoreCropUrls[i] = 'data:image/png;base64,' + snip.toString('base64');
            } catch (err) {}

            let bestScore = '';
            for (const th of [138, 120, 155]) {
                try {
                    const scoreBuf = await sharp(imageBuffer)
                        .extract({ left: sLeft, top: sTop, width: sWidth, height: sHeight })
                        .resize(250, null, { kernel: 'lanczos3' })
                        .grayscale()
                        .threshold(th)
                        .extend({ top: 35, bottom: 35, left: 35, right: 35, background: '#ffffff' })
                        .png()
                        .toBuffer();

                    const ocrRes = await Tesseract.recognize(scoreBuf, 'eng');
                    const parsed = cleanBowlingScore(ocrRes.data.text);
                    if (parsed !== '') {
                        bestScore = parsed;
                        break;
                    }
                } catch (err) {}
            }
            scores[i] = bestScore !== '' ? bestScore : '';
        }

        const validCount = scores.filter(s => s !== '').length;

        return {
            ok: true,
            engine: 'computer-vision',
            detectedLane,
            scores,
            turkeys,
            flowers,
            laneCropUrl,
            scoreCropUrls,
            confidence: validCount >= 2 ? 0.95 : 0.70,
            message: `本機電腦視覺已辨識完成（辨識出 ${validCount}/4 位選手成績）`
        };
    }
}

module.exports = new OcrService();
