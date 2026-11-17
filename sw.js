// Service worker: lets Binjamin keep working when the Wi-Fi at the bin drops.
// - app files (html/js/css/art): network first, cache fallback (so refresh-to-iterate still works)
// - models, wasm, fonts, CDN files: cache first (big + never change)
const CACHE = 'binjamin-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (!url.protocol.startsWith('http')) return;
  const heavy = url.origin !== self.location.origin || /\/(models|vendor)\//.test(url.pathname);

  // HEAD probes (used to find local model copies) answered from cache when offline
  if (req.method === 'HEAD') {
    e.respondWith(fetch(req).catch(async () => {
      const hit = await caches.match(url.href);
      return hit ? new Response(null, { status: 200 }) : new Response(null, { status: 404 });
    }));
    return;
  }
  if (req.method !== 'GET') return;
  e.respondWith(heavy ? cacheFirst(req) : networkFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}
