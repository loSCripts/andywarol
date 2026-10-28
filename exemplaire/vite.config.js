import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';

/* Service worker minimal, généré au moment de la construction : il connaît la
   liste exacte des fichiers produits, donc le jeu marche hors ligne sur le site. */
function serviceWorker() {
  return {
    name: 'exemplaire-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const fichiers = ['./', './index.html', './manifest.webmanifest', './icone.svg', './icone-192.png', './icone-512.png',
        ...Object.keys(bundle).map((f) => `./${f}`)];
      const version = createHash('sha1').update(fichiers.join('|')).digest('hex').slice(0, 10);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `const CACHE = 'exemplaire-${version}';
const FICHIERS = ${JSON.stringify(fichiers)};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
`,
      });
    },
  };
}

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
  plugins: [serviceWorker()],
});
