/* ==================================================
   cards.js — صفحة "بطاقاتي"
   بطاقات يضيفها المستخدم بنفسه (اسم بالإنجليزي + شبكة + رقم جوال)
   مع رصيد يديره ويشحنه يدويًا — بلا أي اتصال حقيقي ببنك أو شركة اتصالات.
================================================== */

window.Cards = (function () {

    const stackEl = document.getElementById("cardsStack");
    const balanceEl = document.getElementById("cardsActiveBalance");
    const esc = App.esc;

    let order = [];   // ترتيب المعرّفات — الأول هو البطاقة الأمامية (النشطة)، مشترك بين اللوحة والصفحة الكاملة

    /* -------- حالة Card Focus + تدفّق العملية داخل البطاقة (State Machine واحدة بدل Booleans متعارضة) -------- */
    let focusedId = null;     // معرّف البطاقة الحالية بوضع Focus، أو null
    let isAnimating = false;  // قفل يمنع تشغيل حركة فوق حركة (Focus/رجوع/تبديل) لسا جارية
    let txnState = null;      // { cardId, kind, step: "recipient"|"amount"|"review", recipient, amount, locked } أو null

    document.getElementById("addCardBtn")
        .addEventListener("click", () => editSheet(null));

    document.getElementById("cardsBackBtn")
        .addEventListener("click", () => window.switchPage("transferPage"));

    const playgroundBtn = document.getElementById("playgroundBtn");
    if (playgroundBtn) playgroundBtn.addEventListener("click", () => {
        if (window.Playground) Playground.open(order[0] || null);
    });


    /* -------- المكدّس ثلاثي الأبعاد (مشترك بين لوحة التحكم والصفحة الكاملة) -------- */

    /* مبلغ الرصيد بالدولار مقابل الشيكل — يظهر فقط لو المستخدم حدّد سعر الصرف بالإعدادات (لا نخمّن سعرًا) */
    function usdEquivalentHtml(ils) {
        const rate = Number(Store.getSettings().usdRate) || 0;
        if (rate <= 0) return "";
        return `<small class="bank-card-usd privacy-sensitive">≈ ${Store.money((ils || 0) / rate)} $</small>`;
    }

    /* رقم بأسلوب بطاقة حقيقية — آخر 4 أرقام فقط، بغض النظر عن إعداد "إخفاء الأرقام" العام */
    function cardNumberDisplay(phone) {
        const digits = Store.cleanNum(phone);
        const last4 = (digits.slice(-4) || "0000").padStart(4, "0");
        return `•••• •••• ${last4}`;
    }

    const CONTACTLESS_SVG = `
        <svg class="bank-card-wave" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M4.5 10.5a11 11 0 0 1 15 0" stroke="rgba(255,255,255,.8)" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M7.3 13.6a7 7 0 0 1 9.4 0" stroke="rgba(255,255,255,.8)" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M10.1 16.7a3 3 0 0 1 3.8 0" stroke="rgba(255,255,255,.8)" stroke-width="1.8" stroke-linecap="round"/>
        </svg>`;

    function cardFaceHtml(c) {
        const net = Store.SERVICES[c.network] || {};
        return `
            <span class="bank-card-sheen" aria-hidden="true"></span>
            <div class="bank-card-head">
                <div class="bank-card-wallet-name">
                    <span class="bank-card-wallet-title">${esc(net.name || "")}</span>
                    <span class="bank-card-wallet-type">Digital Wallet Card</span>
                </div>
                <img class="bank-card-logo" src="${net.logo || ""}" alt="${esc(net.name || "")}">
            </div>
            <div class="bank-card-chip-row">
                <span class="bank-card-chip"></span>
                ${CONTACTLESS_SVG}
            </div>
            <div class="bank-card-number privacy-sensitive">${cardNumberDisplay(c.phone)}</div>
            <div class="bank-card-holder">${esc((c.name || "").toUpperCase())}</div>
            <div class="bank-card-footer">
                <div class="bank-card-footer-bal">
                    <small>الرصيد</small>
                    <strong class="privacy-sensitive">${Store.money(c.balance || 0)} ₪</strong>
                    ${usdEquivalentHtml(c.balance)}
                </div>
                <span class="bank-card-status"><i></i>نشطة</span>
            </div>`;
    }

    function cardWrapHtml(c, i, wide) {
        return `
            <div class="bank-card-wrap" data-id="${c.id}" style="transform:${stackTransform(i, wide)};z-index:${zFor(i)};opacity:${opacityFor(i)};">
                <div class="bank-card-flip">
                    <button class="bank-card bank-card-face-front" data-service="${c.network}" type="button">
                        ${cardFaceHtml(c)}
                    </button>
                    <div class="bank-card bank-card-face-back" data-service="${c.network}"></div>
                </div>
            </div>`;
    }

    /* ==================================================
       الحركة ثلاثية الأبعاد Premium — تكديس بعمق حقيقي + إمالة تفاعلية
       + سحب/تقليب سينمائي + توهّج وانعكاس ضوئي، بأداء 60fps (transform/opacity فقط)
    ================================================== */

    const SWIPE_THRESHOLD = 60;
    const TILT_MAX = 11; // درجات — "فخم لا مبالغ فيه"
    const REDUCED_MOTION = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    function zFor(i) { return 60 - Math.min(i, 4) * 10; }
    /* بطاقات خلفية واضحة المعالم (٩٠٪-٩٦٪) لا باهتة — فقط البطاقة الأمامية بكامل الوضوح */
    function opacityFor(i) { return i === 0 ? 1 : Math.max(.82, .96 - Math.min(i, 4) * 0.045); }

    /* الوضع الأساسي (بلا تفاعل) لكل عمق — مروحة بطاقات حقيقية: rotateZ + translateX جانبيًا
       مع translateZ/rotateX خفيفين لعمق ثلاثي أبعاد فعلي (وليس مجرد تكديس مسطّح)
       wide=true (صفحة "بطاقاتي" الكاملة بعد "عرض الكل") يبعثر البطاقات أكثر — أقرب لإحساس Orbit/Cover-Flow
       من المعاينة المصغّرة الهادئة باللوحة الرئيسية (wide=false) */
    function stackTransform(i, wide) {
        if (i === 0) return "translate3d(0, 0, 30px) rotateZ(0deg) rotateX(0deg) scale(1)";
        const side = i % 2 ? 1 : -1; // البطاقة الفردية (الثانية) تميل يمينًا، الزوجية (الثالثة) يسارًا
        const depth = Math.min(i, 4);
        const spread = wide ? 1.25 : 1;
        const tx = side * (16 + depth * 4) * spread;   // معتدل كي لا تخرج البطاقة خارج الشاشة على العرض الضيق (320px)
        const ty = (-6 - depth * 8) * (wide ? 0.7 : 1);
        const tz = 30 - depth * 16;
        const rz = side * (5 + depth * 1.2);
        const scale = 1 - depth * (wide ? 0.035 : 0.05);
        return `translate3d(${tx}px, ${ty}px, ${tz}px) rotateZ(${rz}deg) rotateX(${1 + depth}deg) scale(${scale})`;
    }

    function frontInteractiveTransform({ rx = 0, ry = 0, tx = 0, lifted = false, pressed = false }) {
        rx = Math.max(-TILT_MAX, Math.min(TILT_MAX, rx));
        ry = Math.max(-TILT_MAX, Math.min(TILT_MAX, ry));
        const z = lifted ? 44 : 28;
        const scale = pressed ? 0.97 : 1;
        return `translateX(${tx.toFixed(1)}px) translateZ(${z}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${scale})`;
    }

    function updateActiveBalance() {
        if (!balanceEl || balanceEl.hidden) return;
        const active = Store.getCard(order[0]);
        if (active) balanceEl.innerHTML = `<span>رصيد ${esc(active.name)}</span><strong class="privacy-sensitive">${Store.money(active.balance || 0)} ₪</strong>${usdEquivalentHtml(active.balance)}`;
    }

    /* يعيد ترتيب/تموضع البطاقات القائمة فعليًا بالـDOM (بلا إعادة بناء HTML) لحركة سينمائية سلسة بين الحالتين */
    function repositionStack(containerEl, animate) {
        if (!containerEl) return;
        const wide = containerEl === stackEl;
        const map = {};
        containerEl.querySelectorAll(".bank-card-wrap").forEach(el => { map[el.dataset.id] = el; });
        order.forEach((id, i) => {
            const el = map[id];
            if (!el) return;
            el.style.transition = animate
                ? "transform .6s cubic-bezier(.22,1,.36,1), opacity .4s ease"
                : "none";
            el.style.zIndex = String(zFor(i));
            el.style.opacity = String(opacityFor(i));
            el.style.transform = stackTransform(i, wide);
            el.classList.remove("bank-card-wrap-lifted", "bank-card-wrap-active", "bank-card-wrap-hover", "bank-card-wrap-flipped");
        });
    }

    function reorderTo(newOrder, activeContainerEl) {
        const frontChanged = newOrder[0] !== order[0];
        order = newOrder;
        [stackEl, document.getElementById("dashCardsStack")].forEach(container => {
            if (!container) return;
            repositionStack(container, container === activeContainerEl);
        });
        updateActiveBalance();
        if (frontChanged) {
            const front = Store.getCard(order[0]);
            if (front) Transfer.selectServiceSilently(front.network, front.id);
        }
    }

    function bringToFront(id, containerEl) {
        if (id === order[0]) return;
        reorderTo([id, ...order.filter(x => x !== id)], containerEl);
    }

    /* البطاقة الحالية "تُسحب" خارج المكدّس ثم تُستأنف حركتها للخلف؛ التالية تتقدّم بنفس اللحظة */
    function commitSwipe(el, containerEl, dir) {
        el.style.transition = "transform .5s cubic-bezier(.22,1,.36,1), opacity .35s ease";
        const outX = dir === "right" ? 240 : -240;
        el.style.transform = `translateX(${outX}px) translateZ(10px) rotateY(${dir === "right" ? -16 : 16}deg) rotateX(2deg) scale(.95)`;
        el.style.opacity = "0.35";
        const newOrder = [...order.slice(1), order[0]];
        setTimeout(() => reorderTo(newOrder, containerEl), 40);
    }

    function wireStack(containerEl) {
        containerEl.querySelectorAll(".bank-card-wrap").forEach(el => attachCardHandlers(el, containerEl));
    }

    function attachCardHandlers(el, containerEl) {
        if (el._cardsWired) return;
        el._cardsWired = true;

        const isFront = () => el.dataset.id === order[0];
        const isFlipped = () => el.classList.contains("bank-card-wrap-flipped");

        let mode = null; // "press" | "drag" | null
        let startX = 0, startY = 0, dx = 0, dy = 0, moved = false;
        let rafId = null;

        function scheduleTilt(px, py) {
            if (rafId) return;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                if (!isFront()) return;
                const rx = (0.5 - py) * TILT_MAX * 2;
                const ry = (px - 0.5) * TILT_MAX * 2;
                el.style.transition = "none";
                el.style.transform = frontInteractiveTransform({ rx, ry, lifted: true });
                el.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
                el.style.setProperty("--my", (py * 100).toFixed(1) + "%");
            });
        }

        function springBack() {
            el.style.transition = "transform .45s cubic-bezier(.34,1.56,.64,1)";
            el.style.transform = stackTransform(0);
            el.classList.remove("bank-card-wrap-lifted");
        }

        // إمالة تفاعلية بالماوس (Hover Tilt) — لا تُفعَّل باللمس (لِلَمس مسار السحب أدناه)، ولا أثناء Focus/قلب
        el.addEventListener("pointerenter", (e) => {
            if (REDUCED_MOTION || e.pointerType !== "mouse" || !isFront() || isFlipped() || focusedId || mode) return;
            el.classList.add("bank-card-wrap-hover", "bank-card-wrap-lifted");
        });
        el.addEventListener("pointermove", (e) => {
            if (REDUCED_MOTION || e.pointerType !== "mouse" || !isFront() || isFlipped() || focusedId || mode) return;
            const rect = el.getBoundingClientRect();
            scheduleTilt((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
        });
        el.addEventListener("pointerleave", (e) => {
            if (e.pointerType !== "mouse") return;
            el.classList.remove("bank-card-wrap-hover");
            if (isFront() && !isFlipped() && !focusedId && !mode) springBack();
        });

        // ضغط/سحب (فأرة أو لمس) — يشتغل فقط على البطاقة الأمامية غير المقلوبة وخارج وضع Focus
        el.addEventListener("pointerdown", (e) => {
            if (!isFront() || isFlipped() || focusedId) return;
            startX = e.clientX; startY = e.clientY; dx = 0; dy = 0; moved = false;
            try { el.setPointerCapture(e.pointerId); } catch (err) {}
            mode = "press";
            el.classList.add("bank-card-wrap-active", "bank-card-wrap-lifted");
            if (!REDUCED_MOTION) {
                el.style.transition = "none";
                el.style.transform = frontInteractiveTransform({ lifted: true, pressed: true });
            }
        });
        el.addEventListener("pointermove", (e) => {
            if (!mode) return;
            dx = e.clientX - startX; dy = e.clientY - startY;
            if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
            if (!moved || REDUCED_MOTION) return;
            mode = "drag";
            const rx = Math.max(-6, Math.min(6, -dy / 14));   // إمالة رأسية طفيفة فقط كي لا نتعارض مع تمرير الصفحة
            const ry = dx / 9;
            el.style.transition = "none";
            el.style.transform = frontInteractiveTransform({ rx, ry, tx: dx, lifted: true });
        });
        function endInteraction() {
            if (!mode) return;
            el.classList.remove("bank-card-wrap-active");
            if (mode === "drag" && Math.abs(dx) > SWIPE_THRESHOLD && order.length > 1) {
                commitSwipe(el, containerEl, dx > 0 ? "right" : "left");
            } else if (mode === "drag") {
                springBack();
            } else {
                // نقرة بسيطة (ضغط/رفع سريعان بلا سحب): أعد المقياس الطبيعي فقط
                el.style.transition = "transform .3s cubic-bezier(.34,1.56,.64,1)";
                el.style.transform = frontInteractiveTransform({ lifted: true });
            }
            mode = null;
        }
        el.addEventListener("pointerup", endInteraction);
        el.addEventListener("pointercancel", endInteraction);

        el.addEventListener("click", (e) => {
            e.stopPropagation();
            if (moved) { moved = false; return; }
            if (isFlipped()) return; // التعامل يتم عبر أزرار الوجه الخلفي نفسها
            if (isAnimating) return; // امنع تشغيل حركة جديدة فوق حركة لسا شغالة
            if (focusedId) {
                if (el.dataset.id === focusedId) { exitFocus(containerEl); return; }
                switchFocus(el.dataset.id, containerEl);
                return;
            }
            if (!isFront()) { bringToFront(el.dataset.id, containerEl); return; }
            enterFocus(el.dataset.id, containerEl);
        });
    }

    /* ==================================================
       Card Focus — الضغطة الأولى تُخرج البطاقة للأمام وتستقر، ثم تظهر
       إجراءاتها الذكية أسفلها تباعًا. الضغطة الثانية تعكس الحركة بالضبط.
    ================================================== */

    function focusTransform() {
        return "translate3d(0, -4px, 92px) rotateZ(0deg) rotateX(0deg) scale(1.07)";
    }
    /* تراجع بقية البطاقات خلال Focus — أعمق وأخفت قليلًا من وضعها الطبيعي، لكن تبقى ظاهرة بوضوح */
    function recedeTransform(i) {
        const depth = Math.max(1, Math.min(i, 4));
        const side = i % 2 ? 1 : -1;
        return `translate3d(${side * 10}px, ${-8 - depth * 4}px, ${-60 - depth * 12}px) rotateZ(${side * 3}deg) rotateX(${2 + depth}deg) scale(${0.92 - depth * 0.015})`;
    }

    const FOCUS_MS = 620, STAGGER_MS = 50;

    /* لوحة واحدة أسفل المكدّس تُستخدم لكل من الإجراءات الذكية وخطوات العملية — تُنشأ مرة وتُعاد تعبئتها */
    function getFocusPanel(containerEl) {
        let panel = containerEl.parentElement.querySelector(":scope > .card-focus-panel");
        if (!panel) {
            panel = document.createElement("div");
            panel.className = "card-focus-panel";
            panel.hidden = true;
            containerEl.after(panel);
        }
        return panel;
    }

    function enterFocus(id, containerEl) {
        if (isAnimating || focusedId) return;
        isAnimating = true;
        focusedId = id;
        containerEl.querySelectorAll(".bank-card-wrap").forEach(w => {
            w.style.transition = `transform ${FOCUS_MS}ms cubic-bezier(.22,1,.36,1), opacity .5s ease`;
            if (w.dataset.id === id) {
                w.classList.add("bank-card-wrap-focused");
                w.style.zIndex = "80";
                w.style.opacity = "1";
                w.style.transform = focusTransform();
            } else {
                w.style.transform = recedeTransform(order.indexOf(w.dataset.id));
                w.style.opacity = "0.74";
            }
        });
        App.haptic && App.haptic("click");
        setTimeout(() => {
            isAnimating = false;
            if (focusedId === id) revealFocusActions(id, containerEl);
        }, FOCUS_MS);
    }

    function exitFocus(containerEl, onDone) {
        if (!focusedId) { onDone && onDone(); return; }
        if (isAnimating) return;
        isAnimating = true;
        txnState = null;
        const panel = getFocusPanel(containerEl);
        const btns = Array.from(panel.querySelectorAll(":scope > .card-focus-actions > button, :scope > .card-txn-step button"));
        if (btns.length && !REDUCED_MOTION) {
            btns.slice().reverse().forEach((btn, i) => {
                btn.style.transitionDelay = (i * 40) + "ms";
                btn.style.opacity = "0";
                btn.style.transform = "translateY(10px)";
            });
        }
        const hideDelay = REDUCED_MOTION ? 0 : (220 + btns.length * 40);
        setTimeout(() => {
            panel.hidden = true;
            panel.innerHTML = "";
            const wide = containerEl === stackEl;
            containerEl.querySelectorAll(".bank-card-wrap").forEach(w => {
                const i = order.indexOf(w.dataset.id);
                w.style.transition = `transform ${FOCUS_MS}ms cubic-bezier(.22,1,.36,1), opacity .5s ease`;
                w.style.zIndex = String(zFor(i));
                w.style.opacity = String(opacityFor(i));
                w.style.transform = stackTransform(i, wide);
                w.classList.remove("bank-card-wrap-focused");
            });
            setTimeout(() => {
                isAnimating = false;
                focusedId = null;
                onDone && onDone();
            }, FOCUS_MS);
        }, hideDelay);
    }

    /* تبديل سينمائي: رجوع A كامل ثم تقدّم B — تبسيط مقصود لتفادي تعارض حركتين متزامنتين على نفس المكدّس */
    function switchFocus(newId, containerEl) {
        if (isAnimating || focusedId === newId) return;
        exitFocus(containerEl, () => enterFocus(newId, containerEl));
    }

    function walletActionItems(c) {
        const net = Store.SERVICES[c.network] || {};
        const base = net.needsPayment ? [
            { action: "friend", icon: "👤", label: "دفع لصديق" },
            { action: "merchant", icon: "🏪", label: "دفع لتاجر" },
        ] : [
            { action: "friend", icon: "🏦", label: "تنفيذ التحويل" },
        ];
        return base.concat([
            { action: "topup", icon: "📱", label: "شحن رصيد" },
            { action: "wallet", icon: "🔁", label: "تحويل بين محافظي" },
            { action: "history", icon: "💼", label: "فتح المحفظة" },
            { action: "flipview", icon: "🔄", label: "تفاصيل" },
        ]);
    }

    function revealFocusActions(id, containerEl) {
        const c = Store.getCard(id);
        if (!c || focusedId !== id) return;
        const panel = getFocusPanel(containerEl);
        const items = walletActionItems(c);
        panel.className = "card-focus-panel";
        panel.hidden = false;
        panel.innerHTML = `<div class="card-focus-actions">${items.map((it, i) => `
            <button class="card-focus-action" data-action="${it.action}" style="transition-delay:${i * STAGGER_MS}ms" type="button">
                <span>${it.icon}</span><span>${it.label}</span>
            </button>`).join("")}</div>`;
        void panel.offsetWidth;
        panel.classList.toggle("card-focus-actions-in", !REDUCED_MOTION);
        if (REDUCED_MOTION) panel.classList.add("card-focus-actions-in");
        panel.onclick = (e) => {
            e.stopPropagation();
            const btn = e.target.closest("button[data-action]");
            if (!btn) return;
            const action = btn.dataset.action;
            const wrapEl = containerEl.querySelector(`.bank-card-wrap[data-id="${id}"]`);
            if (action === "flipview") {
                exitFocus(containerEl, () => {
                    const w = containerEl.querySelector(`.bank-card-wrap[data-id="${id}"]`);
                    if (w) flipOpen(w, id);
                });
                return;
            }
            if (action === "topup") { topUpSheet(id); return; }
            if (action === "wallet") { walletTransferSheet(id); return; }
            if (action === "history" && wrapEl) { openCardPortal(id, wrapEl, containerEl); return; }
            if ((action === "friend" || action === "merchant") && wrapEl) {
                startTxn(action, id, wrapEl, containerEl);
            }
        };
    }

    /* ==================================================
       Card Portal (المرحلة ١) — البطاقة نفسها تتحوّل إلى صفحة سجلّها،
       بتقنية FLIP يدوية (transform فقط، بلا مكتبات) — العودة عكس مطابق تمامًا.
    ================================================== */

    function openCardPortal(id, wrapEl, containerEl) {
        if (isAnimating) return;
        isAnimating = true;

        const c = Store.getCard(id);
        const firstRect = wrapEl.getBoundingClientRect();

        const portal = document.createElement("div");
        portal.className = "card-portal";
        portal.dataset.service = c ? c.network : "";
        portal.innerHTML = `
            <div class="card-portal-inner">
                <div class="card-portal-head">
                    <button class="card-portal-back" type="button">→ رجوع</button>
                    <span>محفظة ${esc(c ? c.name : "")}</span>
                </div>
                <div class="card-portal-body" id="cardPortalBody-${id}"></div>
            </div>`;
        document.body.appendChild(portal);

        const lastRect = portal.getBoundingClientRect();
        const scaleX = firstRect.width / lastRect.width;
        const scaleY = firstRect.height / lastRect.height;
        const tx = (firstRect.left + firstRect.width / 2) - (lastRect.left + lastRect.width / 2);
        const ty = (firstRect.top + firstRect.height / 2) - (lastRect.top + lastRect.height / 2);
        const inner = portal.querySelector(".card-portal-inner");

        /* إغلاق سريع (بلا عكس-FLIP نحو البطاقة) — يُستخدم فقط عند تسليم Portal لـ Composer
           (المستخدم ذاهب قدمًا للمراجعة، لا "للخلف" نحو البطاقة) */
        function quickClosePortal() {
            isAnimating = false;
            wrapEl.style.visibility = "";
            focusedId = null;
            if (REDUCED_MOTION) { portal.remove(); return; }
            portal.style.transition = "opacity .2s ease";
            portal.style.opacity = "0";
            setTimeout(() => portal.remove(), 210);
        }

        if (REDUCED_MOTION) {
            wrapEl.style.visibility = "hidden";
            renderPortalBody(id, document.getElementById(`cardPortalBody-${id}`), quickClosePortal);
            isAnimating = false;
        } else {
            portal.style.transition = "none";
            portal.style.transform = `translate(${tx}px, ${ty}px) scale(${scaleX}, ${scaleY})`;
            portal.style.borderRadius = "18px";
            inner.style.opacity = "0";
            void portal.offsetWidth;

            portal.style.transition = "transform .68s cubic-bezier(.22,1,.36,1), border-radius .68s cubic-bezier(.22,1,.36,1)";
            portal.style.transform = "translate(0, 0) scale(1, 1)";
            portal.style.borderRadius = "0px";
            wrapEl.style.visibility = "hidden";

            setTimeout(() => {
                inner.style.transition = "opacity .3s ease";
                inner.style.opacity = "1";
                renderPortalBody(id, document.getElementById(`cardPortalBody-${id}`), quickClosePortal);
                isAnimating = false;
            }, 520);
        }

        portal.querySelector(".card-portal-back").addEventListener("click", () => closeCardPortal(portal, wrapEl, firstRect));
    }

    function closeCardPortal(portal, wrapEl, firstRect) {
        if (isAnimating) return;
        isAnimating = true;
        const inner = portal.querySelector(".card-portal-inner");

        if (REDUCED_MOTION) {
            portal.remove();
            wrapEl.style.visibility = "";
            isAnimating = false;
            return;
        }

        const lastRect = portal.getBoundingClientRect();
        const scaleX = firstRect.width / lastRect.width;
        const scaleY = firstRect.height / lastRect.height;
        const tx = (firstRect.left + firstRect.width / 2) - (lastRect.left + lastRect.width / 2);
        const ty = (firstRect.top + firstRect.height / 2) - (lastRect.top + lastRect.height / 2);

        inner.style.transition = "opacity .2s ease";
        inner.style.opacity = "0";
        portal.style.transition = "transform .62s cubic-bezier(.22,1,.36,1), border-radius .62s cubic-bezier(.22,1,.36,1)";
        portal.style.transform = `translate(${tx}px, ${ty}px) scale(${scaleX}, ${scaleY})`;
        portal.style.borderRadius = "18px";

        setTimeout(() => {
            portal.remove();
            wrapEl.style.visibility = "";
            isAnimating = false;
        }, 640);
    }

    /* يعيد استخدام نفس بنية/أسلوب .op-item الموجودة أصلًا بصفحة السجل — بيانات حقيقية فقط، مفلترة على هذه البطاقة
       limit: لعرض آخر N فقط (Wallet Portal)، أو بلا حد لعرض الكل */
    function renderCardHistory(id, bodyEl, limit) {
        if (!bodyEl) return;
        let ops = Store.getOps().filter(o => o.cardId === id);
        if (!ops.length) {
            bodyEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📜</div><h3>لا عمليات بعد</h3><p>أي تحويل تنفّذه من هذه البطاقة رح يظهر هون.</p></div>';
            return;
        }
        const total = ops.length;
        if (limit) ops = ops.slice(0, limit);
        bodyEl.innerHTML = ops.map((o, i) => {
            const icon = o.status === "success" ? "✅" : o.status === "failed" ? "❌" : "⏳";
            const title = o.name || o.serviceName || "عملية";
            const sub = [o.serviceName, o.phone ? Store.maskPhone(o.phone) : null, Store.timeOf(o.ts)].filter(Boolean).join("  •  ");
            return `
                <div class="op-item" data-id="${o.id}" style="--i:${Math.min(i, 12)}">
                    <span class="op-status-icon">${icon}</span>
                    <div class="op-main">
                        <div class="o-name">${esc(title)}</div>
                        <div class="o-sub">${esc(sub)}</div>
                    </div>
                    <div class="op-amount privacy-sensitive ${o.status === "failed" ? "failed" : ""}">${o.amount ? Store.money(o.amount) : "—"}</div>
                </div>`;
        }).join("");
        if (limit && total > limit) {
            const more = document.createElement("button");
            more.type = "button";
            more.className = "link-btn wp-show-all";
            more.textContent = `عرض كل العمليات (${total}) ›`;
            more.addEventListener("click", () => renderCardHistory(id, bodyEl, 0));
            bodyEl.appendChild(more);
        }
        bodyEl.querySelectorAll(".op-item").forEach(item => {
            item.addEventListener("click", () => { if (window.History) History.openOp(item.dataset.id); });
        });
    }

    /* ==================================================
       Wallet Portal — محتوى بوابة البطاقة: الرصيد (مع تحويل النقود بالسحب)
       + جهات سريعة + آخر العمليات. لا ينفّذ أي عملية بنفسه — يسلّم فقط لـ Composer الموجود.
    ================================================== */
    function renderPortalBody(id, bodyEl, closePortal) {
        if (!bodyEl) return;
        const c = Store.getCard(id);
        if (!c) return;
        const contacts = (window.Playground && Playground.contactsList) ? Playground.contactsList() : [];
        let selectedAmount = 0;

        bodyEl.innerHTML = `
            <button class="wp-balance-btn" id="wpBalanceBtn" type="button">
                <span>الرصيد — اضغط لتحويل مبلغ بالسحب</span>
                <strong class="privacy-sensitive">${Store.money(c.balance || 0)} ₪</strong>
                ${usdEquivalentHtml(c.balance)}
            </button>
            <div class="pg-tokens wp-tokens" id="wpTokens" hidden>
                ${[10, 20, 50, 100].map(v => `
                    <button class="pg-token" data-amount="${v}" type="button">
                        <span class="pg-token-amt">${v}</span><span class="pg-token-cur">₪</span>
                    </button>`).join("")}
            </div>
            ${contacts.length ? `
            <div class="wp-section-title">تحويل سريع</div>
            <div class="pg-contacts wp-contacts" id="wpContacts">
                ${contacts.map(ct => `
                    <button class="card-txn-contact pg-contact" data-id="${ct.id}" type="button">
                        <span class="card-txn-avatar">${(window.PhotoDB && PhotoDB.get(ct.id)) ? `<img src="${PhotoDB.get(ct.id)}">` : esc((ct.name || "?").charAt(0))}</span>
                        <span>${esc(ct.name)}</span>
                    </button>`).join("")}
            </div>` : ""}
            <div class="wp-section-title">آخر العمليات</div>
            <div id="wpHistBody"></div>
        `;

        renderCardHistory(id, bodyEl.querySelector("#wpHistBody"), 5);

        function completeWith(contact) {
            const fresh = Store.getCard(id);
            if (!fresh) return;
            if (fresh.network !== "bank" && selectedAmount > (fresh.balance || 0)) {
                App.toast("الرصيد غير كافٍ لإتمام العملية");
                return;
            }
            if (closePortal) closePortal();
            if (window.Composer && Composer.quickFill) {
                Composer.quickFill({
                    cardId: fresh.id,
                    contactId: contact.id,
                    recipientName: contact.name,
                    recipientPhone: contact.phone,
                    contactType: contact.type || "",
                    amount: selectedAmount,
                });
            }
        }

        const balBtn = bodyEl.querySelector("#wpBalanceBtn");
        const tokensWrap = bodyEl.querySelector("#wpTokens");
        if (balBtn && tokensWrap) {
            balBtn.addEventListener("click", () => { tokensWrap.hidden = !tokensWrap.hidden; });
            tokensWrap.querySelectorAll(".pg-token").forEach(tok => {
                tok.addEventListener("click", () => {
                    if (tok._justDragged) return;
                    const amt = Number(tok.dataset.amount);
                    selectedAmount = selectedAmount === amt ? 0 : amt;
                    tokensWrap.querySelectorAll(".pg-token").forEach(t => t.classList.toggle("pg-token-active", Number(t.dataset.amount) === selectedAmount));
                });
                if (window.Playground && Playground.attachMoneyDrag) {
                    Playground.attachMoneyDrag(tok, () => Number(tok.dataset.amount), {
                        targetSelector: ".pg-contact",
                        onMoved: amt => {
                            selectedAmount = amt;
                            tokensWrap.querySelectorAll(".pg-token").forEach(t => t.classList.toggle("pg-token-active", Number(t.dataset.amount) === amt));
                        },
                        onDrop: targetEl => {
                            const ct = Store.getContact(targetEl.dataset.id);
                            if (ct) completeWith(ct);
                        },
                    });
                }
            });
        }
        const contactsWrap = bodyEl.querySelector("#wpContacts");
        if (contactsWrap) contactsWrap.querySelectorAll(".pg-contact").forEach(btn => {
            btn.addEventListener("click", () => {
                if (!selectedAmount) { App.toast("اضغط الرصيد واختر مبلغًا أولًا"); return; }
                const ct = Store.getContact(btn.dataset.id);
                if (ct) completeWith(ct);
            });
        });
    }

    /* ==================================================
       تدفّق العملية داخل البطاقة — Recipient → Amount → Review → Transfer Beam
       ثم تسليم فعلي (بلا أي تكرار) لنظام USSD/التأكيد الحقيقي الموجود أصلًا بالتطبيق.
       أهم قاعدة: الحركة هنا Feedback بصري فقط — لا تُغيّر أي رصيد بنفسها إطلاقًا.
    ================================================== */

    function startTxn(kind, id, wrapEl, containerEl) {
        const c = Store.getCard(id);
        if (!c) return;
        txnState = { cardId: id, kind, step: "recipient", recipient: null, amount: 0, locked: false };
        const panel = getFocusPanel(containerEl);
        panel.className = "card-focus-panel";
        panel.hidden = false;
        panel.innerHTML = "";
        renderTxnPanel(panel, wrapEl, containerEl, id, "fwd");
    }

    function progressDotsHtml(step) {
        const idx = { recipient: 0, amount: 1, review: 2 }[step] || 0;
        return `<div class="card-txn-progress">${[0, 1, 2].map(i =>
            `<span class="card-txn-dot ${i <= idx ? "active" : ""}"></span>${i < 2 ? '<span class="card-txn-line"></span>' : ""}`
        ).join("")}</div>`;
    }

    function recipientStepHtml(c) {
        const quick = Store.quickContacts().slice(0, 4);
        const photo = cid => (window.PhotoDB ? PhotoDB.get(cid) : null);
        const chips = quick.map(x => `
            <button class="card-txn-contact" data-id="${x.id}" type="button">
                <span class="card-txn-avatar">${photo(x.id) ? `<img src="${photo(x.id)}">` : esc((x.name || "?").charAt(0))}</span>
                <span>${esc(x.name)}</span>
            </button>`).join("");
        return `
            <div class="card-txn-head">
                <button class="card-txn-back" data-txn="back" type="button">→</button>
                <span>إلى من تريد التحويل؟</span>
            </div>
            ${progressDotsHtml("recipient")}
            <div class="card-txn-contacts">
                ${chips}
                <button class="card-txn-contact card-txn-contact-new" data-action="manual" type="button">
                    <span class="card-txn-avatar">+</span><span>رقم جديد</span>
                </button>
            </div>
            <div class="card-txn-manual" hidden>
                <input id="txnManualPhone" type="tel" inputmode="numeric" placeholder="05XXXXXXXX">
                <button class="mini-btn" data-action="manualGo" type="button">متابعة</button>
            </div>`;
    }

    function amountStepHtml(c) {
        const amt = txnState.amount || 0;
        const after = (c.balance || 0) - amt;
        return `
            <div class="card-txn-head">
                <button class="card-txn-back" data-txn="back" type="button">→</button>
                <span>كم تريد أن ترسل؟ — إلى ${esc(txnState.recipient.name || Store.maskPhone(txnState.recipient.phone))}</span>
            </div>
            ${progressDotsHtml("amount")}
            <div class="card-txn-amount privacy-sensitive" id="txnAmountVal">${Store.money(amt)} <small>₪</small></div>
            <div class="card-txn-quick">
                ${[10, 20, 50, 100].map(v => `<button data-add="${v}" type="button">+${v}</button>`).join("")}
                <button data-action="clear" type="button">مسح</button>
            </div>
            <div class="card-txn-preview">
                <span>الرصيد بعد التحويل</span>
                <strong class="privacy-sensitive ${after < 0 ? "card-txn-neg" : ""}">${Store.money(Math.max(after, 0))} ₪</strong>
            </div>
            <button class="main-button" data-action="amountNext" type="button">متابعة</button>`;
    }

    function reviewStepHtml(c) {
        const net = Store.SERVICES[c.network] || {};
        return `
            <div class="card-txn-head">
                <button class="card-txn-back" data-txn="back" type="button">→</button>
                <span>مراجعة العملية</span>
            </div>
            ${progressDotsHtml("review")}
            <div class="card-txn-review">
                <div class="kv-row"><span>من</span><strong>${esc(net.name || "")}</strong></div>
                <div class="kv-row"><span>إلى</span><strong>${esc(txnState.recipient.name || "مستفيد جديد")}</strong></div>
                <div class="kv-row"><span>الرقم</span><strong>${esc(Store.maskPhone(txnState.recipient.phone))}</strong></div>
                <div class="kv-row"><span>المبلغ</span><strong class="privacy-sensitive">${Store.money(txnState.amount)} ₪</strong></div>
                <div class="kv-row"><span>الرصيد بعد العملية</span><strong class="privacy-sensitive">${Store.money(Math.max((c.balance || 0) - txnState.amount, 0))} ₪</strong></div>
            </div>
            <button class="main-button" id="txnConfirmBtn" type="button">✓ تأكيد وإرسال</button>`;
    }

    /* انتقال أفقي خفيف للمحتوى الداخلي فقط — البطاقة نفسها لا تتحرك بين الخطوات */
    function renderTxnPanel(panel, wrapEl, containerEl, id, direction) {
        const c = Store.getCard(id);
        if (!c || !txnState) return;
        const html = txnState.step === "recipient" ? recipientStepHtml(c)
            : txnState.step === "amount" ? amountStepHtml(c)
            : reviewStepHtml(c);

        const inner = document.createElement("div");
        inner.className = "card-txn-step";
        inner.innerHTML = html;

        const old = panel.querySelector(":scope > .card-txn-step");
        if (REDUCED_MOTION) {
            if (old) old.remove();
            panel.appendChild(inner);
        } else {
            inner.classList.add(direction === "back" ? "card-txn-step-in-back" : "card-txn-step-in-fwd");
            panel.appendChild(inner);
            requestAnimationFrame(() => inner.classList.add("card-txn-step-active"));
            if (old) {
                old.classList.add(direction === "back" ? "card-txn-step-out-back" : "card-txn-step-out-fwd");
                old.classList.remove("card-txn-step-active");
                setTimeout(() => old.remove(), 260);
            }
        }
        wireTxnPanel(panel, wrapEl, containerEl, id);

        if (txnState.step === "recipient") {
            const manualToggle = panel.querySelector('[data-action="manual"]');
            if (manualToggle) manualToggle.addEventListener("click", () => {
                panel.querySelector(".card-txn-manual").hidden = false;
            });
        }
    }

    function wireTxnPanel(panel, wrapEl, containerEl, id) {
        panel.onclick = (e) => {
            e.stopPropagation();
            if (!txnState) return;
            const back = e.target.closest('[data-txn="back"]');
            if (back) { txnStepBack(panel, wrapEl, containerEl, id); return; }

            const contact = e.target.closest(".card-txn-contact:not(.card-txn-contact-new)");
            if (contact) { selectRecipient(contact, panel, wrapEl, containerEl, id); return; }

            const manualGo = e.target.closest('[data-action="manualGo"]');
            if (manualGo) {
                const input = document.getElementById("txnManualPhone");
                const phone = Store.cleanNum(input ? input.value : "");
                if (!phone) { App.toast("أدخل رقم المستفيد"); return; }
                txnState.recipient = { name: "", phone };
                txnState.step = "amount";
                renderTxnPanel(panel, wrapEl, containerEl, id, "fwd");
                return;
            }

            const addBtn = e.target.closest("[data-add]");
            if (addBtn) { bumpAmount(panel, id, Number(addBtn.dataset.add)); return; }

            const clearBtn = e.target.closest('[data-action="clear"]');
            if (clearBtn) { txnState.amount = 0; refreshAmountDisplay(panel, id); return; }

            const amountNext = e.target.closest('[data-action="amountNext"]');
            if (amountNext) {
                const c = Store.getCard(id);
                if (!txnState.amount || txnState.amount <= 0) {
                    shakeAmount(panel); App.toast("أدخل مبلغًا صحيحًا"); return;
                }
                if (txnState.amount > (c.balance || 0)) {
                    shakeAmount(panel); App.toast("الرصيد غير كافٍ"); return;
                }
                txnState.step = "review";
                renderTxnPanel(panel, wrapEl, containerEl, id, "fwd");
                return;
            }

            const confirmBtn = e.target.closest("#txnConfirmBtn");
            if (confirmBtn) { submitTxn(panel, wrapEl, containerEl, id); return; }
        };
    }

    function selectRecipient(contactEl, panel, wrapEl, containerEl, id) {
        const cid = contactEl.dataset.id;
        const c = Store.getContact(cid);
        if (!c) return;
        contactEl.classList.add("card-txn-contact-picked");
        App.haptic && App.haptic("click");
        setTimeout(() => {
            txnState.recipient = { name: c.name, phone: c.phone, contactId: c.id };
            txnState.step = "amount";
            renderTxnPanel(panel, wrapEl, containerEl, id, "fwd");
        }, REDUCED_MOTION ? 0 : 260);
    }

    function bumpAmount(panel, id, add) {
        const c = Store.getCard(id);
        txnState.amount = (txnState.amount || 0) + add;
        refreshAmountDisplay(panel, id);
    }

    function refreshAmountDisplay(panel, id) {
        const c = Store.getCard(id);
        const valEl = panel.querySelector("#txnAmountVal");
        if (valEl) App.animateNumberSwap(valEl, `${Store.money(txnState.amount)} <small>₪</small>`);
        const prevEl = panel.querySelector(".card-txn-preview strong");
        if (prevEl) {
            const after = (c.balance || 0) - txnState.amount;
            prevEl.classList.toggle("card-txn-neg", after < 0);
            App.animateNumberSwap(prevEl, `${Store.money(Math.max(after, 0))} ₪`);
        }
    }

    function shakeAmount(panel) {
        const el = panel.querySelector(".card-txn-amount");
        if (!el) return;
        el.classList.remove("card-txn-shake");
        void el.offsetWidth;
        el.classList.add("card-txn-shake");
    }

    function txnStepBack(panel, wrapEl, containerEl, id) {
        if (!txnState) return;
        if (txnState.step === "recipient") {
            txnState = null;
            revealFocusActions(id, containerEl);
            return;
        }
        txnState.step = txnState.step === "review" ? "amount" : "recipient";
        renderTxnPanel(panel, wrapEl, containerEl, id, "back");
    }

    /* Transfer Beam — لمعة CSS خفيفة تحمل رمز المبلغ بعيدًا عن البطاقة (لا Canvas ولا مسار SVG ثقيل) */
    function playTransferBeam(wrapEl) {
        if (REDUCED_MOTION || !wrapEl) return;
        const rect = wrapEl.getBoundingClientRect();
        const brandEl = wrapEl.querySelector(".bank-card-face-front");
        const brand = brandEl ? getComputedStyle(brandEl).getPropertyValue("--brand").trim() : "";

        const particle = document.createElement("div");
        particle.className = "transfer-beam-particle";
        particle.style.left = (rect.left + rect.width / 2) + "px";
        particle.style.top = (rect.top + rect.height / 2) + "px";
        if (brand) particle.style.setProperty("--beam-color", brand);
        particle.textContent = "💸";
        document.body.appendChild(particle);

        requestAnimationFrame(() => {
            particle.style.transform = "translate(-50%, -50%) translateY(-140px) scale(1.25)";
            particle.style.opacity = "0";
        });
        setTimeout(() => particle.remove(), 750);

        wrapEl.classList.add("bank-card-wrap-beaming");
        setTimeout(() => wrapEl.classList.remove("bank-card-wrap-beaming"), 700);
    }

    /* تسليم فعلي للنظام الحقيقي — بلا أي تكرار لمنطق USSD/التحقق/التأكيد الموجود أصلًا.
       الحركة هنا Feedback بصري بحت: لا تُنشئ عملية ولا تخصم أي رصيد بنفسها؛ فقط تُعبّئ نموذج
       التحويل الحقيقي وتُشغّل نفس زر "إنشاء الكود" الذي يفتح نافذة التأكيد/الرقم السري/الاتصال الحقيقية. */
    function submitTxn(panel, wrapEl, containerEl, id) {
        if (!txnState || txnState.locked) return;
        txnState.locked = true;
        const btn = panel.querySelector("#txnConfirmBtn");
        if (btn) btn.disabled = true;

        playTransferBeam(wrapEl);

        const kind = txnState.kind, amount = txnState.amount, receiver = txnState.recipient.phone;

        setTimeout(() => {
            panel.hidden = true;
            panel.innerHTML = "";
            txnState = null;
            focusedId = null;
            const wide = containerEl === stackEl;
            containerEl.querySelectorAll(".bank-card-wrap").forEach(w => {
                const i = order.indexOf(w.dataset.id);
                w.style.transition = "none";
                w.style.zIndex = String(zFor(i));
                w.style.opacity = String(opacityFor(i));
                w.style.transform = stackTransform(i, wide);
                w.classList.remove("bank-card-wrap-focused");
            });

            window.switchPage("transferPage");
            setTimeout(() => {
                const c = Store.getCard(id);
                if (window.Transfer && Transfer.prefillFromCard && c) {
                    Transfer.prefillFromCard({ service: c.network, payment: kind, cardId: id, receiver, amount, silent: true });
                }
                setTimeout(() => {
                    const createBtn = document.getElementById("createButton");
                    if (createBtn) createBtn.click();
                }, 100);
            }, 80);
        }, REDUCED_MOTION ? 0 : 650);
    }

    /* -------- قلب البطاقة: الوجه الخلفي = إجراءات ذكية حسب قدرات المحفظة الفعلية -------- */

    function flipClose(el) {
        el.classList.remove("bank-card-wrap-flipped");
    }

    function flipOpen(el, id) {
        const backEl = el.querySelector(".bank-card-face-back");
        if (!backEl) return;
        if (!backEl.dataset.built) {
            backEl.innerHTML = buildBackFaceHtml(id);
            wireBackFace(backEl, id, el);
            backEl.dataset.built = "1";
        } else {
            refreshBackBalance(backEl, id);
        }
        el.classList.add("bank-card-wrap-flipped");
    }

    function refreshBackBalance(backEl, id) {
        const c = Store.getCard(id);
        const wrap = backEl.querySelector('[data-role="backBal"]');
        if (!c || !wrap) return;
        const el = wrap.querySelector("b");
        if (el) el.textContent = Store.money(c.balance || 0) + " ₪";
        const usdEl = wrap.querySelector(".bank-card-usd");
        if (usdEl) usdEl.outerHTML = usdEquivalentHtml(c.balance);
    }

    /* -------- تحديث الرصيد بحركة (رقم قديم يصعد ويختفي، جديد يظهر من الأسفل) + نبضة نجاح خضراء على البطاقة نفسها -------- */
    function flashBalanceUpdate(id) {
        const c = Store.getCard(id);
        if (!c) { renderAll(); return; }

        if (balanceEl && !balanceEl.hidden && order[0] === id) {
            const strong = balanceEl.querySelector("strong");
            if (strong) App.animateNumberSwap(strong, `${Store.money(c.balance || 0)} ₪`);
        }

        [stackEl, document.getElementById("dashCardsStack")].forEach(container => {
            if (!container) return;
            const wrap = container.querySelector(`.bank-card-wrap[data-id="${id}"]`);
            if (!wrap) return;
            const strong = wrap.querySelector(".bank-card-footer-bal strong");
            if (strong) App.animateNumberSwap(strong, `${Store.money(c.balance || 0)} ₪`);
            wrap.classList.remove("bank-card-wrap-success");
            void wrap.offsetWidth;
            wrap.classList.add("bank-card-wrap-success");
            setTimeout(() => wrap.classList.remove("bank-card-wrap-success"), 950);
        });

        const dashTotal = document.querySelector("#dashBalance .d-val");
        if (dashTotal) App.animateNumberSwap(dashTotal, `${Store.money(Store.getTotalBalance())} <small>₪</small>`);

        setTimeout(() => {
            renderAll();
            if (window.Transfer) Transfer.refreshHome();
        }, 480);
    }

    /* اهتزاز خفيف على البطاقة عند تسجيل عملية فاشلة — بلا أي تغيير بالرصيد */
    function flashBalanceFail(id) {
        if (!id) return;
        [stackEl, document.getElementById("dashCardsStack")].forEach(container => {
            if (!container) return;
            const wrap = container.querySelector(`.bank-card-wrap[data-id="${id}"]`);
            if (!wrap) return;
            wrap.classList.remove("bank-card-wrap-shake");
            void wrap.offsetWidth;
            wrap.classList.add("bank-card-wrap-shake");
            setTimeout(() => wrap.classList.remove("bank-card-wrap-shake"), 450);
        });
    }

    /* قدرات كل شبكة كما هي مطبَّقة فعليًا بالتطبيق — بلا اختراع أكواد أو خيارات غير مدعومة */
    function buildBackFaceHtml(id) {
        const c = Store.getCard(id);
        if (!c) return "";
        const net = Store.SERVICES[c.network] || {};
        const last4 = (Store.cleanNum(c.phone).slice(-4) || "0000").padStart(4, "0");

        const actions = net.needsPayment ? `
                <button data-action="friend" type="button">👤<span>دفع لصديق</span></button>
                <button data-action="merchant" type="button">🏪<span>دفع لتاجر</span></button>
                <button data-action="topup" type="button">📱<span>شحن رصيد</span></button>
                <button data-action="wallet" type="button">🔁<span>تحويل بين محافظي</span></button>`
            : `
                <button data-action="friend" type="button">🏦<span>تنفيذ التحويل</span></button>
                <button data-action="topup" type="button">📱<span>شحن رصيد</span></button>
                <button data-action="wallet" type="button">🔁<span>تحويل بين محافظي</span></button>`;

        return `
            <div class="bank-card-back-stripe"></div>
            <div class="bank-card-back-body">
                <div class="bank-card-back-head">
                    <span>${esc(net.name || "")}</span>
                    <span>•••• ${last4}</span>
                </div>
                <div class="bank-card-back-bal privacy-sensitive" data-role="backBal">الرصيد: <b>${Store.money(c.balance || 0)} ₪</b> ${usdEquivalentHtml(c.balance)}</div>
                <div class="bank-card-back-title">ماذا تريد أن تفعل باستخدام هذه المحفظة؟</div>
                <div class="bank-card-back-actions">${actions}</div>
                <div class="bank-card-back-utility">
                    <button data-action="edit" type="button">✎ تعديل</button>
                    <button class="bank-card-back-main" data-action="close" type="button">↩ رجوع</button>
                    <button class="danger" data-action="delete" type="button">🗑 حذف</button>
                </div>
            </div>`;
    }

    function wireBackFace(backEl, id, wrapEl) {
        backEl.addEventListener("click", (e) => {
            e.stopPropagation();
            const btn = e.target.closest("button[data-action]");
            if (!btn) return;
            const action = btn.dataset.action;
            if (action === "close") { flipClose(wrapEl); return; }
            if (action === "edit") { flipClose(wrapEl); editSheet(id); return; }
            if (action === "delete") { flipClose(wrapEl); confirmDeleteCard(id); return; }
            if (action === "topup") { flipClose(wrapEl); topUpSheet(id); return; }
            if (action === "wallet") { flipClose(wrapEl); walletTransferSheet(id); return; }
            if (action === "friend" || action === "merchant") {
                flipClose(wrapEl);
                startTransferFromCard(id, action === "merchant" ? "merchant" : "friend");
            }
        });
    }

    /* يفتح صفحة التحويل مع قفل الشبكة + البطاقة المصدر تلقائيًا — لا يُطلب من المستخدم اختيار المحفظة ثانية */
    function startTransferFromCard(id, payment) {
        const c = Store.getCard(id);
        if (!c) return;
        window.switchPage("transferPage");
        setTimeout(() => {
            if (window.Transfer && Transfer.prefillFromCard) {
                Transfer.prefillFromCard({ service: c.network, payment, cardId: id });
            }
        }, 60);
    }

    function confirmDeleteCard(id) {
        const c = Store.getCard(id);
        if (!c) return;
        App.openSheet(`
            <div class="sheet-title">حذف ${esc(c.name)}؟</div>
            <div class="sheet-sub">تُحذف البطاقة، وتبقى عملياتها في السجل بدون ربط.</div>
            <button class="sheet-menu-btn danger" id="delYes" type="button">🗑 نعم، احذف</button>
            <button class="sheet-menu-btn" id="delNo" type="button">إلغاء</button>
        `);
        document.getElementById("delYes").addEventListener("click", () => {
            Store.deleteCard(id);
            App.closeSheet();
            renderAll();
            App.toast("تم حذف البطاقة");
        });
        document.getElementById("delNo").addEventListener("click", () => App.closeSheet());
    }

    /* -------- تحويل بين محافظي — بديل آمن بالنقر بدل السحب-والإفلات الفعلي بين البطاقات
       (يتجنّب تعارض الإيماءات مع السحب/الإمالة الحالية على نفس البطاقة) -------- */
    function walletTransferSheet(fromId) {
        const cards = Store.getCards();
        if (cards.length < 2) { App.toast("تحتاج بطاقتين على الأقل لتحويل بين محافظك"); return; }
        const from = Store.getCard(fromId);
        const others = cards.filter(c => c.id !== fromId);

        App.openSheet(`
            <div class="sheet-title">تحويل بين محافظي</div>
            <div class="sheet-sub">تحويل داخلي محلي بين أرصدة بطاقاتك المسجّلة فقط — بلا أي علاقة ببنك أو شركة اتصالات.</div>
            <div class="input-group">
                <label>من</label>
                <div style="padding:10px 14px;background:var(--input);border-radius:12px;font-weight:800;">${esc(from.name)} — ${Store.money(from.balance || 0)} ₪</div>
            </div>
            <div class="input-group">
                <label>إلى</label>
                <select id="wtTo">${others.map(c => `<option value="${c.id}">${esc(c.name)} — ${Store.money(c.balance || 0)} ₪</option>`).join("")}</select>
            </div>
            <div class="input-group">
                <label>المبلغ (₪)</label>
                <input id="wtAmount" type="number" inputmode="decimal" placeholder="مثال: 100">
            </div>
            <button class="main-button" id="wtGo" type="button">متابعة</button>
        `);

        document.getElementById("wtGo").addEventListener("click", () => {
            const toId = document.getElementById("wtTo").value;
            const amt = Number(document.getElementById("wtAmount").value);
            if (!amt || amt <= 0) { App.toast("أدخل مبلغًا صحيحًا"); return; }
            const fresh = Store.getCard(fromId);
            if (!fresh || (fresh.balance || 0) < amt) { App.toast("الرصيد غير كافٍ لإتمام العملية"); return; }
            Store.adjustCardBalance(fromId, -amt);
            Store.adjustCardBalance(toId, amt);
            App.closeSheet();
            const toCard = Store.getCard(toId);
            flashBalanceUpdate(fromId);
            flashBalanceUpdate(toId);
            App.toast(`تم تحويل ${Store.money(amt)} ₪ من ${from.name} إلى ${toCard ? toCard.name : ""}`);
        });
    }

    function emptyStackHtml(withCta) {
        return `
            <div class="empty-state">
                <div class="empty-icon">💳</div>
                <h3>لا توجد بطاقات بعد</h3>
                <p>أضف بطاقتك الأولى لتتبّع رصيدك عبر خدمات التحويل.</p>
                ${withCta ? '<button class="main-button" id="firstCardBtn" type="button" style="margin-top:14px;">+ أضف بطاقتك الأولى</button>' : ""}
            </div>`;
    }

    function renderAll() {
        render();
        renderDashboard();
    }

    /* شحن سريع من زر "شحن" باللوحة الرئيسية — يفتح شحن رصيد البطاقة الأمامية الحالية */
    function topUpActive() {
        if (!order.length) {
            App.toast("أضف بطاقة أولًا لتقدر تشحن رصيدها");
            window.switchPage("cardsPage");
            return;
        }
        topUpSheet(order[0]);
    }

    /* -------- صفحة "بطاقاتي" الكاملة -------- */

    function render() {
        if (!stackEl) return;
        const list = Store.getCards().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        const totalEl = document.getElementById("cardsTotal");
        if (totalEl) totalEl.textContent = Store.money(Store.getTotalBalance()) + " ₪";

        if (!list.length) {
            order = [];
            balanceEl.hidden = true;
            stackEl.classList.add("cards-stack-empty");
            stackEl.innerHTML = emptyStackHtml(true);
            const b = document.getElementById("firstCardBtn");
            if (b) b.addEventListener("click", () => editSheet(null));
            return;
        }
        stackEl.classList.remove("cards-stack-empty");
        balanceEl.hidden = false;

        order = order.filter(id => list.some(c => c.id === id));
        list.forEach(c => { if (order.indexOf(c.id) === -1) order.push(c.id); });

        const byId = {};
        list.forEach(c => { byId[c.id] = c; });

        stackEl.innerHTML = order.map((id, i) => cardWrapHtml(byId[id], i, true)).join("");
        wireStack(stackEl);

        const active = byId[order[0]];
        balanceEl.innerHTML = `<span>رصيد ${esc(active.name)}</span><strong class="privacy-sensitive">${Store.money(active.balance || 0)} ₪</strong>${usdEquivalentHtml(active.balance)}`;
    }

    /* -------- المعاينة المصغّرة داخل اللوحة الرئيسية -------- */

    function renderDashboard() {
        const dashStackEl = document.getElementById("dashCardsStack");
        if (!dashStackEl) return;
        const list = Store.getCards().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        if (!list.length) {
            dashStackEl.classList.add("cards-stack-empty");
            dashStackEl.innerHTML = emptyStackHtml(false);
            return;
        }
        dashStackEl.classList.remove("cards-stack-empty");

        order = order.filter(id => list.some(c => c.id === id));
        list.forEach(c => { if (order.indexOf(c.id) === -1) order.push(c.id); });

        const byId = {};
        list.forEach(c => { byId[c.id] = c; });

        dashStackEl.innerHTML = order.map((id, i) => cardWrapHtml(byId[id], i)).join("");
        wireStack(dashStackEl);
    }




    /* -------- شحن الرصيد -------- */

    function topUpSheet(id) {
        const c = Store.getCard(id);
        if (!c) return;

        App.openSheet(`
            <div class="sheet-title">شحن رصيد ${esc(c.name)}</div>
            <div class="sheet-sub">أدخل المبلغ الذي تريد إضافته لرصيدك المسجّل — رقم تتبّع محلي بيدك أنت، بلا أي ربط ببنك.</div>
            <div class="input-group">
                <label>المبلغ (₪)</label>
                <input id="topUpAmount" type="number" inputmode="decimal" placeholder="مثال: 200">
            </div>
            <button class="main-button" id="topUpSave" type="button">إضافة للرصيد</button>
        `);

        document.getElementById("topUpSave").addEventListener("click", () => {
            const amt = Number(document.getElementById("topUpAmount").value);
            if (!amt || amt <= 0) { App.toast("أدخل مبلغًا صحيحًا"); return; }
            Store.adjustCardBalance(id, amt);
            App.closeSheet();
            flashBalanceUpdate(id);
            App.toast("تم شحن " + Store.money(amt) + " ₪");
        });
    }


    /* -------- إضافة / تعديل بطاقة -------- */

    /* بطاقة واحدة كحد أقصى لكل جهة تحويل — الشبكات التي عندها بطاقة أصلًا (غير بطاقة التعديل الحالية) تُقفل */
    function takenNetworks(excludeId) {
        const set = new Set();
        Store.getCards().forEach(c => { if (c.id !== excludeId) set.add(c.network); });
        return set;
    }

    function editSheet(id) {
        const c = id ? Store.getCard(id) : null;
        const taken = takenNetworks(c ? c.id : null);

        const netOpts = Object.keys(Store.SERVICES).map(k => {
            const isTaken = taken.has(k);
            return `
            <button class="service ${isTaken ? "service-taken" : ""}" data-net="${k}" type="button" ${isTaken ? 'aria-disabled="true"' : ""}>
                <img src="${Store.SERVICES[k].logo}" alt="" class="service-logo">
                <span>${Store.SERVICES[k].name}</span>
                ${isTaken ? '<small class="service-taken-note">عندك بطاقة فيها</small>' : ""}
            </button>`;
        }).join("");

        App.openSheet(`
            <div class="sheet-title">${c ? "تعديل بطاقة" : "بطاقة جديدة"}</div>
            <div class="sheet-sub">تمثيل بصري فقط — بلا أي أرقام حساب حقيقية. بطاقة واحدة كحد أقصى لكل جهة تحويل.</div>

            <div class="input-group">
                <label>الاسم الكامل (بالإنجليزي)</label>
                <input id="crdName" type="text" value="${c ? esc(c.name) : ""}" placeholder="AHMAD MOHAMMAD">
            </div>
            <div class="input-group">
                <label>جهة التحويل</label>
                <div class="services" id="crdNetWrap">${netOpts}</div>
            </div>
            <div class="input-group">
                <label>رقم الجوال</label>
                <input id="crdPhone" type="tel" inputmode="numeric"
                    value="${c ? esc(c.phone) : ""}" placeholder="05XXXXXXXX">
            </div>

            <button class="main-button" id="crdSave" type="button">حفظ</button>
        `);

        let selectedNet = c ? c.network : null;
        const netWrap = document.getElementById("crdNetWrap");
        function paintNet() {
            netWrap.querySelectorAll(".service").forEach(b =>
                b.classList.toggle("active", b.dataset.net === selectedNet));
        }
        netWrap.querySelectorAll(".service").forEach(b => {
            b.addEventListener("click", () => {
                if (b.classList.contains("service-taken")) {
                    App.toast("عندك بطاقة على هذه الجهة أصلًا — بطاقة وحدة بالحد الأقصى لكل جهة");
                    return;
                }
                selectedNet = b.dataset.net; paintNet();
            });
        });
        paintNet();

        document.getElementById("crdSave").addEventListener("click", () => {
            const name = document.getElementById("crdName").value.trim();
            const phone = document.getElementById("crdPhone").value.trim();

            if (!name) { App.toast("أدخل الاسم"); return; }
            if (!/^[A-Za-z\s.'-]+$/.test(name)) { App.toast("الاسم يجب أن يكون بالإنجليزي"); return; }
            if (!selectedNet) { App.toast("اختر جهة التحويل"); return; }
            if (takenNetworks(c ? c.id : null).has(selectedNet)) {
                App.toast("عندك بطاقة على هذه الجهة أصلًا — بطاقة وحدة بالحد الأقصى لكل جهة");
                return;
            }
            if (!phone) { App.toast("أدخل رقم الجوال"); return; }

            Store.saveCard({
                id: c ? c.id : undefined,
                name,
                network: selectedNet,
                phone,
                balance: c ? c.balance : 0,
            });

            App.closeSheet();
            renderAll();
            if (window.Transfer) Transfer.refreshHome();
            App.toast("تم الحفظ");
        });
    }


    return { render, renderDashboard, topUpActive, flashBalanceUpdate, flashBalanceFail, cardFaceHtml };
})();
