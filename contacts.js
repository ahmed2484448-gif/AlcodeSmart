/* ==================================================
   contacts.js — صفحة الجهات
================================================== */

window.Contacts = (function () {

    const listEl = document.getElementById("contactsList");
    const searchEl = document.getElementById("contactSearch");
    const groupsEl = document.getElementById("contactGroups");
    const esc = App.esc;
    const photo = id => (window.PhotoDB ? PhotoDB.get(id) : null);

    let query = "";
    let groupFilter = "";

    const GROUP_SUGGESTIONS = ["عائلة", "أصدقاء", "عمل", "تجّار", "جيران", "أخرى"];

    searchEl.addEventListener("input", () => {
        query = searchEl.value.trim();
        render();
    });

    document.getElementById("addContactBtn")
        .addEventListener("click", () => editSheet(null));


    /* -------- شرائح المجموعات -------- */

    function renderGroups() {
        const groups = Store.contactGroups();
        if (!groups.length) { groupsEl.innerHTML = ""; return; }
        groupsEl.innerHTML =
            `<button class="filter-chip ${groupFilter === "" ? "active" : ""}"
                     data-g="" type="button">الكل</button>` +
            groups.map(g => `
                <button class="filter-chip ${groupFilter === g ? "active" : ""}"
                        data-g="${esc(g)}" type="button">${esc(g)}</button>`).join("");
        groupsEl.querySelectorAll(".filter-chip").forEach(b => {
            b.addEventListener("click", () => {
                groupFilter = b.dataset.g;
                render();
            });
        });
    }


    /* -------- القائمة -------- */

    function render() {
        renderGroups();
        let list = Store.getContacts();

        if (groupFilter) list = list.filter(c => c.group === groupFilter);

        if (query) {
            const q = query;
            list = list.filter(c =>
                (c.name || "").includes(q) ||
                Store.cleanNum(c.phone).includes(Store.cleanNum(q))
            );
        }

        // المفضّلة أولًا ثم الأحدث نشاطًا
        list.sort((a, b) => {
            if (!!b.favorite !== !!a.favorite) return b.favorite ? 1 : -1;
            return (Store.contactStats(b.id).lastTs || 0) -
                   (Store.contactStats(a.id).lastTs || 0);
        });

        if (!list.length) {
            listEl.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">👥</div>
                    <h3>لا توجد جهات</h3>
                    <p>أضف جهة جديدة، أو احفظ الرقم عند التحويل.</p>
                </div>`;
            return;
        }

        listEl.innerHTML = list.map((c, ci) => {
            const st = Store.contactStats(c.id);
            const net = (Store.SERVICES[c.network] || {}).name || "";
            const sub = [
                Store.maskPhone(c.phone),
                st.lastTs ? "آخر تحويل " + Store.relativeDay(st.lastTs) : null,
                st.total ? "الإجمالي " + Store.money(st.total) + " ₪" : null,
            ].filter(Boolean).join("  •  ");

            const ph = photo(c.id);
            return `
                <div class="contact-item" data-id="${c.id}" style="--i:${Math.min(ci, 12)}">
                    <span class="contact-avatar">
                        ${ph ? `<img src="${ph}">` : esc((c.name || "?").charAt(0))}
                    </span>
                    <div class="contact-main">
                        <div class="c-name">
                            ${c.favorite ? '<span class="star">★</span>' : ""}
                            ${esc(c.name)}
                            ${net ? `<span class="net-badge">${esc(net)}</span>` : ""}
                            ${c.group ? `<span class="net-badge" style="background:transparent;border:1px solid var(--border);color:var(--muted);">${esc(c.group)}</span>` : ""}
                        </div>
                        <div class="c-sub">${esc(sub)}</div>
                    </div>
                    <button class="contact-send" type="button">تحويل</button>
                </div>`;
        }).join("");

        listEl.querySelectorAll(".contact-item").forEach(item => {
            const id = item.dataset.id;

            item.querySelector(".contact-send").addEventListener("click", e => {
                e.stopPropagation();
                transfer(id);
            });

            item.addEventListener("click", () => detailSheet(id));

            // ضغط مطوّل
            let timer = null;
            item.addEventListener("touchstart", () => {
                timer = setTimeout(() => detailSheet(id), 500);
            }, { passive: true });
            item.addEventListener("touchend", () => clearTimeout(timer));
            item.addEventListener("touchmove", () => clearTimeout(timer));
        });
    }


    /* -------- ورقة التفاصيل + القائمة -------- */

    function detailSheet(id) {
        const c = Store.getContact(id);
        if (!c) return;
        const st = Store.contactStats(id);
        const net = (Store.SERVICES[c.network] || {}).name || "—";
        const type = Store.CONTACT_TYPES[c.type] || "—";

        const ph = photo(id);
        App.openSheet(`
            <div class="photo-pick" style="justify-content:center;margin-bottom:10px;">
                <span class="photo-preview">
                    ${ph ? `<img src="${ph}">` : esc((c.name||"?").charAt(0))}
                </span>
            </div>
            <div class="sheet-title">${esc(c.name)}</div>
            <div class="sheet-sub">${esc(Store.maskPhone(c.phone))}</div>

            <div style="background:var(--input);border-radius:14px;padding:10px 14px;margin-bottom:16px;">
                <div class="kv-row"><span>الشبكة / البنك</span><strong>${esc(net)}</strong></div>
                <div class="kv-row"><span>نوع الجهة</span><strong>${esc(type)}</strong></div>
                ${c.group ? `<div class="kv-row"><span>المجموعة</span><strong>${esc(c.group)}</strong></div>` : ""}
                <div class="kv-row"><span>عدد التحويلات</span><strong>${st.count}</strong></div>
                <div class="kv-row"><span>إجمالي ما حُوّل</span><strong>${Store.money(st.total)} ₪</strong></div>
                <div class="kv-row"><span>آخر تحويل</span><strong>${st.lastTs ? Store.relativeDay(st.lastTs) : "—"}</strong></div>
            </div>

            <button class="sheet-menu-btn" id="dTransfer" type="button">↗ تحويل</button>
            <button class="sheet-menu-btn" id="dFav" type="button">
                ${c.favorite ? "★ إزالة من التحويلات السريعة" : "☆ إضافة للتحويلات السريعة"}
            </button>
            <button class="sheet-menu-btn" id="dEdit" type="button">✎ تعديل</button>
            <button class="sheet-menu-btn" id="dHistory" type="button">◷ سجل العمليات</button>
            <button class="sheet-menu-btn danger" id="dDelete" type="button">🗑 حذف</button>
        `);

        document.getElementById("dTransfer").addEventListener("click", () => transfer(id));
        document.getElementById("dEdit").addEventListener("click", () => editSheet(id));
        document.getElementById("dHistory").addEventListener("click", () => {
            App.closeSheet();
            if (window.History) History.showForContact(id);
        });
        document.getElementById("dFav").addEventListener("click", () => {
            Store.toggleFavorite(id);
            App.closeSheet();
            render();
            Transfer.refreshHome();
        });
        document.getElementById("dDelete").addEventListener("click", () => {
            App.openSheet(`
                <div class="sheet-title">حذف ${esc(c.name)}؟</div>
                <div class="sheet-sub">تُحذف الجهة، وتبقى عملياتها في السجل بدون اسم.</div>
                <button class="sheet-menu-btn danger" id="delYes" type="button">🗑 نعم، احذف</button>
                <button class="sheet-menu-btn" id="delNo" type="button">إلغاء</button>
            `);
            document.getElementById("delYes").addEventListener("click", () => {
                const snap = Store.deleteContactUndoable(id);
                App.closeSheet();
                render();
                Transfer.refreshHome();
                App.toastAction("تم حذف " + esc(c.name), "تراجع", () => {
                    Store.restoreContact(snap);
                    render();
                    Transfer.refreshHome();
                    App.toast("تمت الاستعادة");
                });
            });
            document.getElementById("delNo").addEventListener("click", () => detailSheet(id));
        });
    }


    /* -------- ورقة الإضافة / التعديل -------- */

    function editSheet(id) {
        const c = id ? Store.getContact(id) : null;
        let photoData = c ? (photo(c.id) || null) : null;

        const netOpts = Object.keys(Store.SERVICES).map(k =>
            `<option value="${k}" ${c && c.network === k ? "selected" : ""}>
                ${Store.SERVICES[k].name}</option>`
        ).join("") + `<option value="other" ${c && c.network === "other" ? "selected" : ""}>أخرى</option>`;

        const typeOpts = Object.keys(Store.CONTACT_TYPES).map(k =>
            `<option value="${k}" ${c && c.type === k ? "selected" : ""}>
                ${Store.CONTACT_TYPES[k]}</option>`
        ).join("");

        App.openSheet(`
            <div class="sheet-title">${c ? "تعديل جهة" : "جهة جديدة"}</div>
            <div class="sheet-sub">تُحفظ على جهازك فقط</div>

            <div class="photo-pick">
                <span class="photo-preview" id="photoPrev">
                    ${photoData ? `<img src="${photoData}">` : "👤"}
                </span>
                <div class="btn-col" style="flex:1;">
                    <button class="secondary-button" id="photoBtn" type="button">📷 صورة (اختياري)</button>
                    ${photoData ? '<button class="link-btn" id="photoClear" type="button" style="text-align:right;">إزالة الصورة</button>' : ""}
                </div>
                <input type="file" id="photoInput" accept="image/*" hidden>
            </div>

            <div class="input-group">
                <label>الاسم</label>
                <input id="cName" type="text" value="${c ? esc(c.name) : ""}" placeholder="مثال: محمد">
            </div>
            <div class="input-group">
                <label>رقم الهاتف</label>
                <input id="cPhone" type="tel" inputmode="numeric"
                    value="${c ? esc(c.phone) : ""}" placeholder="05XXXXXXXX">
            </div>
            <div class="input-group">
                <label>الشبكة / البنك</label>
                <select id="cNet">${netOpts}</select>
            </div>
            <div class="input-group">
                <label>نوع الجهة</label>
                <select id="cType">${typeOpts}</select>
            </div>
            <div class="input-group">
                <label>المجموعة <span>(اختياري)</span></label>
                <input id="cGroup" type="text" list="groupList"
                    value="${c && c.group ? esc(c.group) : ""}" placeholder="مثال: عائلة">
                <datalist id="groupList">
                    ${[...new Set([...GROUP_SUGGESTIONS, ...Store.contactGroups()])]
                        .map(g => `<option value="${esc(g)}">`).join("")}
                </datalist>
            </div>
            <div class="input-group">
                <label>مبلغ التحويل السريع <span>(اختياري)</span></label>
                <input id="cQuick" type="number" inputmode="decimal"
                    value="${c && c.quickAmount ? c.quickAmount : ""}" placeholder="مثال: 100">
            </div>

            <label class="save-contact-row">
                <input type="checkbox" id="cFav" ${c && c.favorite ? "checked" : ""}>
                <span>عرضها في التحويلات السريعة</span>
            </label>

            <button class="main-button" id="cSave" type="button">حفظ</button>
        `);

        const photoInput = document.getElementById("photoInput");
        document.getElementById("photoBtn")
            .addEventListener("click", () => photoInput.click());

        let photoRemoved = false;

        photoInput.addEventListener("change", () => {
            const file = photoInput.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                resizeImage(reader.result, 200, dataUrl => {
                    photoData = dataUrl;
                    photoRemoved = false;
                    document.getElementById("photoPrev").innerHTML =
                        `<img src="${photoData}">`;
                });
            };
            reader.readAsDataURL(file);
        });

        const clearBtn = document.getElementById("photoClear");
        if (clearBtn) clearBtn.addEventListener("click", () => {
            photoData = null;
            photoRemoved = true;
            document.getElementById("photoPrev").textContent = "👤";
            clearBtn.remove();
        });

        document.getElementById("cSave").addEventListener("click", async () => {
            const name = document.getElementById("cName").value.trim();
            const phone = document.getElementById("cPhone").value.trim();
            if (!name) { App.toast("أدخل الاسم"); return; }

            const quick = Number(document.getElementById("cQuick").value) || null;
            const group = document.getElementById("cGroup").value.trim();

            const savedId = Store.saveContact({
                id: c ? c.id : undefined,
                name,
                phone,
                network: document.getElementById("cNet").value,
                type: document.getElementById("cType").value,
                group: group || null,
                quickAmount: quick,
                favorite: document.getElementById("cFav").checked,
            });

            if (window.PhotoDB) {
                if (photoData) await PhotoDB.put(savedId, photoData);
                else if (photoRemoved) await PhotoDB.remove(savedId);
            }

            App.closeSheet();
            App.toast("تم الحفظ");
            render();
            Transfer.refreshHome();
        });
    }


    /* -------- تحويل من جهة -------- */

    function transfer(id) {
        const c = Store.getContact(id);
        if (!c) return;
        App.prefillTransfer({
            service: Store.SERVICES[c.network] ? c.network : "jawwal",
            payment: c.type === "merchant" ? "merchant" : "friend",
            receiver: c.phone,
            amount: c.quickAmount || "",
            name: c.name,
            contactId: c.id,
        });
    }


    /* -------- تصغير الصورة قبل الحفظ -------- */

    function resizeImage(dataUrl, max, cb) {
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, max / Math.max(img.width, img.height));
            const w = Math.round(img.width * scale);
            const h = Math.round(img.height * scale);
            const canvas = document.createElement("canvas");
            canvas.width = w; canvas.height = h;
            canvas.getContext("2d").drawImage(img, 0, 0, w, h);
            try { cb(canvas.toDataURL("image/jpeg", 0.8)); }
            catch (e) { cb(dataUrl); }
        };
        img.onerror = () => cb(dataUrl);
        img.src = dataUrl;
    }


    render();
    return { render, editSheet, detailSheet };

})();
