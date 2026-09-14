/* ==================================================
   prayer.js — مواقيت الصلاة (حساب فلكي محلي) + اتجاه القبلة
   لا إنترنت، لا اعتماديات. الحساب مبني على معادلات الشمس القياسية.
================================================== */

window.Prayer = (function () {
    "use strict";

    const D2R = Math.PI / 180, R2D = 180 / Math.PI;
    const sin = x => Math.sin(x * D2R);
    const cos = x => Math.cos(x * D2R);
    const tan = x => Math.tan(x * D2R);
    const arcsin = x => R2D * Math.asin(x);
    const arccos = x => R2D * Math.acos(x);
    const arccot = x => R2D * Math.atan(1 / x);
    const fix = (a, n) => { a = a - n * Math.floor(a / n); return a < 0 ? a + n : a; };

    const KAABA = { lat: 21.4225, lng: 39.8262 };

    const METHODS = {
        mwl: { name: "رابطة العالم الإسلامي", fajr: 18, isha: 17 },
        makkah: { name: "أم القرى (مكة)", fajr: 18.5, ishaMin: 90 },
        egypt: { name: "الهيئة المصرية", fajr: 19.5, isha: 17.5 },
        karachi: { name: "كراتشي", fajr: 18, isha: 18 },
        isna: { name: "أمريكا الشمالية (ISNA)", fajr: 15, isha: 15 },
    };

    /* -------- موضع الشمس ليوم جولياني -------- */

    function sunPosition(jd) {
        const D = jd - 2451545.0;
        const g = fix(357.529 + 0.98560028 * D, 360);
        const q = fix(280.459 + 0.98564736 * D, 360);
        const Lsun = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360);
        const e = 23.439 - 0.00000036 * D;
        const decl = arcsin(sin(e) * sin(Lsun));
        let RA = arctan2(cos(e) * sin(Lsun), cos(Lsun)) / 15;
        RA = fix(RA, 24);
        const eqt = q / 15 - RA; // بالساعات
        return { decl, eqt };
    }
    function arctan2(y, x) { return R2D * Math.atan2(y, x); }

    function julian(y, m, d) {
        if (m <= 2) { y -= 1; m += 12; }
        const A = Math.floor(y / 100);
        const B = 2 - A + Math.floor(A / 4);
        return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
    }

    /* -------- زوايا الساعة -------- */

    function hourAngle(angle, lat, decl) {
        const x = (-sin(angle) - sin(lat) * sin(decl)) / (cos(lat) * cos(decl));
        if (x < -1 || x > 1) return null; // نهار/ليل قطبي
        return arccos(x) / 15;
    }
    function asrAngle(factor, lat, decl) {
        const a = -arccot(factor + tan(Math.abs(lat - decl)));
        return hourAngle(a, lat, decl);
    }

    function hhmm(hours) {
        hours = fix(hours, 24);
        let h = Math.floor(hours);
        let m = Math.round((hours - h) * 60);
        if (m === 60) { m = 0; h = (h + 1) % 24; }
        return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
    }

    /*
     * times(date, lat, lng, opts)
     * opts: { method: "mwl"|..., asr: "standard"|"hanafi", tz: <hours> }
     * يعيد: { fajr, sunrise, dhuhr, asr, maghrib, isha } (كل قيمة { time:"HH:MM", minutes:Number })
     */
    function times(date, lat, lng, opts) {
        opts = opts || {};
        const method = METHODS[opts.method] || METHODS.mwl;
        const tz = (typeof opts.tz === "number") ? opts.tz : -date.getTimezoneOffset() / 60;
        const shadow = opts.asr === "hanafi" ? 2 : 1;

        const jd = julian(date.getFullYear(), date.getMonth() + 1, date.getDate()) - lng / (15 * 24);
        const { decl, eqt } = sunPosition(jd + 0.5);

        const dhuhr = 12 + tz - lng / 15 - eqt;

        function T(angle, dir) {
            const ha = hourAngle(angle, lat, decl);
            if (ha === null) return null;
            return dhuhr + (dir < 0 ? -ha : ha);
        }

        const sunriseH = T(0.833, -1);
        const maghribH = T(0.833, 1);
        const fajrH = T(method.fajr, -1);
        const asrHa = asrAngle(shadow, lat, decl);
        const asrH = asrHa === null ? null : dhuhr + asrHa;
        let ishaH;
        if (method.ishaMin) ishaH = maghribH === null ? null : maghribH + method.ishaMin / 60;
        else ishaH = T(method.isha, 1);

        const out = {};
        const set = (key, h) => {
            out[key] = h === null
                ? { time: "—", minutes: null }
                : { time: hhmm(h), minutes: Math.round(fix(h, 24) * 60) };
        };
        set("fajr", fajrH);
        set("sunrise", sunriseH);
        set("dhuhr", dhuhr);
        set("asr", asrH);
        set("maghrib", maghribH);
        set("isha", ishaH);
        return out;
    }

    const ORDER = [
        ["fajr", "الفجر"], ["sunrise", "الشروق"], ["dhuhr", "الظهر"],
        ["asr", "العصر"], ["maghrib", "المغرب"], ["isha", "العشاء"],
    ];

    function next(t, now) {
        now = now || new Date();
        const cur = now.getHours() * 60 + now.getMinutes();
        for (const [key, label] of ORDER) {
            if (key === "sunrise") continue;
            const m = t[key] && t[key].minutes;
            if (m != null && m > cur) {
                return { key, label, at: t[key].time, remaining: m - cur };
            }
        }
        // بعد العشاء: التالي فجر الغد
        return { key: "fajr", label: "الفجر", at: (t.fajr && t.fajr.time) || "—", remaining: (24 * 60 - cur) + ((t.fajr && t.fajr.minutes) || 0), tomorrow: true };
    }

    /* -------- الاتجاه والمسافة بين نقطتين (عام) -------- */

    /* الاتجاه الأولي (Forward Azimuth) من نقطة إلى نقطة، بالدرجات 0–360 */
    function bearing(lat1, lng1, lat2, lng2) {
        const dLng = lng2 - lng1;
        const y = sin(dLng);
        const x = cos(lat1) * tan(lat2) - sin(lat1) * cos(dLng);
        return fix(arctan2(y, x), 360);
    }

    /* المسافة بالكيلومتر بين نقطتين (هافرساين) */
    function distanceKm(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * D2R;
        const dLng = (lng2 - lng1) * D2R;
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /* -------- القبلة -------- */

    function qibla(lat, lng) {
        return bearing(lat, lng, KAABA.lat, KAABA.lng);
    }

    /* ================= الواجهة ================= */

    const CITIES = {
        "غزة": [31.5017, 34.4668], "رفح": [31.2968, 34.2436], "خان يونس": [31.3462, 34.3062],
        "دير البلح": [31.4183, 34.3502], "القدس": [31.7683, 35.2137], "رام الله": [31.9038, 35.2034],
        "نابلس": [32.2211, 35.2544], "الخليل": [31.5326, 35.0998], "جنين": [32.4597, 35.3],
    };

    function cfg() {
        const s = Store.getSettings();
        return {
            geo: s.geo || null,
            method: s.prayerMethod || "mwl",
            asr: s.asrMethod || "standard",
            adhan: !!s.adhanEnabled,
        };
    }

    /* -------- إشعار الأذان (والتطبيق مفتوح) -------- */

    const adhan = (function () {
        let timers = [];
        const LABELS = { fajr: "الفجر", dhuhr: "الظهر", asr: "العصر", maghrib: "المغرب", isha: "العشاء" };

        function clear() { timers.forEach(clearTimeout); timers = []; }

        function schedule() {
            clear();
            const c = cfg();
            if (!c.adhan || !c.geo) return;
            const now = new Date();
            const t = times(now, c.geo.lat, c.geo.lng, { method: c.method, asr: c.asr });
            const cur = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
            for (const key of Object.keys(LABELS)) {
                const m = t[key] && t[key].minutes;
                if (m == null || m <= cur) continue;
                const ms = (m - cur) * 60000;
                if (ms > 12 * 3600 * 1000) continue;
                timers.push(setTimeout(() => { fire(LABELS[key]); schedule(); }, ms));
            }
        }

        function fire(label) {
            try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
            if ("Notification" in window && Notification.permission === "granted") {
                try { new Notification("حان وقت صلاة " + label, { body: "الله أكبر", tag: "adhan" }); } catch (e) {}
            }
            App.toast("🕌 حان وقت صلاة " + label);
        }

        async function toggle(on) {
            if (on) {
                if ("Notification" in window && Notification.permission === "default") {
                    try { await Notification.requestPermission(); } catch (e) {}
                }
                Store.saveSettings({ adhanEnabled: true });
                schedule();
                App.toast("سيصلك إشعار عند دخول كل وقت");
            } else {
                Store.saveSettings({ adhanEnabled: false });
                clear();
            }
        }

        if (typeof document !== "undefined") {
            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === "visible") schedule();
            });
            setTimeout(schedule, 2000);
        }

        return { toggle, schedule };
    })();

    function fmtRemaining(min) {
        const h = Math.floor(min / 60), m = min % 60;
        if (h > 0) return h + " س " + m + " د";
        return m + " د";
    }

    let timer = null;

    function mountCard(el) {
        if (!el) return;
        const c = cfg();
        if (!c.geo) {
            el.innerHTML = `
                <div class="section-heading slim"><span class="heading-icon">🕌</span><h3>مواقيت الصلاة</h3></div>
                <p class="about-text">حدّد موقعك لعرض المواقيت واتجاه القبلة. الحساب محلي بالكامل.</p>
                <button class="secondary-button full-button" id="prayerLocate" type="button">📍 تحديد الموقع</button>
            `;
            el.querySelector("#prayerLocate").addEventListener("click", pickLocation);
            return;
        }

        const now = new Date();
        const t = times(now, c.geo.lat, c.geo.lng, { method: c.method, asr: c.asr });
        const nx = next(t, now);

        el.innerHTML = `
            <div class="section-heading slim">
                <span class="heading-icon">🕌</span>
                <h3>مواقيت ${esc(c.geo.city || "موقعك")}</h3>
                <button class="link-btn" id="prayerLoc2" type="button">تغيير</button>
            </div>
            <div class="next-prayer">
                <span class="np-label">${nx.tomorrow ? "فجر الغد" : nx.label}</span>
                <span class="np-time">${nx.at}</span>
                <span class="np-rem">بعد ${fmtRemaining(nx.remaining)}</span>
            </div>
            <div class="prayer-grid">
                ${ORDER.map(([k, label]) => `
                    <div class="pt-cell ${k === nx.key && !nx.tomorrow ? "pt-next" : ""}">
                        <span class="pt-name">${label}</span>
                        <span class="pt-time">${t[k].time}</span>
                    </div>`).join("")}
            </div>
            <label class="setting-row" style="padding:10px 0 2px;">
                <span>🔔 إشعار عند دخول وقت الصلاة</span>
                <input type="checkbox" id="adhanToggle" ${c.adhan ? "checked" : ""}>
            </label>
            <div class="prayer-actions">
                <button class="chip-action" id="qiblaBtn" type="button">🧭 القبلة</button>
                <button class="chip-action" id="prayerMethodBtn" type="button">⚙ طريقة الحساب</button>
            </div>
        `;
        el.querySelector("#prayerLoc2").addEventListener("click", pickLocation);
        el.querySelector("#qiblaBtn").addEventListener("click", openQibla);
        el.querySelector("#prayerMethodBtn").addEventListener("click", methodSheet);
        const at = el.querySelector("#adhanToggle");
        if (at) at.addEventListener("change", () => adhan.toggle(at.checked));

        clearTimeout(timer);
        timer = setTimeout(() => mountCard(document.getElementById("prayerCard")), 30000);
    }

    function esc(v) { return window.App ? App.esc(v) : String(v == null ? "" : v); }

    function pickLocation() {
        const rows = Object.keys(CITIES).map(city =>
            `<button class="sheet-menu-btn" data-city="${esc(city)}" type="button">${esc(city)}</button>`
        ).join("");
        App.openSheet(`
            <div class="sheet-title">اختر موقعك</div>
            <div class="sheet-sub">للحساب الدقيق. يُحفظ على جهازك فقط.</div>
            <button class="sheet-menu-btn" id="geoAuto" type="button">📍 موقعي الحالي (GPS)</button>
            ${rows}
        `);
        document.getElementById("geoAuto").addEventListener("click", () => {
            if (!navigator.geolocation) { App.toast("تحديد الموقع غير مدعوم"); return; }
            App.toast("جارٍ تحديد الموقع…");
            navigator.geolocation.getCurrentPosition(
                p => {
                    Store.saveSettings({ geo: { lat: p.coords.latitude, lng: p.coords.longitude, city: "" } });
                    App.closeSheet();
                    mountCard(document.getElementById("prayerCard"));
                    App.toast("تم تحديد الموقع");
                },
                () => App.toast("تعذّر تحديد الموقع — اختر مدينة"),
                { enableHighAccuracy: false, timeout: 10000 }
            );
        });
        document.querySelectorAll("#sheetBody .sheet-menu-btn[data-city]").forEach(b => {
            b.addEventListener("click", () => {
                const city = b.dataset.city;
                const [lat, lng] = CITIES[city];
                Store.saveSettings({ geo: { lat, lng, city } });
                App.closeSheet();
                mountCard(document.getElementById("prayerCard"));
            });
        });
    }

    function methodSheet() {
        const c = cfg();
        App.openSheet(`
            <div class="sheet-title">طريقة الحساب</div>
            <div class="sheet-sub">اختر ما يوافق التقويم المعتمد في بلدك.</div>
            ${Object.keys(METHODS).map(k =>
                `<button class="sheet-menu-btn ${c.method === k ? "active" : ""}" data-m="${k}" type="button">${esc(METHODS[k].name)}</button>`
            ).join("")}
            <div class="sheet-sub" style="margin-top:14px;">وقت العصر</div>
            <button class="sheet-menu-btn ${c.asr === "standard" ? "active" : ""}" data-asr="standard" type="button">الجمهور (الشافعي/المالكي/الحنبلي)</button>
            <button class="sheet-menu-btn ${c.asr === "hanafi" ? "active" : ""}" data-asr="hanafi" type="button">الحنفي</button>
        `);
        document.querySelectorAll("#sheetBody [data-m]").forEach(b =>
            b.addEventListener("click", () => { Store.saveSettings({ prayerMethod: b.dataset.m }); refreshAndClose(); }));
        document.querySelectorAll("#sheetBody [data-asr]").forEach(b =>
            b.addEventListener("click", () => { Store.saveSettings({ asrMethod: b.dataset.asr }); refreshAndClose(); }));
    }
    function refreshAndClose() {
        App.closeSheet();
        mountCard(document.getElementById("prayerCard"));
    }

    function openQibla() {
        const c = cfg();
        if (!c.geo) { pickLocation(); return; }
        const bearing = qibla(c.geo.lat, c.geo.lng);
        App.openSheet(`
            <div class="sheet-title">اتجاه القبلة</div>
            <div class="sheet-sub">${Math.round(bearing)}° من الشمال — ${esc(c.geo.city || "موقعك")}</div>
            <div class="qibla-wrap">
                <div class="qibla-dial" id="qiblaDial">
                    <div class="qibla-n">ش</div>
                    <div class="qibla-needle" id="qiblaNeedle" style="transform:rotate(${bearing}deg)">
                        <div class="qibla-kaaba">🕋</div>
                    </div>
                </div>
            </div>
            <p id="qiblaHint" class="about-text" style="text-align:center;">
                وجّه أعلى الجهاز نحو الشمال، ثم اتّبع السهم.
            </p>
            <button class="secondary-button full-button" id="qiblaCompass" type="button">تفعيل البوصلة</button>
        `);

        let handler = null;
        function onOrient(e) {
            let heading = e.webkitCompassHeading;
            if (heading == null && e.alpha != null) heading = 360 - e.alpha;
            if (heading == null) return;
            const needle = document.getElementById("qiblaNeedle");
            if (needle) needle.style.transform = "rotate(" + (bearing - heading) + "deg)";
            const hint = document.getElementById("qiblaHint");
            if (hint) hint.textContent = "اتجاهك الحالي: " + Math.round(heading) + "°";
        }
        document.getElementById("qiblaCompass").addEventListener("click", async () => {
            try {
                if (typeof DeviceOrientationEvent !== "undefined" &&
                    typeof DeviceOrientationEvent.requestPermission === "function") {
                    const res = await DeviceOrientationEvent.requestPermission();
                    if (res !== "granted") { App.toast("لم يُسمح باستخدام البوصلة"); return; }
                }
                handler = onOrient;
                window.addEventListener("deviceorientationabsolute", handler, true);
                window.addEventListener("deviceorientation", handler, true);
                App.toast("حرّك الجهاز أفقيًا لمعايرة البوصلة");
            } catch (e) { App.toast("البوصلة غير متاحة على هذا الجهاز"); }
        });

        const box = document.getElementById("sheet");
        const stop = () => {
            if (handler) {
                window.removeEventListener("deviceorientationabsolute", handler, true);
                window.removeEventListener("deviceorientation", handler, true);
                handler = null;
            }
            box.removeEventListener("transitionend", stop);
        };
        document.getElementById("sheetOverlay").addEventListener("click", stop, { once: true });
    }

    return { times, next, qibla, bearing, distanceKm, METHODS, ORDER, mountCard, openQibla };
})();

if (typeof module !== "undefined" && module.exports) module.exports = window.Prayer;
