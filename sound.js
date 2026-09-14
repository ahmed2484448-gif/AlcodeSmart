/* ==================================================
   sound.js — أصوات واجهة قصيرة تُولَّد برمجيًا (Web Audio API)
   لا ملفات صوتية — نغمات قصيرة ناعمة، مختلفة حسب الحدث.
================================================== */

window.Sound = (function () {
    "use strict";

    let ctx = null;
    function getCtx() {
        try {
            if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (ctx.state === "suspended") ctx.resume().catch(() => {});
            return ctx;
        } catch (e) { return null; }
    }

    function enabled() {
        try { return Store.getSettings().soundEnabled !== false; } catch (e) { return true; }
    }

    /* نغمة واحدة بمغلّف صوتي ناعم (Attack/Decay) — لا نقرة حادة ولا صدى مزعج */
    function tone(freq, duration, opts) {
        if (!enabled()) return;
        const c = getCtx();
        if (!c) return;
        opts = opts || {};
        const now = c.currentTime;
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = opts.type || "sine";
        osc.frequency.setValueAtTime(freq, now);
        if (opts.sweepTo) osc.frequency.exponentialRampToValueAtTime(opts.sweepTo, now + duration * 0.85);
        const peak = opts.gain != null ? opts.gain : 0.1;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(peak, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain).connect(c.destination);
        osc.start(now);
        osc.stop(now + duration + 0.02);
    }

    function click() { tone(760, 0.05, { type: "sine", gain: 0.07 }); }
    function nav() { tone(520, 0.08, { type: "sine", gain: 0.08, sweepTo: 780 }); }
    function processing() { tone(600, 0.09, { type: "triangle", gain: 0.07 }); }
    function success() {
        tone(660, 0.1, { type: "sine", gain: 0.09 });
        setTimeout(() => tone(880, 0.14, { type: "sine", gain: 0.09 }), 90);
    }
    function error() { tone(320, 0.18, { type: "sine", gain: 0.08, sweepTo: 170 }); }

    function isEnabled() { return enabled(); }
    function setEnabled(v) { Store.saveSettings({ soundEnabled: !!v }); }
    function toggle() { const v = !enabled(); setEnabled(v); if (v) click(); return v; }

    return { click, nav, processing, success, error, isEnabled, setEnabled, toggle };
})();
