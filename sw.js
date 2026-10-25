'use strict';
// غيّر رقم النسخة عند أي تعديل لإجبار الأجهزة على التحديث
const VERSION = 'mizan-v1';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
const EXT = [
  'https://cdn.tailwindcss.com/3.4.17',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap'
];
const INDEX = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.allSettled(CORE.map(u => fetch(u, { cache: 'reload' }).then(r => { if (r.ok) return c.put(u === './' ? INDEX : u, r) })));
    await Promise.allSettled(EXT.map(async u => {
      const r = await fetch(u, { mode: 'cors', credentials: 'omit' });
      if (!r.ok) return;
      await c.put(u, r.clone());
      if (u.includes('fonts.googleapis.com')) {
        const css = await r.text();
        const fonts = [...new Set((css.match(/https:\/\/fonts\.gstatic\.com[^)'"\s]+/g) || []))];
        await Promise.allSettled(fonts.map(f => fetch(f, { mode: 'cors', credentials: 'omit' }).then(x => x.ok && c.put(f, x))));
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function notify() {
  for (const cl of await self.clients.matchAll({ type: 'window' })) cl.postMessage({ type: 'UPDATED' });
}

async function refresh(req, key, c, isIndex) {
  try {
    const r = await fetch(req);
    if (!r || !(r.ok || r.type === 'opaque')) return r;
    if (isIndex && r.ok) {
      const old = await c.match(key);
      const [a, b] = await Promise.all([old ? old.clone().text() : '', r.clone().text()]);
      await c.put(key, r.clone());
      if (old && a !== b) notify();
    } else {
      await c.put(key, r.clone());
    }
    return r;
  } catch (e) { return null; }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;
  const sameOrigin = url.origin === location.origin;
  const isNav = req.mode === 'navigate';
  const isIndex = isNav || (sameOrigin && (url.pathname.endsWith('/index.html') || url.pathname === new URL(self.registration.scope).pathname));
  const key = isIndex ? INDEX : req.url;
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const hit = await c.match(key, { ignoreSearch: isIndex });
    if (hit && !sameOrigin) return hit;
    if (hit) {
      e.waitUntil(refresh(isIndex ? new Request(INDEX, { cache: 'no-cache' }) : req, key, c, isIndex));
      return hit;
    }
    const r = await refresh(isIndex ? new Request(INDEX, { cache: 'no-cache' }) : req, key, c, isIndex);
    if (r) return r;
    return new Response('offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  })());
});
