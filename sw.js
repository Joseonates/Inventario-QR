/* Service worker de "Escáner Serial y MAC".
   Guarda la app en el dispositivo para que abra y funcione sin señal.
   Al publicar una versión nueva, sube el número de CACHE. */
var VERSION = "v2";
var SHELL_CACHE = "serial-mac-shell-" + VERSION;
var EXT_CACHE = "serial-mac-ext-" + VERSION;

var SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./favicon-32.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(SHELL_CACHE).then(function (c) {
      // addAll falla completo si un archivo falla; se agregan uno por uno.
      return Promise.all(SHELL.map(function (u) {
        return c.add(new Request(u, { cache: "reload" })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== SHELL_CACHE && k !== EXT_CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("message", function (e) {
  if (e.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  // Navegación: red primero, y si no hay señal se sirve la app guardada.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(SHELL_CACHE).then(function (c) { c.put("./index.html", copy); });
        return res;
      }).catch(function () {
        return caches.match("./index.html").then(function (r) {
          return r || caches.match("./");
        });
      })
    );
    return;
  }

  // Archivos propios: caché primero (la app no cambia entre versiones).
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(SHELL_CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        });
      })
    );
    return;
  }

  // Fuentes y librerías externas: se usan de la caché y se refrescan en segundo plano.
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname) || /cdnjs\.cloudflare\.com$/.test(url.hostname)) {
    e.respondWith(
      caches.open(EXT_CACHE).then(function (c) {
        return c.match(req).then(function (hit) {
          var net = fetch(req).then(function (res) {
            if (res) c.put(req, res.clone());
            return res;
          }).catch(function () { return hit; });
          return hit || net;
        });
      })
    );
  }
});
