/* ==================================================
   report.js — بطاقة تقرير شهرية قابلة للمشاركة (صورة PNG)
   يرسمها على canvas ثم يشاركها عبر navigator.share أو يحفظها.
================================================== */

window.Report = (function () {
    "use strict";

    const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
        "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

    function draw() {
        const now = new Date();
        const s = Store.summary("month");
        const series = Store.dailySeries(30);
        const maxDay = Math.max(1, ...series.map(d => d.total));

        const W = 1080, H = 1080;
        const canvas = document.createElement("canvas");
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext("2d");
        ctx.direction = "rtl";
        ctx.textAlign = "right";

        // خلفية
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, "#0b2b34");
        g.addColorStop(1, "#06131c");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = "#3ba7c4";
        ctx.fillRect(0, 0, W, 12);

        const R = W - 90; // الحافة اليمنى للنص

        ctx.fillStyle = "#7fb9c9";
        ctx.font = "700 34px Tahoma, Arial, sans-serif";
        ctx.fillText("الكود الوسيط", R, 110);

        ctx.fillStyle = "#ffffff";
        ctx.font = "800 68px Tahoma, Arial, sans-serif";
        ctx.fillText("تقرير " + MONTHS[now.getMonth()] + " " + now.getFullYear(), R, 200);

        // بطاقتان كبيرتان
        function tile(x, y, w, h, value, label) {
            ctx.fillStyle = "rgba(255,255,255,0.06)";
            roundRect(ctx, x, y, w, h, 22);
            ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.font = "800 62px Tahoma, Arial, sans-serif";
            ctx.fillText(value, x + w - 34, y + 90);
            ctx.fillStyle = "#8fb8c4";
            ctx.font = "500 28px Tahoma, Arial, sans-serif";
            ctx.fillText(label, x + w - 34, y + 140);
        }
        tile(90, 260, 430, 190, Store.money(s.total) + " ₪", "إجمالي التحويلات");
        tile(560, 260, 430, 190, String(s.count), "عدد العمليات");
        tile(90, 480, 430, 190, Store.money(Math.round(s.avg)) + " ₪", "متوسط العملية");
        tile(560, 480, 430, 190, s.successCount + " / " + s.failedCount, "ناجحة / فاشلة");

        // رسم بياني بسيط لآخر 30 يومًا
        const bx = 90, by = 720, bw = W - 180, bh = 180;
        ctx.fillStyle = "#8fb8c4";
        ctx.font = "600 26px Tahoma, Arial, sans-serif";
        ctx.fillText("آخر 30 يومًا", R, by - 16);
        const step = bw / series.length;
        series.forEach((d, i) => {
            const barH = Math.max(3, (d.total / maxDay) * bh);
            ctx.fillStyle = d.total ? "#3ba7c4" : "rgba(255,255,255,0.08)";
            ctx.fillRect(bx + i * step + 2, by + bh - barH, step - 4, barH);
        });

        if (s.topName) {
            ctx.fillStyle = "#ffffff";
            ctx.font = "700 32px Tahoma, Arial, sans-serif";
            ctx.fillText("أكثر جهة: " + s.topName + " (" + Store.money(s.topAmount) + " ₪)", R, 960);
        }

        ctx.fillStyle = "#6f95a0";
        ctx.font = "500 24px Tahoma, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("صدقة جارية عن روح شهداء عائلة فرج الله", W / 2, 1030);

        return canvas;
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function toBlob(canvas) {
        return new Promise(resolve => {
            if (canvas.toBlob) canvas.toBlob(resolve, "image/png");
            else resolve(dataURLtoBlob(canvas.toDataURL("image/png")));
        });
    }
    function dataURLtoBlob(url) {
        const [head, b64] = url.split(",");
        const mime = /:(.*?);/.exec(head)[1];
        const bin = atob(b64), arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: mime });
    }

    async function share() {
        if (!Store.summary("month").count) { App.toast("لا توجد عمليات هذا الشهر"); return; }
        const canvas = draw();
        const blob = await toBlob(canvas);
        if (!blob) { App.toast("تعذّر إنشاء الصورة"); return; }

        const file = new File([blob], "alkod-report.png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try { await navigator.share({ files: [file], title: "تقريري الشهري" }); return; }
            catch (e) { if (e && e.name === "AbortError") return; }
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "alkod-report-" + new Date().toISOString().slice(0, 7) + ".png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        App.toast("حُفظت صورة التقرير");
    }

    return { share, draw };
})();
