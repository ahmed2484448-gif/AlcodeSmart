/* ==================================================
   native.js — الجسر مع أندرويد + القفل الحيوي (بصمة / وجه)
   يدعم مسارين:
   1) جسر أندرويد الأصلي (window.KWNative) — BiometricPrompt يشمل الوجه والإصبع.
   2) WebAuthn (منصّة) — Face ID على iOS، Windows Hello، بصمة/وجه أندرويد على الويب.
================================================== */

/* -------- فتح صفحة من اختصار/ودجت -------- */

window.__openPage = function (target) {
    if (!target) return;
    const run = () => {
        const known = ["transferPage", "contactsPage", "historyPage", "debtsPage", "aboutPage"];
        const id = known.indexOf(target) !== -1 ? target : (target + "Page");
        App.go(known.indexOf(id) !== -1 ? id : "transferPage");
    };
    if (window.App && document.querySelector(".nav-button")) run();
    else window.addEventListener("load", () => setTimeout(run, 300));
};


/* -------- القفل الحيوي -------- */

window.Bio = (function () {

    let _supported = false;               // مخبّأ للاستخدام المتزامن في الإعدادات
    let _onReady = null;
    let _nativeResolver = null;

    window.__bioResult = function (ok) {
        if (_nativeResolver) { _nativeResolver(ok === true || ok === "true"); _nativeResolver = null; }
    };

    /* ---- أدوات ---- */

    function rand(n) {
        const a = new Uint8Array(n);
        (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => a[i] = Math.random() * 256);
        return a;
    }
    function b64(bytes) { let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
    function unb64(str) { const bin = atob(str), o = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; }

    function hasNative() {
        try { return !!(window.KWNative && window.KWNative.biometricAvailable && window.KWNative.biometricAvailable()); }
        catch (e) { return false; }
    }
    async function hasWebAuthn() {
        try {
            return !!(window.PublicKeyCredential &&
                await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
        } catch (e) { return false; }
    }

    /* ---- الجسر الأصلي ---- */

    function nativePrompt() {
        return new Promise(resolve => {
            _nativeResolver = resolve;
            try { window.KWNative.biometricPrompt(); }
            catch (e) { resolve(false); _nativeResolver = null; }
            setTimeout(() => { if (_nativeResolver) { _nativeResolver(false); _nativeResolver = null; } }, 30000);
        });
    }

    /* ---- WebAuthn ---- */

    async function webauthnEnroll() {
        try {
            const cred = await navigator.credentials.create({
                publicKey: {
                    challenge: rand(32),
                    rp: { name: "الكود الوسيط", id: location.hostname || undefined },
                    user: { id: rand(16), name: "quds-user", displayName: "مستخدم الكود الوسيط" },
                    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
                    authenticatorSelection: {
                        authenticatorAttachment: "platform",
                        userVerification: "required",
                        residentKey: "preferred",
                    },
                    timeout: 60000,
                    attestation: "none",
                },
            });
            if (!cred) return false;
            Store.saveSettings({ webauthnCred: b64(new Uint8Array(cred.rawId)) });
            return true;
        } catch (e) { return false; }
    }

    async function webauthnVerify() {
        const id = Store.getSettings().webauthnCred;
        if (!id) return false;
        try {
            const assertion = await navigator.credentials.get({
                publicKey: {
                    challenge: rand(32),
                    allowCredentials: [{ type: "public-key", id: unb64(id) }],
                    userVerification: "required",
                    timeout: 60000,
                },
            });
            return !!assertion;
        } catch (e) { return false; }
    }

    /* ---- الواجهة العامة ---- */

    function supported() { return _supported; }

    // تفعيل: يُطلب من الإعدادات
    async function enroll() {
        if (hasNative()) return await nativePrompt();
        if (await hasWebAuthn()) return await webauthnEnroll();
        return false;
    }

    // تحقّق: يُطلب من شاشة القفل
    async function verify() {
        if (hasNative()) return await nativePrompt();
        if (Store.getSettings().webauthnCred) return await webauthnVerify();
        return false;
    }

    function disable() {
        Store.saveSettings({ webauthnCred: "" });
    }

    async function tryUnlock() {
        const s = Store.getSettings();
        if (!s.biometric) return;
        if (!hasNative() && !s.webauthnCred) return;
        const ok = await verify();
        if (ok && window.Lock) Lock.unlock();
    }

    // fallback القديم (استُعمل في نسخ سابقة)
    const prompt = verify;

    /* ---- تهيئة ---- */

    (async function init() {
        _supported = hasNative() || await hasWebAuthn();
        if (typeof _onReady === "function") _onReady(_supported);
    })();

    function onReady(cb) {
        _onReady = cb;
        if (_supported) cb(true);
    }

    return { supported, onReady, enroll, verify, disable, tryUnlock, prompt };

})();


/* لو شاشة القفل ظاهرة عند تحميل هذا الملف، جرّب البصمة */
(function () {
    const ls = document.getElementById("lockScreen");
    if (ls && !ls.classList.contains("hidden")) {
        setTimeout(() => Bio.tryUnlock(), 200);
    }
})();
