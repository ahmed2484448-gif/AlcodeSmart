/* ==================================================
   تطبيق الكود الوسيط — script.js
   الهيكل العام + صفحة التحويل + الملخص + التحويلات السريعة
================================================== */

const THEME_KEY = "alkod_alwasit_theme";
const APP_VERSION = "3.0";
// رابط التطبيق المنشور على GitHub Pages — يُستخدم في المشاركة وروابط التحويل
const APP_SHARE_URL = "https://ahmed2484448-gif.github.io/alcode-alwasitussd2026/";
const CHANGELOG = [
    "بطاقاتي: محافظ حقيقية ثلاثية الأبعاد برصيد تديره بنفسك",
    "تحويل سريع بشريط واحد (محفظة ← مستفيد ← مبلغ) بدل عدة صفحات",
    "مركز التحكم ⌘ — وصول سريع للرصيد والتحويل والإجراءات",
    "بطاقة واحدة كحد أقصى لكل جهة تحويل",
    "سجل كل بطاقة الخاص بها (اسحب البطاقة لعرض تاريخها)",
    "تحويل داخلي بين محافظك",
    "وضع الخصوصية — إخفاء الأرقام الحساسة بضغطة",
    "عرض الرصيد بالدولار (اختياري) مقابل الشيكل",
    "هوية بصرية جديدة كاملة وشعار جديد للتطبيق",
    "آخر العمليات صارت بصفحة الإحصائيات",
];


/* ==================================================
   أدوات عامة مشتركة بين الوحدات (window.App)
================================================== */

window.App = {

    esc(v) {
        return String(v == null ? "" : v)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    },

    /* تبديل رقم (رصيد) بحركة: القديم يصعد ويختفي، الجديد يظهر من الأسفل — تحترم تقليل الحركة */
    animateNumberSwap(el, newHtml) {
        if (!el) return;
        const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduced) { el.innerHTML = newHtml; return; }
        el.style.transition = "transform .18s ease, opacity .18s ease";
        el.style.transform = "translateY(-8px)";
        el.style.opacity = "0";
        setTimeout(() => {
            el.innerHTML = newHtml;
            el.style.transition = "none";
            el.style.transform = "translateY(8px)";
            requestAnimationFrame(() => {
                el.style.transition = "transform .22s cubic-bezier(.22,1,.36,1), opacity .22s ease";
                el.style.transform = "translateY(0)";
                el.style.opacity = "1";
            });
        }, 190);
    },

    /* وضع الخصوصية: يعمّي أي رقم مالي حسّاس (رصيد/بطاقة/مبالغ العمليات) بضغطة واحدة، محفوظ بالإعدادات */
    togglePrivacyMode() {
        const on = !Store.getSettings().privacyMode;
        Store.saveSettings({ privacyMode: on });
        document.body.classList.toggle("privacy-mode", on);
        document.querySelectorAll("#privacyEyeBtn").forEach(b => b.textContent = on ? "🙈" : "👁");
        this.haptic("click");
    },

    toast(message) {
        const old = document.querySelector(".toast");
        if (old) old.remove();
        const el = document.createElement("div");
        el.className = "toast";
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2200);
    },

    /* toast مع زر إجراء (تراجع…) */
    toastAction(message, label, onAction) {
        const old = document.querySelector(".toast");
        if (old) old.remove();
        const el = document.createElement("div");
        el.className = "toast update-toast";
        const span = document.createElement("span");
        span.textContent = message;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = label;
        let used = false;
        btn.addEventListener("click", () => { used = true; el.remove(); try { onAction(); } catch (e) {} });
        el.appendChild(span);
        el.appendChild(btn);
        document.body.appendChild(el);
        setTimeout(() => { if (!used) el.remove(); }, 6000);
    },

    vibrate(ms) {
        try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
    },

    /* اهتزاز مختلف الشكل حسب نوع الحدث — "لغة اهتزاز" مميّزة لكل حالة */
    haptic(kind) {
        try {
            if (!navigator.vibrate) return;
            const on = (Store.getSettings().hapticsEnabled !== false);
            if (!on) return;
            const patterns = {
                click: 10,
                nav: 12,
                success: [15, 40, 25],
                warning: [20, 50, 20],
                error: [30, 60, 30, 60, 30],
            };
            navigator.vibrate(patterns[kind] || 10);
        } catch (e) {}
    },

    /* تحوّل الزر إلى شارة نجاح/فشل مؤقتة (Button Morphing) */
    morphButton(el, kind) {
        if (!el) return;
        el.classList.remove("morph-success", "morph-error");
        void el.offsetWidth;
        el.classList.add(kind === "error" ? "morph-error" : "morph-success");
        setTimeout(() => el.classList.remove("morph-success", "morph-error"), 1100);
    },

    /* كبسولة عائمة أعلى الشاشة (Dynamic Island) لحالات عابرة قصيرة */
    island(text, icon, kind) {
        let el = document.getElementById("dynIsland");
        if (!el) {
            el = document.createElement("div");
            el.id = "dynIsland";
            el.className = "dyn-island";
            el.innerHTML = '<span class="di-icon"></span><span class="di-text"></span>';
            document.body.appendChild(el);
        }
        el.querySelector(".di-icon").textContent = icon || "•";
        el.querySelector(".di-text").textContent = text || "";
        el.className = "dyn-island " + (kind || "") + " show";
        clearTimeout(el._hideTimer);
        el._hideTimer = setTimeout(() => el.classList.remove("show"), 2600);
    },

    openSheet(html) {
        const sheet = document.getElementById("sheet");
        document.getElementById("sheetBody").innerHTML = html;
        sheet.classList.remove("hidden");
    },

    closeSheet() {
        document.getElementById("sheet").classList.add("hidden");
    },

    go(pageId) {
        const btn = document.querySelector(
            '.nav-button[data-page="' + pageId + '"]'
        );
        if (btn) btn.click();
    },

    /* تعبئة صفحة التحويل من عملية/جهة والانتقال إليها */
    prefillTransfer(data) {
        App.closeSheet();
        App.go("transferPage");
        setTimeout(() => Transfer.prefill(data), 60);
    },

    /* توهّج حواف الشاشة للحظات المهمّة: "success" | "warning" | "error" */
    edgeFlash(kind) {
        const el = document.getElementById("edgeGlow");
        if (window.Sound) { if (kind === "success") Sound.success(); else if (kind === "error") Sound.error(); }
        App.haptic(kind === "success" ? "success" : kind === "error" ? "error" : "warning");
        if (!el) return;
        el.classList.remove("show");
        el.className = "edge-glow " + kind;
        setTimeout(() => el.classList.add("show"), 20);
        setTimeout(() => el.classList.remove("show"), 650);
    },
};

/* لمعة + صوت نقر خفيف فوق الأزرار الرئيسية عند الضغط عليها */
document.addEventListener("click", e => {
    const soundBtn = e.target.closest(".main-button, .confirm-yes, .mini-btn, .secondary-button");
    if (soundBtn && window.Sound) Sound.click();
    if (soundBtn) App.haptic("click");
    const btn = e.target.closest(".main-button, .confirm-yes");
    if (!btn) return;
    btn.classList.remove("sweep");
    void btn.offsetWidth;
    btn.classList.add("sweep");
});


/* ==================================================
   التنقل بين الصفحات
================================================== */

const navButtons = document.querySelectorAll(".nav-button");
const pages = document.querySelectorAll(".page");
const navIndicator = document.getElementById("navIndicator");

function positionNavIndicator(button) {
    if (!navIndicator || !button) return;
    const icon = button.querySelector(".nav-icon");
    const label = button.querySelector("span:last-child");
    const niIcon = navIndicator.querySelector(".ni-icon");
    const niLabel = navIndicator.querySelector(".ni-label");
    if (niIcon && icon) niIcon.textContent = icon.textContent;
    if (niLabel && label) niLabel.textContent = label.textContent;
    const w = navIndicator.offsetWidth || 40;
    navIndicator.style.left = (button.offsetLeft + button.offsetWidth / 2 - w / 2) + "px";
}

/* تبديل الصفحة النشطة — تُستخدم من أزرار شريط التنقّل */
function switchPage(target) {
    pages.forEach(p => p.classList.remove("active-page"));
    const targetPage = document.getElementById(target);
    if (targetPage) targetPage.classList.add("active-page");

    window.scrollTo({ top: 0, behavior: "smooth" });

    if (target === "transferPage") Transfer.refreshHome();
    if (target === "contactsPage" && window.Contacts) Contacts.render();
    if (target === "historyPage" && window.History) History.render();
    if (target === "debtsPage" && window.Debts) Debts.render();
    if (target === "cardsPage" && window.Cards) Cards.render();
    if (target === "statsPage" && window.Stats) Stats.render();
}
window.switchPage = switchPage;

navButtons.forEach(button => {
    button.addEventListener("click", () => {
        const target = button.dataset.page;

        navButtons.forEach(b => b.classList.remove("active"));
        button.classList.add("active");
        positionNavIndicator(button);
        if (window.Sound) Sound.nav();
        App.haptic("nav");

        switchPage(target);
    });
});

positionNavIndicator(document.querySelector(".nav-button.active"));
window.addEventListener("resize", () => positionNavIndicator(document.querySelector(".nav-button.active")));


/* ==================================================
   الأوضاع (Modes) — زجاجي · نعناعي · بنفسجي · أزرق
================================================== */

const THEMES = [
    { id: "glass",      name: "زجاجي" },
    { id: "mint",       name: "نعناعي" },
    { id: "purple",     name: "بنفسجي" },
    { id: "navy",       name: "أزرق" },
    { id: "berry",      name: "توتي" },
    { id: "aurora",     name: "فخم" },
    { id: "ocean",      name: "المحيط الزجاجي" },
    { id: "midnight",   name: "الواحة الخضراء" },
    { id: "gold",       name: "الذهبي الفاخر" },
    { id: "crystal",    name: "كريستال" },
    { id: "finance",    name: "نيون الأسواق" },
    { id: "liquid",     name: "الزجاج السائل" },
    { id: "neonpurple", name: "البنفسجي النيوني" },
    { id: "titanium",   name: "التيتانيوم الأسود" },
    { id: "holo",       name: "الهولوغرافي" },
    { id: "palestine",  name: "ليلة فلسطين" },
];

const themeButton = document.getElementById("themeButton");
const modeChip = document.getElementById("modeChip");
let _modeChipTimer = null;

function currentTheme() {
    let t = "gold";
    try { t = localStorage.getItem(THEME_KEY) || "gold"; } catch (e) {}
    if (t === "light") t = "mint";
    if (t === "dark") t = "gold";
    return THEMES.some(x => x.id === t) ? t : "gold";
}

