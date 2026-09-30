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
請仔細分析這張保齡球館完賽計分板照片（通常包含球道上方懸掛/牆壁上的紅色球道號碼燈箱或螢幕標題，以及電視螢幕中的 4 位選手計分板）。

【保齡球計分板結構說明】：
1. lane: 球道號碼。請特別注意電視螢幕正上方懸掛/牆壁上的「紅色大字球道號碼」（例如紅色數字 24），請勿看錯成其它數字。若圖片中看到明確球道號碼請填寫；若無法明確辨識則填寫 ${options.selectedLane || 1}。
2. 4 位選手完賽累積總分 (p1_score, p2_score, p3_score, p4_score):
   - 電視螢幕由上至下分為 4 列（分別代表第 1、2、3、4 位選手）。
   - 每位選手在最右側的「第 10 格 (Frame 10)」下方，會有該局打完後的「最終累積總分（累計總成績）」。
   - 請特別注意：第 10 格上方有 2~3 個小方格是擊倒瓶數（例如 9 -, 7 2, 2 1, X 2 6），請絕對不要讀取擊倒瓶數！
   - 請務必只讀取第 10 格最下方的大字最終累積總得分（例如 98, 105, 103, 129），分數介於 0 到 300 之間。
3. 特別獎項：
   - turkeys: 連續三次全倒 (Turkey) 次數（若無請填 0）。
   - flowers: 5+7+10 霸王花分瓶或特殊開花分瓶次數（若無請填 0）。

