/* ==================================================
   idb.js — تخزين صور الجهات في IndexedDB
   (بدل localStorage الذي يمتلئ بسرعة بالصور)
================================================== */

window.PhotoDB = (function () {

    const DB = "kw_photos_db";
    const STORE = "photos";
    let _db = null;

    /* خريطة في الذاكرة للعرض المتزامن */
    const cache = {};

    function open() {
        return new Promise((resolve, reject) => {
            if (_db) return resolve(_db);
            const req = indexedDB.open(DB, 1);
            req.onupgradeneeded = () => {
                req.result.createObjectStore(STORE);
            };
            req.onsuccess = () => { _db = req.result; resolve(_db); };
            req.onerror = () => reject(req.error);
        });
    }

    async function put(id, dataUrl) {
        cache[id] = dataUrl;
        try {
            const db = await open();
            await new Promise((res, rej) => {
                const tx = db.transaction(STORE, "readwrite");
                tx.objectStore(STORE).put(dataUrl, id);
                tx.oncomplete = res;
                tx.onerror = () => rej(tx.error);
            });
        } catch (e) {
            // fallback: احتفظ بها في الذاكرة فقط لهذه الجلسة
        }
    }

    async function remove(id) {
        delete cache[id];
        try {
            const db = await open();
            await new Promise((res) => {
                const tx = db.transaction(STORE, "readwrite");
                tx.objectStore(STORE).delete(id);
                tx.oncomplete = res;
                tx.onerror = res;
            });
        } catch (e) {}
    }

    /* تحميل كل الصور إلى الذاكرة عند الإقلاع */
    async function hydrate() {
        try {
            const db = await open();
            await new Promise((res) => {
                const tx = db.transaction(STORE, "readonly");
                const store = tx.objectStore(STORE);
                const keysReq = store.getAllKeys();
                const valsReq = store.getAll();
                tx.oncomplete = () => {
                    const keys = keysReq.result || [];
                    const vals = valsReq.result || [];
                    keys.forEach((k, i) => { cache[k] = vals[i]; });
                    res();
                };
                tx.onerror = res;
            });
        } catch (e) {}

        // ترحيل الصور القديمة المخزّنة داخل الجهات نفسها
        try {
            const raw = localStorage.getItem("kw_contacts");
            if (raw) {
                const list = JSON.parse(raw);
                let changed = false;
                for (const c of list) {
                    if (c.photo && c.id && !cache[c.id]) {
                        await put(c.id, c.photo);
                        delete c.photo;
                        changed = true;
                    }
                }
                if (changed) {
                    localStorage.setItem("kw_contacts", JSON.stringify(list));
                }
            }
        } catch (e) {}
    }

    function get(id) {
        return cache[id] || null;
    }

    return { hydrate, put, get, remove, cache };

})();