/* ألوان أساسية لكل ثيم (نسخة JS من متغيرات CSS) — تُستخدم فقط لحساب مزج الثيمات حيًّا */
const THEME_COLORS = {
    glass:      { bg: "#071119", card: "#0d1a23", primary: "#3fd0c2", primaryHover: "#5ce0d3", text: "#edf8fb" },
    mint:       { bg: "#e9f5f2", card: "#ffffff", primary: "#2bbcae", primaryHover: "#22a99b", text: "#223f3b" },
    purple:     { bg: "#eae7f8", card: "#ffffff", primary: "#7a68d9", primaryHover: "#6a58c9", text: "#2b2750" },
    navy:       { bg: "#eef1f6", card: "#ffffff", primary: "#2e4d8e", primaryHover: "#26417a", text: "#1b2b47" },
    berry:      { bg: "#f8e9ef", card: "#ffffff", primary: "#c94f7c", primaryHover: "#b8426d", text: "#3c2130" },
    aurora:     { bg: "#16112f", card: "#251d4c", primary: "#ab8dff", primaryHover: "#c2aaff", text: "#f2eeff" },
    ocean:      { bg: "#3a3d33", card: "#4d5044", primary: "#d9d0b6", primaryHover: "#e9e0c6", text: "#f5f2e8" },
    midnight:   { bg: "#0e1710", card: "#17241a", primary: "#8fbf6a", primaryHover: "#a8d488", text: "#f1f4ea" },
    gold:       { bg: "#07080b", card: "#13141c", primary: "#e8c874", primaryHover: "#f5da91", text: "#f6f4ee" },
    crystal:    { bg: "#eff6fa", card: "#ffffff", primary: "#4fa8d8", primaryHover: "#3f96c6", text: "#1c3a4a" },
    finance:    { bg: "#060907", card: "#0e1710", primary: "#39ff8f", primaryHover: "#5dffa3", text: "#e8fbe9" },
    liquid:     { bg: "#0a0f24", card: "#131c3d", primary: "#6f8dff", primaryHover: "#8ba3ff", text: "#eef1ff" },
    neonpurple: { bg: "#0d0414", card: "#1c0a2a", primary: "#d94fff", primaryHover: "#e979ff", text: "#f6ecff" },
    titanium:   { bg: "#0c0d0f", card: "#17191c", primary: "#9fb4c2", primaryHover: "#b7c9d4", text: "#eceff2" },
    holo:       { bg: "#0b0813", card: "#171025", primary: "#b98fff", primaryHover: "#d0aeff", text: "#f2ecff" },
};

function hexToRgb(hex) {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function lerpHex(hexA, hexB, t) {
    const a = hexToRgb(hexA), b = hexToRgb(hexB);
    const mix = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return "#" + mix.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}

/* تخصيص الشفافية/التوهّج + مزج الثيمات + الخلفية المعزّزة — تُطبَّق فوق أي ثيم نشط */
function applyThemeCustomization() {
    const s = Store.getSettings();
    const body = document.body;

    if (s.themeGlassOpacity) body.style.setProperty("--glass-opacity", s.themeGlassOpacity + "%");
    else body.style.removeProperty("--glass-opacity");

    if (s.themeGlowAlpha) body.style.setProperty("--glow-alpha", s.themeGlowAlpha + "%");
    else body.style.removeProperty("--glow-alpha");

    body.classList.toggle("wallpaper-enhanced", !!s.enhancedWallpaper);

    const curId = body.dataset.theme;
    const mixId = s.themeMixWith;
    if (mixId && mixId !== curId && THEME_COLORS[mixId] && THEME_COLORS[curId]) {
        const t = Math.max(0, Math.min(100, Number(s.themeMixAmount) || 50)) / 100;
        const a = THEME_COLORS[curId], b = THEME_COLORS[mixId];
        body.style.setProperty("--bg", lerpHex(a.bg, b.bg, t));
        body.style.setProperty("--card", lerpHex(a.card, b.card, t));
        body.style.setProperty("--primary", lerpHex(a.primary, b.primary, t));
        body.style.setProperty("--primary-hover", lerpHex(a.primaryHover, b.primaryHover, t));
        body.style.setProperty("--text", lerpHex(a.text, b.text, t));
    } else {
        ["--bg", "--card", "--primary", "--primary-hover", "--text"].forEach(v => body.style.removeProperty(v));
    }
}

function applyTheme(id, announce) {
    document.body.dataset.theme = id;
    try { localStorage.setItem(THEME_KEY, id); } catch (e) {}
    applyThemeCustomization();

    // لون شريط المتصفح يتبع الوضع
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
        const bg = getComputedStyle(document.body).getPropertyValue("--bg").trim();
        if (bg) meta.setAttribute("content", bg);
    }

    if (announce && modeChip) {
        const name = (THEMES.find(x => x.id === id) || {}).name || id;
        modeChip.textContent = "وضع " + name;
        modeChip.hidden = false;
        requestAnimationFrame(() => modeChip.classList.add("show"));
        clearTimeout(_modeChipTimer);
        _modeChipTimer = setTimeout(() => {
            modeChip.classList.remove("show");
            setTimeout(() => { modeChip.hidden = true; }, 260);
        }, 1600);
    }
}

applyTheme(currentTheme(), false);

/* حركة الخلفية المتحركة (#bgFX) — إيقاف/منخفضة/عادية/كاملة، فوق احترام prefers-reduced-motion دائمًا */
function applyBgMotion(level) {
    document.body.classList.remove("bg-motion-off", "bg-motion-low", "bg-motion-full");
    if (level === "off" || level === "low" || level === "full") {
        document.body.classList.add("bg-motion-" + level);
    }
}
applyBgMotion((Store.getSettings().bgMotion) || "normal");


/* -------- الوضع التلقائي: حسب الوقت (نهار/ليل) أو حسب البطارية -------- */

let _batterySavedTheme = null;

function applyAutoTheme() {
    const s = Store.getSettings();
    if (s.autoThemeMode === "time") {
        const hour = new Date().getHours();
        const isDay = hour >= 6 && hour < 18;
        const target = isDay ? (s.autoThemeDay || "mint") : (s.autoThemeNight || "glass");
        if (document.body.dataset.theme !== target) applyTheme(target, false);
    } else if (s.autoThemeMode === "battery" && navigator.getBattery) {
        navigator.getBattery().then(bat => {
            const low = bat.level <= 0.2 && !bat.charging;
            if (low && document.body.dataset.theme !== "titanium") {
                _batterySavedTheme = document.body.dataset.theme;
                applyTheme("titanium", false);
            } else if (!low && _batterySavedTheme && document.body.dataset.theme === "titanium") {
                applyTheme(_batterySavedTheme, false);
                _batterySavedTheme = null;
            }
        }).catch(() => {});
    }
}

applyAutoTheme();
setInterval(applyAutoTheme, 5 * 60 * 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) applyAutoTheme(); });


function openThemePicker() {
    const cur = document.body.dataset.theme || "glass";
    const s = Store.getSettings();
    const otherThemes = THEMES.filter(t => t.id !== cur);

    App.openSheet(`
        <div class="sheet-title">المظهر</div>
        <div class="sheet-sub">كل مظهر هويّة بصرية كاملة — خلفية وزجاج وإضاءة وألوان. يبقى محفوظًا على جهازك حتى تغيّره.</div>
        <div class="theme-picker">
            ${THEMES.map(t => `
                <button class="theme-swatch ${t.id === cur ? "active" : ""}" data-theme-id="${t.id}" type="button">
                    <span class="tsw-mini" data-theme="${t.id}">
                        <span class="tsw-mini-card"></span>
                        <span class="tsw-mini-btn"></span>
                        <span class="tsw-mini-dot"></span>
                    </span>
                    <span class="tsw-name">${App.esc(t.name)}${t.id === cur ? " ✓" : ""}</span>
                </button>`).join("")}
        </div>

        <div class="theme-section">
            <div class="theme-section-title">تخصيص</div>
            <label class="theme-slider-row">
                <span>شفافية الزجاج</span>
                <input type="range" id="tcGlass" min="35" max="96" step="1" value="${s.themeGlassOpacity || 78}">
            </label>
            <label class="theme-slider-row">
                <span>قوة التوهّج</span>
                <input type="range" id="tcGlow" min="15" max="70" step="1" value="${s.themeGlowAlpha || 45}">
            </label>
            <button class="mini-btn" id="tcReset" type="button">↺ استعادة افتراضي الثيم</button>
        </div>

        <div class="theme-section">
            <div class="theme-section-title">مزج الثيمات</div>
            <div class="theme-sub-hint">امزج الثيم الحالي مع ثيم آخر بأي نسبة تحبّها.</div>
            <select id="tcMixWith" class="theme-select">
                <option value="">بلا مزج</option>
                ${otherThemes.map(t => `<option value="${t.id}" ${s.themeMixWith === t.id ? "selected" : ""}>${App.esc(t.name)}</option>`).join("")}
            </select>
            <label class="theme-slider-row" id="tcMixAmountRow" ${s.themeMixWith ? "" : "hidden"}>
                <span>نسبة المزج</span>
                <input type="range" id="tcMixAmount" min="10" max="90" step="5" value="${s.themeMixAmount || 50}">
            </label>
        </div>

        <div class="theme-section">
            <div class="theme-section-title">الوضع التلقائي</div>
            <div class="theme-auto-row">
                <button class="theme-auto-btn ${s.autoThemeMode === "off" || !s.autoThemeMode ? "active" : ""}" data-auto="off" type="button">إيقاف</button>
                <button class="theme-auto-btn ${s.autoThemeMode === "time" ? "active" : ""}" data-auto="time" type="button">حسب الوقت</button>
                <button class="theme-auto-btn ${s.autoThemeMode === "battery" ? "active" : ""}" data-auto="battery" type="button">حسب البطارية</button>
            </div>
            <div class="theme-sub-hint" id="tcAutoHint"></div>
        </div>

        <div class="theme-section">
            <label class="theme-toggle-row">
                <span>خلفية حيّة معزّزة</span>
                <input type="checkbox" id="tcWallpaper" ${s.enhancedWallpaper ? "checked" : ""}>
            </label>
        </div>
    `);

    document.querySelectorAll("#sheetBody .theme-swatch").forEach(b => {
        b.addEventListener("click", () => {
            Store.saveSettings({ autoThemeMode: "off" });
            applyTheme(b.dataset.themeId, true);
            App.closeSheet();
            try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {}
        });
    });

    const glassInput = document.getElementById("tcGlass");
    const glowInput = document.getElementById("tcGlow");
    glassInput.addEventListener("input", () => {
        Store.saveSettings({ themeGlassOpacity: Number(glassInput.value) });
        applyThemeCustomization();
    });
    glowInput.addEventListener("input", () => {
        Store.saveSettings({ themeGlowAlpha: Number(glowInput.value) });
        applyThemeCustomization();
    });
    document.getElementById("tcReset").addEventListener("click", () => {
        Store.saveSettings({
            themeGlassOpacity: null, themeGlowAlpha: null,
            themeMixWith: "", themeMixAmount: 50,
        });
        glassInput.value = 78; glowInput.value = 45;
        mixSelect.value = ""; mixAmount.value = 50; mixAmountRow.hidden = true;
        applyThemeCustomization();
        App.toast("أُعيد لافتراضي الثيم");
    });

    const mixSelect = document.getElementById("tcMixWith");
    const mixAmountRow = document.getElementById("tcMixAmountRow");
    const mixAmount = document.getElementById("tcMixAmount");
    mixSelect.addEventListener("change", () => {
        Store.saveSettings({ themeMixWith: mixSelect.value });
        mixAmountRow.hidden = !mixSelect.value;
        applyThemeCustomization();
    });
    mixAmount.addEventListener("input", () => {
        Store.saveSettings({ themeMixAmount: Number(mixAmount.value) });
        applyThemeCustomization();
    });

    const autoHint = document.getElementById("tcAutoHint");
    function updateAutoHint(mode) {
        if (mode === "time") autoHint.textContent = "يبدّل تلقائيًا بين ثيم نهاري (6ص–6م) وليلي حسب ساعة جهازك.";
        else if (mode === "battery") autoHint.textContent = navigator.getBattery
            ? "يتحوّل لثيم داكن موفّر عند انخفاض الشحن عن 20٪ بلا شاحن، ويعود عند الشحن."
            : "⚠️ متصفحك لا يدعم قراءة حالة البطارية — هذا الخيار لن يعمل.";
        else autoHint.textContent = "";
    }
    updateAutoHint(s.autoThemeMode);
    document.querySelectorAll(".theme-auto-btn").forEach(b => {
        b.addEventListener("click", () => {
            document.querySelectorAll(".theme-auto-btn").forEach(x => x.classList.remove("active"));
            b.classList.add("active");
            Store.saveSettings({ autoThemeMode: b.dataset.auto });
            updateAutoHint(b.dataset.auto);
            applyAutoTheme();
        });
    });

    document.getElementById("tcWallpaper").addEventListener("change", e => {
        Store.saveSettings({ enhancedWallpaper: e.target.checked });
        applyThemeCustomization();
    });
}

