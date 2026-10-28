const CACHE = 'exemplaire-a0c65274e3';
const FICHIERS = ["./","./index.html","./manifest.webmanifest","./icone.svg","./icone-192.png","./icone-512.png","./assets/index-BNwu6G4P.js","./assets/anton-latin-400-normal-AUNGEG_V.woff","./assets/anton-latin-400-normal-Byf51wtH.woff2","./assets/courier-prime-latin-400-normal-BAlbUm6l.woff","./assets/courier-prime-latin-400-normal-BbyBr73r.woff2","./assets/courier-prime-latin-700-normal-CVvp4Sof.woff","./assets/courier-prime-latin-700-normal-D1YCjmaD.woff2","./assets/index-OXcqXG1a.css"];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
