// Service worker : installation PWA + fonctionnement hors-ligne complet.
//
// Stratégie « réseau d'abord, repli sur le cache » pour la page et ses
// dépendances externes (Firebase, SheetJS) : quand la connexion est
// disponible, on charge toujours la version la plus récente (et on la
// remet en cache au passage) ; sans connexion, on sert la dernière
// version connue plutôt que d'échouer.
//
// Les requêtes vers Firestore/Firebase Auth (API en ligne) ne sont PAS
// interceptées ici — Firestore gère déjà sa propre persistance hors-ligne
// (IndexedDB) de son côté ; le service worker ne doit pas s'en mêler.

const CACHE_NAME = "frais-scolaires-v2.0.0";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) => {
          const options = url.startsWith("http") ? { mode: "no-cors" } : {};
          return fetch(url, options)
            .then((res) => cache.put(url, res))
            .catch(() => {}); // une ressource indisponible au premier chargement ne doit pas bloquer l'installation
        })
      )
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

function estRessourceApplicative(url) {
  if (url.origin === self.location.origin) return true; // index.html et assets locaux
  return PRECACHE_URLS.some((u) => u === url.href);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // On ne touche qu'aux requêtes GET pour l'app elle-même et ses librairies
  // externes précitées. Tout le reste (Firestore, Firebase Auth, appels
  // API) passe directement au réseau, sans interception.
  if (req.method !== "GET" || !estRessourceApplicative(url)) {
    return; // laisse le navigateur gérer normalement
  }

  event.respondWith(
    fetch(req, url.origin === self.location.origin ? {} : { mode: "no-cors" })
      .then((res) => {
        const copie = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copie)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || caches.match("./index.html"))
      )
  );
});