if (themeButton) themeButton.addEventListener("click", openThemePicker);


/* ==================================================
   وضع كبار السن (خط أكبر + تباين + عداد تكبير)
================================================== */

const TEXT_ZOOM_MIN = 100;
const TEXT_ZOOM_MAX = 170;
const TEXT_ZOOM_STEP = 10;

const ZOOM_SUPPORTED = (function () {
    try { return !!(window.CSS && CSS.supports && CSS.supports("zoom", "1.1")); }
    catch (e) { return false; }
})();

function applyTextZoom(pct) {
    if (!ZOOM_SUPPORTED) return;
    document.documentElement.style.zoom = pct ? (pct + "%") : "";
}

function loadDisplayPrefs() {
    let large = false, zoom = 100;
    try {
        const s = Store.getSettings();
        large = s.largeText;
        zoom = s.textZoom || 100;
    } catch (e) {}
    document.body.classList.toggle("large-text", !!large);
    applyTextZoom(large ? zoom : 100);
}
loadDisplayPrefs();

try { document.body.classList.toggle("privacy-mode", !!Store.getSettings().privacyMode); } catch (e) {}


/* ==================================================
   مؤشر حالة الاتصال — إعلامي فقط: التطبيق نفسه (بيانات/محافظ/عمليات USSD) يعمل بالكامل
   بلا إنترنت أصلًا (تخزين محلي صرف)؛ الوحيد المرتبط فعليًا بالإنترنت هو المساعد الذكي.
================================================== */
(function networkStatus() {
    const el = document.getElementById("networkStatus");
    if (!el) return;
    let hideTimer = null;

    function show(kind, text) {
        clearTimeout(hideTimer);
        el.className = "network-status show " + kind;
        el.innerHTML = `<i></i><span>${text}</span>`;
    }
    function hide() { el.classList.remove("show"); }

    window.addEventListener("online", () => {
        show("online", "عاد الاتصال");
        hideTimer = setTimeout(hide, 2500);
    });
})();


/* ==================================================
   المشاركة + "ما الجديد"
================================================== */

function appUrl() { return APP_SHARE_URL; }

function showWhatsNew() {
    App.openSheet(`
        <div class="sheet-title">✨ جديد الإصدار ${App.esc(APP_VERSION)}</div>
        <div class="sheet-sub">شكرًا لاستخدامك التطبيق.</div>
        <ul class="whatsnew-list">
            ${CHANGELOG.map(x => `<li>${App.esc(x)}</li>`).join("")}
        </ul>
        <button class="main-button" id="wnClose" type="button">تمام</button>
    `);
    const b = document.getElementById("wnClose");
    if (b) b.addEventListener("click", () => App.closeSheet());
}

async function nativeShare(text) {
    const url = appUrl();
    if (navigator.share) {
        try { await navigator.share({ title: "الكود الوسيط", text, url }); return true; }
        catch (e) { if (e && e.name === "AbortError") return true; }
    }
    try { await navigator.clipboard.writeText(text + "\n" + url); App.toast("نُسخ الرابط والرسالة 📋"); }
    catch (e) { App.toast(url); }
    return false;
}

function shareForIos() {
    App.openSheet(`
        <div class="sheet-title">🍏 التثبيت على الآيفون</div>
        <div class="sheet-sub">آيفون لا يعرض زر «تثبيت» تلقائيًا — الخطوات يدوية عبر Safari:</div>
        <ol class="ios-steps">
            <li>افتح رابط التطبيق في متصفح <b>Safari</b> (وليس Chrome).</li>
            <li>اضغط زر المشاركة <b>⬆️</b> في الأسفل.</li>
            <li>مرّر واختر <b>«إضافة إلى الشاشة الرئيسية»</b>.</li>
            <li>يظهر التطبيق بأيقونته ويعمل بملء الشاشة وبدون إنترنت.</li>
        </ol>
        <button class="main-button" id="iosShareBtn" type="button">↗ إرسال الرابط + هذه التعليمات</button>
    `);
    const b = document.getElementById("iosShareBtn");
    if (b) b.addEventListener("click", () => {
        App.closeSheet();
        nativeShare(
            "تطبيق الكود الوسيط (يعمل على الآيفون):\n" +
            "١. افتح الرابط في Safari\n" +
            "٢. زر المشاركة ⬆️\n" +
            "٣. «إضافة إلى الشاشة الرئيسية»\n" +
            "صدقة جارية — انشرها."
        );
    });
}

(function shareAndVersion() {
    const iosBtn = document.getElementById("shareIosBtn");
    const wnBtn = document.getElementById("whatsNewBtn");
    if (iosBtn) iosBtn.addEventListener("click", shareForIos);
    if (wnBtn) wnBtn.addEventListener("click", showWhatsNew);

    // إظهار "ما الجديد" تلقائيًا بعد تحديث الإصدار
    try {
        const seen = localStorage.getItem("kw_seen_version");
        if (seen && seen !== APP_VERSION) setTimeout(showWhatsNew, 1200);
        localStorage.setItem("kw_seen_version", APP_VERSION);
    } catch (e) {}
})();


/* ==================================================
   تذكير عند فتح التطبيق (يتغيّر كل مرة)
================================================== */

(function dhikrBanner() {

    const DHIKR = [
        "اذكر الله",
        "هل صليت على الحبيب محمد ﷺ؟",
        "سبحان الله وبحمده، سبحان الله العظيم",
        "أستغفر الله العظيم وأتوب إليه",
        "لا حول ولا قوة إلا بالله",
        "اللهم صل وسلم على نبينا محمد",
        "﴿ أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ ﴾",
        "لا إله إلا الله وحده لا شريك له",
        "سبحان الله والحمد لله ولا إله إلا الله والله أكبر",
        "اللهم إنك عفو تحب العفو فاعف عنا",
        "رضيت بالله ربًا، وبالإسلام دينًا، وبمحمد ﷺ نبيًا",
        "حسبنا الله ونعم الوكيل",
        "اللهم أعنّي على ذكرك وشكرك وحسن عبادتك",
        "لا تنسَ الصلاة على النبي في يوم الجمعة",
    ];

    const KEY = "kw_dhikr_index";
    const banner = document.getElementById("dhikrBanner");
    const textEl = document.getElementById("dhikrText");
    if (!banner) return;

    let i = 0;
    try { i = (Number(localStorage.getItem(KEY)) + 1) % DHIKR.length; } catch (e) {}
    try { localStorage.setItem(KEY, String(i)); } catch (e) {}

    textEl.textContent = DHIKR[i] || DHIKR[0];
    banner.classList.remove("hidden");
    requestAnimationFrame(() => banner.classList.add("show"));

    const dismiss = () => {
        banner.classList.remove("show");
        setTimeout(() => banner.classList.add("hidden"), 350);
    };

    document.getElementById("dhikrClose").addEventListener("click", dismiss);
    setTimeout(dismiss, 7000);

})();


/* ==================================================
   الورقة السفلية — إغلاق بالخلفية
================================================== */

document.getElementById("sheetOverlay")
    .addEventListener("click", () => App.closeSheet());


/* ==================================================
   إجراءات سريعة: مسح QR + استلم تحويلًا
================================================== */

