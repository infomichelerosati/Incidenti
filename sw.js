const CACHE_NAME = 'sinistri-pwa-cache-v12'; // *** VERSIONE INCREMENTATA A v12 ***

// Separiamo gli asset locali da quelli esterni (CDN)
const LOCAL_URLS = [
  './', // Alias per index.html
  './index.html',
  './manifest.json',
  './icon-192.png', // NUOVA ICONA
  './icon-512.png'  // NUOVA ICONA
];

const CDN_URLS = [
  'https://cdn.tailwindcss.com/',
  'https://unpkg.com/dexie@3/dist/dexie.js',
  'https://unpkg.com/lucide@latest',
  // Aggiunte le librerie di esportazione che erano in index.html
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.0/FileSaver.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

// 1. Installazione (Caching degli asset principali)
self.addEventListener('install', event => {
  console.log(`SW: Installazione v${CACHE_NAME}...`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('SW: Caching asset locali...');
        // 1. Caching asset locali (fallisce se uno non va)
        return cache.addAll(LOCAL_URLS).then(() => {
          console.log('SW: Caching asset CDN (no-cors)...');
          // 2. Caching asset CDN (modalità no-cors)
          const cdnPromises = CDN_URLS.map(url => {
            // Creiamo una nuova Richiesta in modalità 'no-cors'
            // NOTA: jspdf.umd.min.js potrebbe essere grande e fallire il caching no-cors
            // in alcuni browser. Se dà problemi, va rimosso da CDN_URLS.
            const request = new Request(url, { mode: 'no-cors' });
            return fetch(request)
              .then(response => {
                return cache.put(request, response); // Mettiamo in cache la risposta opaca
              })
              .catch(err => {
                console.warn(`SW: Impossibile fare cache di ${url}`, err);
              });
          });
          return Promise.all(cdnPromises);
        });
      })
      .then(() => {
          console.log(`SW: Installazione v${CACHE_NAME} completata.`);
          self.skipWaiting(); // Forza l'attivazione del nuovo SW
      })
      .catch(err => {
          console.error(`SW: Installazione v${CACHE_NAME} fallita durante il caching.`, err);
      })
  );
});

// 2. Attivazione (Pulizia delle vecchie cache)
self.addEventListener('activate', event => {
  console.log(`SW: Attivazione v${CACHE_NAME}...`);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => {
          // Rimuovi tutte le cache che non sono quella attuale
          return cacheName.startsWith('sinistri-pwa-cache-') && cacheName !== CACHE_NAME;
        }).map(cacheName => {
          console.log(`SW: Eliminazione vecchia cache: ${cacheName}`);
          return caches.delete(cacheName);
        })
      );
    }).then(() => self.clients.claim()) // Prendi controllo immediato della pagina
  );
});

// 3. Fetch (Strategia Cache-first)
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // Determina se la richiesta è per una CDN o un asset locale
  const isCdnUrl = CDN_URLS.some(cdnUrl => event.request.url.startsWith(cdnUrl));
  // Per i local URLs, controlliamo il pathname
  // NOTA: Dobbiamo rimuovere lo slash iniziale se presente
  const requestPath = requestUrl.pathname.startsWith('/') ? '.' + requestUrl.pathname : requestUrl.pathname;
  
  const isLocalUrl = LOCAL_URLS.includes(requestPath);

  // Per le CDN, usa la cache.
  if (isCdnUrl) {
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true })
        .then(cachedResponse => {
          if (cachedResponse) {
            // console.log('SW: Servito da cache (CDN)', event.request.url);
            return cachedResponse;
          }
          
          // Se non in cache, fetch
          const fetchRequest = event.request.clone();
          
          // Creiamo una richiesta no-cors per le CDN
          return fetch(new Request(fetchRequest.url, { mode: 'no-cors' }))
            .then(response => {
                // Non possiamo mettere in cache la risposta no-cors qui
                // perché non possiamo clonarla, ma l'installazione dovrebbe averla gestita.
                return response;
            })
            .catch(err => {
                console.error('SW: Errore fetch CDN (no-cors)', err, event.request.url);
            });
        })
    );
  } 
  // Per gli asset locali (index, manifest, icone)
  else if (isLocalUrl) {
     event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    // console.log('SW: Servito da cache (Locale)', event.request.url);
                    return cachedResponse;
                }
                // Se non è in cache, vai alla rete (importante per lo sviluppo)
                console.warn('SW: Asset locale non in cache, fetch dalla rete:', event.request.url);
                return fetch(event.request); 
            })
    );
  }
  
  // Per tutto il resto (es. richieste API, se ci fossero), lascia passare
  // return;
});
