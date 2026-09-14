/* ==================================================
   service-worker.js — تخزين مؤقت + تحديث نظيف
   - التنقّل/HTML: الشبكة أولًا (نسخة طازجة عند الاتصال)، ثم الكاش بلا إنترنت.
   - الملفات الثابتة: كاش أولًا مع تحديث في الخلفية (stale-while-revalidate).
   - عند نشر إصدار جديد: غيّر VERSION فقط.
================================================== */

const VERSION = "v37";
const CACHE = "alkod-alwasit-" + VERSION;

const ASSETS = [
    "./", "./index.html", "./style.css", "./manifest.json",
    "./idb.js", "./data.js", "./lock.js", "./script.js",
    "./contacts.js", "./history.js", "./debts.js", "./stats.js",
    "./fx.js", "./native.js", "./prayer.js", "./qrgen.js", "./qr.js", "./report.js", "./ai.js",
    "./codedir.js", "./sound.js", "./cards.js", "./receipt.js",
    "./icon.png", "./icon-512.png", "./apple-touch-icon.png", "./images/1.png", "./images/2.png", "./images/3.png",
];


self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE).then(cache =>
            Promise.all(ASSETS.map(url => cache.add(url).catch(() => {})))
        )
    );
    self.skipWaiting();
});


self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(names => Promise.all(
                names.filter(n => n !== CACHE).map(n => caches.delete(n))
            ))
            .then(() => self.clients.claim())
    );
});


self.addEventListener("message", event => {
    if (event.data === "skipWaiting") self.skipWaiting();
});


function isNavigation(request) {
    return request.mode === "navigate" ||
        (request.method === "GET" &&
            (request.headers.get("accept") || "").includes("text/html"));
}


self.addEventListener("fetch", event => {
    const { request } = event;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return; // خارجي: اتركه للمتصفح

    if (isNavigation(request)) {
        // الشبكة أولًا — يضمن وصول أي تحديث للواجهة
        event.respondWith(
            fetch(request)
                .then(resp => {
                    const copy = resp.clone();
                    caches.open(CACHE).then(c => c.put("./index.html", copy)).catch(() => {});
                    return resp;
                })
                .catch(() =>
                    caches.match(request).then(r => r || caches.match("./index.html"))
                )
        );
        return;
    }

    // ثابت: كاش أولًا + تحديث صامت
    event.respondWith(
        caches.match(request).then(cached => {
            const network = fetch(request).then(resp => {
                if (resp && resp.ok) {
                    const copy = resp.clone();
                    caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
                }
                return resp;
            }).catch(() => cached);
            return cached || network;
        })
    );
});
