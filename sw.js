// 極簡 SW：直接走網路（保留擴充空間）
self.addEventListener('fetch', e => e.respondWith(fetch(e.request)));
