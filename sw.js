/* CashFlow PWA Service Worker
   - HTML: network-first
   - JS/CSS: stale-while-revalidate
   - Images/Icons: cache-first
   - Bump CACHE_NAME to force refresh old assets
*/
const CACHE_NAME = 'cashflow-v3.6.0';              // ← 版本號想更新就改這個
const RUNTIME_IMG = 'cashflow-img-v1';

const BASE_PATH = new URL(self.registration.scope).pathname.replace(/\/$/, '') || '';
const precacheList = [
  '',                 // /cashflow/ -> index.html
  'index.html',
  'style.css',
  'app.js',
  'manifest.json',
  // 如果圖示/字體有固定路徑，也加進來（依你的 repo 實際檔名）
  // 'icons/icon-192.png',
  // 'icons/icon-512.png',
  // 'pocket_pig.svg',
].map(p => `${BASE_PATH}/${p}`.replace(/\/+$/, '/')); // 正規化結尾斜線

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(precacheList);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 刪除舊版快取
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k !== CACHE_NAME && k !== RUNTIME_IMG)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 僅處理同網域（含 GitHub Pages /cashflow/ scope）
  const sameOrigin = url.origin === self.location.origin;

  // 1) 導覽（HTML）→ Network First
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // 2) 同網域的靜態檔
  if (sameOrigin) {
    // JS / CSS / JSON → Stale-While-Revalidate
    if (/\.(?:js|css|json|wasm)$/.test(url.pathname)) {
      event.respondWith(staleWhileRevalidate(request, CACHE_NAME));
      return;
    }
    // 圖片 / 圖示 / 字型 → Cache-First（另開一個 runtime cache）
    if (/\.(?:png|jpg|jpeg|gif|webp|svg|ico|avif|woff2?|ttf|otf)$/.test(url.pathname)) {
      event.respondWith(cacheFirst(request, RUNTIME_IMG));
      return;
    }
  }

  // 其他請求：直接走網路（保持簡單）
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

/* ---- Caching Strategies ---- */

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    // 導覽頁面也快取一份（提升離線體驗）
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (_) {
    const cached = await caches.match(request);
    // 若沒命中，就回 index.html（SPA 友善）
    return cached || caches.match(`${BASE_PATH}/index.html`);
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((resp) => {
      cache.put(request, resp.clone());
      return resp;
    })
    .catch(() => null);

  return cached || fetchPromise || fetch(request);
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const resp = await fetch(request);
  cache.put(request, resp.clone());
  return resp;
}
