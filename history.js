/* ==================================================
   history.js — صفحة سجل العمليات
================================================== */

window.History = (function () {

    const container = document.getElementById("historyContainer");
    const searchEl = document.getElementById("historySearch");
    const filterRow = document.getElementById("historyFilters");
    const esc = App.esc;

    let filter = "all";
    let query = "";
    let contactFilter = null;

    searchEl.addEventListener("input", () => {
        query = searchEl.value.trim();
        render();
    });

    filterRow.querySelectorAll(".filter-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            filterRow.querySelectorAll(".filter-chip")
                .forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            filter = chip.dataset.filter;
            contactFilter = null;
            render();
        });
    });

    document.getElementById("clearHistoryButton").addEventListener("click", () => {
        if (!Store.getOps().length) { App.toast("السجل فارغ"); return; }
        App.openSheet(`
            <div class="sheet-title">مسح السجل؟</div>
            <div class="sheet-sub">تُحذف كل العمليات المسجّلة نهائيًا.</div>
            <button class="sheet-menu-btn danger" id="clrYes" type="button">🗑 نعم، امسح الكل</button>
            <button class="sheet-menu-btn" id="clrNo" type="button">إلغاء</button>
        `);
        document.getElementById("clrYes").addEventListener("click", () => {
            Store.clearOps();
            App.closeSheet();
            render();
            Transfer.refreshHome();
        });
        document.getElementById("clrNo").addEventListener("click", () => App.closeSheet());
    });


    /* -------- عرض السجل -------- */

    function currentList() {
        let ops = Store.getOps();

        if (contactFilter) {
            ops = ops.filter(o => o.contactId === contactFilter);
        }

        if (filter === "success" || filter === "failed") {
            ops = ops.filter(o => o.status === filter);
        } else if (filter === "jawwal" || filter === "palpay" || filter === "bank") {
            ops = ops.filter(o => o.service === filter);
        }

        if (query) {
            const q = query;
            ops = ops.filter(o =>
                (o.name || "").includes(q) ||
                (o.phone || "").includes(Store.cleanNum(q)) ||
                (o.code || "").includes(q) ||
                (o.serviceName || "").includes(q)
            );
        }
        return ops;
    }

    function render() {
        const ops = currentList();

        if (!ops.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">◷</div>
                    <h3>لا توجد عمليات</h3>
                    <p>${query || filter !== "all" || contactFilter
                        ? "لا نتائج مطابقة للفلتر."
                        : "ستظهر التحويلات هنا بعد إتمام الاتصال."}</p>
                </div>`;
            return;
        }

        // تجميع حسب اليوم
        const groups = {};
        ops.forEach(o => {
            const label = Store.relativeDay(o.ts) || "غير مؤرّخ";
            (groups[label] = groups[label] || []).push(o);
        });

        const bannerContact = contactFilter
            ? `<div class="day-label" style="color:var(--primary);">
                 سجل: ${esc((Store.getContact(contactFilter) || {}).name || "جهة محذوفة")}
                 — <button class="link-btn" id="clearContactFilter" type="button">عرض الكل</button>
               </div>` : "";

        let _i = 0;
        container.innerHTML = bannerContact + Object.keys(groups).map(label => `
            <div class="day-group">
                <div class="day-label">${esc(label)}</div>
                ${groups[label].map(o => opRow(o, _i++)).join("")}
            </div>
        `).join("");

        const cc = document.getElementById("clearContactFilter");
        if (cc) cc.addEventListener("click", () => {
            contactFilter = null;
            render();
        });

        container.querySelectorAll(".op-item").forEach(item => {
            item.addEventListener("click", () => opSheet(item.dataset.id));
        });
    }

    function opRow(o, i) {
        const icon = o.status === "success" ? "✅"
            : o.status === "failed" ? "❌" : "⏳";
        const title = o.name || o.serviceName || "عملية";
        const sub = [
            o.serviceName,
            o.phone ? Store.maskPhone(o.phone) : null,
            Store.timeOf(o.ts),
        ].filter(Boolean).join("  •  ");

        return `
            <div class="op-item" data-id="${o.id}" style="--i:${Math.min(i || 0, 12)}">
                <span class="op-status-icon">${icon}</span>
                <div class="op-main">
                    <div class="o-name">${esc(title)}</div>
                    <div class="o-sub">${esc(sub)}</div>
                </div>
                <div class="op-amount ${o.status === "failed" ? "failed" : ""}">
                    ${o.amount ? Store.money(o.amount) : "—"}
                </div>
            </div>`;
    }


    /* -------- تفاصيل العملية + إعادة التحويل -------- */

    function opSheet(id) {
        const o = Store.getOps().find(x => x.id === id);
        if (!o) return;

        const statusText = o.status === "success" ? "✅ ناجحة"
            : o.status === "failed" ? "❌ فاشلة" : "⏳ قيد التنفيذ";

        App.openSheet(`
            <div class="sheet-title">${esc(o.name || o.serviceName || "عملية")}</div>
            <div class="sheet-sub">${esc(o.date || Store.relativeDay(o.ts))}</div>

            <div style="background:var(--input);border-radius:14px;padding:10px 14px;margin-bottom:16px;">
                <div class="kv-row"><span>الحالة</span><strong>${statusText}</strong></div>
                <div class="kv-row"><span>الخدمة</span><strong>${esc(o.serviceName || "—")}</strong></div>
                ${o.paymentName ? `<div class="kv-row"><span>طريقة الدفع</span><strong>${esc(o.paymentName)}</strong></div>` : ""}
                ${o.phone ? `<div class="kv-row"><span>رقم المستلم</span><strong>${esc(Store.maskPhone(o.phone))}</strong></div>` : ""}
                ${o.amount ? `<div class="kv-row"><span>المبلغ</span><strong>${Store.money(o.amount)} ₪</strong></div>` : ""}
                ${o.notes ? `<div class="kv-row"><span>ملاحظة</span><strong>${esc(o.notes)}</strong></div>` : ""}
                ${o.code ? `<div class="kv-row"><span>الكود</span><strong style="direction:ltr;">${esc(o.code)}</strong></div>` : ""}
            </div>

            <button class="sheet-menu-btn" id="oRetry" type="button">↻ إعادة التحويل</button>
            ${o.status !== "failed"
                ? '<button class="sheet-menu-btn" id="oFail" type="button">✎ تعليم كفاشلة</button>'
                : '<button class="sheet-menu-btn" id="oOk" type="button">✎ تعليم كناجحة</button>'}
            ${o.contactId ? '<button class="sheet-menu-btn" id="oContact" type="button">👤 فتح الجهة</button>' : ""}
            <button class="sheet-menu-btn danger" id="oDel" type="button">🗑 حذف من السجل</button>
        `);

        document.getElementById("oRetry").addEventListener("click", () => {
            App.prefillTransfer({
                service: o.service,
                payment: o.payment,
                receiver: o.phone,
                amount: o.amount || "",
                notes: o.notes,
                name: o.name,
                contactId: o.contactId,
            });
        });

        const oFail = document.getElementById("oFail");
        if (oFail) oFail.addEventListener("click", () => {
            Store.updateOpStatus(id, "failed");
            App.closeSheet(); render(); Transfer.refreshHome();
        });
        const oOk = document.getElementById("oOk");
        if (oOk) oOk.addEventListener("click", () => {
            Store.updateOpStatus(id, "success");
            App.closeSheet(); render(); Transfer.refreshHome();
        });

        const oContact = document.getElementById("oContact");
        if (oContact) oContact.addEventListener("click", () => {
            App.closeSheet();
            App.go("contactsPage");
            setTimeout(() => Contacts.detailSheet(o.contactId), 80);
        });

        document.getElementById("oDel").addEventListener("click", () => {
            const removed = Store.deleteOpUndoable(id);
            App.closeSheet();
            render();
            Transfer.refreshHome();
            App.toastAction("حُذفت العملية", "تراجع", () => {
                Store.restoreOp(removed);
                render();
                Transfer.refreshHome();
                App.toast("تمت الاستعادة");
            });
        });
    }


    /* -------- عرض سجل جهة محددة -------- */

    function showForContact(contactId) {
        App.go("historyPage");
        contactFilter = contactId;
        filter = "all";
        filterRow.querySelectorAll(".filter-chip").forEach(c =>
            c.classList.toggle("active", c.dataset.filter === "all"));
        setTimeout(render, 60);
    }


    render();
    return { render, showForContact, openOp: opSheet };

})();
