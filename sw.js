const CACHE = 'analysis-power-v5.0.0';
const LOCAL_ASSETS = [
  './','./index.html','./manifest.webmanifest','./css/styles.css','./css/power.css','./js/constants.js','./js/utils.js','./js/csv.js','./js/xlsx-lite.js','./js/importer.js',
  './js/storage.js','./js/geo.js','./js/intelligence.js','./js/autopilot.js','./js/analytics.js','./js/public-context.js','./js/causal-context.js','./js/power.js','./js/ui.js','./js/app.js','./config/store.json','./data/public-context.json','./data/public-context-history.json'
];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(c => c.addAll(LOCAL_ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.endsWith('/data/public-context.json') || url.pathname.endsWith('/data/public-context-history.json')) {
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(resp=>{const copy=resp.clone();caches.open(CACHE).then(c=>c.put(event.request,copy)).catch(()=>{});return resp;}).catch(()=>caches.match(event.request)));
    return;
  }
  event.respondWith(fetch(event.request).then(resp => {
    const copy = resp.clone(); caches.open(CACHE).then(c => c.put(event.request, copy)).catch(()=>{}); return resp;
  }).catch(()=>caches.match(event.request)));
});
