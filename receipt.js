/* ==================================================
   receipt.js — شاشة "تم التحويل بنجاح" (الإيصال)
   تظهر فقط عند تأكيد المستخدم يدويًا إن العملية نجحت.
   كل الأرقام هنا حقيقية من العملية نفسها — بلا أي اختراع.
================================================== */

window.Receipt = (function () {

    const esc = App.esc;

    function fromLabel(op) {
        if (op.cardId) {
            const c = Store.getCard(op.cardId);
            if (c) return c.name + " — " + (op.serviceName || "");
        }
        return op.serviceName || "-";
    }

    function toLabel(op) {
        return op.name || (op.phone ? Store.maskPhone(op.phone) : "-") || "-";
    }

    /* -------- الشاشة الحيّة (Overlay) -------- */

    function show(op) {
        const old = document.getElementById("receiptFX");
        if (old) old.remove();

        const el = document.createElement("div");
        el.id = "receiptFX";
        el.className = "receipt-fx";
        el.innerHTML = `
            <div class="receipt-box">
                <div class="receipt-check">✓</div>
                <h2>تم التحويل بنجاح</h2>
                <p class="receipt-sub">تم تسجيل العملية وخصم المبلغ من رصيدك المحفوظ</p>
                <div class="receipt-card">
                    <div class="receipt-row"><span>رقم العملية</span><strong>#${esc(op.id)}</strong></div>
                    <div class="receipt-row"><span>التاريخ والوقت</span><strong>${esc(op.date || "")}</strong></div>
                    <div class="receipt-row"><span>من</span><strong>${esc(fromLabel(op))}</strong></div>
                    <div class="receipt-row"><span>إلى</span><strong>${esc(toLabel(op))}</strong></div>
                    ${op.amount ? `
                    <div class="receipt-row"><span>المبلغ</span><strong>${Store.money(op.amount)} ₪</strong></div>
                    <div class="receipt-row"><span>الرسوم</span><strong>0.00 ₪</strong></div>
                    <div class="receipt-row receipt-total"><span>الإجمالي</span><strong>${Store.money(op.amount)} ₪</strong></div>` : ""}
                </div>
                <div class="receipt-actions">
                    <button class="secondary-button" id="rcptSave" type="button">⬇ حفظ الإيصال</button>
                    <button class="secondary-button" id="rcptShare" type="button">↗ مشاركة الإيصال</button>
                </div>
                <button class="main-button" id="rcptAgain" type="button">إجراء تحويل آخر</button>
                <button class="link-btn" id="rcptHome" type="button">العودة إلى الرئيسية</button>
            </div>
        `;
        document.body.appendChild(el);
        burstConfetti(el);

        try { if (navigator.vibrate) navigator.vibrate([30, 40, 30]); } catch (e) {}

        function close() {
            el.style.transition = "opacity .25s ease";
            el.style.opacity = "0";
            setTimeout(() => el.remove(), 260);
        }

        document.getElementById("rcptSave").addEventListener("click", () => save(op));
        document.getElementById("rcptShare").addEventListener("click", () => share(op));
        document.getElementById("rcptAgain").addEventListener("click", () => {
            close();
            if (window.Transfer && Transfer.resetForm) Transfer.resetForm();
        });
        document.getElementById("rcptHome").addEventListener("click", close);
    }

    /* -------- كونفيتي ذهبي خفيف (بلا أي مكتبة خارجية) -------- */

    function burstConfetti(container) {
        const colors = ["#e8c874", "#f5da91", "#c9a45c", "#fff3d6"];
        const layer = document.createElement("div");
        layer.className = "receipt-confetti";
        for (let i = 0; i < 26; i++) {
            const p = document.createElement("i");
            p.style.left = Math.random() * 100 + "%";
            p.style.background = colors[i % colors.length];
            p.style.animationDelay = (Math.random() * 0.4) + "s";
            p.style.animationDuration = (1.6 + Math.random() * 1.1) + "s";
            p.style.transform = "rotate(" + Math.round(Math.random() * 360) + "deg)";
            layer.appendChild(p);
        }
        container.appendChild(layer);
        setTimeout(() => layer.remove(), 3200);
    }

    /* -------- رسم الإيصال كصورة (نفس أسلوب report.js) -------- */

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function draw(op) {
        const W = 900, H = 1150;
        const canvas = document.createElement("canvas");
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext("2d");
        ctx.direction = "rtl";
        ctx.textAlign = "right";

        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, "#13141c");
        g.addColorStop(1, "#07080b");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = "#e8c874";
        ctx.fillRect(0, 0, W, 10);

        const R = W - 70;

        // دائرة ✓
        ctx.beginPath();
        ctx.arc(W / 2, 150, 56, 0, Math.PI * 2);
        ctx.fillStyle = "#2f6b4f";
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "800 56px Tahoma, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("✓", W / 2, 170);

        ctx.fillStyle = "#ffffff";
        ctx.font = "900 40px Tahoma, Arial, sans-serif";
        ctx.fillText("تم التحويل بنجاح", W / 2, 250);
        ctx.textAlign = "right";

        // بطاقة التفاصيل
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        roundRect(ctx, 60, 300, W - 120, 500, 22);
        ctx.fill();

        const rows = [
            ["رقم العملية", "#" + op.id],
            ["التاريخ والوقت", op.date || ""],
            ["من", fromLabel(op)],
            ["إلى", toLabel(op)],
        ];
        if (op.amount) {
            rows.push(["المبلغ", Store.money(op.amount) + " ₪"]);
            rows.push(["الرسوم", "0.00 ₪"]);
            rows.push(["الإجمالي", Store.money(op.amount) + " ₪"]);
        }

        let y = 360;
        rows.forEach(([label, value]) => {
            ctx.fillStyle = "#a9abb8";
            ctx.font = "500 24px Tahoma, Arial, sans-serif";
            ctx.fillText(label, R, y);
            ctx.fillStyle = "#f6f4ee";
            ctx.font = "700 26px Tahoma, Arial, sans-serif";
            ctx.fillText(String(value), R, y + 34);
            y += 68;
        });

        ctx.textAlign = "center";
        ctx.fillStyle = "#a9abb8";
        ctx.font = "500 22px Tahoma, Arial, sans-serif";
        ctx.fillText("صدقة جارية عن روح شهداء عائلة فرج الله", W / 2, H - 40);

        return canvas;
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

    async function share(op) {
        const canvas = draw(op);
        const blob = await toBlob(canvas);
        if (!blob) { App.toast("تعذّر إنشاء الصورة"); return; }
        const file = new File([blob], "receipt-" + op.id + ".png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try { await navigator.share({ files: [file], title: "إيصال التحويل" }); return; }
            catch (e) { if (e && e.name === "AbortError") return; }
        }
        await save(op, canvas);
    }

    async function save(op, canvas) {
        canvas = canvas || draw(op);
        const blob = await toBlob(canvas);
        if (!blob) { App.toast("تعذّر إنشاء الصورة"); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "receipt-" + op.id + ".png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        App.toast("حُفظ الإيصال");
    }

    return { show, draw, share, save };
})();