(function quickActions() {
    const scan = document.getElementById("scanQrBtn");
    const receive = document.getElementById("receiveBtn");
    const sendBtn = document.getElementById("sendActionBtn");
    const topUpBtn = document.getElementById("topUpActionBtn");
    if (scan) scan.addEventListener("click", () => App.scanQR && App.scanQR());
    if (receive) receive.addEventListener("click", () => App.receiveSheet && App.receiveSheet());
    if (sendBtn) sendBtn.addEventListener("click", () => {
        if (window.Composer) Composer.openCommandCenter();
        else {
            const target = document.querySelector(".services");
            if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    });
    if (topUpBtn) topUpBtn.addEventListener("click", () => {
        if (window.Cards) Cards.topUpActive();
    });

    const aiFab = document.getElementById("aiFab");
    if (aiFab) aiFab.addEventListener("click", () => { if (window.AI) AI.open(); });

    const soundToggleButton = document.getElementById("soundToggleButton");
    function syncSoundButton() {
        if (!soundToggleButton || !window.Sound) return;
        const on = Sound.isEnabled();
        soundToggleButton.textContent = on ? "🔊" : "🔇";
        soundToggleButton.classList.toggle("muted", !on);
        soundToggleButton.setAttribute("aria-label", on ? "كتم الأصوات" : "تشغيل الأصوات");
    }
    if (soundToggleButton) soundToggleButton.addEventListener("click", () => {
        if (window.Sound) Sound.toggle();
        syncSoundButton();
    });
    syncSoundButton();

    const quickBackup = document.getElementById("quickBackupBtn");
    if (quickBackup) quickBackup.addEventListener("click", () => {
        const btn = document.getElementById("exportBtn");
        if (btn) btn.click(); else App.toast("انتقل لـ«حول» ‹ «النسخ الاحتياطي»");
    });
    const quickLock = document.getElementById("quickLockBtn");
    if (quickLock) quickLock.addEventListener("click", () => {
        if (!Store.getSettings().pinEnabled) { App.toast("فعّل رمز القفل أولًا من «الأمان» أدناه"); return; }
        if (window.Lock) Lock.guard();
    });
})();


/* ==================================================
   بحث عام (جهات + سجل)
================================================== */

(function globalSearch() {
    const btn = document.getElementById("searchButton");
    if (!btn) return;

    function results(q) {
        const r = Store.search(q);
        if (!q.trim()) return '<p class="sheet-sub">اكتب اسمًا أو رقمًا أو ملاحظة…</p>';
        if (!r.contacts.length && !r.operations.length) return '<p class="sheet-sub">لا نتائج.</p>';

        let html = "";
        if (r.contacts.length) {
            html += '<div class="search-group">الجهات</div>';
            html += r.contacts.map(c => `
                <button class="sheet-menu-btn" data-kind="c" data-id="${c.id}" type="button">
                    <span style="flex:1;text-align:right;">
                        ${App.esc(c.name)}
                        <br><small style="color:var(--muted);font-weight:400;">${App.esc(Store.maskPhone(c.phone))}</small>
                    </span>
                </button>`).join("");
        }
        if (r.operations.length) {
            html += '<div class="search-group">العمليات</div>';
            html += r.operations.map(o => `
                <button class="sheet-menu-btn" data-kind="o" data-id="${o.id}" type="button">
                    <span style="flex:1;text-align:right;">
                        ${App.esc(o.name || o.serviceName || "عملية")}
                        ${o.amount ? " — " + Store.money(o.amount) + " ₪" : ""}
                        <br><small style="color:var(--muted);font-weight:400;">
                            ${App.esc([o.serviceName, o.phone ? Store.maskPhone(o.phone) : "", Store.relativeDay(o.ts)].filter(Boolean).join(" • "))}
                        </small>
                    </span>
                </button>`).join("");
        }
        return html;
    }

    function bindRows() {
        document.querySelectorAll("#sheetBody .sheet-menu-btn[data-kind]").forEach(b => {
            b.addEventListener("click", () => {
                const id = b.dataset.id;
                App.closeSheet();
                if (b.dataset.kind === "c" && window.Contacts) {
                    App.go("contactsPage");
                    setTimeout(() => Contacts.detailSheet(id), 80);
                } else if (b.dataset.kind === "o" && window.History) {
                    App.go("historyPage");
                    setTimeout(() => History.openOp(id), 80);
                }
            });
        });
    }

    btn.addEventListener("click", () => {
        App.openSheet(`
            <div class="sheet-title">بحث</div>
            <div class="input-group"><input id="gSearch" type="search" placeholder="اسم، رقم، خدمة، ملاحظة…" autocomplete="off"></div>
            <div id="gResults">${results("")}</div>
        `);
        const inp = document.getElementById("gSearch");
        setTimeout(() => inp.focus(), 80);
        inp.addEventListener("input", () => {
            document.getElementById("gResults").innerHTML = results(inp.value);
            bindRows();
        });
    });
})();


/* ==================================================
   صفحة التحويل
================================================== */

const Transfer = (function () {

    let selectedService = "";
    let selectedPayment = "";
    let selectedCardId = null;
    let currentUSSD = "";
    let currentContactId = null;
    let _phoneWarnAck = false;
    let _dupAck = false;

    const $ = id => document.getElementById(id);

    const serviceButtons = document.querySelectorAll(".service");
    const paymentButtons = document.querySelectorAll(".payment-type");
    const paymentSection = $("paymentSection");
    const receiverGroup = $("receiverGroup");
    const amountGroup = $("amountGroup");
    const notesGroup = $("notesGroup");
    const saveContactRow = $("saveContactRow");
    const receiverInput = $("receiver");
    const amountInput = $("amount");
    const notesInput = $("notes");
    const receiverName = $("receiverName");
    const createButton = $("createButton");
    const resultSection = $("resultSection");
    const resultMessage = $("resultMessage");
    const ussdCode = $("ussdCode");
    const callButton = $("callButton");
    const copyButton = $("copyButton");

    const confirmModal = $("confirmModal");
    const confirmCallButton = $("confirmCallButton");
    const cancelCallButton = $("cancelCallButton");
    const confirmService = $("confirmService");
    const confirmPayment = $("confirmPayment");
    const confirmReceiver = $("confirmReceiver");
    const confirmAmount = $("confirmAmount");
    const confirmPaymentRow = $("confirmPaymentRow");
    const confirmReceiverRow = $("confirmReceiverRow");
    const confirmAmountRow = $("confirmAmountRow");

    const show = el => el && el.classList.remove("hidden");
    const hide = el => el && el.classList.add("hidden");


    /* -------- اختيار الخدمة -------- */

    serviceButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            serviceButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            selectedService = btn.dataset.service || "";
            selectedPayment = "";
            paymentButtons.forEach(b => b.classList.remove("active"));
            updateFields();
            renderSourceCard();
            hide(resultSection);
        });
    });

    /* -------- بطاقة المصدر (اختياري) — لو عند المستخدم بطاقة على نفس الشبكة -------- */

    function renderSourceCard() {
        const wrap = $("sourceCardWrap");
        if (!wrap) return;
        const cards = Store.cardsForNetwork(selectedService);
        if (!cards.length) {
            selectedCardId = null;
            wrap.classList.add("hidden");
            wrap.innerHTML = "";
            return;
        }
        if (!cards.some(c => c.id === selectedCardId)) selectedCardId = cards[0].id;

        wrap.classList.remove("hidden");
        wrap.innerHTML = cards.map(c => `
            <button type="button" class="source-card-chip ${c.id === selectedCardId ? "active" : ""}" data-id="${c.id}">
                من بطاقة: ${App.esc(c.name)} — ${Store.money(c.balance || 0)} ₪
            </button>`).join("");
        wrap.querySelectorAll(".source-card-chip").forEach(b => {
            b.addEventListener("click", () => { selectedCardId = b.dataset.id; renderSourceCard(); });
        });
    }

    paymentButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            if (selectedService === "bank") return;
            paymentButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            selectedPayment = btn.dataset.type || "";
        });
    });

    /* -------- مزامنة صامتة: بطاقة الواجهة في لوحة التحكم → جهة التحويل -------- */

    function selectServiceSilently(network, cardId) {
        if (!network) return;
        const btn = Array.from(serviceButtons).find(b => b.dataset.service === network);
        if (!btn) return;
        if (selectedService !== network) {
            serviceButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            selectedService = network;
            selectedPayment = "";
            paymentButtons.forEach(b => b.classList.remove("active"));
            updateFields();
        }
        if (cardId) selectedCardId = cardId;
        renderSourceCard();
    }

    function updateFields() {
        const svc = Store.SERVICES[selectedService];
        if (!svc || !svc.needsData) {
            hide(paymentSection); hide(receiverGroup);
            hide(amountGroup); hide(notesGroup); hide(saveContactRow);
            selectedPayment = "";
            paymentButtons.forEach(b => b.classList.remove("active"));
            return;
        }
        show(paymentSection); show(receiverGroup);
        show(amountGroup); show(notesGroup); show(saveContactRow);
    }


    /* -------- رقم المستلم ↔ الجهات -------- */

    receiverInput.addEventListener("input", () => {
        currentContactId = null;
        const num = Store.cleanNum(receiverInput.value);
        const match = Store.getContacts().find(
            c => Store.cleanNum(c.phone) === num
        );
        if (match) {
            currentContactId = match.id;
            receiverName.textContent = "👤 " + match.name;
            $("saveContactCheck").checked = false;
        } else {
            receiverName.textContent = "";
        }
    });

    $("pickContactBtn").addEventListener("click", () => {
        pickContact(c => {
            receiverInput.value = c.phone;
            receiverInput.dispatchEvent(new Event("input"));
            if (c.network && Store.SERVICES[c.network]) {
                const sb = document.querySelector(
                    '.service[data-service="' + c.network + '"]'
                );
                if (sb) sb.click();
            }
        });
    });

    document.querySelectorAll(".amount-chips button").forEach(b => {
        b.addEventListener("click", () => {
            amountInput.value = b.dataset.amt;
        });
    });


    /* -------- آلة حاسبة مصغّرة لحساب المبلغ -------- */

    (function miniCalc() {
        const toggleBtn = $("calcToggle");
        const calcBox = $("miniCalc");
        const display = $("calcDisplay");
        const resultRow = $("calcResultRow");
        const resultValue = $("calcResultValue");
        const addBtn = $("calcAddBtn");
        if (!toggleBtn || !calcBox || !display) return;

        let acc = null;        // القيمة المتراكمة
        let pendingOp = null;  // العملية المعلّقة
        let cur = "0";         // الرقم قيد الإدخال
        let freshEntry = true; // التالي رقم جديد يمسح العرض
        let lastResult = null; // آخر نتيجة محسوبة (لزر «إضافة المبلغ»)

        const render = () => { display.textContent = cur; };
        const toNum = s => parseFloat(s) || 0;
        const hideResult = () => { if (resultRow) resultRow.hidden = true; lastResult = null; };

        function calc(a, b, o) {
            if (o === "+") return a + b;
            if (o === "−") return a - b;
            if (o === "×") return a * b;
            if (o === "÷") return b === 0 ? NaN : a / b;
            return b;
        }
        function fmt(n) {
            if (!isFinite(n)) return "خطأ";
            return String(Math.round(n * 100) / 100);
        }
        function digit(d) {
            hideResult();
            if (freshEntry) { cur = "0"; freshEntry = false; }
            if (d === ".") { if (!cur.includes(".")) cur += "."; }
            else cur = cur === "0" ? d : cur + d;
            if (cur.replace(/[.-]/g, "").length > 9) cur = cur.slice(0, -1);
            render();
        }
        function chooseOp(o) {
            hideResult();
            const n = toNum(cur);
            acc = (pendingOp && !freshEntry) ? calc(acc, n, pendingOp) : n;
            pendingOp = o;
            cur = fmt(acc);
            freshEntry = true;
            render();
        }
        function equals() {
            if (pendingOp === null) return;
            const r = calc(acc, toNum(cur), pendingOp);
            cur = fmt(r);
            acc = null; pendingOp = null; freshEntry = true;
            render();
            if (isFinite(r) && resultRow && resultValue) {
                lastResult = Math.round(r * 100) / 100;
                resultValue.textContent = lastResult;
                resultRow.hidden = false;
            } else {
                hideResult();
            }
        }
        function clearAll() {
            cur = "0"; acc = null; pendingOp = null; freshEntry = true;
            hideResult();
            render();
        }
        function backspace() {
            hideResult();
            if (freshEntry) return;
            cur = cur.length > 1 ? cur.slice(0, -1) : "0";
            render();
        }

        calcBox.querySelectorAll("[data-calc]").forEach(btn => {
            btn.addEventListener("click", () => {
                const v = btn.dataset.calc;
                if (v === "clear") clearAll();
                else if (v === "back") backspace();
                else if (v === "=") equals();
                else if (v === "+" || v === "−" || v === "×" || v === "÷") chooseOp(v);
                else digit(v);
            });
        });

        toggleBtn.addEventListener("click", () => {
            calcBox.hidden = !calcBox.hidden;
            if (!calcBox.hidden) clearAll();
        });

        if (addBtn) addBtn.addEventListener("click", () => {
            if (lastResult === null || lastResult <= 0) { App.toast("لا يوجد ناتج صالح لإضافته"); return; }
            amountInput.value = lastResult;
            App.toast("أُضيف المبلغ: " + lastResult + " ₪");
        });
    })();


    /* -------- منتقي الجهات -------- */

    function pickContact(cb) {
        const list = Store.getContacts();
        const rows = list.length
            ? list.map(c => `
                <button class="sheet-menu-btn" data-id="${c.id}" type="button">
                    <span class="contact-avatar" style="width:34px;height:34px;font-size:13px;">
                        ${(window.PhotoDB && PhotoDB.get(c.id)) ? `<img src="${PhotoDB.get(c.id)}">` : App.esc(c.name.charAt(0))}
                    </span>
                    <span style="flex:1;text-align:right;">
                        ${App.esc(c.name)}
                        <br><small style="color:var(--muted);font-weight:400;">
                            ${App.esc(Store.maskPhone(c.phone))}
                        </small>
                    </span>
                </button>`).join("")
            : `<p class="sheet-sub">لا توجد جهات محفوظة بعد.</p>`;

        App.openSheet(`
            <div class="sheet-title">اختر جهة</div>
            <div class="sheet-sub">${list.length} جهة</div>
            ${rows}
        `);

        document.querySelectorAll("#sheetBody .sheet-menu-btn[data-id]").forEach(b => {
            b.addEventListener("click", () => {
                const c = Store.getContact(b.dataset.id);
                App.closeSheet();
                if (c) cb(c);
            });
        });
    }


    /* -------- إنشاء الكود -------- */

    function createCode() {
        if (!selectedService) {
            App.toast("اختر جهة التحويل أولًا");
            return;
        }

        if (selectedService === "bank") {
            currentUSSD = Store.buildCode({ service: "bank" });
            ussdCode.textContent = currentUSSD;
            resultMessage.textContent = "تم تجهيز كود بنك فلسطين.";
            updateCallButton();
            show(resultSection);
            openConfirm();
            return;
        }

        if (!selectedPayment) { App.toast("اختر طريقة الدفع"); return; }

        const receiver = Store.cleanNum(receiverInput.value);
        const amount = Store.cleanAmt(amountInput.value);

        if (!receiver) { App.toast("أدخل رقم المستلم"); receiverInput.focus(); return; }
        if (!amount || Number(amount) <= 0) {
            App.toast("أدخل مبلغًا صحيحًا"); amountInput.focus(); return;
        }

        // تنبيه صيغة الرقم
        const pv = Store.validatePhone(receiver, selectedService);
        if (pv.warn && !_phoneWarnAck) {
            _phoneWarnAck = true;
            App.toast(pv.warn + " — اضغط مجددًا للمتابعة");
            return;
        }
        _phoneWarnAck = false;

        // تنبيه العملية المكرّرة
        const dup = Store.recentDuplicate(receiver, amount);
        if (dup && !_dupAck) {
            _dupAck = true;
            const mins = Math.max(1, Math.round((Date.now() - dup.ts) / 60000));
            App.openSheet(`
                <div class="sheet-title">⚠️ عملية مشابهة قريبة</div>
                <div class="sheet-sub">
                    حوّلت لنفس الرقم (${App.esc(Store.maskPhone(receiver))})
                    نفس المبلغ (${Store.money(amount)} ₪) قبل ${mins} دقيقة تقريبًا.
                </div>
                <button class="sheet-menu-btn danger" id="dupGo" type="button">تابع رغم ذلك</button>
                <button class="sheet-menu-btn" id="dupNo" type="button">إلغاء</button>
            `);
            document.getElementById("dupGo").addEventListener("click", () => {
                App.closeSheet();
                createCode();
            });
            document.getElementById("dupNo").addEventListener("click", () => {
                _dupAck = false;
                App.closeSheet();
            });
            return;
        }
        _dupAck = false;

        if (selectedService === "palpay") {
            currentUSSD = Store.buildCode({
                service: "palpay", payment: selectedPayment, receiver, amount,
            });
            ussdCode.textContent = currentUSSD;
            resultMessage.textContent = "تم تجهيز كود بال بي.";
        } else {
            // جوال بي — الرقم السري يُطلب وقت التنفيذ
            currentUSSD = "";
            ussdCode.textContent = "سيُطلب الرقم السري";
            resultMessage.textContent = "بعد التأكيد أدخل الرقم السري لجوال بي.";
        }

        updateCallButton();
        show(resultSection);
        openConfirm();
    }

    createButton.addEventListener("click", createCode);

    const shareBtn = $("shareTransferBtn");
    if (shareBtn) shareBtn.addEventListener("click", () => {
        if (!selectedService || selectedService === "bank") {
            App.toast("اختر خدمة ورقمًا أولًا");
            return;
        }
        const phone = Store.cleanNum(receiverInput.value);
        if (!phone) { App.toast("أدخل رقم المستلم"); return; }
        App.shareTransfer({
            service: selectedService,
            payment: selectedPayment || "friend",
            phone,
            amount: Store.cleanAmt(amountInput.value),
        }, "رابط تحويل عبر الكود الوسيط");
    });


    function updateCallButton() {
        if (!callButton) return;
        if (!currentUSSD) { callButton.removeAttribute("href"); return; }
        callButton.href = Store.telHref(currentUSSD);
    }


    /* -------- نافذة التأكيد -------- */

    /* -------- التأكيد الصوتي -------- */

    function digitsToSpeech(num) {
        return String(num || "").replace(/\s+/g, "").split("").join(" ");
    }

    function speakConfirmation() {
        try {
            if (!("speechSynthesis" in window)) return false;
            if (!Store.getSettings().voiceConfirm) return false;

            let text;
            if (selectedService === "bank") {
                text = "كود بنك فلسطين جاهز. تأكد منّه منيح وبعدين دوس ع تأكيد.";
            } else {
                const amount = Store.cleanAmt(amountInput.value);
                const phone = Store.cleanNum(receiverInput.value);
                const svc = (Store.SERVICES[selectedService] || {}).name || "";
                const pay = selectedPayment === "merchant" ? "لتاجر" : "لصاحبك";
                text = "رح تحوّل " + amount + " شيكل " + pay + "، عالرقم "
                    + digitsToSpeech(phone) + "، عن طريق " + svc + ". تأكد منها منيح وبعدين دوس ع تأكيد.";
            }

            speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.rate = 0.92;
            // نفضّل أقرب لهجة شامية متاحة على الجهاز (فلسطين/الأردن/لبنان/سوريا) بدل السعودية الافتراضية
            const voices = speechSynthesis.getVoices();
            const levantine = ["ar-PS", "ar-JO", "ar-LB", "ar-SY", "ar-IQ"];
            let chosen = null;
            for (const code of levantine) {
                chosen = voices.find(v => (v.lang || "").toLowerCase() === code.toLowerCase());
                if (chosen) break;
            }
            if (!chosen) chosen = voices.find(v => /^ar/i.test(v.lang));
            if (chosen) { u.voice = chosen; u.lang = chosen.lang; }
            else u.lang = "ar-JO";
            speechSynthesis.speak(u);
            return true;
        } catch (e) { return false; }
    }

    function stopVoice() {
        try { if ("speechSynthesis" in window) speechSynthesis.cancel(); } catch (e) {}
    }

    const replayBtn = $("replayVoice");
    if (replayBtn) replayBtn.addEventListener("click", speakConfirmation);


    /* -------- نافذة التأكيد -------- */

    function openConfirm() {
        confirmService.textContent =
            (Store.SERVICES[selectedService] || {}).name || "-";

        if (selectedService === "bank") {
            hide(confirmPaymentRow); hide(confirmReceiverRow); hide(confirmAmountRow);
        } else {
            show(confirmPaymentRow); show(confirmReceiverRow); show(confirmAmountRow);
            confirmPayment.textContent = Store.PAYMENTS[selectedPayment] || "-";
            confirmReceiver.textContent =
                Store.maskPhone(receiverInput.value) || "-";
            const a = Store.cleanAmt(amountInput.value);
            confirmAmount.textContent = a ? a + " شيكل" : "-";
        }

        confirmModal.classList.remove("hidden");
        const spoke = speakConfirmation();
        if (replayBtn) replayBtn.hidden = !spoke;
    }

    function closeConfirm() { confirmModal.classList.add("hidden"); stopVoice(); }
    cancelCallButton.addEventListener("click", closeConfirm);


    /* -------- طلب الرقم السري لجوال بي -------- */

    function askPassword() {
        return new Promise(resolve => {
            const m = document.createElement("div");
            m.className = "confirm-modal";
            m.innerHTML = `
                <div class="confirm-overlay"></div>
                <div class="confirm-box">
                    <div class="confirm-icon">🔐</div>
                    <h2>الرقم السري</h2>
                    <p class="confirm-text">أدخل الرقم السري لجوال بي لإكمال العملية.</p>
                    <div class="input-group" style="text-align:right;margin-top:14px;">
                        <input id="pwd" type="password" inputmode="numeric"
                               autocomplete="off" placeholder="الرقم السري">
                    </div>
                    <div class="confirm-buttons">
                        <button id="pwdOk" class="confirm-yes" type="button">✓ متابعة</button>
                        <button id="pwdNo" class="confirm-no" type="button">إلغاء</button>
                    </div>
                </div>`;
            document.body.appendChild(m);

            const inp = m.querySelector("#pwd");
            setTimeout(() => inp.focus(), 80);

            const done = v => { m.remove(); resolve(v); };
            m.querySelector("#pwdOk").addEventListener("click", () => {
                const p = Store.cleanNum(inp.value);
                if (!p) { App.toast("أدخل الرقم السري"); return; }
                done(p);
            });
            m.querySelector("#pwdNo").addEventListener("click", () => done(null));
            m.querySelector(".confirm-overlay").addEventListener("click", () => done(null));
            inp.addEventListener("keydown", e => {
                if (e.key === "Enter") m.querySelector("#pwdOk").click();
                if (e.key === "Escape") done(null);
            });
        });
    }


    /* -------- تنفيذ العملية -------- */

    confirmCallButton.addEventListener("click", async () => {
        closeConfirm();

        let pin = null;
        if (selectedService === "jawwal") {
            pin = await askPassword();
            if (!pin) return;
        }

        const receiver = Store.cleanNum(receiverInput.value);
        const amount = Store.cleanAmt(amountInput.value);

        // تحقّق من كفاية رصيد البطاقة المصدر (إن اختير المستخدم واحدة) قبل أي كود أو اتصال
        if (selectedCardId && selectedService !== "bank") {
            const srcCard = Store.getCard(selectedCardId);
            if (srcCard && Number(srcCard.balance || 0) < Number(amount)) {
                App.toast("الرصيد غير كافٍ لإتمام العملية");
                App.edgeFlash("error");
                if (window.Cards) Cards.flashBalanceFail(selectedCardId);
                return;
            }
        }

        currentUSSD = Store.buildCode({
            service: selectedService,
            payment: selectedPayment,
            receiver, amount, pin,
        });

        if (!currentUSSD) { App.toast("تعذّر إنشاء الكود"); App.edgeFlash("error"); App.morphButton(createButton, "error"); return; }

        // نعرض ونحفظ نسخة مقنّعة؛ الكود الحقيقي (بالرقم السري) يبقى في الذاكرة فقط للاتصال
        const safeCode = Store.redactCode(currentUSSD);
        ussdCode.textContent = safeCode;
        resultMessage.textContent = "تم إنشاء الكود.";
        updateCallButton();

        // حفظ الجهة إن طُلب
        let contactId = currentContactId;
        if (
            selectedService !== "bank" &&
            $("saveContactCheck").checked && receiver && !contactId
        ) {
            contactId = Store.saveContact({
                name: "جهة " + receiver.slice(-4),
                phone: receiver,
                network: selectedService,
                type: selectedPayment === "merchant" ? "merchant" : "friend",
                favorite: false,
            });
        }

        // تسجيل العملية كـ "قيد التنفيذ" حتى يؤكّد المستخدم نتيجتها بعد الاتصال
        const op = Store.addOp({
            contactId,
            cardId: selectedCardId,
            name: contactId ? (Store.getContact(contactId) || {}).name : "",
            phone: selectedService === "bank" ? "" : receiver,
            service: selectedService,
            payment: selectedPayment,
            amount: selectedService === "bank" ? 0 : Number(amount),
            notes: notesInput.value.trim(),
            code: safeCode,
            status: "pending",
        });
        if (window.OpResult) OpResult.markPending(op.id);

        _dupAck = false;
        _phoneWarnAck = false;
        if (window.Sound) Sound.processing();
        App.edgeFlash("success");
        App.morphButton(createButton, "success");
        window.location.href = Store.telHref(currentUSSD);
    });


    /* -------- نسخ الكود -------- */

    /* لو الكود يحوي رقمًا سريًا، امسحه من الحافظة بعد دقيقة إن بقي كما هو */
    function scheduleClipboardClear(value) {
        if (Store.redactCode(value) === value) return; // بلا سر
        setTimeout(async () => {
            try {
                const cur = await navigator.clipboard.readText();
                if (cur === value) {
                    await navigator.clipboard.writeText("");
                    App.toast("مُسح الكود من الحافظة للأمان");
                }
            } catch (e) {}
        }, 60000);
    }

    copyButton.addEventListener("click", async () => {
        if (!currentUSSD) { App.toast("لا يوجد كود لنسخه"); return; }
        try {
            await navigator.clipboard.writeText(currentUSSD);
            App.toast("تم نسخ الكود 📋");
            scheduleClipboardClear(currentUSSD);
        } catch (e) {
            const t = document.createElement("textarea");
            t.value = currentUSSD;
            t.style.position = "fixed"; t.style.opacity = "0";
            document.body.appendChild(t); t.select();
            try { document.execCommand("copy"); App.toast("تم نسخ الكود 📋"); }
            catch (err) { App.toast("تعذّر النسخ"); }
            t.remove();
        }
    });


    /* -------- لوحة التحكم + التحويلات السريعة -------- */

    function greeting() {
        const h = new Date().getHours();
        if (h < 12) return "صباح الخير";
        if (h < 17) return "طاب يومك";
        return "مساء الخير";
    }

    /* نسبة تغيّر إجمالي التحويلات هذا الشهر مقابل الشهر الماضي — رقم حقيقي من السجل الفعلي، لا تقديري */
    function monthTrend() {
        const now = new Date();
        const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
        const prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
        const ops = Store.getOps().filter(o => o.status === "success");
        const curTotal = ops.filter(o => o.ts >= from && o.ts < to).reduce((s, o) => s + (Number(o.amount) || 0), 0);
        const prevTotal = ops.filter(o => o.ts >= prevFrom && o.ts < from).reduce((s, o) => s + (Number(o.amount) || 0), 0);
        if (!prevTotal) return curTotal > 0 ? { has: true, pct: 100 } : { has: false, pct: 0 };
        return { has: true, pct: Math.round(((curTotal - prevTotal) / prevTotal) * 100) };
    }

    function refreshHome() {
        const cardsCount = Store.getCards().length;
        const userName = (Store.getSettings().userName || "").trim();

        const balanceVal = cardsCount
            ? `${Store.money(Store.getTotalBalance())} <small>₪</small>`
            : `<span class="d-val-empty">أضف بطاقة لتتبّع رصيدك</span>`;
        const trend = monthTrend();
        const trendHtml = (cardsCount && trend.has)
            ? `<span class="dash-trend ${trend.pct < 0 ? "down" : "up"}">${trend.pct < 0 ? "↓" : "↑"} ${Math.abs(trend.pct)}%</span>`
            : "";

        const headHtml = userName ? `
            <div class="dash-user-row">
                <span class="dash-avatar">${App.esc(userName.charAt(0).toUpperCase())}</span>
                <div class="dash-user-text">
                    <span class="dash-hi">مرحبًا، <b>${App.esc(userName)}</b></span>
                    <span class="dash-hi-sub">${greeting()} — ${new Date().toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })}</span>
                </div>
            </div>` : `
            <div class="dash-head">
                <span>${greeting()}</span>
                <span class="dash-date">${new Date().toLocaleDateString("ar-EG",
                    { weekday: "long", day: "numeric", month: "long" })}</span>
            </div>`;

        const usdRate = Number(Store.getSettings().usdRate) || 0;
        const usdHtml = (cardsCount && usdRate > 0)
            ? `<span class="dash-balance-usd privacy-sensitive">≈ ${Store.money(Store.getTotalBalance() / usdRate)} <small>$</small></span>`
            : "";

        const dash = $("dashboard");
        dash.innerHTML = `
            ${headHtml}
            <div class="dash-top-row">
                <div class="dash-balance" id="dashBalance">
                    <span class="dash-balance-lbl">الرصيد الإجمالي
                        <button class="privacy-eye-btn" id="privacyEyeBtn" type="button" aria-label="إخفاء/إظهار الأرقام المالية">${Store.getSettings().privacyMode ? "🙈" : "👁"}</button>
                    </span>
                    <div class="dash-balance-row">
                        <span class="d-val privacy-sensitive">${balanceVal}</span>
                        ${trendHtml}
                    </div>
                    ${usdHtml}
                    ${trendHtml ? '<span class="dash-trend-note">مقارنة بإجمالي تحويلات الشهر الماضي</span>' : ""}
                </div>
            </div>
            <div class="dash-cards-head">
                <span>💳 بطاقاتي</span>
                <span class="dash-cards-viewall">عرض الكل ›</span>
            </div>
            <div id="dashCardsStack" class="cards-stack dash-cards-stack"></div>
        `;
        if (window.Cards) Cards.renderDashboard();

        const quick = Store.quickContacts();
        const wrap = $("quickWrap");
        const row = $("quickTransfers");

        if (!quick.length) {
            wrap.classList.add("hidden");
        } else {
            wrap.classList.remove("hidden");
            row.innerHTML = quick.map(c => {
                const st = Store.contactStats(c.id);
                const amt = c.quickAmount || st.total / (st.count || 1) || 50;
                return `
                    <div class="quick-card" data-id="${c.id}">
                        <div class="q-top">
                            <span class="q-avatar">
                                ${(window.PhotoDB && PhotoDB.get(c.id)) ? `<img src="${PhotoDB.get(c.id)}">` : App.esc(c.name.charAt(0))}
                            </span>
                            <span class="q-name">${App.esc(c.name)}</span>
                        </div>
                        <div class="q-amount">${Store.money(Math.round(amt))} ₪</div>
                        <div class="q-sub">${(Store.SERVICES[c.network] || {}).name || "—"}</div>
                        <button class="q-send" type="button">تحويل</button>
                    </div>`;
            }).join("");

            row.querySelectorAll(".quick-card").forEach(card => {
                card.querySelector(".q-send").addEventListener("click", () => {
                    const c = Store.getContact(card.dataset.id);
                    if (!c) return;
                    const st = Store.contactStats(c.id);
                    const amt = c.quickAmount ||
                        Math.round(st.total / (st.count || 1)) || 50;
                    if (window.Composer) {
                        const cardsForNet = Store.cardsForNetwork(c.network || "jawwal");
                        Composer.quickFill({
                            cardId: cardsForNet.length ? cardsForNet[0].id : null,
                            contactId: c.id,
                            recipientName: c.name,
                            recipientPhone: c.phone,
                            contactType: c.type || "",
                            amount: amt,
                        });
                    } else {
                        quickSend(c, amt);
                    }
                });
            });
        }

        renderSourceCard();
    }

    function quickSend(contact, amount) {
        prefill({
            service: contact.network || "jawwal",
            payment: contact.type === "merchant" ? "merchant" : "friend",
            receiver: contact.phone,
            amount: amount,
            contactId: contact.id,
        });
        App.toast("راجع المبلغ ثم اضغط إنشاء الكود");
    }

    $("dashboard").addEventListener("click", (e) => {
        if (e.target.closest("#privacyEyeBtn")) {
            e.stopPropagation();
            App.togglePrivacyMode();
            return;
        }
        if (e.target.closest(".bank-card-wrap")) return;
        window.switchPage("cardsPage");
    });

    $("quickManage").addEventListener("click", () => App.go("contactsPage"));


    /* -------- تعبئة تلقائية (من عملية/جهة) -------- */

    function prefill(data) {
        hide(resultSection);
        currentContactId = data.contactId || null;

        const sb = document.querySelector(
            '.service[data-service="' + (data.service || "") + '"]'
        );
        if (sb) sb.click();

        if (data.payment) {
            const pb = document.querySelector(
                '.payment-type[data-type="' + data.payment + '"]'
            );
            if (pb) pb.click();
        }

        if (data.receiver) {
            receiverInput.value = data.receiver;
            receiverInput.dispatchEvent(new Event("input"));
        }
        if (data.name && receiverName) {
            receiverName.textContent = "👤 " + data.name;
        }
        if (data.amount) amountInput.value = data.amount;
        if (data.notes) notesInput.value = data.notes;

        setTimeout(() => {
            createButton.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 120);
    }


    /* تعبئة من بطاقة مقلوبة — يقفل الشبكة والبطاقة المصدر معًا فلا يُطلب من المستخدم اختيار المحفظة ثانية */
    function prefillFromCard({ service, payment, cardId, receiver, amount, silent }) {
        selectedCardId = cardId || null;
        prefill({ service, payment, receiver, amount });
        if (!silent) App.toast("التحويل هلق من: " + ((Store.getCard(cardId) || {}).name || ""));
    }


    /* -------- تصفير النموذج (بعد إجراء تحويل آخر من شاشة الإيصال) -------- */

    function resetForm() {
        hide(resultSection);
        serviceButtons.forEach(b => b.classList.remove("active"));
        paymentButtons.forEach(b => b.classList.remove("active"));
        selectedService = ""; selectedPayment = ""; selectedCardId = null;
        currentContactId = null; currentUSSD = "";
        receiverInput.value = ""; amountInput.value = ""; notesInput.value = "";
        if (receiverName) receiverName.textContent = "";
        updateFields();
        renderSourceCard();
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    return { refreshHome, prefill, prefillFromCard, pickContact, resetForm, selectServiceSilently };

})();

