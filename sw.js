// Service worker: makes the app open fast and work without internet, and saves data.
//
// App files: saved on install and served from the phone. The browser checks this file for
// changes when the app opens (a tiny download). IMPORTANT: when you change ANY app file
// (places.js, app.js, ...), change APP_VERSION below so phones download the new version.
//
// Map data: saved the first time you look at an area, then used from the phone.
// Nothing is downloaded in advance (map servers do not allow bulk downloads).

const APP_VERSION = "v6";
const APP_CACHE = "oaumap-app-" + APP_VERSION;
const TILE_CACHE = "oaumap-tiles-v1";
const MAX_TILE_ENTRIES = 4000;

const APP_FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "places.js",
  "router.js",
  "transport.js",
  "data/roads.js",
  "data/buildings.js",
  "data/campus.js",
  "manifest.webmanifest",
  "vendor/maplibre/maplibre-gl.js",
  "vendor/maplibre/maplibre-gl.css",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

// Map servers. Style and tile-index files change when the map is updated, so for those
// try the network first. Tiles, fonts and icons never change at the same address: phone first.
const MAP_HOSTS = ["tiles.openfreemap.org", "server.arcgisonline.com"];
const NETWORK_FIRST = (url) => url.hostname === "tiles.openfreemap.org" && (url.pathname.startsWith("/styles/") || /^\/planet\/?$/.test(url.pathname));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => (k.startsWith("oaumap-app-") && k !== APP_CACHE) || /^oaumap-tiles-v[0-9]$/.test(k) && k !== TILE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (MAP_HOSTS.includes(url.hostname)) {
    event.respondWith(NETWORK_FIRST(url) ? networkFirst(req) : cacheFirst(req));
    return;
  }

  if (url.origin === self.location.origin) {
    // App files: from the phone. Page loads with ?place=... still get index.html.
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).catch(() => caches.match("index.html")))
    );
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(TILE_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === "opaque") {
      cache.put(req, res.clone()).then(() => trim(cache));
    }
    return res;
  } catch (e) {
    return new Response("", { status: 504, statusText: "offline" });
  }
}

async function networkFirst(req) {
  const cache = await caches.open(TILE_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(req);
    return hit || new Response("", { status: 504, statusText: "offline" });
  }
}

let trimming = false;
async function trim(cache) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - MAX_TILE_ENTRIES; i++) await cache.delete(keys[i]);
  } finally {
    trimming = false;
  }
}
