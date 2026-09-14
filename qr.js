/* ==================================================
   qr.js — روابط التحويل + مسح QR + المشاركة
   يعمل على الويب وعلى WebView أندرويد. يعتمد على واجهات
   المتصفح الأصلية فقط (BarcodeDetector / navigator.share).
================================================== */

(function () {
    "use strict";

    /* -------- بناء رابط تحويل -------- */

    // الدفع عبر الباركود مربوط بجوال بي افتراضيًا
    const DEFAULT_SERVICE = "jawwal";

    function shareBase() {
        try { if (typeof APP_SHARE_URL === "string" && APP_SHARE_URL) return APP_SHARE_URL; } catch (e) {}
        return location.origin + location.pathname;
    }

    function buildLink(data) {
        const parts = [
            data.service || DEFAULT_SERVICE,
            data.payment || "",
            Store.cleanNum(data.phone || data.receiver || ""),
            data.amount ? Store.cleanAmt(String(data.amount)) : "",
        ];
        return shareBase() + "#t=" + parts.map(encodeURIComponent).join(",");
    }
    App.buildTransferLink = buildLink;


    /* -------- قراءة رابط/نص -------- */

    function parsePayload(str) {
        const m = /[#&?]t=([^#&\s]+)/.exec(str || "");
        let raw;
        if (m) {
            raw = m[1].split(",").map(s => { try { return decodeURIComponent(s); } catch (e) { return s; } });
        } else {
            // رقم جوال عارٍ داخل QR — لو محفوظ بجهاتك نستخدم جهة تحويله المحفوظة، وإلا الافتراضي
            const bare = Store.cleanNum(str || "");
            if (/^0\d{6,11}$/.test(bare)) {
                const known = Store.getContacts().find(c => c.phone === bare);
                const service = (known && Store.SERVICES[known.network]) ? known.network : DEFAULT_SERVICE;
                return { service, receiver: bare };
            }
            return null;
        }
        const [service, payment, phone, amount] = raw;
        if (!phone && !service) return null;
        return {
            service: Store.SERVICES[service] ? service : DEFAULT_SERVICE,
            payment: payment === "merchant" ? "merchant" : (payment === "friend" ? "friend" : ""),
            receiver: Store.cleanNum(phone || ""),
            amount: amount ? Store.cleanAmt(amount) : "",
        };
    }

    function apply(data, note) {
        App.go("transferPage");
        setTimeout(() => { if (typeof Transfer !== "undefined") Transfer.prefill(data); }, 90);
        if (note) App.toast(note);
    }

    function consumeUrl() {
        const data = parsePayload(location.hash) || parsePayload(location.search);
        if (!data) return;
        try { history.replaceState(null, "", location.pathname); } catch (e) {}
        setTimeout(() => apply(data, "رابط تحويل — راجع البيانات"), 350);
    }


    /* -------- مسح QR بالكاميرا (مع نماذج جاهزة كبديل دون كاميرا) -------- */

    async function scan() {
        const quick = Store.quickContacts().slice(0, 6);

        const overlay = document.createElement("div");
        overlay.className = "scan-overlay";
        overlay.innerHTML = `
            <div class="scan-card">
                <div class="scan-head">
                    <div class="scan-title"><span class="scan-badge">⌗</span> ماسح QR دون إنترنت</div>
                    <button type="button" class="scan-close" aria-label="إغلاق">✕</button>
                </div>
                <p class="scan-sub">امسح رمز المستلم لتعبئة بيانات التحويل تلقائيًا</p>
                <div class="scan-video-wrap">
                    <video playsinline muted></video>
                    <div class="scan-frame"></div>
                    <p class="scan-hint">وجّه الكاميرا نحو رمز QR الخاص بالتاجر أو الزميل</p>
                </div>
                ${quick.length ? `
                    <div class="scan-quick-title">أو اختر نموذجًا جاهزًا للمسح الفوري:</div>
                    <div class="scan-quick-list">
                        ${quick.map(c => `
                            <button type="button" class="scan-quick-item" data-id="${c.id}">
                                <span>${App.esc(c.name)}</span>
                                <b>${App.esc(Store.maskPhone(c.phone))}</b>
                            </button>`).join("")}
                    </div>` : ""}
            </div>
        `;
        document.body.appendChild(overlay);

        let stream = null, done = false;
        const stop = () => {
            if (done) return;
            done = true;
            if (stream) stream.getTracks().forEach(t => t.stop());
            overlay.remove();
        };
        overlay.querySelector(".scan-close").addEventListener("click", stop);
        overlay.querySelectorAll(".scan-quick-item").forEach(btn => {
            btn.addEventListener("click", () => {
                const c = Store.getContact(btn.dataset.id);
                stop();
                if (c) apply({ service: Store.SERVICES[c.network] ? c.network : DEFAULT_SERVICE, receiver: c.phone }, "تم اختيار " + c.name);
            });
        });

        const videoWrap = overlay.querySelector(".scan-video-wrap");
        const hint = overlay.querySelector(".scan-hint");
        const video = overlay.querySelector("video");

        if (!("BarcodeDetector" in window)) {
            hint.textContent = "المسح بالكاميرا غير مدعوم بهذا المتصفح — اختر نموذجًا أدناه";
            video.remove();
            return;
        }

        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        } catch (e) {
            hint.textContent = "تعذّر فتح الكاميرا — اختر نموذجًا أدناه أو تحقّق من الإذن";
            video.remove();
            return;
        }
        video.srcObject = stream;
        try { await video.play(); } catch (e) {}

        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        (async function loop() {
            while (!done) {
                try {
                    const codes = await detector.detect(video);
                    if (codes && codes.length) {
                        const data = parsePayload(codes[0].rawValue || "");
                        if (data) { stop(); apply(data, "تم المسح"); return; }
                    }
                } catch (e) {}
                await new Promise(r => setTimeout(r, 300));
            }
        })();
    }
    App.scanQR = scan;


    /* -------- عرض QR في ورقة -------- */

    App.showQR = function (text, title, subtitle) {
        if (!window.QRGen) { App.toast("مولّد QR غير متاح"); return; }
        App.openSheet(`
            <div class="sheet-title">${App.esc(title || "رمز QR")}</div>
            ${subtitle ? `<div class="sheet-sub">${App.esc(subtitle)}</div>` : ""}
            <div class="qr-holder" id="qrHolder"></div>
            <div class="qr-link" id="qrLink">${App.esc(text)}</div>
            <button class="main-button" id="qrShare" type="button">↗ مشاركة الرابط</button>
        `);
        try {
            const canvas = QRGen.toCanvas(text, 720);
            canvas.className = "qr-canvas";
            document.getElementById("qrHolder").appendChild(canvas);
        } catch (e) {
            document.getElementById("qrHolder").textContent = "تعذّر إنشاء الرمز: " + (e.message || e);
        }
        document.getElementById("qrShare").addEventListener("click", async () => {
            if (navigator.share) {
                try { await navigator.share({ title: "الكود الوسيط", text: title || "رابط تحويل", url: text }); return; }
                catch (e) { if (e && e.name === "AbortError") return; }
            }
            try { await navigator.clipboard.writeText(text); App.toast("نُسخ الرابط 📋"); }
            catch (e) { App.toast(text); }
        });
    };


    /* -------- مشاركة رابط تحويل -------- */

    App.shareTransfer = async function (data, label) {
        const url = buildLink(data);
        if (navigator.share) {
            try {
                await navigator.share({ title: "الكود الوسيط", text: label || "رابط تحويل", url });
                return;
            } catch (e) {
                if (e && e.name === "AbortError") return;
            }
        }
        try { await navigator.clipboard.writeText(url); App.toast("نُسخ رابط التحويل 📋"); }
        catch (e) { App.toast(url); }
    };


    /* -------- ورقة "استلم تحويلًا" -------- */

    App.receiveSheet = function () {
        const s = Store.getSettings();
        const mine = s.myPhone || "";
        App.openSheet(`
            <div class="sheet-title">استلم تحويلًا</div>
            <div class="sheet-sub">أنشئ رابطًا أو رمز QR يفتح شاشة تحويل جوال بي معبّأة برقمك، وشاركه مع من سيحوّل لك.</div>
            <div class="input-group">
                <label>رقمي</label>
                <input id="rcvPhone" type="tel" inputmode="numeric" value="${App.esc(mine)}" placeholder="05XXXXXXXX">
            </div>
            <div class="input-group">
                <label>المبلغ <span>(اختياري)</span></label>
                <input id="rcvAmount" type="number" inputmode="decimal" placeholder="بلا مبلغ = يختاره المُرسِل">
            </div>
            <button class="main-button" id="rcvQr" type="button">▦ أظهر رمز QR</button>
            <button class="sheet-menu-btn" id="rcvShare" type="button">↗ مشاركة الرابط فقط</button>
        `);

        function collect() {
            const phone = Store.cleanNum(document.getElementById("rcvPhone").value);
            if (!phone) { App.toast("أدخل رقمك"); return null; }
            const amount = Store.cleanAmt(document.getElementById("rcvAmount").value);
            if (phone !== mine) Store.saveSettings({ myPhone: phone });
            return { service: DEFAULT_SERVICE, payment: "friend", phone, amount };
        }

        document.getElementById("rcvQr").addEventListener("click", () => {
            const d = collect();
            if (!d) return;
            App.showQR(buildLink(d), "حوّل لي", d.amount ? d.amount + " ₪ إلى " + d.phone : d.phone);
        });
        document.getElementById("rcvShare").addEventListener("click", () => {
            const d = collect();
            if (!d) return;
            App.closeSheet();
            App.shareTransfer(d, "حوّل لي عبر الكود الوسيط");
        });
    };


    document.addEventListener("DOMContentLoaded", consumeUrl);
    if (document.readyState !== "loading") consumeUrl();

})();
