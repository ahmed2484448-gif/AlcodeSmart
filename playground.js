/* ==================================================
   playground.js — Transfer Playground + Money Drag & Drop + Magic Amount Dial
   مساحة تفاعلية لتجهيز التحويل بالسحب والإفلات (أو باللمس فقط كبديل متاح دائمًا).
   لا تنفّذ أي عملية هنا إطلاقًا — فقط تعبئة Smart Transfer Composer الموجود فعليًا
   (Composer.quickFill) الذي يسلّم بدوره لنفس Transaction Engine الحالي.
================================================== */

window.Playground = (function () {

    const esc = App.esc;
    const REDUCED_MOTION = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const AMOUNTS = [10, 20, 50, 100];

    let overlayEl = null;
    let activeCardId = null;
    let selectedAmount = 0;
    let extraToken = null; // مبلغ مخصّص أُضيف عبر Magic Dial

    function card() { return activeCardId ? Store.getCard(activeCardId) : null; }

    function contactsList() {
        const favs = Store.quickContacts().slice(0, 6);
        if (favs.length >= 6) return favs;
        const favIds = favs.map(f => f.id);
        const seen = [];
        Store.getOps().forEach(o => {
            if (o.contactId && o.status === "success" && favIds.indexOf(o.contactId) === -1 && seen.indexOf(o.contactId) === -1) seen.push(o.contactId);
        });
        const recents = seen.slice(0, 6 - favs.length).map(id => Store.getContact(id)).filter(Boolean);
        return favs.concat(recents);
    }

    /* -------- فتح/إغلاق -------- */

    function open(cardId) {
        const cards = Store.getCards();
        if (!cards.length) { App.toast("أضف بطاقتك الأولى أولًا من «بطاقاتي»"); return; }
        activeCardId = (cardId && Store.getCard(cardId)) ? cardId : cards[0].id;
        selectedAmount = 0;
        extraToken = null;
        build();
    }

    function close() {
        if (!overlayEl) return;
        overlayEl.remove();
        overlayEl = null;
        drag = null;
    }

    /* -------- بناء الواجهة -------- */

    function tokenAmounts() {
        const list = AMOUNTS.slice();
        if (extraToken && list.indexOf(extraToken) === -1) list.unshift(extraToken);
        return list;
    }

    function walletCardHtml(c) {
        const face = (window.Cards && Cards.cardFaceHtml) ? Cards.cardFaceHtml(c) : "";
        return `<div class="pg-wallet-holder" id="pgWalletHolder">
            <button class="bank-card" data-service="${c.network}" type="button" id="pgWalletCard">${face}</button>
        </div>`;
    }

    function tokensHtml() {
        return `<div class="pg-tokens" id="pgTokens">
            ${tokenAmounts().map(v => `
                <button class="pg-token ${v === selectedAmount ? "pg-token-active" : ""}" data-amount="${v}" type="button">
                    <span class="pg-token-amt">${v}</span><span class="pg-token-cur">₪</span>
                </button>`).join("")}
            <button class="pg-token pg-token-add" data-action="dial" type="button">+</button>
        </div>`;
    }

    function contactsHtml() {
        const list = contactsList();
        if (!list.length) return `<p class="sheet-sub" style="text-align:center;margin-top:14px;">لا جهات محفوظة بعد — أضف جهة من «الجهات» لتستخدم السحب والإفلات.</p>`;
        return `<div class="pg-contacts" id="pgContacts">
            ${list.map(c => `
                <button class="card-txn-contact pg-contact" data-id="${c.id}" type="button">
                    <span class="card-txn-avatar">${(window.PhotoDB && PhotoDB.get(c.id)) ? `<img src="${PhotoDB.get(c.id)}">` : esc((c.name || "?").charAt(0))}</span>
                    <span>${esc(c.name)}</span>
                </button>`).join("")}
        </div>`;
    }

    function walletSwitchHtml(cards, c) {
        if (cards.length < 2) return "";
        return `<div class="pg-wallet-switch-row" id="pgWalletSwitchRow">
            ${cards.map(w => {
                const net = Store.SERVICES[w.network] || {};
                return `<button class="pg-wallet-dot ${w.id === c.id ? "pg-wallet-dot-active" : ""}" data-id="${w.id}" type="button" aria-label="${esc(net.name || "")}">
                    <img src="${net.logo || ""}" alt="">
                </button>`;
            }).join("")}
        </div>`;
    }

    function build() {
        close();
        const c = card();
        if (!c) return;
        const cards = Store.getCards();

        overlayEl = document.createElement("div");
        overlayEl.className = "pg-overlay";
        overlayEl.innerHTML = `
            <div class="pg-topbar">
                <button class="pg-close" data-action="close" type="button" aria-label="إغلاق">✕</button>
                <span class="pg-title">تحويل بالسحب</span>
                <span class="pg-topbar-spacer"></span>
            </div>
            <div class="pg-stage">
                ${walletCardHtml(c)}
                ${walletSwitchHtml(cards, c)}
                ${tokensHtml()}
                <div class="pg-hint" id="pgHint">اسحب مبلغًا إلى المستفيد — أو اضغط المبلغ ثم اضغط المستفيد</div>
                ${contactsHtml()}
            </div>
            <div class="pg-dial-sheet" id="pgDialSheet" hidden></div>
        `;
        document.body.appendChild(overlayEl);
        wire();
    }

    function refreshTokensAndContacts() {
        const tokensWrap = overlayEl.querySelector("#pgTokens");
        if (tokensWrap) tokensWrap.outerHTML = tokensHtml();
        wireTokens();
    }

    /* -------- الربط -------- */

    function wire() {
        overlayEl.querySelector('[data-action="close"]').addEventListener("click", close);

        const switchRow = overlayEl.querySelector("#pgWalletSwitchRow");
        if (switchRow) switchRow.querySelectorAll(".pg-wallet-dot").forEach(b => {
            b.addEventListener("click", () => {
                activeCardId = b.dataset.id;
                selectedAmount = 0;
                build();
            });
        });

        wireTokens();
        wireContacts();
    }

    function wireTokens() {
        const tokensWrap = overlayEl.querySelector("#pgTokens");
        if (!tokensWrap) return;

        tokensWrap.querySelectorAll(".pg-token:not(.pg-token-add)").forEach(tok => {
            tok.addEventListener("click", () => {
                if (tok._justDragged) return; // نقرة نتجت عن نهاية سحب فعلي — تجاهلها
                const amt = Number(tok.dataset.amount);
                selectedAmount = selectedAmount === amt ? 0 : amt;
                tokensWrap.querySelectorAll(".pg-token").forEach(t => t.classList.toggle("pg-token-active", Number(t.dataset.amount) === selectedAmount));
                pulseWallet();
            });
            attachMoneyDrag(tok, () => Number(tok.dataset.amount), {
                targetSelector: ".pg-contact",
                onMoved: amt => {
                    selectedAmount = amt;
                    tokensWrap.querySelectorAll(".pg-token").forEach(t => t.classList.toggle("pg-token-active", Number(t.dataset.amount) === amt));
                },
                onDrop: (targetEl) => {
                    const c = Store.getContact(targetEl.dataset.id);
                    if (c) attemptComplete(c);
                },
            });
        });

        const addBtn = tokensWrap.querySelector(".pg-token-add");
        if (addBtn) addBtn.addEventListener("click", openDial);
    }

    function wireContacts() {
        const wrap = overlayEl.querySelector("#pgContacts");
        if (!wrap) return;
        wrap.querySelectorAll(".pg-contact").forEach(btn => {
            btn.addEventListener("click", () => {
                if (!selectedAmount) { App.toast("اختر مبلغًا أولًا"); return; }
                const c = Store.getContact(btn.dataset.id);
                if (!c) return;
                attemptComplete(c);
            });
        });
    }

    function pulseWallet() {
        const holder = overlayEl && overlayEl.querySelector("#pgWalletCard");
        if (!holder || REDUCED_MOTION) return;
        holder.classList.remove("pg-wallet-pulse");
        void holder.offsetWidth;
        holder.classList.add("pg-wallet-pulse");
    }

    /* -------- السحب الحقيقي بالإصبع/الفأرة — أداة عامة قابلة لإعادة الاستخدام
       (يستخدمها Playground نفسه، وأيضًا صف "تحويل النقود بالسحب" داخل Wallet Portal) -------- */

    function attachMoneyDrag(tokenEl, getAmount, opts) {
        let state = null;

        function down(e) {
            if (e.button !== undefined && e.button !== 0) return;
            const amount = getAmount();
            const rect = tokenEl.getBoundingClientRect();
            const ghost = document.createElement("div");
            ghost.className = "pg-drag-ghost";
            ghost.innerHTML = `<span class="pg-token-amt">${amount}</span><span class="pg-token-cur">₪</span>`;
            ghost.style.left = rect.left + "px";
            ghost.style.top = rect.top + "px";
            ghost.style.width = rect.width + "px";
            ghost.style.height = rect.height + "px";
            document.body.appendChild(ghost);

            state = { amount, ghost, moved: false, startX: e.clientX, startY: e.clientY, lastTarget: null };
            tokenEl.classList.add("pg-token-dragging");
            if (!REDUCED_MOTION) ghost.classList.add("pg-drag-ghost-active");

            try { tokenEl.setPointerCapture(e.pointerId); } catch (err) {}
            tokenEl.addEventListener("pointermove", move);
            tokenEl.addEventListener("pointerup", up);
            tokenEl.addEventListener("pointercancel", up);
        }

        function move(e) {
            if (!state) return;
            const dx = e.clientX - state.startX, dy = e.clientY - state.startY;
            if (!state.moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
                state.moved = true;
                if (opts.onMoved) opts.onMoved(state.amount);
            }
            state.ghost.style.transform = `translate(${dx}px, ${dy}px) scale(1.08)`;

            const el = document.elementFromPoint(e.clientX, e.clientY);
            const target = el && el.closest ? el.closest(opts.targetSelector) : null;
            if (state.lastTarget && state.lastTarget !== target) state.lastTarget.classList.remove("pg-contact-target");
            if (target) target.classList.add("pg-contact-target");
            state.lastTarget = target;
        }

        function up() {
            if (!state) return;
            const s = state;
            tokenEl.removeEventListener("pointermove", move);
            tokenEl.removeEventListener("pointerup", up);
            tokenEl.removeEventListener("pointercancel", up);
            tokenEl.classList.remove("pg-token-dragging");
            if (s.lastTarget) s.lastTarget.classList.remove("pg-contact-target");

            if (s.moved && s.lastTarget) {
                const target = s.lastTarget;
                s.ghost.remove();
                state = null;
                tokenEl._justDragged = true;
                setTimeout(() => { tokenEl._justDragged = false; }, 0);
                opts.onDrop(target, s.amount);
                return;
            }

            if (s.moved) {
                tokenEl._justDragged = true;
                setTimeout(() => { tokenEl._justDragged = false; }, 0);
            }
            if (!REDUCED_MOTION) {
                const rect = tokenEl.getBoundingClientRect();
                const gx = parseFloat(s.ghost.style.left) || 0, gy = parseFloat(s.ghost.style.top) || 0;
                s.ghost.style.transition = "transform .32s cubic-bezier(.22,1,.36,1)";
                s.ghost.style.transform = `translate(${rect.left - gx}px, ${rect.top - gy}px) scale(1)`;
                setTimeout(() => s.ghost.remove(), 340);
            } else {
                s.ghost.remove();
            }
            setTimeout(() => { state = null; }, 0);
        }

        tokenEl.addEventListener("pointerdown", down);
    }

    /* -------- إتمام الاختيار (لا تنفيذ — فقط تسليم لـ Composer) -------- */

    function attemptComplete(contact) {
        const c = card();
        if (!c) return;
        if (c.network !== "bank" && selectedAmount > (c.balance || 0)) {
            App.toast("الرصيد غير كافٍ لإتمام العملية");
            return;
        }
        const amount = selectedAmount;
        const contactEl = overlayEl.querySelector(`.pg-contact[data-id="${contact.id}"]`);
        if (contactEl && !REDUCED_MOTION) {
            contactEl.classList.add("pg-contact-hit");
            setTimeout(() => finish(contact, amount), 260);
        } else {
            finish(contact, amount);
        }
    }

    function finish(contact, amount) {
        const c = card();
        close();
        if (window.Composer && Composer.quickFill) {
            Composer.quickFill({
                cardId: c.id,
                contactId: contact.id,
                recipientName: contact.name,
                recipientPhone: contact.phone,
                contactType: contact.type || "",
                amount,
            });
        }
    }

    /* -------- Magic Amount Dial -------- */

    function stepFor(v) { return v < 100 ? 5 : v < 500 ? 10 : 50; }
    function roundStep(v) { const s = stepFor(v); return Math.max(0, Math.round(v / s) * s); }

    function openDial() {
        const panel = overlayEl.querySelector("#pgDialSheet");
        if (!panel) return;
        let val = selectedAmount || 50;

        panel.innerHTML = `
            <div class="pg-dial-head">
                <span>اختر مبلغًا</span>
                <button class="pg-dial-close" data-action="dialClose" type="button">✕</button>
            </div>
            <div class="pg-dial-circle" id="pgDialCircle">
                <div class="pg-dial-ticks">${Array.from({ length: 12 }).map((_, i) => `<span style="transform:rotate(${i * 30}deg)"></span>`).join("")}</div>
                <div class="pg-dial-handle" id="pgDialHandle"></div>
                <div class="pg-dial-value privacy-sensitive" id="pgDialValue">${val}<small>₪</small></div>
            </div>
            <div class="pg-dial-quick">
                ${[20, 50, 100, 200].map(v => `<button data-v="${v}" type="button">${v} ₪</button>`).join("")}
            </div>
            <div class="input-group" style="margin-top:10px;">
                <label>إدخال يدوي</label>
                <input id="pgDialManual" type="number" inputmode="decimal" value="${val}" placeholder="المبلغ">
            </div>
            <button class="main-button" id="pgDialUse" type="button">استخدام ${val} ₪</button>
        `;
        panel.hidden = false;
        if (!REDUCED_MOTION) requestAnimationFrame(() => panel.classList.add("pg-dial-sheet-in"));

        const valueEl = panel.querySelector("#pgDialValue");
        const useBtn = panel.querySelector("#pgDialUse");
        const handle = panel.querySelector("#pgDialHandle");
        const circle = panel.querySelector("#pgDialCircle");
        const manualInput = panel.querySelector("#pgDialManual");

        function setVal(v, fromManual) {
            val = Math.max(0, Math.round(v));
            valueEl.innerHTML = `${val}<small>₪</small>`;
            useBtn.textContent = `استخدام ${val} ₪`;
            if (!fromManual) manualInput.value = val;
            const angle = (val % 360 === 0 && val > 0) ? 359.999 : (val / 500) * 360;
            handle.style.transform = `rotate(${Math.min(angle, 359.999)}deg)`;
        }
        setVal(val);

        let dialDrag = false;
        function angleToVal(clientX, clientY) {
            const rect = circle.getBoundingClientRect();
            const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
            let deg = Math.atan2(clientY - cy, clientX - cx) * 180 / Math.PI + 90;
            if (deg < 0) deg += 360;
            const raw = (deg / 360) * 500;
            return roundStep(raw);
        }
        circle.addEventListener("pointerdown", e => {
            dialDrag = true;
            try { circle.setPointerCapture(e.pointerId); } catch (err) {}
            setVal(angleToVal(e.clientX, e.clientY));
        });
        circle.addEventListener("pointermove", e => { if (dialDrag) setVal(angleToVal(e.clientX, e.clientY)); });
        circle.addEventListener("pointerup", () => { dialDrag = false; });
        circle.addEventListener("pointercancel", () => { dialDrag = false; });

        panel.querySelectorAll(".pg-dial-quick button").forEach(b => {
            b.addEventListener("click", () => setVal(Number(b.dataset.v)));
        });
        manualInput.addEventListener("input", () => setVal(Number(manualInput.value) || 0, true));

        panel.querySelector('[data-action="dialClose"]').addEventListener("click", closeDial);
        useBtn.addEventListener("click", () => {
            if (!val || val <= 0) { App.toast("أدخل مبلغًا صحيحًا"); return; }
            extraToken = val;
            selectedAmount = val;
            closeDial();
            refreshTokensAndContacts();
            pulseWallet();
        });
    }

    function closeDial() {
        const panel = overlayEl && overlayEl.querySelector("#pgDialSheet");
        if (!panel) return;
        panel.classList.remove("pg-dial-sheet-in");
        panel.hidden = true;
        panel.innerHTML = "";
    }

    return { open, close, attachMoneyDrag, contactsList };

})();
