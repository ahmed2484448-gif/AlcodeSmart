/* ==================================================
   fx.js — التأثيرات الحركية الدقيقة
   (Ripple + لمعة جهة التحويل + Animation النجاح)
================================================== */

(function () {

    /* -------- موجة Ripple على الأزرار -------- */

    const RIPPLE_SEL =
        ".main-button, .mini-btn, .q-send, .contact-send, " +
        ".confirm-buttons button, .sheet-menu-btn, .amount-chips button, " +
        ".zikr-count-btn, .filled-btn, .payment-type, .call-button, .secondary-button";

    document.addEventListener("pointerdown", e => {
        const btn = e.target.closest(RIPPLE_SEL);
        if (!btn) return;

        const rect = btn.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const rp = document.createElement("span");
        rp.className = "rp";
        rp.style.width = rp.style.height = size + "px";
        rp.style.left = (e.clientX - rect.left - size / 2) + "px";
        rp.style.top = (e.clientY - rect.top - size / 2) + "px";
        btn.appendChild(rp);
        setTimeout(() => rp.remove(), 650);
    }, { passive: true });


    /* -------- لمعة بلون علامة جهة التحويل -------- */

    document.querySelectorAll(".service").forEach(s => {
        s.addEventListener("click", () => {
            s.classList.remove("flash");
            // إعادة تشغيل الأنيميشن
            void s.offsetWidth;
            s.classList.add("flash");
            try {
                if (navigator.vibrate) navigator.vibrate(12);
            } catch (err) {}
        });
    });


    /* -------- Animation نجاح التحويل -------- */

    window.successBurst = function (text) {
        const old = document.getElementById("successFX");
        if (old) old.remove();

        const el = document.createElement("div");
        el.id = "successFX";
        el.innerHTML =
            '<div class="sb-circle">✓</div>' +
            '<div class="sb-text">' +
            (text || "تم تسجيل العملية") +
            "</div>";
        document.body.appendChild(el);

        try {
            if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
        } catch (err) {}

        setTimeout(() => {
            el.style.transition = "opacity .3s ease";
            el.style.opacity = "0";
            setTimeout(() => el.remove(), 320);
        }, 1100);
    };

})();
