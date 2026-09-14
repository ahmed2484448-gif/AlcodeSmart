/* ==================================================
   stats.js — صفحة الإحصائيات (خانة مستقلة كاملة الشاشة)
================================================== */

window.Stats = (function () {

    const esc = App.esc;
    let range = "month";

    function open() {
        window.switchPage("statsPage");
    }

    /* نطاق العرض الحالي + النطاق المقابل له بالمدة السابقة (لحساب نسبة التغيّر) */
    function computeRanges(r) {
        const now = new Date();
        if (r === "q3") {
            const to = Date.now(), from = to - 90 * 86400000;
            return { cur: { from, to }, prev: { from: from - 90 * 86400000, to: from } };
        }
        if (r === "year") {
            const to = Date.now(), from = to - 365 * 86400000;
            return { cur: { from, to }, prev: { from: from - 365 * 86400000, to: from } };
        }
        const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
        const prevFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
        return { cur: { from, to }, prev: { from: prevFrom, to: from } };
    }

    function opsInRange(r) {
        return Store.getOps().filter(o =>
            o.status === "success" && o.ts >= r.from && o.ts <= r.to);
    }

    function pctChange(cur, prev) {
        if (!prev) return cur > 0 ? 100 : 0;
        return Math.round(((cur - prev) / prev) * 100);
    }

    /* آخر العمليات — أول 5 من السجل الفعلي، بلا فلترة بالنطاق (لمحة سريعة كما كانت باللوحة الرئيسية سابقًا) */
    function recentOpsHtml() {
        const ops = Store.getOps().slice(0, 5);
        if (!ops.length) return '<p class="sheet-sub" style="margin:6px 2px;">لا توجد عمليات بعد</p>';
        return ops.map((o, i) => {
            const icon = o.status === "success" ? "✅" : o.status === "failed" ? "❌" : "⏳";
            const title = o.name || o.serviceName || "عملية";
            const sub = [o.serviceName, o.phone ? Store.maskPhone(o.phone) : null, Store.timeOf(o.ts)]
                .filter(Boolean).join("  •  ");
            return `
                <div class="op-item" data-id="${o.id}" style="--i:${i}">
                    <span class="op-status-icon">${icon}</span>
                    <div class="op-main">
                        <div class="o-name">${esc(title)}</div>
                        <div class="o-sub">${esc(sub)}</div>
                    </div>
                    <div class="op-amount privacy-sensitive ${o.status === "failed" ? "failed" : ""}">
                        ${o.amount ? Store.money(o.amount) : "—"}
                    </div>
                </div>`;
        }).join("");
    }

    function lineChartSvg(series) {
        const W = 300, H = 90, PAD = 6;
        const max = Math.max(1, ...series.map(d => d.total));
        const stepX = series.length > 1 ? (W - PAD * 2) / (series.length - 1) : 0;
        const pts = series.map((d, i) => [
            PAD + i * stepX,
            H - PAD - (d.total / max) * (H - PAD * 2),
        ]);
        const line = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
        const area = line + ` L${pts[pts.length - 1][0].toFixed(1)},${H - PAD} L${pts[0][0].toFixed(1)},${H - PAD} Z`;
        return `
            <svg viewBox="0 0 ${W} ${H}" class="stats-line-chart" preserveAspectRatio="none">
                <path d="${area}" class="stats-line-area"></path>
                <path d="${line}" class="stats-line-path"></path>
            </svg>`;
    }

    function render() {
        const { cur, prev } = computeRanges(range);
        const curOps = opsInRange(cur);
        const prevTotal = opsInRange(prev).reduce((s, o) => s + (Number(o.amount) || 0), 0);
        const total = curOps.reduce((s, o) => s + (Number(o.amount) || 0), 0);
        const avg = curOps.length ? total / curOps.length : 0;
        const allInRange = Store.getOps().filter(o => o.ts >= cur.from && o.ts <= cur.to);
        const failedCount = allInRange.filter(o => o.status === "failed").length;
        const pct = pctChange(total, prevTotal);

        const series = Store.dailySeries(30);

        // أكثر الجهات تحويلًا (ضمن النطاق المختار)
        const byName = {};
        curOps.forEach(o => {
            const k = o.name || o.phone || o.serviceName || "غير محدد";
            byName[k] = (byName[k] || 0) + (Number(o.amount) || 0);
        });
        const ranked = Object.keys(byName)
            .map(k => ({ name: k, total: byName[k] }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);

        // التوزيع حسب الخدمة — بلون كل شبكة (نفس ألوان بطاقاتها)
        const byService = {};
        curOps.forEach(o => {
            const id = o.service || "other";
            if (!byService[id]) byService[id] = { id, name: o.serviceName || id, total: 0 };
            byService[id].total += Number(o.amount) || 0;
        });
        const svcList = Object.values(byService).sort((a, b) => b.total - a.total);
        const svcTotal = svcList.reduce((s, x) => s + x.total, 0) || 1;

        document.getElementById("statsBody").innerHTML = `
            <div class="filter-row" style="margin-bottom:14px;">
                <button class="filter-chip ${range === "month" ? "active" : ""}"
                        data-r="month" type="button">هذا الشهر</button>
                <button class="filter-chip ${range === "q3" ? "active" : ""}"
                        data-r="q3" type="button">آخر 3 أشهر</button>
                <button class="filter-chip ${range === "year" ? "active" : ""}"
                        data-r="year" type="button">سنة كاملة</button>
            </div>

            <div class="stats-total-card">
                <span class="stats-total-lbl">إجمالي التحويلات</span>
                <div class="stats-total-row">
                    <span class="stats-total-val">${Store.money(total)} <small>₪</small></span>
                    <span class="stats-pct ${pct < 0 ? "down" : "up"}">${pct < 0 ? "↓" : "↑"} ${Math.abs(pct)}%</span>
                </div>
                ${lineChartSvg(series)}
            </div>

            <div class="stat-grid">
                <div class="stat-box">
                    <div class="st-val">${curOps.length}</div>
                    <div class="st-lbl">عملية</div>
                </div>
                <div class="stat-box">
                    <div class="st-val">${Store.money(Math.round(avg))}</div>
                    <div class="st-lbl">متوسط العملية (₪)</div>
                </div>
                <div class="stat-box">
                    <div class="st-val">${failedCount}</div>
                    <div class="st-lbl">عمليات فاشلة</div>
                </div>
            </div>

            <div class="dash-recent">
                <div class="dash-recent-head">
                    <span>آخر العمليات</span>
                    <span class="dash-cards-viewall" id="statsRecentViewAll">عرض الكل ›</span>
                </div>
                ${recentOpsHtml()}
            </div>

            <div class="stats-section-title">أكثر الفئات إنفاقًا (حسب الخدمة)</div>
            ${svcList.length ? svcList.map(r => `
                <div class="svc-row">
                    <span class="svc-dot" data-service="${esc(r.id)}"></span>
                    <span class="svc-name">${esc(r.name)}</span>
                    <span class="svc-pct">${Math.round(r.total / svcTotal * 100)}%</span>
                    <span class="svc-val">${Store.money(r.total)} ₪</span>
                    <div class="svc-bar-track"><div class="svc-bar-fill" data-service="${esc(r.id)}" style="width:${Math.round(r.total / svcTotal * 100)}%;"></div></div>
                </div>`).join("") : '<p class="sheet-sub">لا توجد بيانات بعد</p>'}

            <div class="stats-section-title">أكثر الجهات تحويلًا</div>
            ${ranked.length ? ranked.map((r, i) => `
                <div class="rank-row">
                    <span class="rank-num">${i + 1}</span>
                    <span class="rank-name">${esc(r.name)}</span>
                    <span class="rank-val">${Store.money(r.total)} ₪</span>
                </div>`).join("") : '<p class="sheet-sub">لا توجد بيانات بعد</p>'}

            <button class="main-button" id="shareReport" type="button" style="margin-top:18px;">
                ↗ شارك تقرير هذا الشهر كصورة
            </button>
            <button class="secondary-button full-button" id="printStatement" type="button" style="margin-top:8px;">
                🖨 كشف حساب للطباعة / PDF
            </button>
        `;

        document.querySelectorAll("#statsBody .filter-chip[data-r]").forEach(b => {
            b.addEventListener("click", () => {
                range = b.dataset.r;
                render();
            });
        });

        const sr = document.getElementById("shareReport");
        if (sr) sr.addEventListener("click", () => window.Report && Report.share());
        const ps = document.getElementById("printStatement");
        if (ps) ps.addEventListener("click", () => openStatement());

        const rva = document.getElementById("statsRecentViewAll");
        if (rva) rva.addEventListener("click", () => window.switchPage("historyPage"));
        document.querySelectorAll("#statsBody .dash-recent .op-item").forEach(item => {
            item.addEventListener("click", () => {
                if (window.History) History.openOp(item.dataset.id);
            });
        });
    }


    /* -------- كشف حساب للطباعة -------- */

    const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
        "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

    function openStatement(monthDate) {
        const d = monthDate || new Date();
        const y = d.getFullYear(), m = d.getMonth();
        const from = new Date(y, m, 1).getTime();
        const to = new Date(y, m + 1, 1).getTime();

        const ops = Store.getOps()
            .filter(o => o.ts >= from && o.ts < to)
            .sort((a, b) => a.ts - b.ts);
        const success = ops.filter(o => o.status === "success");
        const total = success.reduce((s, o) => s + (Number(o.amount) || 0), 0);

        const rows = ops.map((o, i) => `
            <tr>
                <td>${i + 1}</td>
                <td>${new Date(o.ts).toLocaleDateString("ar-EG", { day: "numeric", month: "numeric" })}</td>
                <td>${esc(o.name || o.serviceName || "—")}</td>
                <td>${esc(o.phone ? Store.maskPhone(o.phone) : "—")}</td>
                <td>${esc(o.serviceName || "—")}</td>
                <td>${o.status === "success" ? "ناجحة" : o.status === "failed" ? "فاشلة" : "قيد التنفيذ"}</td>
                <td>${o.amount ? Store.money(o.amount) : "—"}</td>
            </tr>`).join("");

        const wrap = document.createElement("div");
        wrap.id = "printSheet";
        wrap.innerHTML = `
            <div class="print-toolbar no-print">
                <button id="pDo" type="button">🖨 طباعة / حفظ PDF</button>
                <button id="pClose" type="button">إغلاق</button>
            </div>
            <div class="print-doc">
                <h1>كشف حساب — ${MONTHS[m]} ${y}</h1>
                <p class="print-sub">تطبيق الكود الوسيط • بيانات محفوظة على الجهاز فقط</p>
                <table>
                    <thead><tr>
                        <th>#</th><th>التاريخ</th><th>الجهة</th><th>الرقم</th><th>الخدمة</th><th>الحالة</th><th>المبلغ (₪)</th>
                    </tr></thead>
                    <tbody>${rows || '<tr><td colspan="7">لا عمليات في هذا الشهر</td></tr>'}</tbody>
                </table>
                <div class="print-total">
                    إجمالي التحويلات الناجحة: <strong>${Store.money(total)} ₪</strong>
                    &nbsp;•&nbsp; عدد العمليات: <strong>${ops.length}</strong>
                </div>
                <p class="print-foot">صدقة جارية عن روح شهداء عائلة فرج الله</p>
            </div>
        `;
        document.body.appendChild(wrap);
        document.getElementById("pDo").addEventListener("click", () => window.print());
        document.getElementById("pClose").addEventListener("click", () => wrap.remove());
    }

    return { open, render };

})();