【輸出格式要求】：
請務必且只輸出合法的 JSON 字串，不要包含任何額外的 Markdown 代碼塊或說明文字，格式範例如下：
{
  "lane": 24,
  "p1_score": 98,
  "p2_score": 105,
  "p3_score": 103,
  "p4_score": 129,
  "p1_turkeys": 0,
  "p2_turkeys": 0,
  "p3_turkeys": 0,
  "p4_turkeys": 0,
  "p1_flowers": 0,
  "p2_flowers": 0,
  "p3_flowers": 0,
  "p4_flowers": 0,
  "confidence": 0.99,
  "description": "成功識別照片中球道號碼與4位選手得分"
}
`;

        let response;
        try {
            response = await ai.models.generateContent({
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
        } catch (e0) {
            try {
                response = await ai.models.generateContent({
                    model: 'gemini-2.0-flash',
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
            } catch (e1) {
                response = await ai.models.generateContent({
                    model: 'gemini-1.5-flash',
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
        }

        }
        const rawText = response.text || '';
        let cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
        if (jsonMatch) cleanJson = jsonMatch[0];
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
        const scoreCropUrls = ['', '', '', ''];

        // 1. 智慧搜尋上方球道號碼牌 (Lane sign - 搜尋影像上方 0% ~ 28% 區塊)
        try {
            const scanH = Math.floor(height * 0.28);
            const { data } = await sharp(imageBuffer)
                .extract({ left: 0, top: 0, width, height: scanH })
                .raw()
                .toBuffer({ resolveWithObject: true });

            let minX = width, maxX = 0, minY = scanH, maxY = 0, redCount = 0;
            for (let y = 0; y < scanH; y++) {
                for (let x = Math.floor(width * 0.15); x < Math.floor(width * 0.85); x++) {
                    const idx = (y * width + x) * 3;
                    const r = data[idx], g = data[idx+1], b = data[idx+2];
                    // 深紅/朱紅色球道號碼牌（排除電視螢幕頂部高藍光之粉紅橫條 b < 130）
                    if (r - Math.max(g, b) > 18 && b < 130) {
                        redCount++;
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }

            if (redCount > 50 && maxX > minX && maxY > minY) {
                const padX = Math.floor((maxX - minX) * 0.25);
                const padY = Math.floor((maxY - minY) * 0.25);
                const cX = Math.max(0, minX - padX);
                const cY = Math.max(0, minY - padY);
                const cW = Math.min(width - cX, (maxX - minX) + padX * 2);
                const cH = Math.min(scanH - cY, (maxY - minY) + padY * 2);

                const laneSnippet = await sharp(imageBuffer)
                    .extract({ left: cX, top: cY, width: cW, height: cH })
                    .resize(160, null)
                    .png()
                    .toBuffer();
                laneCropUrl = 'data:image/png;base64,' + laneSnippet.toString('base64');

                const crop = await sharp(imageBuffer)
                    .extract({ left: cX, top: cY, width: cW, height: cH })
                    .raw()
                    .toBuffer({ resolveWithObject: true });

                const binarized = Buffer.alloc(cW * cH);
                for (let i = 0, j = 0; i < crop.data.length; i += 3, j++) {
                    const r = crop.data[i], g = crop.data[i+1], b = crop.data[i+2];
                    binarized[j] = (r - Math.max(g, b) > 18 && b < 130) ? 0 : 255;
                }

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

        // 2. 智慧保齡球專用字體轉譯函數 (包含空心字、連字與邊緣假字過濾)
        function smartCleanBowlingScore(raw) {
            if (!raw) return '';
            const s = String(raw).trim();

            // 1. 優先提取連續數字組 (通常為 2 位數 50~99 或 3 位數 100~300)
            const digitGroups = s.match(/\d+/g);
            if (digitGroups) {
                for (const grp of digitGroups) {
                    if (grp.length === 2 || grp.length === 3) {
                        const n = parseInt(grp, 10);
                        if (n >= 0 && n <= 300) return n;
                    }
                    if (grp.length === 4) {
                        if (/^100\d$/.test(grp)) return parseInt('10' + grp[3], 10);
                        if (/^1(\d)\1(\d)$/.test(grp)) return parseInt('1' + grp[1] + grp[3], 10);
                        const f3 = parseInt(grp.substring(0, 3), 10);
                        if (f3 >= 30 && f3 <= 300) return f3;
                        const l3 = parseInt(grp.substring(1, 4), 10);
                        if (l3 >= 30 && l3 <= 300) return l3;
                    }
                }
            }

            // 2. 備援：過濾所有非數字字元後為 2~3 位數
            const allDigits = s.replace(/\D/g, '');
            if (allDigits.length === 2 || allDigits.length === 3) {
                const n = parseInt(allDigits, 10);
                if (n >= 0 && n <= 300) return n;
            }

            // 3. 備援：保齡球特殊字符轉譯
            let sub = s.replace(/\"/g, '5')
                       .replace(/[=\)\]\}]/g, '3')
                       .replace(/[CQq]/g, '9')
                       .replace(/[BG&]/g, '8')
                       .replace(/[S]/g, '5');
            const subDigits = sub.replace(/\D/g, '');
            if (subDigits.length === 2 || subDigits.length === 3) {
                const n = parseInt(subDigits, 10);
                if (n >= 30 && n <= 300) return n;
            }

            return '';
        }

        // 3. 鎖定 Frame 10 累計總分格（精確校正比例座標，完美避開第 9 格與上方投球小方格）
        const sLeft = Math.floor(width * 0.835);
        const sWidth = Math.floor(width * 0.130);
        const configs = [
            { topPct: 0.468, hPct: 0.040 },
            { topPct: 0.593, hPct: 0.040 },
            { topPct: 0.718, hPct: 0.040 },
            { topPct: 0.843, hPct: 0.040 }
        ];
        const scoreBoxes = configs.map(c => ({
            left: sLeft,
            top: Math.floor(height * c.topPct),
            width: sWidth,
            height: Math.floor(height * c.hPct)
        }));

        // 4. 逐一提取選手累計成績並過濾紫色/紅色筆跡與邊框
        for (let i = 0; i < 4; i++) {
            const box = scoreBoxes[i];
            try {
                // 擷取原始切圖供記分員核對
                const snip = await sharp(imageBuffer)
                    .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
                    .png()
                    .toBuffer();
                scoreCropUrls[i] = 'data:image/png;base64,' + snip.toString('base64');

                const { data: sData, info: sInfo } = await sharp(imageBuffer)
                    .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
                    .raw()
                    .toBuffer({ resolveWithObject: true });

                // 智慧筆跡過濾：去除紫色筆跡、紅色註記、計分板深藍條
                const cleaned = Buffer.alloc(sInfo.width * sInfo.height * 3);
                for (let y = 0; y < sInfo.height; y++) {
                    for (let x = 0; x < sInfo.width; x++) {
                        const idx = (y * sInfo.width + x) * 3;
                        const r = sData[idx], g = sData[idx+1], b = sData[idx+2];
                        const isPurple = (r > 80 && b > 80 && (r - g > 45) && (b - g > 45));
                        const isRed = (r - g > 50 && r - b > 40);
                        const isBlue = (b > 130 && b - r > 50 && b - g > 40);

                        if (isPurple || isRed || isBlue) {
                            cleaned[idx] = 255;
                            cleaned[idx+1] = 255;
                            cleaned[idx+2] = 255;
                        } else {
                            cleaned[idx] = r;
                            cleaned[idx+1] = g;
                            cleaned[idx+2] = b;
                        }
                    }
                }

                let bestScore = '';
                for (const th of [150, 160, 140, 130]) {
                    try {
                        const scoreBuf = await sharp(cleaned, { raw: { width: sInfo.width, height: sInfo.height, channels: 3 } })
                            .resize(250, null)
                            .grayscale()
                            .threshold(th)
                            .extend({ top: 20, bottom: 20, left: 20, right: 20, background: '#ffffff' })
                            .png()
                            .toBuffer();

                        const ocrRes = await Tesseract.recognize(scoreBuf, 'eng', { 
                            tessedit_pageseg_mode: '6',
                            tessedit_char_whitelist: '0123456789'
                        });
                        const rawText = (ocrRes.data && ocrRes.data.text) ? ocrRes.data.text.trim() : '';
                        const parsed = smartCleanBowlingScore(rawText);
                        if (parsed !== '') {
                            bestScore = parsed;
                            break;
                        }
                    } catch (err) {}
                }
                scores[i] = bestScore !== '' ? bestScore : '';
            } catch (cropErr) {
                console.warn(`[OCR Local] 選手 ${i+1} 辨識錯誤:`, cropErr.message);
            }
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
            message: `本機電腦視覺已辨識完成（球道：第 ${detectedLane} 道，辨識出 ${validCount}/4 位選手成績）`
        };
    }
}

module.exports = new OcrService();

