const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.resolve(projectRoot, process.argv[2] || 'dist');
const indexPath = path.join(outputDir, 'index.html');
const sourceIcon = path.join(projectRoot, 'assets', 'koda-pwa-icon.png');
const appleIcon = path.join(outputDir, 'apple-touch-icon.png');
const icon192 = path.join(outputDir, 'pwa-icon-192.png');
const icon512 = path.join(outputDir, 'pwa-icon-512.png');
const manifestPath = path.join(outputDir, 'manifest.webmanifest');
const serviceWorkerPath = path.join(outputDir, 'sw.js');
const themeOptions = require('../src/features/koda/themeOptions.json');
const { applyKodaFavicon } = require('../src/features/koda/favicon');

if (!fs.existsSync(indexPath)) {
  throw new Error(`Missing web export index.html at ${indexPath}`);
}

fs.copyFileSync(sourceIcon, appleIcon);
fs.copyFileSync(sourceIcon, icon192);
fs.copyFileSync(sourceIcon, icon512);

const manifest = {
  id: '/',
  lang: 'ru-RU',
  name: 'KODA',
  short_name: 'KODA',
  description: 'Личный дневник, привычки и цели',
  start_url: '/?source=pwa',
  scope: '/',
  display: 'standalone',
  display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
  orientation: 'any',
  background_color: themeOptions[0].colors['--koda-app-bg'],
  theme_color: themeOptions[0].colors['--koda-app-bg'],
  categories: ['productivity', 'lifestyle'],
  icons: [
    {
      src: '/pwa-icon-192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/pwa-icon-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any maskable',
    },
    {
      src: '/apple-touch-icon.png',
      sizes: '1024x1024',
      type: 'image/png',
      purpose: 'any maskable',
    },
  ],
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

function collectCacheUrls(directory, base = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    const publicPath = `${base}/${entry.name}`.replace(/\\/g, '/');

    if (entry.isDirectory()) {
      return collectCacheUrls(absolutePath, publicPath);
    }

    if (entry.name === 'sw.js') return [];
    if (!/\.(html|js|css|json|ico|png|webmanifest)$/i.test(entry.name)) return [];

    return [publicPath || '/'];
  });
}

const precacheUrls = Array.from(new Set(['/', ...collectCacheUrls(outputDir).map((url) => (url === '/index.html' ? '/' : url))]));
// Expo exports content-addressed assets with an MD5/SHA hash in the basename.
// Never infer immutability from a hash in a directory or from shell filenames.
const reusableUrls = precacheUrls.filter((url) =>
  /^\/(?:assets|_expo\/static)\//.test(url)
  && /(?:^|[.-])(?:[a-f0-9]{32}|[a-f0-9]{64})\.(?:js|css|json|ico|png)$/i.test(path.posix.basename(url)),
);

fs.writeFileSync(
  serviceWorkerPath,
  `const CACHE_NAME = 'koda-offline-${Date.now()}';
const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)};
const REUSABLE_URLS = new Set(${JSON.stringify(reusableUrls, null, 2)});

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      const previousKeys = (await caches.keys())
        .filter((key) => key.startsWith('koda-offline-') && key !== CACHE_NAME).reverse();
      const entries = await Promise.all(PRECACHE_URLS.map(async (url) => {
        if (REUSABLE_URLS.has(url)) {
          for (const cacheName of previousKeys) {
            try {
              const response = await caches.match(url, { cacheName });
              if (response?.ok && response.status !== 206) return { url, response };
            } catch {
              // An evicted or unreadable old cache must not prevent network fallback.
            }
          }
        }
        return { url };
      }));
      // Reload mutable resources and new hashes even when the HTTP cache is fresh.
      const downloads = entries.filter((entry) => !entry.response)
        .map((entry) => new Request(entry.url, { cache: 'reload' }));
      if (downloads.length) await cache.addAll(downloads);
      // Settle every copy before cleanup so a late write cannot recreate a failed cache.
      const copies = await Promise.allSettled(entries.filter((entry) => entry.response)
        .map((entry) => cache.put(entry.url, entry.response)));
      const failure = copies.find((result) => result.status === 'rejected');
      if (failure) throw failure.reason;
      await self.skipWaiting();
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const responses = await Promise.all(PRECACHE_URLS.map((url) => cache.match(url)));
    if (responses.some((response) => !response?.ok)) throw new Error('Incomplete offline cache');
    await self.clients.claim();
    const keys = await caches.keys();
    // Cleanup is best effort after activation is ready; failed cleanup is safe to retry next release.
    await Promise.allSettled(keys.filter((key) => key.startsWith('koda-offline-') && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = await caches.match('/') || await caches.match('/index.html');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), cached ? 1500 : 8000);
      try {
        const response = await fetch(request, { signal: controller.signal });
        if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Unavailable');
        const cache = await caches.open(CACHE_NAME);
        await cache.put('/', response.clone());
        return response;
      } catch {
        return cached || new Response('KODA: для первого запуска нужен доступ к интернету.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      } finally { clearTimeout(timeout); }
    })());
    return;
  }

  if (url.pathname.startsWith('/_expo/static/')) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
    return;
  }

  if (/\\.(js|css|json|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }

          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }

      return response;
    })),
  );
});

self.addEventListener('push', (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = {};
  }

  const title = data.title || 'KODA';
  const options = {
    body: data.body || 'Открой KODA и отметь день.',
    badge: '/apple-touch-icon.png',
    icon: '/apple-touch-icon.png',
    tag: data.tag || 'koda-reminder',
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          return;
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});
`,
  'utf8',
);

