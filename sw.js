/**
 * LedgerPulse Service Worker
 * Handles caching and offline support for the PWA
 * Strategy: Network-First for ALL assets during development to avoid caching locks
 */

const CACHE_NAME = 'ledgerpulse-v1.0.0';
const OFFLINE_PAGE = 'offline.html';

// Static assets matching your exact folder tree structure
const PRECACHE_ASSETS = [
  'index.html',
  'offline.html',
  'manifest.json',
  'assets/css/theme.css',
  'assets/js/storage.js',
  'assets/js/theme.js',
  'assets/js/utils.js',
  'assets/js/app.js',
  'assets/icons/icon-72.png',
  'assets/icons/icon-96.png',
  'assets/icons/icon-128.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'pages/dashboard.html',
  'pages/products.html',
  'pages/inventory.html',
  'pages/pos.html',
  'pages/sales.html',
  'pages/reports.html',
  'pages/settings.html',
  // External CDNs (cached for offline performance)
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

// ─── Install Event ─────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing LedgerPulse v1.0.0...');

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching assets...');
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[ServiceWorker] Some assets failed to pre-cache:', err);
      });
    }).then(() => {
      // Force the waiting service worker to become active immediately
      return self.skipWaiting();
    })
  );
});

// ─── Activate Event ────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activating and sweeping old caches...');

  event.waitUntil(
    // Remove old caches from previous versions dynamically
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[ServiceWorker] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      // Take control of all open clients immediately
      return self.clients.claim();
    })
  );
});

// ─── Fetch Event ───────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and browser extension requests
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') return;

  event.respondWith(handleFetch(request));
});

/**
 * Fetch handler with Network-First strategy for ALL requests.
 * This guarantees live file changes update immediately during development.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleFetch(request) {
  // 1. Handle Navigation requests (HTML pages)
  if (request.mode === 'navigate') {
    try {
      const networkResponse = await fetch(request);
      
      if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    } catch {
      const cached = await caches.match(request);
      return cached || caches.match(OFFLINE_PAGE);
    }
  }

  // 2. Handle Static Assets (CSS, JS, Images, CDNs) using Network-First strategy
  try {
    const networkResponse = await fetch(request);
    
    // Dynamically update the cache with the fresh asset from the server
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    console.log('[ServiceWorker] Network failed. Serving asset from persistent cache fallback.');
    
    // If local network server is unreachable/offline, serve from cache
    const cached = await caches.match(request);
    if (cached) return cached;

    // Hard fallback if asset isn't in cache either
    if (request.headers.get('accept')?.includes('text/html')) {
      return caches.match(OFFLINE_PAGE);
    }
    return new Response('Offline resource unavailable', { status: 503 });
  }
}
