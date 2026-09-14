/* ==================================================
   lock.js — قفل التطبيق برمز من 6 أرقام (حقل نصي مقنَّع) + تلميح
================================================== */

(function () {

    const PIN_LEN = 6;
    const HINT_AFTER_TRIES = 3;

    const screen = document.getElementById("lockScreen");
    const logo = document.getElementById("lockLogo");
    const appLogo = document.getElementById("lockAppLogo");
    const msg = document.getElementById("lockMsg");
    const fieldGroup = document.getElementById("lockFieldGroup");
    const input = document.getElementById("lockPasswordInput");
    const toggleShow = document.getElementById("lockToggleShow");
    const submitBtn = document.getElementById("lockSubmit");
    const bioBtn = document.getElementById("lockBio");
    const forgotBtn = document.getElementById("lockForgot");
    const rememberRow = document.getElementById("lockRememberRow");
    const rememberInput = document.getElementById("lockRemember");
    const shield = document.getElementById("lockShield");

    if (!screen || !input) return;

    let mode = "verify";        // verify | set | confirm
    let firstPin = "";
    let onDone = null;
    let wrongTries = 0;

    function syncBioButton() {
        if (!bioBtn) return;
        const s = Store.getSettings();
        const on = mode === "verify" && s.biometric &&
            window.Bio && (Bio.supported() || s.webauthnCred);
        bioBtn.hidden = !on;
    }

    function syncForgotButton() {
        if (!forgotBtn) return;
        forgotBtn.hidden = mode !== "verify" || wrongTries < HINT_AFTER_TRIES;
    }

    if (bioBtn) bioBtn.addEventListener("click", () => {
        bioBtn.disabled = true;
        Promise.resolve(window.Bio && Bio.tryUnlock()).finally(() => { bioBtn.disabled = false; });
    });

    if (toggleShow) toggleShow.addEventListener("click", () => {
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        toggleShow.textContent = show ? "🙈" : "👁";
        toggleShow.setAttribute("aria-label", show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
        input.focus();
    });

    if (forgotBtn) forgotBtn.addEventListener("click", () => {
        const s = Store.getSettings();
        const hint = (s.pinHint || "").trim();
        App.openSheet(`
            <div class="sheet-title">نسيت كلمة المرور؟</div>
            ${hint
                ? `<div class="sheet-sub">تلميحك:</div><p class="about-text" style="font-size:15px;font-weight:800;">${App.esc(hint)}</p>`
                : `<div class="sheet-sub">لم تُسجّل تلميحًا. يمكنك إضافته من «حول التطبيق ‹ الأمان» بعد الدخول.</div>`}
            <div class="sheet-sub" style="margin-top:14px;">
                لا يمكن استعادة كلمة المرور. إن نسيتها نهائيًا، الخيار الوحيد حذف البيانات على هذا الجهاز والبدء من جديد
                (نسختك الاحتياطية إن وُجدت تبقى سليمة).
            </div>
            <button class="sheet-menu-btn danger" id="forgotWipe" type="button">🗑 حذف البيانات والبدء من جديد</button>
            <button class="sheet-menu-btn" id="forgotBack" type="button">رجوع</button>
        `);
        document.getElementById("forgotBack").addEventListener("click", () => App.closeSheet());
        document.getElementById("forgotWipe").addEventListener("click", () => {
            App.openSheet(`
                <div class="sheet-title">تأكيد الحذف</div>
                <div class="sheet-sub">سيُحذف كل شيء على هذا الجهاز نهائيًا: الجهات، السجل، الإعدادات، والقفل.</div>
                <button class="sheet-menu-btn danger" id="wipeSure" type="button">نعم، احذف كل شيء</button>
                <button class="sheet-menu-btn" id="wipeCancel" type="button">إلغاء</button>
            `);
            document.getElementById("wipeCancel").addEventListener("click", () => App.closeSheet());
            document.getElementById("wipeSure").addEventListener("click", () => {
                Store.wipeAll();
                try { localStorage.removeItem("kw_onboarded"); } catch (e) {}
                location.reload();
            });
        });
    });

    input.addEventListener("input", () => {
        input.value = input.value.replace(/\D/g, "").slice(0, PIN_LEN);
    });
    input.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); submit(); }
    });
    if (submitBtn) submitBtn.addEventListener("click", submit);

    function shake() {
        const card = screen.querySelector(".lock-inner");
        if (card) card.animate([
            { transform: "translateX(0)" },
            { transform: "translateX(-8px)" },
            { transform: "translateX(8px)" },
            { transform: "translateX(0)" },
        ], { duration: 220 });
    }

    async function submit() {
        if (mode === "welcome") { finish(true); return; }

        const attempt = input.value;
        if (!attempt) { input.focus(); return; }
        try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) {}

        if (mode === "verify") {
            const ok = await Store.verifyPin(attempt);
            if (ok) {
                wrongTries = 0;
                Store.saveSettings({ rememberDevice: !!(rememberInput && rememberInput.checked) });
                finish(true);
                return;
            }
            wrongTries++;
            input.value = "";
            shake();
            syncForgotButton();
            // تأخير تصاعدي بسيط بعد 3 محاولات
            if (wrongTries >= 3) {
                const wait = Math.min(30, (wrongTries - 2) * 5);
                lockInput(wait);
                msg.textContent = "محاولات كثيرة — انتظر " + wait + " ثانية";
            } else {
                msg.textContent = "كلمة مرور غير صحيحة، حاول مجددًا";
            }
            return;
        }

        if (mode === "set") {
            if (attempt.length < PIN_LEN) { msg.textContent = "أدخل " + PIN_LEN + " أرقام كاملة"; shake(); return; }
            firstPin = attempt;
            input.value = "";
            mode = "confirm";
            msg.textContent = "أعد إدخال كلمة المرور للتأكيد";
            input.focus();
            return;
        }

        if (mode === "confirm") {
            if (attempt === firstPin) {
                await Store.setPin(firstPin);
                finish(true);
            } else {
                input.value = "";
                firstPin = "";
                shake();
                mode = "set";
                msg.textContent = "لم تتطابق كلمة المرور، أدخل رمزًا جديدًا من " + PIN_LEN + " أرقام";
                input.focus();
            }
        }
    }

    function lockInput(seconds) {
        input.disabled = true;
        if (submitBtn) submitBtn.disabled = true;
        setTimeout(() => {
            input.disabled = false;
            if (submitBtn) submitBtn.disabled = false;
            msg.textContent = "أدخل كلمة المرور للدخول";
            input.focus();
        }, seconds * 1000);
    }

    function closeScreen() {
        screen.classList.add("hidden");
        screen.classList.remove("lock-exit");
        input.value = "";
        firstPin = "";
        if (onDone) onDone(true);
        onDone = null;
    }

    function finish(ok) {
        if (!ok) {
            screen.classList.add("hidden");
            input.value = "";
            firstPin = "";
            if (onDone) onDone(false);
            onDone = null;
            return;
        }

        const showShield = mode === "verify" && shield;

        const playExit = () => {
            screen.classList.add("lock-exit");
            setTimeout(closeScreen, 460);
        };

        if (showShield) {
            shield.classList.remove("show");
            void shield.offsetWidth;
            shield.classList.add("show");
            try { if (navigator.vibrate) navigator.vibrate([15, 40, 15]); } catch (e) {}
            setTimeout(() => { shield.classList.remove("show"); playExit(); }, 750);
        } else {
            playExit();
        }
    }

    function playLogoIntro() {
        [appLogo, logo].forEach(el => {
            if (!el || el.hidden) return;
            el.classList.remove("lock-logo-in");
            void el.offsetWidth;
            el.classList.add("lock-logo-in");
        });
    }

    function openScreen(newMode, message) {
        mode = newMode;
        firstPin = "";
        wrongTries = 0;
        input.value = "";
        input.type = "password";
        if (toggleShow) { toggleShow.textContent = "👁"; toggleShow.setAttribute("aria-label", "إظهار كلمة المرور"); }

        const isWelcome = newMode === "welcome";
        screen.classList.toggle("welcome-mode", isWelcome);
        if (logo) logo.hidden = isWelcome;
        if (fieldGroup) fieldGroup.hidden = isWelcome;
        if (rememberRow) rememberRow.hidden = newMode !== "verify";
        if (rememberInput) rememberInput.checked = !!Store.getSettings().rememberDevice;

        syncBioButton();
        syncForgotButton();
        msg.textContent = message || "";
        msg.hidden = !message;
        screen.classList.remove("hidden");
        playLogoIntro();
        if (!isWelcome) setTimeout(() => input.focus(), 200);
    }

    /* -------- الواجهة العامة -------- */

    window.Lock = {

        guard(isBoot) {
            const s = Store.getSettings();
            if (s.pinEnabled && (s.pinHash || s.pin)) {
                openScreen("verify", "أدخل كلمة المرور للدخول");
                if (window.Bio) {
                    Bio.tryUnlock();
                    if (Bio.onReady) Bio.onReady(() => syncBioButton());
                }
            } else if (isBoot) {
                openScreen("welcome", "");
            }
        },

        setup(cb) {
            onDone = cb;
            openScreen("set", "أدخل رمزًا جديدًا مكوّنًا من " + PIN_LEN + " أرقام");
        },

        disable(cb) {
            onDone = function (ok) { if (ok) Store.clearPin(); cb(ok); };
            openScreen("verify", "أدخل كلمة المرور الحالية لإلغاء القفل");
        },

        unlock() { finish(true); },
    };

    Lock.guard(true);


    /* -------- إعادة القفل بعد مدة في الخلفية -------- */

    let hiddenAt = 0;

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }

        if (!hiddenAt) return;
        const away = Date.now() - hiddenAt;
        hiddenAt = 0;

        const s = Store.getSettings();
        if (!s.pinEnabled || !(s.pinHash || s.pin)) return;
        if (!screen.classList.contains("hidden")) return;
        if (s.rememberDevice) return;

        const limit = Number.isFinite(Number(s.lockAfter)) ? Number(s.lockAfter) : 90;
        if (limit < 0) return;

        let pending = false;
        try { pending = !!sessionStorage.getItem("kw_pending_op"); } catch (e) {}
        if (pending && away < 180000) return;

        if (away >= limit * 1000) Lock.guard();
    });

})();
