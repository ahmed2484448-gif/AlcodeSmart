/* ==================================================
   debts.js — دفتر الديون والسلف
================================================== */

window.Debts = (function () {

    const listEl = document.getElementById("debtsList");
    const summaryEl = document.getElementById("debtsSummary");
    const filterRow = document.getElementById("debtsFilter");
    const searchEl = document.getElementById("debtsSearch");
    const esc = (App && App.esc) ? App.esc : (s => String(s == null ? "" : s));

    if (!listEl) return { render() {} };

    let filter = "all";
    let query = "";

    const TYPES = { owed_to_me: "لي", i_owe: "عليّ" };
    const CATEGORIES = {
        cash: { label: "سلفة نقدية", icon: "💵" },
        work: { label: "عمل وخدمات", icon: "💼" },
        other: { label: "أخرى", icon: "📦" },
    };
    function cat(id) { return CATEGORIES[id] || CATEGORIES.other; }

    filterRow.querySelectorAll(".filter-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            filterRow.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            filter = chip.dataset.f;
            render();
        });
    });

    if (searchEl) searchEl.addEventListener("input", () => {
        query = searchEl.value.trim();
        render();
    });

    document.getElementById("addDebtBtn").addEventListener("click", () => editSheet(null));


    /* -------- العرض -------- */

    function currentList() {
        let list = Store.getDebts().slice();

        if (filter === "me") list = list.filter(d => !d.settled && d.type === "owed_to_me");
        else if (filter === "owe") list = list.filter(d => !d.settled && d.type === "i_owe");
        else if (filter === "open") list = list.filter(d => !d.settled);
        // "all" — بلا تصفية إضافية (تشمل المسدَّدة)

        const q = query.toLowerCase();
        if (q) {
            list = list.filter(d =>
                (d.person || "").toLowerCase().includes(q) ||
                (d.note || "").toLowerCase().includes(q) ||
                Store.cleanNum(d.phone || "").includes(Store.cleanNum(q))
            );
        }

        return list.sort((a, b) => (b.dueDate || b.createdAt || 0) - (a.dueDate || a.createdAt || 0));
    }

    function render() {
        const s = Store.debtSummary();
        summaryEl.innerHTML = `
            <div class="debts-stat-cards">
                <div class="debts-stat-card neg">
                    <div class="dsc-top"><span>عليّ (ديون)</span><span class="dsc-icon">↗</span></div>
                    <div class="dsc-amount">₪ ${Store.money(s.iOwe)}</div>
                    <div class="dsc-label">التزامات مطلوب سدادها</div>
                </div>
                <div class="debts-stat-card pos">
                    <div class="dsc-top"><span>لي (مستحقات)</span><span class="dsc-icon">↗</span></div>
                    <div class="dsc-amount">₪ ${Store.money(s.owedToMe)}</div>
                    <div class="dsc-label">أموال أنتظر استرجاعها</div>
                </div>
            </div>
            <div class="debts-balance-bar ${s.net >= 0 ? "pos" : "neg"}">
                <span>الرصيد المستحق:</span>
                <b>${s.net >= 0 ? "+" : "−"}₪ ${Store.money(Math.abs(s.net))} (${s.net >= 0 ? "فائض لصالحك" : "عجز عليك"})</b>
            </div>
        `;

        const list = currentList();
        if (!list.length) {
            listEl.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📓</div>
                    <h3>لا شيء هنا</h3>
                    <p>${query ? "لا نتائج مطابقة للبحث." : "أضف دَينًا أو سلفة لتتابعها."}</p>
                </div>`;
            return;
        }

        const now = Date.now();
        listEl.innerHTML = list.map((d, i) => {
            const overdue = d.dueDate && !d.settled && d.dueDate < now;
            const c = cat(d.category);
            const pos = d.type === "owed_to_me";
            return `
                <div class="debt-row ${d.settled ? "settled" : ""} ${overdue ? "overdue" : ""}"
                     data-id="${d.id}" style="--i:${Math.min(i, 12)}">
                    <div class="di-top">
                        <span class="di-amount ${pos ? "pos" : "neg"}">₪${Store.money(d.amount)}${pos ? "+" : "−"}</span>
                        <div class="di-who">
                            <div class="d-name">${esc(d.person || "بدون اسم")}</div>
                            <div class="di-cat"><span>${c.icon}</span> ${esc(c.label)} · ${d.dueDate ? Store.relativeDay(d.dueDate) : Store.relativeDay(d.createdAt)}</div>
                        </div>
                    </div>
                    ${d.note ? `<div class="di-note">${esc(d.note)}</div>` : ""}
                    <div class="di-bottom">
                        <button class="di-icon-btn di-delete" type="button" aria-label="حذف">🗑</button>
                        <span class="di-status ${d.settled ? "done" : "pending"}">${d.settled ? "✓ تم السداد" : "غير مسدَّد"}</span>
                        ${d.dueDate ? `<span class="di-due">📅 ${overdue ? "متأخّر" : "الاستحقاق"}: ${Store.relativeDay(d.dueDate)}</span>` : ""}
                        ${d.phone ? `<a class="di-call" href="${Store.telHref(d.phone)}">📞 اتصال</a>` : ""}
                    </div>
                </div>`;
        }).join("");

        listEl.querySelectorAll(".debt-row").forEach(item => {
            item.querySelector(".di-delete").addEventListener("click", e => {
                e.stopPropagation();
                const id = item.dataset.id;
                const snap = Store.deleteDebtUndoable(id);
                render();
                App.toastAction("حُذف من الدفتر", "تراجع", () => { Store.restoreDebt(snap); render(); App.toast("تمت الاستعادة"); });
            });
            const call = item.querySelector(".di-call");
            if (call) call.addEventListener("click", e => e.stopPropagation());
            item.addEventListener("click", () => detailSheet(item.dataset.id));
        });
    }


    /* -------- ورقة التفاصيل -------- */

    function detailSheet(id) {
        const d = Store.getDebt(id);
        if (!d) return;
        const c = cat(d.category);
        App.openSheet(`
            <div class="sheet-title">${esc(d.person || "بدون اسم")}</div>
            <div class="sheet-sub">${TYPES[d.type]} — ${Store.money(d.amount)} ₪</div>
            <div style="background:var(--input);border-radius:14px;padding:10px 14px;margin:14px 0;">
                <div class="kv-row"><span>النوع</span><strong>${d.type === "owed_to_me" ? "لك عنده" : "عليك له"}</strong></div>
                <div class="kv-row"><span>التصنيف</span><strong>${c.icon} ${esc(c.label)}</strong></div>
                <div class="kv-row"><span>المبلغ</span><strong>${Store.money(d.amount)} ₪</strong></div>
                ${d.phone ? `<div class="kv-row"><span>الهاتف</span><strong>${esc(d.phone)}</strong></div>` : ""}
                ${d.note ? `<div class="kv-row"><span>ملاحظة</span><strong>${esc(d.note)}</strong></div>` : ""}
                ${d.dueDate ? `<div class="kv-row"><span>تاريخ الاستحقاق</span><strong>${Store.relativeDay(d.dueDate)}</strong></div>` : ""}
                <div class="kv-row"><span>الحالة</span><strong>${d.settled ? "✓ مسدَّد" : "قائم"}</strong></div>
            </div>
            ${d.phone ? `<a class="secondary-button full-button" href="${Store.telHref(d.phone)}" style="display:flex;">📞 اتصال بـ${esc(d.person || "")}</a>` : ""}
            ${d.settled
                ? '<button class="sheet-menu-btn" id="dUnsettle" type="button">↺ إرجاعه دَينًا قائمًا</button>'
                : '<button class="sheet-menu-btn" id="dSettle" type="button">✓ تسديد كامل</button>'}
            <button class="sheet-menu-btn" id="dEdit" type="button">✎ تعديل</button>
            <button class="sheet-menu-btn danger" id="dDelete" type="button">🗑 حذف</button>
        `);

        const settle = document.getElementById("dSettle");
        if (settle) settle.addEventListener("click", () => {
            Store.settleDebt(id, true);
            App.closeSheet();
            render();
            App.toast("سُجّل كمسدَّد");
        });
        const unsettle = document.getElementById("dUnsettle");
        if (unsettle) unsettle.addEventListener("click", () => {
            Store.settleDebt(id, false);
            App.closeSheet();
            render();
        });
        document.getElementById("dEdit").addEventListener("click", () => editSheet(id));
        document.getElementById("dDelete").addEventListener("click", () => {
            const snap = Store.deleteDebtUndoable(id);
            App.closeSheet();
            render();
            App.toastAction("حُذف من الدفتر", "تراجع", () => {
                Store.restoreDebt(snap);
                render();
                App.toast("تمت الاستعادة");
            });
        });
    }


    /* -------- إضافة / تعديل -------- */

    function editSheet(id) {
        const d = id ? Store.getDebt(id) : null;
        const dueVal = d && d.dueDate ? new Date(d.dueDate).toISOString().slice(0, 10) : "";
        const curCat = (d && d.category) || "cash";

        App.openSheet(`
            <div class="sheet-title">${d ? "تعديل" : "دَين / سلفة جديدة"}</div>
            <div class="sheet-sub">تُحفظ على جهازك فقط</div>

            <div class="type-toggle">
                <button class="tt-opt ${!d || d.type === "owed_to_me" ? "active" : ""}" data-t="owed_to_me" type="button">لي عند شخص</button>
                <button class="tt-opt ${d && d.type === "i_owe" ? "active" : ""}" data-t="i_owe" type="button">عليّ لشخص</button>
            </div>

            <div class="input-group">
                <label>الشخص</label>
                <input id="dPerson" type="text" list="debtPeople" value="${d ? esc(d.person) : ""}" placeholder="الاسم">
                <datalist id="debtPeople">
                    ${Store.getContacts().map(c => `<option value="${esc(c.name)}">`).join("")}
                </datalist>
            </div>
            <div class="input-group">
                <label>المبلغ <span>(بالشيكل)</span></label>
                <input id="dAmount" type="number" inputmode="decimal" min="1" step="0.01"
                    value="${d ? d.amount : ""}" placeholder="مثال: 200">
            </div>
            <div class="input-group">
                <label>التصنيف</label>
                <div class="type-toggle" id="dCatToggle">
                    ${Object.keys(CATEGORIES).map(k => `
                        <button class="tt-opt ${curCat === k ? "active" : ""}" data-c="${k}" type="button">${CATEGORIES[k].icon} ${CATEGORIES[k].label}</button>
                    `).join("")}
                </div>
            </div>
            <div class="input-group">
                <label>رقم الهاتف <span>(اختياري — لزر الاتصال السريع)</span></label>
                <input id="dPhone" type="tel" value="${d ? esc(d.phone || "") : ""}" placeholder="05XXXXXXXX">
            </div>
            <div class="input-group">
                <label>ملاحظة <span>(اختياري)</span></label>
                <input id="dNote" type="text" value="${d ? esc(d.note || "") : ""}" placeholder="مثال: سلفة حتى الراتب">
            </div>
            <div class="input-group">
                <label>تاريخ الاستحقاق <span>(اختياري — للتذكير)</span></label>
                <input id="dDue" type="date" value="${dueVal}">
            </div>

            <button class="main-button" id="dSave" type="button">حفظ</button>
        `);

        let type = d ? d.type : "owed_to_me";
        document.querySelectorAll("#sheetBody .type-toggle:not(#dCatToggle) .tt-opt").forEach(b => {
            b.addEventListener("click", () => {
                type = b.dataset.t;
                document.querySelectorAll("#sheetBody .type-toggle:not(#dCatToggle) .tt-opt").forEach(x => x.classList.toggle("active", x === b));
            });
        });

        let category = curCat;
        document.querySelectorAll("#dCatToggle .tt-opt").forEach(b => {
            b.addEventListener("click", () => {
                category = b.dataset.c;
                document.querySelectorAll("#dCatToggle .tt-opt").forEach(x => x.classList.toggle("active", x === b));
            });
        });

        document.getElementById("dSave").addEventListener("click", () => {
            const person = document.getElementById("dPerson").value.trim();
            const amount = Number(Store.cleanAmt(document.getElementById("dAmount").value));
            if (!person) { App.toast("أدخل اسم الشخص"); return; }
            if (!amount || amount <= 0) { App.toast("أدخل مبلغًا صحيحًا"); return; }
            const dueStr = document.getElementById("dDue").value;

            Store.saveDebt({
                id: d ? d.id : undefined,
                type,
                person,
                amount,
                category,
                phone: Store.cleanNum(document.getElementById("dPhone").value),
                note: document.getElementById("dNote").value.trim(),
                dueDate: dueStr ? new Date(dueStr + "T12:00:00").getTime() : null,
                settled: d ? d.settled : false,
            });

            App.closeSheet();
            App.toast("تم الحفظ");
            render();
        });
    }


    render();
    return { render, editSheet };

})();
