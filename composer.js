/* ==================================================
   composer.js — Smart Transfer Composer + Wallet Command Center
   شريط تفاعلي واحد (محفظة ← مستفيد ← مبلغ) بدل نموذج تقليدي متعدد الصفحات.
   لا ينفذ أي عملية بنفسه: Compose → Validate → Prefill → Review،
   ثم يسلّم الأمر لنفس Transaction Engine الحالي (نفس #createButton/#confirmModal).
================================================== */

window.Composer = (function () {

    const esc = App.esc;

    function emptyState() {
        return { cardId: null, contactId: null, recipientName: "", recipientPhone: "", contactType: "", amount: 0 };
    }

    const sourceDone = s => !!s.cardId;
    const recipientDone = s => !!s.recipientPhone;
    const amountDone = s => s.amount > 0;
    const allDone = s => sourceDone(s) && recipientDone(s) && amountDone(s);

    function nextIncomplete(s) {
        if (!sourceDone(s)) return "source";
        if (!recipientDone(s)) return "recipient";
        if (!amountDone(s)) return "amount";
        return null;
    }

    function contactAvatarHtml(c) {
        const photo = window.PhotoDB ? PhotoDB.get(c.id) : null;
        return photo ? `<img src="${photo}">` : esc((c.name || "?").charAt(0));
    }

    function contactChipHtml(c) {
        return `
            <button class="card-txn-contact" data-id="${c.id}" type="button">
                <span class="card-txn-avatar">${contactAvatarHtml(c)}</span>
                <span>${esc(c.name)}</span>
            </button>`;
    }

    /* ---------- مثيل مستقل — يمكن تشغيل أكثر من واحد بنفس اللحظة (الرئيسية + ورقة مركز التحكم) ---------- */
    function createInstance(root, opts) {
        if (!root) return null;
        opts = opts || {};
        let state = emptyState();
        let openStep = null;

        function card() { return state.cardId ? Store.getCard(state.cardId) : null; }

        function barHtml() {
            if (allDone(state)) {
                return `<button class="stc-review-btn" type="button" data-action="review">
                    <span>مراجعة التحويل</span><i>←</i>
                </button>`;
            }
            const c = card();
            const net = c ? (Store.SERVICES[c.network] || {}) : null;
            return `
                <div class="stc-bar">
                    <button class="stc-chip ${sourceDone(state) ? "stc-chip-done" : ""}" data-step="source" type="button">
                        ${sourceDone(state)
                            ? `<img class="stc-chip-logo" src="${net.logo || ""}" alt=""><span>${esc(c.name)}</span><i class="stc-check">✓</i>`
                            : `<span class="stc-chip-ph">من محفظتك</span>`}
                    </button>
                    <span class="stc-arrow">‹</span>
                    <button class="stc-chip ${recipientDone(state) ? "stc-chip-done" : ""}" data-step="recipient" type="button">
                        ${recipientDone(state)
                            ? `<span>${esc(state.recipientName || Store.maskPhone(state.recipientPhone))}</span><i class="stc-check">✓</i>`
                            : `<span class="stc-chip-ph">إلى المستفيد</span>`}
                    </button>
                    <span class="stc-arrow">‹</span>
                    <button class="stc-chip ${amountDone(state) ? "stc-chip-done" : ""}" data-step="amount" type="button">
                        ${amountDone(state)
                            ? `<span class="privacy-sensitive">${Store.money(state.amount)} ₪</span><i class="stc-check">✓</i>`
                            : `<span class="stc-chip-ph">المبلغ</span>`}
                    </button>
                </div>`;
        }

        function sourcePanelHtml() {
            const cards = Store.getCards();
            if (!cards.length) {
                return `
                    <div class="card-txn-head"><button class="card-txn-back" data-action="closeStep" type="button">✕</button><span>من أي محفظة؟</span></div>
                    <p class="sheet-sub" style="margin:4px 2px 10px;">ما عندك بطاقة بعد — أضف بطاقتك الأولى من «بطاقاتي» لتقدر تستخدم التحويل السريع.</p>
                    <button class="secondary-button full-button" data-action="goCards" type="button">+ أضف بطاقة</button>`;
            }
            return `
                <div class="card-txn-head"><button class="card-txn-back" data-action="closeStep" type="button">✕</button><span>من أي محفظة؟</span></div>
                <div class="stc-wallet-list">
                    ${cards.map(c => {
                        const net = Store.SERVICES[c.network] || {};
                        return `
                        <button class="stc-wallet-row ${c.id === state.cardId ? "stc-wallet-row-active" : ""}" data-id="${c.id}" type="button">
                            <img src="${net.logo || ""}" alt="">
                            <span class="stc-wallet-name">${esc(c.name)}<small>${esc(net.name || "")}</small></span>
                            <span class="stc-wallet-bal privacy-sensitive">${Store.money(c.balance || 0)} ₪</span>
                        </button>`;
                    }).join("")}
                </div>`;
        }

        function recentContacts(favIds) {
            const seen = [];
            Store.getOps().forEach(o => {
                if (o.contactId && o.status === "success" && seen.indexOf(o.contactId) === -1) seen.push(o.contactId);
            });
            return seen
                .filter(id => favIds.indexOf(id) === -1)
                .slice(0, 6)
                .map(id => Store.getContact(id))
                .filter(Boolean);
        }

        function recipientPanelHtml() {
            const favs = Store.quickContacts().slice(0, 6);
            const recents = recentContacts(favs.map(f => f.id));
            return `
                <div class="card-txn-head"><button class="card-txn-back" data-action="closeStep" type="button">✕</button><span>إلى من تريد التحويل؟</span></div>
                <div class="input-group" style="margin-bottom:10px;">
                    <input id="stcSearch" type="text" placeholder="ابحث بالاسم أو الرقم…" autocomplete="off">
                </div>
                <div id="stcContactResults">
                    ${favs.length ? `<div class="stc-mini-label">المفضلة</div><div class="card-txn-contacts">${favs.map(contactChipHtml).join("")}</div>` : ""}
                    ${recents.length ? `<div class="stc-mini-label">تحويلات سابقة</div><div class="card-txn-contacts">${recents.map(contactChipHtml).join("")}</div>` : ""}
                    ${!favs.length && !recents.length ? '<p class="sheet-sub" style="margin:4px 2px;">لا جهات محفوظة بعد.</p>' : ""}
                </div>
                <div class="card-txn-manual" style="display:flex;margin-top:12px;">
                    <input id="stcManualPhone" type="tel" inputmode="numeric" placeholder="05XXXXXXXX" maxlength="14">
                    <button class="mini-btn" data-action="manualGo" type="button">استخدام الرقم</button>
                </div>`;
        }

        function amountPanelHtml() {
            const c = card();
            const amt = state.amount || 0;
            const after = c ? (c.balance || 0) - amt : null;
            return `
                <div class="card-txn-head"><button class="card-txn-back" data-action="closeStep" type="button">✕</button><span>كم تريد أن ترسل؟</span></div>
                <div class="card-txn-amount privacy-sensitive" id="stcAmountVal">${Store.money(amt)} <small>₪</small></div>
                <div class="card-txn-quick">
                    ${[10, 20, 50, 100].map(v => `<button data-add="${v}" type="button">+${v}</button>`).join("")}
                    <button data-action="clear" type="button">مسح</button>
                </div>
                ${c ? `
                <div class="card-txn-preview">
                    <span>الرصيد بعد التحويل</span>
                    <strong class="privacy-sensitive ${after < 0 ? "card-txn-neg" : ""}">${Store.money(Math.max(after, 0))} ₪</strong>
                </div>` : ""}
                <button class="main-button" data-action="amountOk" type="button">تم</button>`;
        }

        function stepPanelHtml() {
            if (openStep === "source") return sourcePanelHtml();
            if (openStep === "recipient") return recipientPanelHtml();
            if (openStep === "amount") return amountPanelHtml();
            return "";
        }

        function render() {
            root.innerHTML = `
                <div class="stc-root glass">
                    ${barHtml()}
                    <div class="stc-panel app-card slim" ${openStep ? "" : "hidden"}>${openStep ? stepPanelHtml() : ""}</div>
                </div>`;
            wire();
        }

        function setOpenStep(step) {
            openStep = step;
            render();
        }

        function afterStepComplete() {
            const nxt = nextIncomplete(state);
            setOpenStep(nxt || null);
        }

        function wireContactChips(container, onPick) {
            container.querySelectorAll(".card-txn-contact").forEach(chip => {
                chip.addEventListener("click", () => {
                    const c = Store.getContact(chip.dataset.id);
                    if (!c) return;
                    onPick(c);
                });
            });
        }

        function pickContact(c) {
            state.contactId = c.id;
            state.recipientName = c.name;
            state.recipientPhone = c.phone;
            state.contactType = c.type || "";
            App.haptic("click");
            afterStepComplete();
        }

        function wire() {
            root.querySelectorAll(".stc-chip").forEach(btn => {
                btn.addEventListener("click", () => {
                    const step = btn.dataset.step;
                    setOpenStep(openStep === step ? null : step);
                });
            });

            const reviewBtn = root.querySelector('[data-action="review"]');
            if (reviewBtn) reviewBtn.addEventListener("click", submitReview);

            const closeBtn = root.querySelector('[data-action="closeStep"]');
            if (closeBtn) closeBtn.addEventListener("click", () => setOpenStep(null));

            const goCards = root.querySelector('[data-action="goCards"]');
            if (goCards) goCards.addEventListener("click", () => {
                if (opts.inSheet) App.closeSheet();
                window.switchPage("cardsPage");
            });

            root.querySelectorAll(".stc-wallet-row").forEach(row => {
                row.addEventListener("click", () => {
                    state.cardId = row.dataset.id;
                    App.haptic("click");
                    afterStepComplete();
                });
            });

            if (openStep === "recipient") {
                wireContactChips(root, pickContact);

                const searchInput = root.querySelector("#stcSearch");
                if (searchInput) searchInput.addEventListener("input", () => {
                    const q = searchInput.value.trim();
                    const results = root.querySelector("#stcContactResults");
                    if (!results) return;
                    if (!q) {
                        const favs = Store.quickContacts().slice(0, 6);
                        const recents = recentContacts(favs.map(f => f.id));
                        results.innerHTML = `
                            ${favs.length ? `<div class="stc-mini-label">المفضلة</div><div class="card-txn-contacts">${favs.map(contactChipHtml).join("")}</div>` : ""}
                            ${recents.length ? `<div class="stc-mini-label">تحويلات سابقة</div><div class="card-txn-contacts">${recents.map(contactChipHtml).join("")}</div>` : ""}`;
                        wireContactChips(results, pickContact);
                        return;
                    }
                    const matches = Store.getContacts().filter(c =>
                        (c.name || "").includes(q) || (c.phone || "").includes(Store.cleanNum(q))
                    ).slice(0, 8);
                    results.innerHTML = matches.length
                        ? `<div class="stc-mini-label">نتائج البحث</div><div class="card-txn-contacts">${matches.map(contactChipHtml).join("")}</div>`
                        : '<p class="sheet-sub" style="margin:4px 2px;">لا نتائج مطابقة.</p>';
                    wireContactChips(results, pickContact);
                });

                const manualGo = root.querySelector('[data-action="manualGo"]');
                if (manualGo) manualGo.addEventListener("click", () => {
                    const input = root.querySelector("#stcManualPhone");
                    const phone = Store.cleanNum(input ? input.value : "");
                    if (!phone || phone.length < 9) { App.toast("أدخل رقمًا صحيحًا"); return; }
                    state.contactId = null; state.recipientName = ""; state.recipientPhone = phone; state.contactType = "";
                    afterStepComplete();
                });
            }

            if (openStep === "amount") {
                root.querySelectorAll("[data-add]").forEach(btn => {
                    btn.addEventListener("click", () => {
                        state.amount = (state.amount || 0) + Number(btn.dataset.add);
                        refreshAmount();
                    });
                });
                const clearBtn = root.querySelector('[data-action="clear"]');
                if (clearBtn) clearBtn.addEventListener("click", () => { state.amount = 0; refreshAmount(); });
                const okBtn = root.querySelector('[data-action="amountOk"]');
                if (okBtn) okBtn.addEventListener("click", () => {
                    if (!state.amount || state.amount <= 0) { App.toast("أدخل مبلغًا صحيحًا"); return; }
                    afterStepComplete();
                });
            }
        }

        function refreshAmount() {
            const c = card();
            const valEl = root.querySelector("#stcAmountVal");
            if (valEl) App.animateNumberSwap(valEl, `${Store.money(state.amount)} <small>₪</small>`);
            const prevEl = root.querySelector(".card-txn-preview strong");
            if (prevEl && c) {
                const after = (c.balance || 0) - state.amount;
                prevEl.classList.toggle("card-txn-neg", after < 0);
                App.animateNumberSwap(prevEl, `${Store.money(Math.max(after, 0))} ₪`);
            }
        }

        /* لا تُنفَّذ العملية هنا — فقط تعبئة النموذج الحقيقي وتشغيل نفس زر "إنشاء الكود"
           كي تمر عبر نفس Transaction Engine (كشف التكرار/التأكيد/الرصيد) بلا أي تكرار للمنطق. */
        function submitReview() {
            if (!allDone(state)) return;
            const c = card();
            if (!c) { App.toast("اختر محفظة أولاً"); return; }
            if (c.network !== "bank" && state.amount > (c.balance || 0)) {
                App.toast("الرصيد غير كافٍ لإتمام العملية");
                return;
            }
            const payment = state.contactType === "merchant" ? "merchant" : "friend";
            const receiver = state.recipientPhone;
            const amount = state.amount;

            if (opts.inSheet) App.closeSheet();
            window.switchPage("transferPage");
            setTimeout(() => {
                Transfer.prefillFromCard({
                    service: c.network, payment, cardId: c.id,
                    receiver, amount, silent: true,
                });
                setTimeout(() => {
                    const btn = document.getElementById("createButton");
                    if (btn) btn.click();
                }, 100);
            }, 80);

            state = emptyState();
            openStep = null;
            render();
        }

        function prefillAndShow(data) {
            state = { ...emptyState(), ...data };
            openStep = null;
            render();
        }

        render();
        return {
            render,
            prefillAndShow,
            reset() { state = emptyState(); openStep = null; render(); },
        };
    }

    let homeInstance = null;

    function mountHome() {
        const el = document.getElementById("smartComposerHome");
        if (!el || homeInstance) return;
        homeInstance = createInstance(el, { inSheet: false });
    }

    /* -------- Wallet Command Center — ورقة وصول سريع: رصيد + Composer + اختصارات -------- */
    function openCommandCenter() {
        const totalBal = Store.getTotalBalance();
        App.openSheet(`
            <div class="sheet-title">⌘ مركز التحكم</div>
            <div class="cmd-balance-row">
                <span>الرصيد الإجمالي</span>
                <strong class="privacy-sensitive">${Store.money(totalBal)} <small>₪</small></strong>
            </div>
            <div id="cmdComposerMount"></div>
            ${Store.getCards().length ? `<button class="secondary-button full-button" id="cmdPlaygroundBtn" type="button">🎯 تحويل بالسحب</button>` : ""}
            <div class="cmd-quick-grid">
                <button class="cmd-quick-btn" data-go="cardsPage" type="button"><span>💳</span>بطاقاتي</button>
                <button class="cmd-quick-btn" data-action="receive" type="button"><span>↙</span>استقبال</button>
                <button class="cmd-quick-btn" data-action="topup" type="button"><span>⚡</span>شحن</button>
                <button class="cmd-quick-btn" data-go="statsPage" type="button"><span>📊</span>إحصائياتي</button>
            </div>
        `);
        const mount = document.getElementById("cmdComposerMount");
        if (mount) createInstance(mount, { inSheet: true });

        document.querySelectorAll(".cmd-quick-btn[data-go]").forEach(b => {
            b.addEventListener("click", () => { App.closeSheet(); window.switchPage(b.dataset.go); });
        });
        const receiveBtn = document.querySelector('.cmd-quick-btn[data-action="receive"]');
        if (receiveBtn) receiveBtn.addEventListener("click", () => { App.closeSheet(); if (App.receiveSheet) App.receiveSheet(); });
        const topupBtn = document.querySelector('.cmd-quick-btn[data-action="topup"]');
        if (topupBtn) topupBtn.addEventListener("click", () => { App.closeSheet(); if (window.Cards) Cards.topUpActive(); });
        const pgBtn = document.getElementById("cmdPlaygroundBtn");
        if (pgBtn) pgBtn.addEventListener("click", () => { App.closeSheet(); if (window.Playground) Playground.open(); });
    }

    /* تعبئة فورية من مصدر خارجي (تحويلات سريعة مثلًا) — تفتح الرئيسية وتُظهر Composer جاهزًا للمراجعة */
    function quickFill(data) {
        mountHome();
        if (!homeInstance) return false;
        window.switchPage("transferPage");
        setTimeout(() => {
            const dash = document.getElementById("smartComposerHome");
            if (dash) dash.scrollIntoView({ behavior: "smooth", block: "center" });
            homeInstance.prefillAndShow(data);
        }, 80);
        return true;
    }

    /* -------- Pocket Mode — أسرع طريقة لتحويل: [محفظة] → [مستفيد] → [مبلغ] فقط، بلا أي محتوى آخر -------- */
    function openPocketMode() {
        App.openSheet(`<div id="pocketComposerMount" class="pocket-sheet-body"></div>`);
        const mount = document.getElementById("pocketComposerMount");
        if (mount) createInstance(mount, { inSheet: true });
    }

    function wirePocketHandle() {
        const handle = document.getElementById("pocketHandle");
        if (!handle) return;
        let suppressClick = false;
        handle.addEventListener("click", () => {
            if (suppressClick) { suppressClick = false; return; }
            openPocketMode();
        });

        let startY = null;
        handle.addEventListener("pointerdown", e => { startY = e.clientY; });
        handle.addEventListener("pointermove", e => {
            if (startY === null) return;
            if (startY - e.clientY > 28) { startY = null; suppressClick = true; openPocketMode(); }
        });
        handle.addEventListener("pointerup", () => { startY = null; });
        handle.addEventListener("pointercancel", () => { startY = null; });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => { mountHome(); wirePocketHandle(); });
    } else {
        mountHome();
        wirePocketHandle();
    }

    return { mountHome, openCommandCenter, openPocketMode, quickFill };

})();
