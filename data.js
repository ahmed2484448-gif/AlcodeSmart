/* ==================================================
   تطبيق الكود الوسيط
   data.js — طبقة البيانات المشتركة
   (الجهات + العمليات + الإعدادات + ورد اليوم)
   كل شيء محفوظ محليًا على الجهاز — بدون إنترنت.
================================================== */

const Store = (function () {

    /* -------- المفاتيح -------- */

    const K = {
        contacts: "kw_contacts",
        ops: "kw_operations",
        settings: "kw_settings",
        debts: "kw_debts",
        codeDirectory: "kw_code_directory",
        cards: "kw_cards",
        legacyHistory: "alkod_alwasit_history",
        theme: "alkod_alwasit_theme",
    };


    /* -------- أدوات التخزين -------- */

    function read(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function write(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            return false;
        }
    }

    function uid() {
        return (
            Date.now().toString(36) +
            Math.random().toString(36).slice(2, 7)
        );
    }


    /* ==================================================
       الخدمات (الشبكات / البنوك)
    ================================================== */

    const SERVICES = {
        jawwal: { name: "جوال بي", logo: "images/1.png", needsPayment: true, needsData: true },
        palpay: { name: "بال بي", logo: "images/2.png", needsPayment: true, needsData: true },
        bank: { name: "بنك فلسطين", logo: "images/3.png", needsPayment: false, needsData: false },
    };

    const PAYMENTS = {
        friend: "الدفع لصديق",
        merchant: "الدفع لتاجر",
    };

    const CONTACT_TYPES = {
        friend: "صديق",
        family: "عائلة",
        merchant: "تاجر",
        work: "عمل",
        other: "أخرى",
    };


    /* ==================================================
       بناء كود USSD من المعطيات
    ================================================== */

    function cleanNum(v) {
        return String(v || "").trim().replace(/\s+/g, "");
    }

    function cleanAmt(v) {
        return String(v || "").trim().replace(/,/g, ".").replace(/[^\d.]/g, "");
    }

    /*
     * يبني الكود. جوال بي يحتاج رقمًا سريًا (لا يُخزَّن أبدًا)،
     * فإن لم يُمرَّر يعيد الدالة "" ويطلبه التطبيق وقت التنفيذ.
     */
    function buildCode({ service, payment, receiver, amount, pin }) {

        const r = cleanNum(receiver);
        const a = cleanAmt(amount);

        if (service === "bank") {
            return "*267#";
        }

        if (service === "jawwal") {
            if (!pin) return "";
            const p = payment === "merchant" ? "2" : "1";
            return "*110*" + p + "*" + cleanNum(pin) + "*" + r + "*" + a + "#";
        }

        if (service === "palpay") {
            if (payment === "merchant") {
                return "*370*2*" + r + "*" + a + "#";
            }
            return "*370*1*1*" + r + "*" + a + "#";
        }

        return "";
    }

    /* لروابط tel: — الرمز # يجب ترميزه وإلا اقتُطع الكود */
    function telHref(code) {
        return "tel:" + String(code || "").replace(/#/g, "%23");
    }

    /*
     * يُقنّع الرقم السري لجوال بي قبل أي حفظ أو عرض أو تصدير.
     * صيغة جوال بي: *110*<1|2>*<PIN>*<رقم>*<مبلغ>#  — الحقل الثالث هو السر.
     * بال بي وبنك فلسطين بلا سر، فتُعاد كما هي.
     * الكود الحقيقي يبقى في الذاكرة فقط للحظة الاتصال، ولا يُكتب أبدًا.
     */
    function redactCode(code) {
        return String(code || "").replace(
            /^(\*110\*[12]\*)(\d+)(\*)/,
            (m, head, pin, tail) => head + "•".repeat(Math.max(4, Math.min(pin.length, 6))) + tail
        );
    }


    /* ==================================================
       الجهات
    ================================================== */

    function getContacts() {
        return read(K.contacts, []);
    }

    function getContact(id) {
        return getContacts().find(c => c.id === id) || null;
    }

    function saveContact(data) {
        const list = getContacts();
        // الصور تُخزَّن في IndexedDB لا هنا
        delete data.photo;

        if (data.id) {
            const i = list.findIndex(c => c.id === data.id);
            if (i !== -1) {
                list[i] = { ...list[i], ...data };
            }
        } else {
            data.id = uid();
            data.createdAt = Date.now();
            list.push(data);
        }

        write(K.contacts, list);
        return data.id;
    }

    /* مجموعات الجهات الموجودة فعليًا */
    function contactGroups() {
        const set = new Set();
        getContacts().forEach(c => { if (c.group) set.add(c.group); });
        return [...set];
    }

    function deleteContact(id) {
        write(K.contacts, getContacts().filter(c => c.id !== id));
        if (window.PhotoDB) PhotoDB.remove(id);
        // نفصل العمليات عن الجهة المحذوفة دون حذفها
        const ops = getOps().map(o =>
            o.contactId === id ? { ...o, contactId: null } : o
        );
        write(K.ops, ops);
    }

    /* حذف قابل للتراجع — يعيد لقطة تُستعاد بـ restoreContact */
    function deleteContactUndoable(id) {
        const contact = getContact(id);
        if (!contact) return null;
        const photo = (window.PhotoDB && PhotoDB.get(id)) || null;
        const opIds = getOps().filter(o => o.contactId === id).map(o => o.id);
        deleteContact(id);
        return { contact, photo, opIds };
    }
    function restoreContact(snap) {
        if (!snap || !snap.contact) return;
        const list = getContacts();
        if (!list.some(c => c.id === snap.contact.id)) { list.push(snap.contact); write(K.contacts, list); }
        if (snap.photo && window.PhotoDB) PhotoDB.put(snap.contact.id, snap.photo);
        if (snap.opIds && snap.opIds.length) {
            write(K.ops, getOps().map(o =>
                snap.opIds.indexOf(o.id) !== -1 ? { ...o, contactId: snap.contact.id } : o));
        }
    }

    function toggleFavorite(id) {
        const c = getContact(id);
        if (c) saveContact({ id, favorite: !c.favorite });
    }

    /* الجهات المفضّلة للتحويل السريع */
    function quickContacts() {
        return getContacts()
            .filter(c => c.favorite)
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }

    /* إحصاءات جهة: آخر تحويل + الإجمالي + العدد */
    function contactStats(id) {
        const ops = getOps().filter(
            o => o.contactId === id && o.status === "success"
        );
        const total = ops.reduce((s, o) => s + (Number(o.amount) || 0), 0);
        const last = ops.reduce((m, o) => Math.max(m, o.ts || 0), 0);
        return { total, count: ops.length, lastTs: last || null };
    }


    /* ==================================================
       بطاقاتي (تمثيل بصري لمحافظ المستخدم + رصيد يديره بنفسه)
       — بلا أي اتصال حقيقي ببنك/شركة اتصالات، مجرّد تتبّع محلي.
    ================================================== */

    function getCards() {
        return read(K.cards, []);
    }

    function getCard(id) {
        return getCards().find(c => c.id === id) || null;
    }

    function saveCard(data) {
        const list = getCards();

        if (data.id) {
            const i = list.findIndex(c => c.id === data.id);
            if (i !== -1) list[i] = { ...list[i], ...data };
        } else {
            data.id = uid();
            data.createdAt = Date.now();
            data.balance = Number(data.balance) || 0;
            list.push(data);
        }

        write(K.cards, list);
        return data.id;
    }

    function deleteCard(id) {
        write(K.cards, getCards().filter(c => c.id !== id));
        // نفصل العمليات عن البطاقة المحذوفة دون حذف سجلها
        const ops = getOps().map(o =>
            o.cardId === id ? { ...o, cardId: null } : o
        );
        write(K.ops, ops);
    }

    /* شحن/خصم رصيد بطاقة — delta موجب عند الشحن اليدوي، سالب عند خصم تحويل */
    function adjustCardBalance(id, delta) {
        const list = getCards();
        const i = list.findIndex(c => c.id === id);
        if (i === -1) return null;
        list[i] = { ...list[i], balance: (Number(list[i].balance) || 0) + Number(delta || 0) };
        write(K.cards, list);
        return list[i];
    }

    /* مجموع أرصدة كل البطاقات — يُستخدم كـ"الرصيد الإجمالي" بلوحة التحكم */
    function getTotalBalance() {
        return getCards().reduce((s, c) => s + (Number(c.balance) || 0), 0);
    }

    /* أول بطاقة مطابقة لشبكة معيّنة — لاقتراح بطاقة المصدر تلقائيًا بنموذج التحويل */
    function cardsForNetwork(network) {
        return getCards().filter(c => c.network === network);
    }


    /* ==================================================
       العمليات (السجل)
    ================================================== */

    function getOps() {
        const ops = read(K.ops, null);
        if (ops) return ops;

        // ترحيل السجل القديم مرة واحدة
        const legacy = read(K.legacyHistory, []);
        const migrated = legacy.map(it => ({
            id: String(it.id || uid()),
            contactId: null,
            name: it.name || it.serviceName || "",
            phone: it.receiver || "",
            service: it.service || "",
            serviceName: it.serviceName || "",
            payment: it.payment || "",
            paymentName: it.paymentName || "",
            amount: Number(it.amount) || 0,
            notes: it.notes || "",
            code: it.code || "",
            status: "success",
            date: it.date || "",
            ts: Number(it.id) || Date.now(),
        }));
        write(K.ops, migrated);
        return migrated;
    }

    function addOp(op) {
        const list = getOps();
        const full = {
            id: uid(),
            contactId: op.contactId || null,
            cardId: op.cardId || null,
            name: op.name || "",
            phone: op.phone || "",
            service: op.service || "",
            serviceName: op.serviceName || (SERVICES[op.service] || {}).name || "",
            payment: op.payment || "",
            paymentName: op.paymentName || PAYMENTS[op.payment] || "",
            amount: Number(op.amount) || 0,
            notes: op.notes || "",
            code: redactCode(op.code || ""),   // لا يُخزَّن رقم سري أبدًا
            status: op.status || "success",
            date: new Date().toLocaleString("ar-EG"),
            ts: Date.now(),
        };
        list.unshift(full);
        write(K.ops, list.slice(0, 500));

        // حدّث اسم الجهة تلقائيًا لو الرقم معروف
        _linkOpToContact(full);

        return full;
    }

    function updateOpStatus(id, status) {
        const list = getOps().map(o =>
            o.id === id ? { ...o, status } : o
        );
        write(K.ops, list);
    }

    function deleteOp(id) {
        write(K.ops, getOps().filter(o => o.id !== id));
    }
    function deleteOpUndoable(id) {
        const op = getOps().find(o => o.id === id) || null;
        deleteOp(id);
        return op;
    }
    function restoreOp(op) {
        if (!op) return;
        const list = getOps();
        if (!list.some(o => o.id === op.id)) { list.unshift(op); write(K.ops, list.slice(0, 500)); }
    }

    /* بحث موحّد: جهات + عمليات */
    function search(query) {
        const q = String(query || "").trim();
        if (!q) return { contacts: [], operations: [] };
        const nq = cleanNum(q);
        const contacts = getContacts().filter(c =>
            (c.name || "").includes(q) || (nq && cleanNum(c.phone).includes(nq))
        ).slice(0, 8);
        const operations = getOps().filter(o =>
            (o.name || "").includes(q) ||
            (nq && cleanNum(o.phone).includes(nq)) ||
            (o.serviceName || "").includes(q) ||
            (o.notes || "").includes(q)
        ).slice(0, 12);
        return { contacts, operations };
    }

    function clearOps() {
        write(K.ops, []);
    }

    /* لو الرقم يطابق جهة محفوظة، اربط العملية بها */
    function _linkOpToContact(op) {
        if (op.contactId || !op.phone) return;
        const match = getContacts().find(
            c => cleanNum(c.phone) === cleanNum(op.phone)
        );
        if (match) {
            const list = getOps().map(o =>
                o.id === op.id
                    ? { ...o, contactId: match.id, name: o.name || match.name }
                    : o
            );
            write(K.ops, list);
        }
    }


    /* ==================================================
       دفتر الديون والسلف
       debt: { id, type: "owed_to_me" | "i_owe", person, contactId, amount,
               note, dueDate, settled, settledAt, createdAt }
    ================================================== */

    function getDebts() { return read(K.debts, []); }
    function getDebt(id) { return getDebts().find(d => d.id === id) || null; }

    function saveDebt(data) {
        const list = getDebts();
        if (data.id) {
            const i = list.findIndex(d => d.id === data.id);
            if (i !== -1) list[i] = { ...list[i], ...data };
        } else {
            data.id = uid();
            data.createdAt = Date.now();
            data.settled = !!data.settled;
            list.push(data);
        }
        write(K.debts, list);
        return data.id;
    }

    function settleDebt(id, settled) {
        const d = getDebt(id);
        if (d) saveDebt({ id, settled: !!settled, settledAt: settled ? Date.now() : null });
    }

    function deleteDebtUndoable(id) {
        const d = getDebt(id);
        if (!d) return null;
        write(K.debts, getDebts().filter(x => x.id !== id));
        return d;
    }
    function restoreDebt(d) {
        if (!d) return;
        const list = getDebts();
        if (!list.some(x => x.id === d.id)) { list.push(d); write(K.debts, list); }
    }

    function debtSummary() {
        const open = getDebts().filter(d => !d.settled);
        const sum = t => open.filter(d => d.type === t).reduce((s, d) => s + (Number(d.amount) || 0), 0);
        const owedToMe = sum("owed_to_me");
        const iOwe = sum("i_owe");
        return { owedToMe, iOwe, net: owedToMe - iOwe, count: open.length };
    }


    /* ==================================================
       دليل أكواد USSD السريعة (قابل للإضافة من المستخدم)
       entry: { id, name, code, createdAt }
    ================================================== */

    const DEFAULT_CODE_DIRECTORY = [
        { name: "جوال بي (تحويل أموال)", code: "*110#" },
        { name: "بال بي (تحويل أموال)", code: "*370#" },
        { name: "بنك فلسطين (BOP)", code: "*267#" },
    ];

    function getCodeDirectory() {
        const list = read(K.codeDirectory, null);
        if (list) return list;
        const seeded = DEFAULT_CODE_DIRECTORY.map(e => ({ ...e, id: uid(), createdAt: Date.now(), builtin: true }));
        write(K.codeDirectory, seeded);
        return seeded;
    }
    function getCodeEntry(id) { return getCodeDirectory().find(e => e.id === id) || null; }

    function saveCodeEntry(data) {
        const list = getCodeDirectory();
        if (data.id) {
            const i = list.findIndex(e => e.id === data.id);
            if (i !== -1) list[i] = { ...list[i], ...data };
        } else {
            data.id = uid();
            data.createdAt = Date.now();
            list.push(data);
        }
        write(K.codeDirectory, list);
        return data.id;
    }

    function deleteCodeEntryUndoable(id) {
        const e = getCodeEntry(id);
        if (!e) return null;
        write(K.codeDirectory, getCodeDirectory().filter(x => x.id !== id));
        return e;
    }
    function restoreCodeEntry(e) {
        if (!e) return;
        const list = getCodeDirectory();
        if (!list.some(x => x.id === e.id)) { list.push(e); write(K.codeDirectory, list); }
    }


    /* ==================================================
       الإحصائيات المالية
    ================================================== */

    function monthKey(d) {
        return d.getFullYear() + "-" + (d.getMonth() + 1);
    }

    function summary(range) {
        // range: 'month' | 'all' | {from, to}
        const now = new Date();
        let ops = getOps();

        if (range === "month" || !range) {
            const mk = monthKey(now);
            ops = ops.filter(o => o.ts && monthKey(new Date(o.ts)) === mk);
        } else if (range && range.from) {
            ops = ops.filter(
                o => o.ts >= range.from && o.ts <= (range.to || Date.now())
            );
        }

        const success = ops.filter(o => o.status === "success");
        const total = success.reduce((s, o) => s + (Number(o.amount) || 0), 0);

        // أكثر جهة تحويلًا
        const byName = {};
        success.forEach(o => {
            const key = o.name || o.phone || o.serviceName || "غير محدد";
            byName[key] = (byName[key] || 0) + (Number(o.amount) || 0);
        });
        let topName = null, topAmount = 0;
        Object.keys(byName).forEach(k => {
            if (byName[k] > topAmount) {
                topAmount = byName[k];
                topName = k;
            }
        });

        // توزيع حسب الخدمة
        const byService = {};
        success.forEach(o => {
            const k = o.serviceName || "غير محدد";
            byService[k] = (byService[k] || 0) + (Number(o.amount) || 0);
        });

        return {
            count: ops.length,
            successCount: success.length,
            failedCount: ops.filter(o => o.status === "failed").length,
            total,
            topName,
            topAmount,
            byService,
            avg: success.length ? total / success.length : 0,
        };
    }

    /* سلسلة يومية لآخر N يوم (للرسم) */
    function dailySeries(days) {
        days = days || 14;
        const out = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const ops = getOps().filter(o => o.status === "success");

        for (let i = days - 1; i >= 0; i--) {
            const day = new Date(today);
            day.setDate(day.getDate() - i);
            const start = day.getTime();
            const end = start + 86400000;
            const total = ops
                .filter(o => o.ts >= start && o.ts < end)
                .reduce((s, o) => s + (Number(o.amount) || 0), 0);
            out.push({ day: day, total: total });
        }
        return out;
    }


    /* ==================================================
       الإعدادات
    ================================================== */

    const DEFAULT_SETTINGS = {
        pinEnabled: false,
        pin: "",          // (قديم) — يُرحَّل إلى pinHash
        pinHash: "",
        biometric: false,
        webauthnCred: "",  // معرّف اعتماد WebAuthn للفتح الحيوي على الويب (لا يُصدَّر)
        pinHint: "",       // تلميح رمز القفل (اختياري، لا يُصدَّر في النسخة العادية)
        lockAfter: 90,     // ثوانٍ في الخلفية قبل إعادة القفل (-1 = أبدًا)
        maskPhones: false,
        myPhone: "",       // رقم المستخدم — لرابط "استلم تحويلًا"
        geo: null,         // { lat, lng, city } — لمواقيت الصلاة
        prayerMethod: "mwl",
        asrMethod: "standard",
        adhanEnabled: false,
        largeText: false,  // وضع كبار السن
        textZoom: 100,      // نسبة تكبير النص الإضافية داخل وضع كبار السن (100–170٪)
        voiceConfirm: true, // قراءة العملية بصوت عالٍ قبل التنفيذ
        ai: { provider: "gemini", key: "", model: "", endpoint: "" }, // المساعد الذكي (يحتاج إنترنت ومفتاح)
        soundEnabled: true, // أصوات واجهة قصيرة عند التفاعل
        themeGlassOpacity: null,  // تخصيص شفافية الزجاج (نسبة٪) — null = افتراضي الثيم النشط
        themeGlowAlpha: null,     // تخصيص قوة التوهّج (نسبة٪) — null = افتراضي الثيم النشط
        autoThemeMode: "off",     // "off" | "time" (نهار/ليل) | "battery" (توفير عند انخفاض الشحن)
        autoThemeDay: "mint",     // الثيم المستخدم نهارًا بالوضع التلقائي حسب الوقت
        autoThemeNight: "glass",  // الثيم المستخدم ليلًا بالوضع التلقائي حسب الوقت
        hapticsEnabled: true,     // اهتزاز مختلف حسب نوع الحدث (نجاح/فشل/نقر…)
        rememberDevice: false,    // "تذكرني" — يوقف القفل التلقائي بعد الخلفية (لا يلغي طلب الرمز عند إعادة فتح التطبيق)
        enhancedWallpaper: false, // خلفية حيّة معزّزة (كتل أكبر وأكثر حركة)
        themeMixWith: "",         // معرّف الثيم الثاني بمازج الثيمات (فارغ = بلا مزج)
        themeMixAmount: 50,       // نسبة المزج٪ نحو الثيم الثاني
    };

    function getSettings() {
        return { ...DEFAULT_SETTINGS, ...read(K.settings, {}) };
    }

    function saveSettings(patch) {
        write(K.settings, { ...getSettings(), ...patch });
    }


    /* ---- رمز PIN ----
       يُخزَّن مجزّأً فقط. الصيغة الجديدة:  pbkdf2$<تكرار>$<ملح b64>$<تجزئة b64>
       (PBKDF2-SHA256، ملح عشوائي لكل جهاز — يقاوم كسر الأربع خانات من ملف نسخة).
       الصيغة القديمة (SHA-256 عارٍ، 64 hex) تُقبل مرة واحدة ثم تُرقّى تلقائيًا. */

    const PIN_ITER = 150000;

    function _b64(bytes) {
        let s = "";
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        return btoa(s);
    }
    function _unb64(str) {
        const bin = atob(str), out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    function _eqConst(a, b) {
        if (a.length !== b.length) return false;
        let diff = 0;
        for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
        return diff === 0;
    }
    function _webcrypto() {
        try { return (crypto && crypto.subtle) ? crypto : null; } catch (e) { return null; }
    }

    // تجزئة SHA-256 العارية (للتحقق من الصيغة القديمة فقط)
    async function _legacySha(str) {
        const wc = _webcrypto();
        if (wc) {
            const buf = await wc.subtle.digest("SHA-256", new TextEncoder().encode("kw::" + str));
            return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
        }
        let h = 5381;
        for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i);
        return "x" + (h >>> 0).toString(16);
    }

    async function _pbkdf2(pin, saltBytes, iterations) {
        const wc = _webcrypto();
        if (!wc) return "sha1:" + (await _legacySha(pin + ":" + _b64(saltBytes)));
        const keyMaterial = await wc.subtle.importKey(
            "raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]
        );
        const bits = await wc.subtle.deriveBits(
            { name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" }, keyMaterial, 256
        );
        return _b64(new Uint8Array(bits));
    }

    function _randomSalt() {
        const wc = _webcrypto();
        const salt = new Uint8Array(16);
        if (wc && wc.getRandomValues) wc.getRandomValues(salt);
        else for (let i = 0; i < 16; i++) salt[i] = Math.floor(Math.random() * 256);
        return salt;
    }

    async function setPin(pin) {
        const salt = _randomSalt();
        const hash = await _pbkdf2(pin, salt, PIN_ITER);
        saveSettings({
            pinEnabled: true,
            pinHash: "pbkdf2$" + PIN_ITER + "$" + _b64(salt) + "$" + hash,
            pin: "",
        });
    }

    async function verifyPin(pin) {
        const s = getSettings();
        const h = s.pinHash || "";

        if (h.indexOf("pbkdf2$") === 0) {
            const parts = h.split("$");
            const iterations = Number(parts[1]) || PIN_ITER;
            const got = await _pbkdf2(pin, _unb64(parts[2]), iterations);
            return _eqConst(got, parts[3] || "");
        }

        if (h) { // صيغة SHA-256 قديمة — تحقّق ثم رقِّ
            if (_eqConst(await _legacySha(pin), h)) { await setPin(pin); return true; }
            return false;
        }

        if (s.pin) { // أقدم: نص صريح
            if (pin === s.pin) { await setPin(pin); return true; }
            return false;
        }

        return false;
    }

    function clearPin() {
        saveSettings({ pinEnabled: false, pinHash: "", pin: "" });
    }


    /* ---- التحقق من صيغة رقم الجوال الفلسطيني ---- */

    function validatePhone(phone, service) {
        if (service === "bank") return { ok: true };
        const p = cleanNum(phone);
        if (!p) return { ok: false, msg: "أدخل رقم المستلم" };
        // جوال / أوريدو فلسطين: 059… أو 056… (عشر خانات)
        if (!/^0(5[69])\d{7}$/.test(p)) {
            return { ok: true, warn: "الرقم لا يبدو رقم جوال فلسطيني (يبدأ بـ 059 أو 056)" };
        }
        return { ok: true };
    }


    /* ---- كشف عملية مكرّرة قريبة ---- */

    function recentDuplicate(phone, amount, withinMs) {
        withinMs = withinMs || 5 * 60 * 1000;
        const p = cleanNum(phone);
        const a = Number(amount) || 0;
        const now = Date.now();
        return getOps().find(o =>
            o.status !== "failed" &&
            cleanNum(o.phone) === p && p &&
            Math.abs((Number(o.amount) || 0) - a) < 0.001 &&
            (now - (o.ts || 0)) < withinMs
        ) || null;
    }


    /* ==================================================
       تنسيق
    ================================================== */

    function money(n) {
        const v = Number(n) || 0;
        return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
    }

    function maskPhone(phone) {
        const p = cleanNum(phone);
        if (!getSettings().maskPhones || p.length < 6) return p;
        return p.slice(0, 3) + "•••••" + p.slice(-2);
    }

    function relativeDay(ts) {
        if (!ts) return "";
        const d = new Date(ts);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dd = new Date(d);
        dd.setHours(0, 0, 0, 0);
        const diff = Math.round((today - dd) / 86400000);

        if (diff === 0) return "اليوم";
        if (diff === 1) return "أمس";
        if (diff < 7) return "قبل " + diff + " أيام";
        return d.toLocaleDateString("ar-EG", {
            year: "numeric", month: "long", day: "numeric",
        });
    }

    function timeOf(ts) {
        if (!ts) return "";
        return new Date(ts).toLocaleTimeString("ar-EG", {
            hour: "2-digit", minute: "2-digit",
        });
    }


    /* ==================================================
       نسخة احتياطية
    ================================================== */

    /* الإعدادات القابلة للنقل — بلا رمز القفل (كل جهاز يضبط قفله بنفسه) */
    function _portableSettings() {
        const s = getSettings();
        delete s.pin; delete s.pinHash; delete s.webauthnCred; delete s.pinHint;
        if (s.ai) s.ai = { ...s.ai, key: "" }; // لا نُصدّر مفتاح API
        s.pinEnabled = false; s.biometric = false;
        return s;
    }

    function _payload(withLock) {
        return {
            v: 5,
            exportedAt: new Date().toISOString(),
            contacts: getContacts(),
            operations: getOps().map(o => ({ ...o, code: redactCode(o.code) })),
            debts: getDebts(),
            codeDirectory: getCodeDirectory(),
            cards: getCards(),
            settings: withLock ? getSettings() : _portableSettings(),
            photos: window.PhotoDB ? { ...PhotoDB.cache } : {},
        };
    }

    /* نسخة عادية (JSON مقروء) — بلا رمز القفل، والأكواد مقنّعة */
    function exportAll() {
        return JSON.stringify(_payload(false), null, 2);
    }

    async function _deriveAesKey(password, saltBytes, iterations) {
        const wc = _webcrypto();
        if (!wc) throw new Error("التشفير غير مدعوم في هذا المتصفح.");
        const km = await wc.subtle.importKey(
            "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]
        );
        return wc.subtle.deriveKey(
            { name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" },
            km, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
        );
    }

    /* نسخة مشفّرة (AES-GCM بمفتاح مشتق من كلمة سر) — تشمل كل شيء */
    async function exportEncrypted(password) {
        const wc = _webcrypto();
        if (!wc || !wc.getRandomValues) throw new Error("التشفير غير مدعوم في هذا المتصفح.");
        if (!password || password.length < 4) throw new Error("اختر كلمة سر لا تقل عن 4 أحرف.");
        const ITER = 200000;
        const salt = _randomSalt();
        const iv = wc.getRandomValues(new Uint8Array(12));
        const key = await _deriveAesKey(password, salt, ITER);
        const plain = new TextEncoder().encode(JSON.stringify(_payload(true)));
        const ct = new Uint8Array(await wc.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
        return JSON.stringify({
            app: "alkod-alwasit", enc: "aes-gcm", kdf: "pbkdf2-sha256", iter: ITER,
            salt: _b64(salt), iv: _b64(iv), data: _b64(ct),
        });
    }

    async function _applyImport(data) {
        if (data.contacts) write(K.contacts, data.contacts);
        if (data.operations) write(K.ops, data.operations.map(o => ({ ...o, code: redactCode(o.code) })));
        if (data.debts) write(K.debts, data.debts);
        if (data.codeDirectory) write(K.codeDirectory, data.codeDirectory);
        if (data.cards) write(K.cards, data.cards);
        if (data.settings) write(K.settings, data.settings);
        if (data.photos && window.PhotoDB) {
            for (const id of Object.keys(data.photos)) {
                await PhotoDB.put(id, data.photos[id]);
            }
        }
        return true;
    }

    /*
     * يستعيد نسخة عادية أو مشفّرة.
     * يعيد: true | false (ملف تالف) | "need-password" | "bad-password"
     */
    async function importAll(json, password) {
        let data;
        try {
            data = typeof json === "string" ? JSON.parse(json) : json;
        } catch (e) { return false; }

        if (data && data.enc === "aes-gcm") {
            if (!password) return "need-password";
            try {
                const key = await _deriveAesKey(password, _unb64(data.salt), Number(data.iter) || 200000);
                const wc = _webcrypto();
                const buf = await wc.subtle.decrypt(
                    { name: "AES-GCM", iv: _unb64(data.iv) }, key, _unb64(data.data)
                );
                const inner = JSON.parse(new TextDecoder().decode(new Uint8Array(buf)));
                return await _applyImport(inner);
            } catch (e) {
                return "bad-password";
            }
        }

        try { return await _applyImport(data); }
        catch (e) { return false; }
    }

    function wipeAll() {
        [K.contacts, K.ops, K.settings, K.debts, K.codeDirectory, K.legacyHistory].forEach(k => {
            try { localStorage.removeItem(k); } catch (e) {}
        });
        Object.keys(localStorage).forEach(k => {
            if (k.indexOf("kw_") === 0 || k.indexOf("alkod_alwasit_") === 0) {
                try { localStorage.removeItem(k); } catch (e) {}
            }
        });
        if (window.PhotoDB) {
            Object.keys(PhotoDB.cache).forEach(id => PhotoDB.remove(id));
        }
    }


    /* -------- ترحيل: تنظيف أي رقم سري قديم من السجل -------- */

    (function migrateRedactPins() {
        try {
            if (localStorage.getItem("kw_pin_redacted") === "1") return;
            const ops = read(K.ops, null);
            if (ops && ops.length) {
                let changed = false;
                const clean = ops.map(o => {
                    const c = redactCode(o.code);
                    if (c !== o.code) { changed = true; return { ...o, code: c }; }
                    return o;
                });
                if (changed) write(K.ops, clean);
            }
            localStorage.setItem("kw_pin_redacted", "1");
        } catch (e) {}
    })();


    /* -------- الواجهة العامة -------- */

    return {
        SERVICES, PAYMENTS, CONTACT_TYPES,
        uid, cleanNum, cleanAmt,
        buildCode, telHref, redactCode,
        getContacts, getContact, saveContact, deleteContact, contactGroups,
        deleteContactUndoable, restoreContact,
        toggleFavorite, quickContacts, contactStats,
        getCards, getCard, saveCard, deleteCard, adjustCardBalance, getTotalBalance, cardsForNetwork,
        getOps, addOp, updateOpStatus, deleteOp, clearOps,
        deleteOpUndoable, restoreOp, search,
        getDebts, getDebt, saveDebt, settleDebt, deleteDebtUndoable, restoreDebt, debtSummary,
        getCodeDirectory, getCodeEntry, saveCodeEntry, deleteCodeEntryUndoable, restoreCodeEntry,
        summary, dailySeries,
        getSettings, saveSettings,
        setPin, verifyPin, clearPin,
        validatePhone, recentDuplicate,
        money, maskPhone, relativeDay, timeOf,
        exportAll, exportEncrypted, importAll, wipeAll,
    };

})();
