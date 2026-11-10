const CACHE = 'stock-opname-v6.1';
const ASSETS = [
  './', './index.html', './style.css', './app.js',
  './xlsx.full.min.js', './manifest.json', './icon.svg',
  './data/master.json'
];
// File tampilan utama: selalu coba jaringan dulu agar update versi
// langsung sampai ke pengguna; bila offline, pakai cache.
const SHELL = ['/', '/index.html', 'index.html', '/app.js', 'app.js', '/style.css', 'style.css'];

self.addEventListener('install', e => {
  // Aktifkan service worker baru segera, jangan menunggu tab lama ditutup.
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isShell = e.request.mode === 'navigate' || SHELL.some(p => url.pathname === p || url.pathname.endsWith(p));
  if (isShell) {
    // Network-first: ambil versi terbaru bila online, cache bila offline.
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request).then(r => r || caches.match('./')))
    );
    return;
  }
  // Aset lain: cache-first (tetap bisa offline).
  e.respondWith(
    caches.match(e.request).then(r =>
      r || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match('./'))
    )
  );
});
