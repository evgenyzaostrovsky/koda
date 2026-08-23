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
  background_color: '#050605',
  theme_color: '#050605',
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

fs.writeFileSync(
  serviceWorkerPath,
  `const CACHE_NAME = 'koda-offline-${Date.now()}';
const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.all(PRECACHE_URLS.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('koda-offline-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((clients) => Promise.all(clients.map((client) => {
        client.postMessage({ type: 'KODA_SW_UPDATED' });
        return undefined;
      }))),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/') || caches.match('/index.html')),
    );
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
const pwaTags = [
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="KODA">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<link rel="manifest" href="/manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
  '<style id="koda-pwa-shell">html,body,#root{height:100%;min-height:100%;background:#050605;touch-action:manipulation;}@supports (height:100dvh){html,body,#root{height:100dvh;min-height:100dvh;}}body{overflow:hidden;-webkit-text-size-adjust:100%;}input,textarea,select{font-size:16px!important;}*{scrollbar-width:thin;scrollbar-color:#ff5f1a #050605;}*::-webkit-scrollbar{width:8px;height:8px;}*::-webkit-scrollbar-track{background:#050605;border-left:1px solid #242424;}*::-webkit-scrollbar-thumb{background:#ff5f1a;border:2px solid #050605;border-radius:999px;}*::-webkit-scrollbar-thumb:hover{background:#ff7a33;}*::-webkit-scrollbar-button{display:none;width:0;height:0;}*::-webkit-scrollbar-corner{background:#050605;}</style>',
].join('\n');

html = html.replace(/<meta\s+name=["']viewport["'][^>]*>/i, '');

if (!html.includes('apple-mobile-web-app-capable')) {
  html = html.replace('</head>', `${pwaTags}\n</head>`);
}

fs.writeFileSync(indexPath, html, 'utf8');
