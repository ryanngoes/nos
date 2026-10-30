// Service worker: deixa o app abrir rápido e funcionar sem internet
// (as telas abrem; fotos e dados novos precisam de conexão).
// Ao publicar uma versão nova, aumente o número abaixo.
const VERSION = 'nos-v2';
const SHELL = [
  './',
  'index.html',
  'app.css',
  'app.js',
  'api.js',
  'demo.js',
  'spotify.js',
  'config.js',
  'vendor/supabase.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
  'fonts/young-serif-latin-400-normal.woff2',
  'fonts/figtree-latin-400-normal.woff2',
  'fonts/figtree-latin-600-normal.woff2',
  'fonts/figtree-latin-700-normal.woff2',
  'fonts/nanum-pen-script-latin-400-normal.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Supabase e Spotify sempre direto na rede

  // Rede primeiro (pra pegar atualizações), cache se estiver sem internet.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
