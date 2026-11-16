// Service worker: deja la app disponible sin conexión. No maneja notificaciones.
const VERSION = 'repaso-v1';
const ARCHIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/db.js', 'js/engine.js', 'js/fechas.js', 'js/ics.js', 'js/parser.js',
  'js/ui/comun.js', 'js/ui/hoy.js', 'js/ui/sesion.js', 'js/ui/materias.js', 'js/ui/cronograma.js',
  'js/ui/semana.js', 'js/ui/ritmo.js', 'js/ui/ajustes.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Primero caché (funciona offline) y actualiza en segundo plano para la próxima apertura.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const guardado = await cache.match(req, { ignoreSearch: true });
      const red = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return guardado || (await red) || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
    }),
  );
});