window.Transfer = Transfer;


/* ==================================================
   شاشة الترحيب (أول تشغيل)
================================================== */

(function onboarding() {
    let seen = false;
    try { seen = localStorage.getItem("kw_onboarded") === "1"; } catch (e) {}
    const el = document.getElementById("onboarding");
    if (seen || !el) return;

    el.classList.remove("hidden");
    document.getElementById("onbStart").addEventListener("click", () => {
        try { localStorage.setItem("kw_onboarded", "1"); } catch (e) {}
        el.classList.add("hidden");
    });
})();


/* ==================================================
   تأكيد نتيجة العملية بعد العودة من الاتصال
================================================== */

window.OpResult = (function () {

    let pendingId = null;

    function markPending(opId) {
        pendingId = opId;
        try { sessionStorage.setItem("kw_pending_op", opId); } catch (e) {}
    }

    function ask() {
        if (!pendingId) {
            try { pendingId = sessionStorage.getItem("kw_pending_op"); } catch (e) {}
        }
        if (!pendingId) return;

        const op = Store.getOps().find(o => o.id === pendingId);
        pendingId = null;
        try { sessionStorage.removeItem("kw_pending_op"); } catch (e) {}
        if (!op || op.status !== "pending") return;

        App.openSheet(`
            <div class="sheet-title">هل تمّت العملية؟</div>
            <div class="sheet-sub">
                ${App.esc(op.name || op.serviceName)}
                ${op.amount ? " — " + Store.money(op.amount) + " ₪" : ""}
            </div>
            <button class="sheet-menu-btn" id="opYes" type="button">✅ نعم، تمّت بنجاح</button>
            <button class="sheet-menu-btn danger" id="opNo" type="button">❌ لا، فشلت</button>
            <button class="sheet-menu-btn" id="opLater" type="button">لاحقًا</button>
        `);
        document.getElementById("opYes").addEventListener("click", () => {
            Store.updateOpStatus(op.id, "success");
            if (op.cardId && op.amount) {
                const card = Store.getCard(op.cardId);
                // لا نسمح للرصيد المحلي بالسالب — حتى لو تغيّر منذ لحظة التأكيد؛ العملية الحقيقية تبقى مسجّلة كنجاح بغض النظر
                const amt = card ? Math.min(Number(op.amount), Math.max(0, Number(card.balance || 0))) : 0;
                if (amt > 0) Store.adjustCardBalance(op.cardId, -amt);
            }
            App.closeSheet();
            if (window.History) History.render();
            if (window.Cards && op.cardId) Cards.flashBalanceUpdate(op.cardId);
            else Transfer.refreshHome();
            if (window.Receipt) Receipt.show(op);
            else if (window.successBurst) successBurst("تمّت العملية بنجاح ✓");
        });
        document.getElementById("opNo").addEventListener("click", () => {
            Store.updateOpStatus(op.id, "failed");
            App.closeSheet(); Transfer.refreshHome();
            if (window.History) History.render();
            if (window.Cards && op.cardId) Cards.flashBalanceFail(op.cardId);
            App.toast("سُجّلت كعملية فاشلة");
        });
        document.getElementById("opLater").addEventListener("click", () => App.closeSheet());
    }

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") setTimeout(ask, 400);
    });
    window.addEventListener("focus", () => setTimeout(ask, 400));

    return { markPending };

})();


