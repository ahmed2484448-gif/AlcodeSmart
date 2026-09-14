/* ==================================================
   ai.js — المساعد الذكي (يحتاج إنترنت + مفتاح API)
   يدعم: Gemini (طبقة مجانية) و OpenAI-متوافق (OpenAI / OpenRouter / Groq…)
   الرسائل تُرسَل مباشرة من المتصفح إلى مزوّد الذكاء — لا خادم للتطبيق.
================================================== */

window.AI = (function () {
    "use strict";

    const HIST_KEY = "kw_ai_history";
    const NOTICE_KEY = "kw_ai_notice_seen";
    const DEFAULT_GEMINI_KEY = "AQ.Ab8RN6IuSCMlYejmHv44MAqLoaRzWBHjCUVZnMLo_FC_IzlB_w";

    const SYSTEM = [
        "أنت «مساعد الكود الوسيط» داخل تطبيق فلسطيني للتحويل المالي عبر أكواد USSD، يعمل في غزة وبدون إنترنت (عدا هذا المساعد).",
        "الخدمات المدعومة وصيغ الأكواد:",
        "• جوال بي: *110*<1 لصديق أو 2 لتاجر>*<الرقم السري>*<رقم المستلم>*<المبلغ>#",
        "• بال بي لصديق: *370*1*1*<رقم المستلم>*<المبلغ>#",
        "• بال بي لتاجر: *370*2*<رقم المستلم>*<المبلغ>#",
        "• بنك فلسطين: *267# (قائمة، بلا معطيات).",
        "أرقام الجوال الفلسطينية تبدأ بـ 059 أو 056.",
        "ميزات التطبيق: الجهات، سجل العمليات، دفتر الديون والسلف، النسخ الاحتياطي (عادي/مشفّر)، قفل PIN وبصمة، تأكيد صوتي، أوضاع ألوان متعددة، مشاركة عبر رابط/QR.",
        "أجب بالعربية، بإيجاز ووضوح، بلهجة مفهومة للفلسطينيين.",
        "إذا سألك المستخدم عن كود USSD، افككه واشرح كل جزء. لا تطلب الرقم السري أبدًا ولا تعرضه.",
        "لا تدّعي أنك تنفّذ تحويلات — أنت تشرح وترشد فقط.",
        "التطبيق صدقة جارية عن روح شهداء عائلة فرج الله.",
    ].join("\n");

    function cfg() {
        const s = Store.getSettings();
        const c = { provider: "gemini", key: "", model: "", endpoint: "", ...(s.ai || {}) };
        if (!c.key && c.provider === "gemini") c.key = DEFAULT_GEMINI_KEY;
        return c;
    }

    function loadHistory() {
        try { return JSON.parse(localStorage.getItem(HIST_KEY)) || []; } catch (e) { return []; }
    }
    function saveHistory(h) {
        try { localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(-40))); } catch (e) {}
    }
    function clearHistory() {
        try { localStorage.removeItem(HIST_KEY); } catch (e) {}
    }

    /* -------- استدعاء المزوّد -------- */

    async function ask(messages) {
        const c = cfg();
        if (!c.key) throw new Error("أضف مفتاح API من «حول ‹ المساعد الذكي» أولًا.");
        return c.provider === "openai" ? askOpenAI(c, messages) : askGemini(c, messages);
    }

    async function askGemini(c, messages) {
        const model = (c.model || "gemini-flash-latest").replace(/^models\//, "");
        const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
            encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(c.key);
        const contents = messages.map(m => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
        }));
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM }] },
                contents,
                generationConfig: { temperature: 0.6, maxOutputTokens: 900 },
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(errText(res.status, data && data.error && data.error.message));
        const parts = data.candidates && data.candidates[0] && data.candidates[0].content &&
            data.candidates[0].content.parts;
        return (parts && parts.map(p => p.text || "").join("")) || "لم أستطع توليد رد. جرّب صياغة أخرى.";
    }

    async function askOpenAI(c, messages) {
        const endpoint = c.endpoint || "https://api.openai.com/v1/chat/completions";
        const model = c.model || "gpt-4o-mini";
        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + c.key },
            body: JSON.stringify({
                model,
                messages: [{ role: "system", content: SYSTEM }, ...messages],
                temperature: 0.6,
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(errText(res.status, data && data.error && data.error.message));
        return (data.choices && data.choices[0] && data.choices[0].message &&
            data.choices[0].message.content) || "…";
    }

    function errText(status, msg) {
        if (status === 401 || status === 403) return "المفتاح غير صحيح أو منتهي.";
        if (status === 429) return "تجاوزت حد الاستخدام — انتظر قليلًا ثم أعد المحاولة.";
        if (/api[_ ]?key|API_KEY_INVALID|invalid.*key/i.test(msg || "")) return "المفتاح غير صحيح — راجعه في «حول ‹ المساعد الذكي».";
        if (status === 404) return "الموديل غير موجود — اترك خانة الموديل فارغة أو صحّح اسمه.";
        return "تعذّر الاتصال بالمساعد (" + status + ")" + (msg ? ": " + String(msg).slice(0, 120) : "");
    }

    /* -------- الواجهة -------- */

    let overlay = null;
    let sending = false;

    function bubble(role, text) {
        const el = document.createElement("div");
        el.className = "ai-msg ai-" + role;
        el.textContent = text;
        return el;
    }

    function render() {
        const body = overlay.querySelector("#aiBody");
        body.innerHTML = "";
        const hist = loadHistory();
        if (!hist.length) {
            const hint = document.createElement("div");
            hint.className = "ai-empty";
            hint.textContent = "اسألني عن التحويل، أو الصق كود USSD لأفككه لك، أو استفسر عن أي ميزة في التطبيق.";
            body.appendChild(hint);
        }
        hist.forEach(m => body.appendChild(bubble(m.role, m.content)));
        body.scrollTop = body.scrollHeight;
    }

    async function send(text) {
        text = (text || "").trim();
        if (!text || sending) return;
        const input = overlay.querySelector("#aiInput");
        input.value = "";

        const hist = loadHistory();
        hist.push({ role: "user", content: text });
        saveHistory(hist);
        render();

        sending = true;
        overlay.querySelector("#aiSend").disabled = true;
        const body = overlay.querySelector("#aiBody");
        const typing = document.createElement("div");
        typing.className = "ai-msg ai-assistant ai-typing";
        typing.textContent = "…";
        body.appendChild(typing);
        body.scrollTop = body.scrollHeight;

        try {
            const reply = await ask(loadHistory());
            const h2 = loadHistory();
            h2.push({ role: "assistant", content: reply });
            saveHistory(h2);
        } catch (e) {
            const h2 = loadHistory();
            h2.push({ role: "assistant", content: "⚠️ " + (e.message || e) });
            saveHistory(h2);
        } finally {
            sending = false;
            const s = overlay && overlay.querySelector("#aiSend");
            if (s) s.disabled = false;
            render();
        }
    }

    function open() {
        const c = cfg();

        if (!c.key) {
            App.openSheet(`
                <div class="sheet-title">🤖 المساعد الذكي</div>
                <div class="sheet-sub">يحتاج إنترنت ومفتاح API مجاني. رسائلك تُرسَل لمزوّد الذكاء الذي تختاره (لا للتطبيق).</div>
                <button class="main-button" id="aiToSettings" type="button">إعداد المساعد</button>
            `);
            const b = document.getElementById("aiToSettings");
            if (b) b.addEventListener("click", () => {
                App.closeSheet();
                App.go("aboutPage");
                setTimeout(() => {
                    const row = document.getElementById("aiCard");
                    if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
                    const k = document.getElementById("aiKeyInput");
                    if (k) k.focus();
                }, 120);
            });
            return;
        }

        showIntro(openChat);
    }

    /* -------- شاشة الترحيب الكاملة (كرة متوهّجة + حلقات نابضة) -------- */

    function showIntro(next) {
        const intro = document.createElement("div");
        intro.className = "ai-intro";
        intro.innerHTML = `
            <div class="ai-orb-wrap">
                <span class="ai-ring r1"></span>
                <span class="ai-ring r2"></span>
                <span class="ai-ring r3"></span>
                <div class="ai-orb"><span class="ai-eye"></span><span class="ai-eye"></span></div>
            </div>
            <p class="ai-intro-text">مساعدك الذكي جاهز لمساعدتك</p>
            <p class="ai-intro-sub">تطبيق الكود الوسيط</p>
        `;
        document.body.appendChild(intro);

        let done = false;
        const proceed = () => {
            if (done) return;
            done = true;
            intro.classList.add("out");
            setTimeout(() => { intro.remove(); next(); }, 320);
        };
        intro.addEventListener("click", proceed);
        setTimeout(proceed, 1500);
    }

    function openChat() {
        if (overlay) overlay.remove();
        overlay = document.createElement("div");
        overlay.className = "ai-overlay";
        overlay.innerHTML = `
            <div class="ai-head">
                <button id="aiClose" class="ai-back-btn" type="button" title="رجوع للتطبيق">
                    <span class="ai-back-arrow">→</span> رجوع للتطبيق
                </button>
                <span class="ai-head-title">🤖 مساعد الكود الوسيط</span>
                <button id="aiClear" class="ai-clear-btn" type="button" title="مسح المحادثة">🗑</button>
            </div>
            <div class="ai-body" id="aiBody"></div>
            <form class="ai-input-row" id="aiForm">
                <input id="aiInput" type="text" autocomplete="off" placeholder="اكتب سؤالك…">
                <button id="aiSend" type="submit">➤</button>
            </form>
        `;
        document.body.appendChild(overlay);
        render();

        overlay.querySelector("#aiClose").addEventListener("click", () => { overlay.remove(); overlay = null; });
        overlay.querySelector("#aiClear").addEventListener("click", () => { clearHistory(); render(); });
        overlay.querySelector("#aiForm").addEventListener("submit", e => {
            e.preventDefault();
            send(overlay.querySelector("#aiInput").value);
        });
        setTimeout(() => overlay.querySelector("#aiInput").focus(), 80);
    }

    return { open, ask, clearHistory };
})();
