const fs = require('fs');
const path = require('path');
const { randomUUID, createHash } = require('crypto');

const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.resolve(projectRoot, process.argv[2] || 'dist');
const indexPath = path.join(outputDir, 'index.html');
const sourceIcon = path.join(projectRoot, 'assets', 'koda-pwa-icon.png');
const iconVersion = createHash('sha256').update(fs.readFileSync(sourceIcon)).digest('hex').slice(0, 12);
const appleIcon = path.join(outputDir, 'apple-touch-icon.png');
const icon192 = path.join(outputDir, 'pwa-icon-192.png');
const icon512 = path.join(outputDir, 'pwa-icon-512.png');
const manifestPath = path.join(outputDir, 'manifest.webmanifest');
const serviceWorkerPath = path.join(outputDir, 'sw.js');
const buildId = randomUUID();
const themeOptions = require('../src/features/koda/themeOptions.json');
const { applyKodaFavicon } = require('../src/features/koda/favicon');

if (!fs.existsSync(indexPath)) {
  throw new Error(`Missing web export index.html at ${indexPath}`);
}

fs.copyFileSync(path.join(projectRoot, 'assets', 'koda-apple-touch-icon.png'), appleIcon);
fs.copyFileSync(path.join(projectRoot, 'assets', 'koda-pwa-icon-192.png'), icon192);
fs.copyFileSync(path.join(projectRoot, 'assets', 'koda-pwa-icon-512.png'), icon512);
// The boot shell needs these sprites before the JavaScript bundle is ready.
const bootHouse = 'koda-kodik-house-sheet-v1.png';
const bootWave = 'koda-kodik-wave-sheet-v1.png';
fs.copyFileSync(path.join(projectRoot, 'assets', 'pet', 'kodik-house-sheet-v1.png'), path.join(outputDir, bootHouse));
fs.copyFileSync(path.join(projectRoot, 'assets', 'pet', 'kodik-wave-sheet-v1.png'), path.join(outputDir, bootWave));

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
      src: `/pwa-icon-192.png?v=${iconVersion}`,
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: `/pwa-icon-512.png?v=${iconVersion}`,
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: `/apple-touch-icon.png?v=${iconVersion}`,
      sizes: '180x180',
      type: 'image/png',
      purpose: 'any',
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
  `const CACHE_NAME = 'koda-offline-${buildId}';
const BUILD_ID = '${buildId}';
const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)};
const REUSABLE_URLS = new Set(${JSON.stringify(reusableUrls, null, 2)});

function isReusableResponse(response) {
  return response?.ok && response.status !== 206 && !response.headers.get('content-type')?.includes('text/html');
}

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
              if (isReusableResponse(response)) return { url, response };
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
      for (const url of PRECACHE_URLS.filter((url) => url !== '/' && !url.endsWith('.html'))) {
        const response = await cache.match(url);
        if (response?.headers.get('content-type')?.includes('text/html')) throw new Error('HTML returned for offline asset: ' + url);
      }
      // A deployment can change between downloading sw.js and its shell. Never
      // activate a worker whose offline HTML belongs to a different deployment.
      const shell = await cache.match('/');
      if (!shell?.headers.get('content-type')?.includes('text/html')
        || !(await shell.text()).includes('<meta name="koda-build" content="' + BUILD_ID + '">')) {
        throw new Error('Offline shell build mismatch');
      }
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
    // Open pages can still request lazy chunks from their original build. Ask
    // every page before cleanup; legacy/unresponsive pages preserve all caches.
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const builds = await Promise.all(clients.map((client) => new Promise((resolve) => {
      const channel = new MessageChannel();
      let settled = false;
      const finish = (buildId) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        channel.port1.close();
        channel.port2.close();
        resolve(typeof buildId === 'string' && buildId ? buildId : null);
      };
      const timeout = setTimeout(() => finish(null), 1000);
      channel.port1.onmessage = (event) => finish(event.data?.buildId);
      try { client.postMessage({ type: 'KODA_GET_PAGE_BUILD' }, [channel.port2]); }
      catch { finish(null); }
    })));
    if (builds.includes(null)) return;
    const retained = new Set([CACHE_NAME, ...builds.map((buildId) => 'koda-offline-' + buildId)]);
    const keys = await caches.keys();
    // Cleanup is best effort after activation is ready; failed cleanup is safe to retry next release.
    await Promise.allSettled(keys.filter((key) => key.startsWith('koda-offline-') && !retained.has(key))
      .map((key) => caches.delete(key)));
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'KODA_GET_BUILD') event.ports[0]?.postMessage({ buildId: BUILD_ID });
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match('/') || await cache.match('/index.html');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(request, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Unavailable');
        // Only install may replace the offline shell, after all its assets are
        // downloaded. A newer online document must not poison this build's cache.
        return response;
      } catch {
        return cached || new Response('KODA: для первого запуска нужен доступ к интернету.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      } finally { clearTimeout(timeout); }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    let cached = await cache.match(request);
    const immutable = /^\\/(?:assets|_expo\\/static)\\//.test(url.pathname)
      && /(?:^|[.-])(?:[a-f0-9]{32}|[a-f0-9]{64})\\.(?:js|css|json|ico|png)$/i.test(url.pathname.split('/').pop());
    if (immutable) {
      if (isReusableResponse(cached)) return cached;
      cached = undefined;
      // Only content-addressed files may cross build boundaries, and only from
      // KODA caches. In particular, never pick another build's HTML or manifest.
      for (const cacheName of (await caches.keys()).filter((key) => key.startsWith('koda-offline-') && key !== CACHE_NAME).reverse()) {
        try {
          const previous = await caches.match(request, { cacheName });
          if (isReusableResponse(previous)) return previous;
        } catch {
          // An unreadable old cache must not prevent fetching the requested file.
        }
      }
    }
    try {
      const response = await fetch(request, immutable ? undefined : { cache: 'no-cache' });
      if (immutable && response.headers.get('content-type')?.includes('text/html')) return Response.error();
      return response.ok ? response : cached || response;
    } catch {
      return cached || Response.error();
    }
  })());
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
html = html.replace(/<meta\s+name=["']koda-build["'][^>]*>/gi, '');
html = html.replace('<head>', `<head>\n<meta name="koda-build" content="${buildId}">`);
// Render immediately while the application bundle is still downloading. React
// replaces this content as soon as it mounts; it never simulates progress.
const bootScreen = `<div id="koda-boot" role="status" aria-label="Загрузка приложения KODA">
  <div class="koda-boot-art" aria-hidden="true"><div class="koda-boot-house"></div><div class="koda-boot-wave"></div></div>
  <div class="koda-boot-brand">KODA <span>LIFE</span></div><div class="koda-boot-tagline">Маленькие шаги. Свой ритм.</div>
  <div class="koda-boot-loading">Загрузка…</div></div>`;
const bootStyles = `<style id="koda-boot-style">
  #koda-boot{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:20px;background:var(--koda-app-bg,#b7c3b5);color:var(--koda-text,#1b241b);font-family:system-ui,sans-serif}
  .koda-boot-art{position:relative;width:300px;height:270px;margin-bottom:12px}.koda-boot-house{position:absolute;left:8px;top:0;width:266.1px;height:266.1px;background:url('/${bootHouse}') 0 0/532.2px 266.1px no-repeat}
  .koda-boot-wave{position:absolute;left:168px;top:154px;width:104px;height:104px;overflow:hidden;background-image:url('/${bootWave}');background-size:312px 104px;background-position:0 0;background-repeat:no-repeat;animation:koda-wave 720ms steps(1,end) infinite}
  .koda-boot-brand{font-size:28px;font-weight:600;letter-spacing:2.2px}.koda-boot-brand span{font-weight:300;letter-spacing:2.8px}.koda-boot-tagline{font-size:14px;line-height:21px;text-align:center;color:var(--koda-text-muted,#575e50)}
  .koda-boot-loading{width:220px;max-width:100%;margin-top:24px;text-align:center;font-size:14px;color:var(--koda-text-muted,#575e50)}
  @keyframes koda-wave{0%,100%{background-position:0 0}25%,75%{background-position:-104px 0}50%{background-position:-208px 0}}
  @media(prefers-reduced-motion:reduce){.koda-boot-wave{animation:none}}
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
  '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
  '<link rel="manifest" href="/manifest.webmanifest">',
  `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=${iconVersion}">`,
  '<style id="koda-pwa-shell">html,body,#root{height:100%;min-height:100%;background:var(--koda-app-bg,#f5f6f2);touch-action:manipulation;}@supports (height:100dvh){html,body,#root{height:100dvh;min-height:100dvh;}}body{overflow:hidden;-webkit-text-size-adjust:100%;}@media(pointer:coarse){input,textarea,select{font-size:16px!important;}}*{scrollbar-width:thin;scrollbar-color:var(--koda-border-strong) var(--koda-app-bg);}*::-webkit-scrollbar{width:8px;height:8px;}*::-webkit-scrollbar-track{background:var(--koda-app-bg);border-left:1px solid var(--koda-border);}*::-webkit-scrollbar-thumb{background:var(--koda-border-strong);border:2px solid var(--koda-app-bg);border-radius:999px;}*::-webkit-scrollbar-thumb:hover{background:var(--koda-accent);}*::-webkit-scrollbar-button{display:none;width:0;height:0;}*::-webkit-scrollbar-corner{background:var(--koda-app-bg);}</style>',
].join('\n');

html = html.replace(/<meta\s+name=["']viewport["'][^>]*>/i, '');

if (!html.includes('apple-mobile-web-app-capable')) {
  html = html.replace('</head>', `${pwaTags}\n</head>`);
}

// Keep content below the iPhone status bar instead of under its translucent edge.
// Normalize Expo-generated and previously prepared HTML as well.
html = html.replace(/<meta\b(?=[^>]*\bname=["']apple-mobile-web-app-status-bar-style["'])[^>]*>/gi, '');
html = html.replace('</head>', '<meta name="apple-mobile-web-app-status-bar-style" content="default">\n</head>');

fs.writeFileSync(indexPath, html, 'utf8');