/* ==================================================
   الإعدادات (في صفحة "حول")
================================================== */

(function settings() {

    const pinToggle = document.getElementById("pinToggle");
    const maskToggle = document.getElementById("maskToggle");
    const bioRow = document.getElementById("bioRow");
    const bioToggle = document.getElementById("bioToggle");
    const lockAfterRow = document.getElementById("lockAfterRow");
    const lockAfterSelect = document.getElementById("lockAfterSelect");
    const pinHintRow = document.getElementById("pinHintRow");
    const pinHintInput = document.getElementById("pinHintInput");
    const userNameRow = document.getElementById("userNameRow");
    const userNameInput = document.getElementById("userNameInput");
    const usdRateInput = document.getElementById("usdRateInput");
    const s = Store.getSettings();

    pinToggle.checked = s.pinEnabled;
    maskToggle.checked = s.maskPhones;
    bioToggle.checked = s.biometric;
    if (lockAfterSelect) lockAfterSelect.value = String(s.lockAfter);
    if (pinHintInput) pinHintInput.value = s.pinHint || "";
    if (userNameInput) userNameInput.value = s.userName || "";
    if (usdRateInput) usdRateInput.value = s.usdRate || "";

    function syncBioRow() {
        const pinOn = Store.getSettings().pinEnabled;
        bioRow.hidden = !(pinOn && window.Bio && Bio.supported());
        if (lockAfterRow) lockAfterRow.hidden = !pinOn;
        if (pinHintRow) pinHintRow.hidden = !pinOn;
        if (userNameRow) userNameRow.hidden = !pinOn;
    }
    syncBioRow();

    if (pinHintInput) pinHintInput.addEventListener("change", () => {
        Store.saveSettings({ pinHint: pinHintInput.value.trim().slice(0, 60) });
        App.toast("تم حفظ التلميح");
    });
    if (userNameInput) userNameInput.addEventListener("change", () => {
        Store.saveSettings({ userName: userNameInput.value.trim().slice(0, 30) });
        App.toast("تم حفظ الاسم");
    });
    if (usdRateInput) usdRateInput.addEventListener("change", () => {
        const v = Math.max(0, Number(usdRateInput.value) || 0);
        usdRateInput.value = v || "";
        Store.saveSettings({ usdRate: v });
        Transfer.refreshHome();
        App.toast(v ? "تم حفظ سعر الصرف" : "تم إلغاء عرض الدولار");
    });

    /* بعد تفعيل رمز القفل لأول مرة — نطلب الاسم فورًا بدل ترك المستخدم يبحث عنه بالإعدادات */
    function promptUserNameIfMissing() {
        if (Store.getSettings().userName) return;
        App.openSheet(`
            <div class="sheet-title">شو اسمك؟</div>
            <div class="sheet-sub">يظهر برسالة الترحيب بشاشة القفل فقط — اختياري، وممكن تغيّره لاحقًا من هنا.</div>
            <div class="input-group">
                <label for="pnUserInput">الاسم</label>
                <input id="pnUserInput" type="text" maxlength="30" placeholder="مثال: أحمد">
            </div>
            <button class="main-button full-button" id="pnUserSave" type="button">حفظ</button>
            <button class="secondary-button full-button" id="pnUserSkip" type="button" style="margin-top:8px;">تخطّي</button>
        `);
        const pnInput = document.getElementById("pnUserInput");
        setTimeout(() => pnInput.focus(), 150);
        document.getElementById("pnUserSave").addEventListener("click", () => {
            const v = pnInput.value.trim().slice(0, 30);
            Store.saveSettings({ userName: v });
            if (userNameInput) userNameInput.value = v;
            App.closeSheet();
            if (v) App.toast("أهلًا، " + v + "! تم حفظ اسمك");
        });
        document.getElementById("pnUserSkip").addEventListener("click", () => App.closeSheet());
    }
    // دعم البصمة/الوجه قد يُعرف بعد فحص غير متزامن
    if (window.Bio && Bio.onReady) Bio.onReady(() => syncBioRow());

    if (lockAfterSelect) lockAfterSelect.addEventListener("change", () => {
        Store.saveSettings({ lockAfter: Number(lockAfterSelect.value) });
        App.toast("تم حفظ إعداد القفل التلقائي");
    });

    pinToggle.addEventListener("change", () => {
        if (pinToggle.checked) {
            Lock.setup(ok => {
                pinToggle.checked = ok && Store.getSettings().pinEnabled;
                syncBioRow();
                if (ok) {
                    App.toast("تم تفعيل قفل التطبيق");
                    setTimeout(promptUserNameIfMissing, 300);
                }
            });
        } else {
            Lock.disable(ok => {
                pinToggle.checked = Store.getSettings().pinEnabled;
                if (ok) {
                    App.toast("تم إلغاء القفل");
                    Store.saveSettings({ biometric: false, pinHint: "" });
                    bioToggle.checked = false;
                    if (window.Bio && Bio.disable) Bio.disable();
                    if (pinHintInput) pinHintInput.value = "";
                }
                syncBioRow();
            });
        }
    });

    bioToggle.addEventListener("change", async () => {
        if (bioToggle.checked) {
            App.toast("أكّد هويتك لتفعيل الفتح الحيوي…");
            const ok = window.Bio && await Bio.enroll();
            bioToggle.checked = !!ok;
            Store.saveSettings({ biometric: !!ok });
            App.toast(ok ? "تم تفعيل الفتح بالبصمة أو الوجه" : "تعذّر التفعيل — جرّب مجددًا");
        } else {
            Store.saveSettings({ biometric: false });
            if (window.Bio && Bio.disable) Bio.disable();
        }
    });

    maskToggle.addEventListener("change", () => {
        Store.saveSettings({ maskPhones: maskToggle.checked });
        App.toast(maskToggle.checked ? "تم إخفاء الأرقام جزئيًا" : "تم إظهار الأرقام");
        if (window.History) History.render();
        if (window.Contacts) Contacts.render();
    });

    const largeTextToggle = document.getElementById("largeTextToggle");
    const textZoomRow = document.getElementById("textZoomRow");
    const textZoomValue = document.getElementById("textZoomValue");
    const textZoomDown = document.getElementById("textZoomDown");
    const textZoomUp = document.getElementById("textZoomUp");

    function renderTextZoom() {
        const zoom = Store.getSettings().textZoom || 100;
        if (textZoomValue) textZoomValue.textContent = zoom + "٪";
        if (textZoomDown) textZoomDown.disabled = zoom <= TEXT_ZOOM_MIN;
        if (textZoomUp) textZoomUp.disabled = zoom >= TEXT_ZOOM_MAX;
    }

    function setTextZoom(zoom) {
        zoom = Math.max(TEXT_ZOOM_MIN, Math.min(TEXT_ZOOM_MAX, zoom));
        Store.saveSettings({ textZoom: zoom });
        applyTextZoom(zoom);
        renderTextZoom();
    }

    if (largeTextToggle) {
        largeTextToggle.checked = !!s.largeText;
        if (textZoomRow) textZoomRow.hidden = !largeTextToggle.checked || !ZOOM_SUPPORTED;
        renderTextZoom();
        largeTextToggle.addEventListener("change", () => {
            const on = largeTextToggle.checked;
            Store.saveSettings({ largeText: on });
            document.body.classList.toggle("large-text", on);
            applyTextZoom(on ? Store.getSettings().textZoom : 100);
            if (textZoomRow) textZoomRow.hidden = !on || !ZOOM_SUPPORTED;
        });
    }
    if (textZoomDown) textZoomDown.addEventListener("click", () => setTextZoom((Store.getSettings().textZoom || 100) - TEXT_ZOOM_STEP));
    if (textZoomUp) textZoomUp.addEventListener("click", () => setTextZoom((Store.getSettings().textZoom || 100) + TEXT_ZOOM_STEP));

    const voiceConfirmToggle = document.getElementById("voiceConfirmToggle");
    if (voiceConfirmToggle) {
        voiceConfirmToggle.checked = s.voiceConfirm !== false;
        voiceConfirmToggle.addEventListener("change", () => {
            Store.saveSettings({ voiceConfirm: voiceConfirmToggle.checked });
            App.toast(voiceConfirmToggle.checked ? "سيُقرأ التأكيد بصوت عالٍ" : "أُوقف التأكيد الصوتي");
        });
    }

    const bgMotionSelect = document.getElementById("bgMotionSelect");
    if (bgMotionSelect) {
        bgMotionSelect.value = s.bgMotion || "normal";
        bgMotionSelect.addEventListener("change", () => {
            Store.saveSettings({ bgMotion: bgMotionSelect.value });
            applyBgMotion(bgMotionSelect.value);
        });
    }

    /* المساعد الذكي */
    const aiProvider = document.getElementById("aiProvider");
    const aiKeyInput = document.getElementById("aiKeyInput");
    const aiModelInput = document.getElementById("aiModelInput");
    const aiEndpointInput = document.getElementById("aiEndpointInput");
    const aiEndpointRow = document.getElementById("aiEndpointRow");
    const aiKeyHint = document.getElementById("aiKeyHint");
    const aiKeySaved = document.getElementById("aiKeySaved");
    if (aiProvider) {
        const ai = s.ai || { provider: "gemini", key: "", model: "", endpoint: "" };
        aiProvider.value = ai.provider || "gemini";
        aiKeyInput.value = ai.key || "";
        aiModelInput.value = ai.model || "";
        aiEndpointInput.value = ai.endpoint || "";

        function syncAiFields() {
            const openai = aiProvider.value === "openai";
            aiEndpointRow.hidden = !openai;
            aiModelInput.placeholder = openai ? "gpt-4o-mini" : "gemini-flash-latest";
            aiKeyHint.innerHTML = openai
                ? 'مفتاح OpenAI أو OpenRouter (يبدأ بـ <span style="direction:ltr;">sk-</span>)'
                : 'احصل على مفتاح Gemini مجاني من <span style="direction:ltr;">aistudio.google.com/apikey</span>';
            if (aiKeySaved) aiKeySaved.hidden = !aiKeyInput.value.trim();
        }
        function saveAi() {
            const hadKey = !!(s.ai && s.ai.key);
            Store.saveSettings({
                ai: {
                    provider: aiProvider.value,
                    key: aiKeyInput.value.trim(),
                    model: aiModelInput.value.trim(),
                    endpoint: aiEndpointInput.value.trim(),
                },
            });
            s.ai = Store.getSettings().ai;
            if (aiKeySaved) aiKeySaved.hidden = !aiKeyInput.value.trim();
            if (aiKeyInput.value.trim() && !hadKey) App.toast("تم حفظ المفتاح ✓");
        }
        syncAiFields();
        aiProvider.addEventListener("change", () => { syncAiFields(); saveAi(); });
        [aiKeyInput, aiModelInput, aiEndpointInput].forEach(el =>
            el.addEventListener("change", saveAi));

        const aiOpenBtn = document.getElementById("aiOpenBtn");
        if (aiOpenBtn) aiOpenBtn.addEventListener("click", () => {
            saveAi();
            if (window.AI) AI.open();
        });
    }


    /* نسخ احتياطي */

    function downloadText(text, name, mime) {
        const blob = new Blob([text], { type: mime || "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    /* حوار كلمة سر (للتصدير/الاستعادة المشفّرة) */
    function askText(title, sub, okLabel) {
        return new Promise(resolve => {
            const m = document.createElement("div");
            m.className = "confirm-modal";
            m.innerHTML = `
                <div class="confirm-overlay"></div>
                <div class="confirm-box">
                    <div class="confirm-icon">🔑</div>
                    <h2>${App.esc(title)}</h2>
                    <p class="confirm-text">${App.esc(sub)}</p>
                    <div class="input-group" style="text-align:right;margin-top:14px;">
                        <input id="pk" type="password" autocomplete="off" placeholder="كلمة السر">
                    </div>
                    <div class="confirm-buttons">
                        <button id="pkOk" class="confirm-yes" type="button">${App.esc(okLabel || "متابعة")}</button>
                        <button id="pkNo" class="confirm-no" type="button">إلغاء</button>
                    </div>
                </div>`;
            document.body.appendChild(m);
            const inp = m.querySelector("#pk");
            setTimeout(() => inp.focus(), 80);
            const done = v => { m.remove(); resolve(v); };
            m.querySelector("#pkOk").addEventListener("click", () => {
                const v = inp.value;
                if (!v) { App.toast("أدخل كلمة السر"); return; }
                done(v);
            });
            m.querySelector("#pkNo").addEventListener("click", () => done(null));
            m.querySelector(".confirm-overlay").addEventListener("click", () => done(null));
            inp.addEventListener("keydown", e => {
                if (e.key === "Enter") m.querySelector("#pkOk").click();
                if (e.key === "Escape") done(null);
            });
        });
    }

    const stamp = () => new Date().toISOString().slice(0, 10);

    document.getElementById("exportBtn").addEventListener("click", () => {
        App.openSheet(`
            <div class="sheet-title">تصدير نسخة احتياطية</div>
            <div class="sheet-sub">النسخة العادية بلا رمز القفل والأكواد مقنّعة. المشفّرة تحتاج كلمة سر لفتحها.</div>
            <button class="sheet-menu-btn" id="expPlain" type="button">⬇ نسخة عادية (JSON)</button>
            <button class="sheet-menu-btn" id="expEnc" type="button">🔒 نسخة مشفّرة بكلمة سر</button>
        `);
        document.getElementById("expPlain").addEventListener("click", () => {
            App.closeSheet();
            downloadText(Store.exportAll(), "alkod-alwasit-backup-" + stamp() + ".json");
            App.toast("تم تصدير النسخة الاحتياطية");
        });
        document.getElementById("expEnc").addEventListener("click", async () => {
            App.closeSheet();
            const pw = await askText("تشفير النسخة", "لن تُستعاد بدون هذه الكلمة — احفظها في مكان آمن.", "تشفير وحفظ");
            if (!pw) return;
            try {
                const text = await Store.exportEncrypted(pw);
                downloadText(text, "alkod-alwasit-backup-" + stamp() + ".enc.json");
                App.toast("تم تصدير نسخة مشفّرة");
            } catch (e) {
                App.toast(e.message || "تعذّر التشفير");
            }
        });
    });

    const importFile = document.getElementById("importFile");
    document.getElementById("importBtn")
        .addEventListener("click", () => importFile.click());

    function afterImport() {
        App.toast("تمت الاستعادة بنجاح");
        const s2 = Store.getSettings();
        pinToggle.checked = s2.pinEnabled;
        maskToggle.checked = s2.maskPhones;
        Transfer.refreshHome();
        if (window.Contacts) Contacts.render();
        if (window.History) History.render();
    }

    importFile.addEventListener("change", () => {
        const file = importFile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            let res = await Store.importAll(reader.result);
            if (res === "need-password") {
                const pw = await askText("ملف مشفّر", "أدخل كلمة السر لفكّ النسخة.", "فكّ واستعادة");
                if (!pw) return;
                res = await Store.importAll(reader.result, pw);
            }
            if (res === true) afterImport();
            else if (res === "bad-password") App.toast("كلمة السر غير صحيحة");
            else App.toast("الملف غير صالح");
        };
        reader.readAsText(file);
        importFile.value = "";
    });

    document.getElementById("wipeBtn").addEventListener("click", () => {
        App.openSheet(`
            <div class="sheet-title">حذف كل البيانات؟</div>
            <div class="sheet-sub">
                سيتم حذف كل الجهات والعمليات والإعدادات نهائيًا. لا يمكن التراجع.
            </div>
            <button class="sheet-menu-btn danger" id="wipeYes" type="button">
                🗑 نعم، احذف كل شيء
            </button>
            <button class="sheet-menu-btn" id="wipeNo" type="button">إلغاء</button>
        `);
        document.getElementById("wipeYes").addEventListener("click", () => {
            Store.wipeAll();
            App.closeSheet();
            App.toast("تم حذف كل البيانات");
            Transfer.refreshHome();
            if (window.Contacts) Contacts.render();
            if (window.History) History.render();
            pinToggle.checked = false;
            maskToggle.checked = false;
        });
        document.getElementById("wipeNo").addEventListener("click", () => App.closeSheet());
    });

})();


/* ==================================================
   إغلاق النوافذ بـ Escape
================================================== */

document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
        document.getElementById("confirmModal").classList.add("hidden");
        try { if ("speechSynthesis" in window) speechSynthesis.cancel(); } catch (err) {}
        App.closeSheet();
    }
});


/* ==================================================
   تشغيل + Service Worker
================================================== */

(async function boot() {
    if (window.PhotoDB) {
        try { await PhotoDB.hydrate(); } catch (e) {}
    }
    Transfer.refreshHome();
    if (window.Contacts) Contacts.render();
})();

function showUpdateToast(worker) {
    const old = document.querySelector(".update-toast");
    if (old) old.remove();
    const el = document.createElement("div");
    el.className = "toast update-toast";
    el.innerHTML = '<span>نسخة جديدة جاهزة</span>';
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "تحديث الآن";
    btn.addEventListener("click", () => { worker.postMessage("skipWaiting"); el.remove(); });
    el.appendChild(btn);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 15000);
}

if ("serviceWorker" in navigator) {
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
    });

    window.addEventListener("load", async () => {
        try {
            const reg = await navigator.serviceWorker.register("service-worker.js");

            reg.addEventListener("updatefound", () => {
                const nw = reg.installing;
                if (!nw) return;
                nw.addEventListener("statechange", () => {
                    if (nw.state === "installed" && navigator.serviceWorker.controller) {
                        showUpdateToast(nw);
                    }
                });
            });

            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "visible") reg.update().catch(() => {});
            });
        } catch (e) {}
    });
}
