/* ==================================================
   qrgen.js — مُرمِّز QR مضغوط (نمط بايت، تصحيح خطأ L، الإصدارات 1–9)
   بلا اعتماديات. يكفي لروابط التحويل القصيرة (حتى ~230 بايت).
   window.QRGen.encode(text) -> { size, modules: boolean[][] }
================================================== */

window.QRGen = (function () {
    "use strict";

    /* -------- حساب حقل جالوا GF(256) -------- */

    const EXP = new Uint8Array(512);
    const LOG = new Uint8Array(256);
    (function initGF() {
        let x = 1;
        for (let i = 0; i < 255; i++) {
            EXP[i] = x;
            LOG[x] = i;
            x <<= 1;
            if (x & 0x100) x ^= 0x11d;
        }
        for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
    })();
    const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

    function rsGenPoly(degree) {
        let poly = [1];
        for (let i = 0; i < degree; i++) {
            const next = new Array(poly.length + 1).fill(0);
            for (let j = 0; j < poly.length; j++) {
                next[j] ^= gfMul(poly[j], EXP[i]);
                next[j + 1] ^= poly[j];
            }
            poly = next;
        }
        return poly;
    }

    function rsEncode(data, ecLen) {
        const gen = rsGenPoly(ecLen);
        const res = new Array(ecLen).fill(0);
        for (let i = 0; i < data.length; i++) {
            const factor = data[i] ^ res[0];
            res.shift();
            res.push(0);
            if (factor !== 0) for (let j = 0; j < ecLen; j++) res[j] ^= gfMul(gen[j], factor);
        }
        return res;
    }

    /* -------- جداول الإصدارات (تصحيح خطأ L، كتل متساوية) -------- */
    // version: [ecPerBlock, numBlocks, totalDataCodewords]
    const L = {
        1: [7, 1, 19], 2: [10, 1, 34], 3: [15, 1, 55], 4: [20, 1, 80],
        5: [26, 1, 108], 6: [18, 2, 136], 7: [20, 2, 156], 8: [24, 2, 194], 9: [30, 2, 232],
    };
    const ALIGN = {
        1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
        6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46],
    };

    function pickVersion(byteLen) {
        for (let v = 1; v <= 9; v++) {
            const capacity = L[v][2] - 2 - 1; // مود(1 بايت) + طول(1 بايت) تقريبيًا
            if (byteLen <= capacity) return v;
        }
        throw new Error("النص أطول من طاقة QR المدعومة هنا.");
    }

    /* -------- بناء تدفّق البِتّات (نمط بايت) -------- */

    function buildData(bytes, version) {
        const bits = [];
        const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };

        push(0b0100, 4);              // نمط بايت
        push(bytes.length, 8);        // عدّاد المحارف (8 بت للإصدارات 1–9)
        for (const b of bytes) push(b, 8);

        const totalData = L[version][2];
        const capacityBits = totalData * 8;
        for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0); // إنهاء
        while (bits.length % 8 !== 0) bits.push(0);

        const codewords = [];
        for (let i = 0; i < bits.length; i += 8) {
            let byte = 0;
            for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
            codewords.push(byte);
        }
        const PAD = [0xec, 0x11];
        let p = 0;
        while (codewords.length < totalData) codewords.push(PAD[p++ % 2]);
        return codewords;
    }

    function interleave(dataCodewords, version) {
        const [ecPerBlock, numBlocks] = L[version];
        const perBlock = dataCodewords.length / numBlocks;
        const dataBlocks = [], ecBlocks = [];
        for (let b = 0; b < numBlocks; b++) {
            const block = dataCodewords.slice(b * perBlock, (b + 1) * perBlock);
            dataBlocks.push(block);
            ecBlocks.push(rsEncode(block, ecPerBlock));
        }
        const out = [];
        for (let i = 0; i < perBlock; i++) for (const blk of dataBlocks) out.push(blk[i]);
        for (let i = 0; i < ecPerBlock; i++) for (const blk of ecBlocks) out.push(blk[i]);
        return out;
    }

    /* -------- مصفوفة الوحدات -------- */

    function newMatrix(size) {
        const m = [], reserved = [];
        for (let r = 0; r < size; r++) {
            m.push(new Array(size).fill(false));
            reserved.push(new Array(size).fill(false));
        }
        return { m, reserved };
    }

    function placeFinder(m, res, r, c) {
        for (let dr = -1; dr <= 7; dr++) {
            for (let dc = -1; dc <= 7; dc++) {
                const rr = r + dr, cc = c + dc;
                if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue;
                res[rr][cc] = true;
                const inRing = (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
                    (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6));
                const inCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
                m[rr][cc] = inRing || inCore;
            }
        }
    }

    function buildMatrix(version, allCodewords, mask) {
        const size = version * 4 + 17;
        const { m, reserved: res } = newMatrix(size);

        placeFinder(m, res, 0, 0);
        placeFinder(m, res, 0, size - 7);
        placeFinder(m, res, size - 7, 0);

        // مؤقّتات
        for (let i = 8; i < size - 8; i++) {
            const on = i % 2 === 0;
            if (!res[6][i]) { m[6][i] = on; res[6][i] = true; }
            if (!res[i][6]) { m[i][6] = on; res[i][6] = true; }
        }

        // أنماط المحاذاة
        const centers = ALIGN[version];
        for (const ar of centers) {
            for (const ac of centers) {
                if ((ar === 6 && ac === 6) || (ar === 6 && ac === size - 7) || (ar === size - 7 && ac === 6)) continue;
                for (let dr = -2; dr <= 2; dr++) {
                    for (let dc = -2; dc <= 2; dc++) {
                        const rr = ar + dr, cc = ac + dc;
                        res[rr][cc] = true;
                        m[rr][cc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
                    }
                }
            }
        }

        // وحدة داكنة + حجز مناطق معلومات الصيغة
        res[size - 8][8] = true; m[size - 8][8] = true;
        for (let i = 0; i < 9; i++) { res[8][i] = true; res[i][8] = true; }
        for (let i = 0; i < 8; i++) { res[8][size - 1 - i] = true; res[size - 1 - i][8] = true; }

        // وضع البِتّات في مسار متعرّج
        const maskFn = MASKS[mask];
        let bitIdx = 0;
        const totalBits = allCodewords.length * 8;
        for (let col = size - 1; col > 0; col -= 2) {
            if (col === 6) col--; // تخطّي عمود المؤقّت
            for (let i = 0; i < size; i++) {
                const upward = ((col + 1) & 2) === 0;
                const row = upward ? size - 1 - i : i;
                for (let k = 0; k < 2; k++) {
                    const c = col - k;
                    if (res[row][c]) continue;
                    let bit = 0;
                    if (bitIdx < totalBits) {
                        const byte = allCodewords[bitIdx >> 3];
                        bit = (byte >> (7 - (bitIdx & 7))) & 1;
                        bitIdx++;
                    }
                    if (maskFn(row, c)) bit ^= 1;
                    m[row][c] = bit === 1;
                }
            }
        }

        placeFormat(m, size, mask);
        return m;
    }

    /* -------- الأقنعة -------- */

    const MASKS = [
        (r, c) => (r + c) % 2 === 0,
        (r) => r % 2 === 0,
        (r, c) => c % 3 === 0,
        (r, c) => (r + c) % 3 === 0,
        (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
        (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
        (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
        (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
    ];

    /* -------- معلومات الصيغة (تصحيح خطأ L) -------- */

    function placeFormat(m, size, mask) {
        const data = (0b01 << 3) | mask; // L = 01
        let rem = data;
        for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) & 1 ? 0b10100110111 : 0);
        let bits = ((data << 10) | rem) ^ 0b101010000010010;

        const get = i => (bits >> i) & 1;
        for (let i = 0; i <= 5; i++) m[8][i] = get(i) === 1;
        m[8][7] = get(6) === 1;
        m[8][8] = get(7) === 1;
        m[7][8] = get(8) === 1;
        for (let i = 9; i < 15; i++) m[14 - i][8] = get(i) === 1;

        for (let i = 0; i <= 7; i++) m[size - 1 - i][8] = get(i) === 1;
        for (let i = 8; i < 15; i++) m[8][size - 15 + i] = get(i) === 1;
    }

    /* -------- تقييم عقوبة القناع -------- */

    function penalty(m) {
        const n = m.length;
        let score = 0;

        for (let r = 0; r < n; r++) {
            let runC = 1, runR = 1;
            for (let c = 1; c < n; c++) {
                if (m[r][c] === m[r][c - 1]) { runC++; if (runC === 5) score += 3; else if (runC > 5) score++; }
                else runC = 1;
                if (m[c][r] === m[c - 1][r]) { runR++; if (runR === 5) score += 3; else if (runR > 5) score++; }
                else runR = 1;
            }
        }
        for (let r = 0; r < n - 1; r++) {
            for (let c = 0; c < n - 1; c++) {
                const v = m[r][c];
                if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
            }
        }
        const pat = [true, false, true, true, true, false, true];
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n - 6; c++) {
                let h = true, vv = true;
                for (let k = 0; k < 7; k++) {
                    if (m[r][c + k] !== pat[k]) h = false;
                    if (m[c + k][r] !== pat[k]) vv = false;
                }
                if (h) score += 40;
                if (vv) score += 40;
            }
        }
        let dark = 0;
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) dark++;
        const percent = (dark * 100) / (n * n);
        score += Math.floor(Math.abs(percent - 50) / 5) * 10;
        return score;
    }

    /* -------- الواجهة -------- */

    function encode(text) {
        const bytes = [];
        for (const ch of unescape(encodeURIComponent(String(text)))) bytes.push(ch.charCodeAt(0));

        const version = pickVersion(bytes.length);
        const dataCw = buildData(bytes, version);
        const all = interleave(dataCw, version);

        let best = null, bestScore = Infinity;
        for (let mask = 0; mask < 8; mask++) {
            const m = buildMatrix(version, all, mask);
            const s = penalty(m);
            if (s < bestScore) { bestScore = s; best = m; }
        }
        return { size: best.length, modules: best };
    }

    /* رسم على canvas */
    function toCanvas(text, pixels) {
        const { size, modules } = encode(text);
        const quiet = 4;
        const total = size + quiet * 2;
        const scale = Math.max(1, Math.floor((pixels || 512) / total));
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = total * scale;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#000000";
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (modules[r][c]) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
            }
        }
        return canvas;
    }

    return { encode, toCanvas, _internals: { L, ALIGN, MASKS, buildData, interleave } };
})();

if (typeof module !== "undefined" && module.exports) module.exports = window.QRGen;