let html = fs.readFileSync(indexPath, 'utf8');
// Render immediately while the application bundle is still downloading. React
// replaces this content as soon as it mounts; it never simulates progress.
const bootScreen = `<div id="koda-boot" role="status" aria-label="Загрузка приложения KODA">
  <div class="koda-boot-mark" aria-hidden="true"><svg viewBox="0 0 80 80" fill="none"><path d="M40 68C39 52 42 35 48 21"/><path class="koda-boot-leaf koda-boot-leaf-a" d="M43 39C24 40 16 30 17 19C29 20 41 27 43 39Z"/><path class="koda-boot-leaf koda-boot-leaf-b" d="M46 29C47 15 55 8 66 7C67 18 58 27 46 29Z"/></svg></div>
  <div class="koda-boot-brand">KODA <span>LIFE</span></div><div class="koda-boot-caption">Готовим твоё пространство</div>
  <div class="koda-boot-dots" aria-hidden="true"><i></i><i></i><i></i></div></div>`;
const bootStyles = `<style id="koda-boot-style">
  #koda-boot{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:var(--koda-app-bg,#b7c3b5);color:var(--koda-text,#1b241b);font-family:system-ui,sans-serif}
  .koda-boot-mark{width:76px;height:76px;color:var(--koda-accent,#3e501b)}.koda-boot-mark svg{width:100%;height:100%;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
  .koda-boot-leaf{fill:var(--koda-accent-soft,#e8efc3);transform-box:fill-box;transform-origin:bottom center;animation:koda-grow 900ms cubic-bezier(.2,.8,.2,1) both}.koda-boot-leaf-b{animation-delay:140ms}
  .koda-boot-brand{font-size:25px;font-weight:600;letter-spacing:2.2px}.koda-boot-brand span{font-weight:300}.koda-boot-caption{font-size:14px;color:var(--koda-text-muted,#575e50)}
  .koda-boot-dots{display:flex;gap:6px;margin-top:8px}.koda-boot-dots i{width:5px;height:5px;border-radius:50%;background:var(--koda-accent,#3e501b);animation:koda-pulse 1.2s ease-in-out infinite}.koda-boot-dots i:nth-child(2){animation-delay:160ms}.koda-boot-dots i:nth-child(3){animation-delay:320ms}
  @keyframes koda-grow{from{opacity:0;transform:scale(.3)}to{opacity:1;transform:scale(1)}}@keyframes koda-pulse{0%,100%{opacity:.3}50%{opacity:1}}
  @media(prefers-reduced-motion:reduce){.koda-boot-leaf,.koda-boot-dots i{animation:none}}
</style>`;
if (!html.includes('id="koda-boot"')) {
  html = html.replace(/<div\s+id=["']root["']\s*><\/div>/i, `<div id="root">${bootScreen}</div>`);
  html = html.replace('</head>', `${bootStyles}\n</head>`);
}
// The bootstrap creates the themed icon before the app loads. A later static
// favicon link would override it and briefly restore the orange icon on reload.
html = html.replace(/<link\b(?=[^>]*\brel=["'](?:shortcut\s+)?icon["'])[^>]*>/gi, '');
const themeBootstrap = `<script id="koda-theme-bootstrap">(function(){var themes=${JSON.stringify(themeOptions)};var id;try{id=localStorage.getItem('koda:theme:v1');}catch(e){}if(id==='koda-dark')id='calm-dark';if(id==='reference-dark')id='calm-sky-dark';var theme=themes.find(function(t){return t.id===id;})||themes[0];var root=document.documentElement;root.dataset.theme=theme.id;root.style.colorScheme=theme.id.endsWith('dark')?'dark':'light';Object.keys(theme.colors).forEach(function(key){root.style.setProperty(key,theme.colors[key]);});(${applyKodaFavicon.toString()})(theme.colors);})();</script>`;
html = html.replace('<head>', `<head>\n${themeBootstrap}`);
const pwaTags = [
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="KODA">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<link rel="manifest" href="/manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
  '<style id="koda-pwa-shell">html,body,#root{height:100%;min-height:100%;background:var(--koda-app-bg,#f5f6f2);touch-action:manipulation;}@supports (height:100dvh){html,body,#root{height:100dvh;min-height:100dvh;}}body{overflow:hidden;-webkit-text-size-adjust:100%;}@media(pointer:coarse){input,textarea,select{font-size:16px!important;}}*{scrollbar-width:thin;scrollbar-color:var(--koda-border-strong) var(--koda-app-bg);}*::-webkit-scrollbar{width:8px;height:8px;}*::-webkit-scrollbar-track{background:var(--koda-app-bg);border-left:1px solid var(--koda-border);}*::-webkit-scrollbar-thumb{background:var(--koda-border-strong);border:2px solid var(--koda-app-bg);border-radius:999px;}*::-webkit-scrollbar-thumb:hover{background:var(--koda-accent);}*::-webkit-scrollbar-button{display:none;width:0;height:0;}*::-webkit-scrollbar-corner{background:var(--koda-app-bg);}</style>',
].join('\n');

html = html.replace(/<meta\s+name=["']viewport["'][^>]*>/i, '');

if (!html.includes('apple-mobile-web-app-capable')) {
  html = html.replace('</head>', `${pwaTags}\n</head>`);
}

fs.writeFileSync(indexPath, html, 'utf8');
