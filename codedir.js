/* ==================================================
   codedir.js — دليل أكواد USSD السريعة (قابل للإضافة من المستخدم)
================================================== */

window.CodeDir = (function () {

    const listEl = document.getElementById("codeDirList");
    const esc = App.esc;

    if (!listEl) return { render() {} };

    function render() {
        const list = Store.getCodeDirectory().slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        if (!list.length) {
            listEl.innerHTML = `<p class="about-text" style="text-align:center;">لا أكواد بعد.</p>`;
            return;
        }
        listEl.innerHTML = list.map(e => `
            <div class="codedir-item" data-id="${e.id}">
                <span class="codedir-icon">📞</span>
                <span class="codedir-name">${esc(e.name)}</span>
                <a class="codedir-code" href="${Store.telHref(e.code)}" data-call>${esc(e.code)}</a>
                ${e.builtin ? "" : '<button type="button" class="codedir-del" aria-label="حذف">🗑</button>'}
            </div>`).join("");

        listEl.querySelectorAll("[data-call]").forEach(a => a.addEventListener("click", e => e.stopPropagation()));
        listEl.querySelectorAll(".codedir-del").forEach(btn => {
            btn.addEventListener("click", e => {
                e.stopPropagation();
                const id = btn.closest(".codedir-item").dataset.id;
                const snap = Store.deleteCodeEntryUndoable(id);
                render();
                App.toastAction("حُذف من الدليل", "تراجع", () => { Store.restoreCodeEntry(snap); render(); App.toast("تمت الاستعادة"); });
            });
        });
    }

    function addSheet() {
        App.openSheet(`
            <div class="sheet-title">إضافة كود جديد للدليل</div>
            <div class="sheet-sub">أدخل كودًا تحقّقت منه بنفسك — التطبيق لا يخمّن أكواد الأرصدة أو الخدمات.</div>
            <div class="input-group">
                <label>الاسم</label>
                <input id="cdName" type="text" placeholder="مثال: فحص رصيد جوال">
            </div>
            <div class="input-group">
                <label>الكود</label>
                <input id="cdCode" type="text" dir="ltr" placeholder="مثال: *100#">
            </div>
            <button class="main-button" id="cdSave" type="button">حفظ</button>
        `);
        document.getElementById("cdSave").addEventListener("click", () => {
            const name = document.getElementById("cdName").value.trim();
            const code = document.getElementById("cdCode").value.trim();
            if (!name) { App.toast("أدخل اسمًا"); return; }
            if (!/^[*#0-9]+$/.test(code)) { App.toast("الكود يجب أن يتكوّن من أرقام و* و# فقط"); return; }
            Store.saveCodeEntry({ name, code });
            App.closeSheet();
            App.toast("أُضيف للدليل");
            render();
        });
    }

    const addBtn = document.getElementById("codeDirAddBtn");
    if (addBtn) addBtn.addEventListener("click", addSheet);

    render();
    return { render };

})();
