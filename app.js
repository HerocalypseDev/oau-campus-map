/* OAU Campus Map
 * Map engine: MapLibre GL JS. Base map: OpenFreeMap (OpenStreetMap data). Satellite: Esri World Imagery.
 * Places: places.js. Roads for walking routes: data/roads.js (offline). Route finder: router.js.
 */
(function () {
  "use strict";

  // ---------- Small helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const words = (s) => String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const slug = (s) => words(s).join("-");
  const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content; };
  const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* ignore */ } };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  // ---------- Settings ----------
  const CENTER = [4.5225, 7.5185]; // [lng, lat]
  const MAX_BOUNDS = [[4.46, 7.46], [4.61, 7.59]];
  const WALK_M_PER_MIN = 80;   // normal walking speed, about 4.8 km/h
  const NEAR_CAMPUS_M = 1500;  // farther than this from any campus road = not on campus
  const GOOD_GPS_M = 20;
  const ARRIVE_M = 22;
  const OFF_ROUTE_M = 35;
  const STYLE_LIGHT = "https://tiles.openfreemap.org/styles/liberty";
  const STYLE_DARK = "https://tiles.openfreemap.org/styles/dark";
  const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
  const LABEL_FONT = ["Noto Sans Bold"];
  // Only editors can add places. Unlock by typing "editor:YOUR-CODE" in search. Only the SHA-256 hash is stored here.
  const EDITOR_CODE_HASH = "6c7e63dbba860e7243b778561f6cd988342dd3271cef69865e2c190bbef08277";
  const K = { settings: "oaumap.settings", saved: "oaumap.saved", recent: "oaumap.recent", mine: "oaumap.myPlaces", editor: "oaumap.editorOn", welcomed: "oaumap.welcomed" };

  const settings = Object.assign({
    theme: "auto",          // auto | light | dark
    mapType: "map",         // map | satellite
    threeD: false,
    dataSaver: !!(navigator.connection && navigator.connection.saveData),
    satWarned: false,
  }, store.get(K.settings, {}));
  const saveSettings = () => store.set(K.settings, settings);

  const darkMQ = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : { matches: false, addEventListener() {} };
  const isDark = () => settings.theme === "dark" || (settings.theme === "auto" && darkMQ.matches);

  // ---------- Places ----------
  const places = [];
  const byId = new Map();
  function registerPlace(p) {
    if (!CATEGORIES[p.cat]) { console.warn("Unknown category", p); return null; }
    p.id = p.id || slug(p.name);
    let id = p.id, n = 2;
    while (byId.has(id)) id = `${p.id}-${n++}`;
    p.id = id;
    places.push(p); byId.set(p.id, p);
    return p;
  }
  PLACES.forEach(registerPlace);
  let myPlaces = store.get(K.mine, []);
  myPlaces.forEach((p) => { p.mine = true; p.id = p.id || "my-" + slug(p.name); registerPlace(p); });

  let savedIds = new Set(store.get(K.saved, []));
  let recentIds = store.get(K.recent, []);
  const pushRecent = (p) => { recentIds = [p.id, ...recentIds.filter((x) => x !== p.id)].slice(0, 8); store.set(K.recent, recentIds); };

  // ---------- Router (built on first use) ----------
  let router = null;
  const getRouter = () => router || (router = new Router(window.ROADS || []));
  if ("requestIdleCallback" in window) requestIdleCallback(() => getRouter()); else setTimeout(getRouter, 1500);

  // ---------- Map ----------
  const SAT_STYLE = {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      sat: {
        type: "raster", tileSize: 256, maxzoom: 18,
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        attribution: "Imagery © Esri",
      },
      omt: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: "© OpenStreetMap contributors" },
    },
    layers: [
      { id: "sat", type: "raster", source: "sat" },
      {
        id: "sat-road-names", type: "symbol", source: "omt", "source-layer": "transportation_name", minzoom: 14,
        layout: { "symbol-placement": "line", "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 12 },
        paint: { "text-color": "#fff", "text-halo-color": "rgba(0,0,0,.8)", "text-halo-width": 1.5 },
      },
    ],
  };
  const styleFor = () => (settings.mapType === "satellite" ? SAT_STYLE : isDark() ? STYLE_DARK : STYLE_LIGHT);

  const map = new maplibregl.Map({
    container: "map",
    style: styleFor(),
    center: CENTER,
    zoom: 15.4,
    minZoom: 13,
    maxZoom: 19.5,
    maxPitch: 65,
    maxBounds: MAX_BOUNDS,
    attributionControl: false,
    fadeDuration: 150,
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: "Places & routes © OpenStreetMap contributors" }), "bottom-left");
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 80, unit: "metric" }), "bottom-left");
  // Show the map credits as a small (i) button instead of a long line of text.
  const collapseAttribution = () => {
    const a = document.querySelector(".maplibregl-ctrl-attrib");
    if (a) { a.classList.remove("maplibregl-compact-show"); a.removeAttribute("open"); }
  };
  map.on("load", collapseAttribution);
  map.on("styledata", collapseAttribution);

  function applyTheme() {
    document.body.classList.toggle("dark", isDark());
    $('meta[name="theme-color"]').setAttribute("content", isDark() ? "#202124" : "#1a73e8");
  }
  applyTheme();
  darkMQ.addEventListener && darkMQ.addEventListener("change", () => { if (settings.theme === "auto") { applyTheme(); setMapStyle(); } });

  let currentStyleKey = null;
  function setMapStyle() {
    const key = settings.mapType === "satellite" ? "sat" : isDark() ? "dark" : "light";
    if (key === currentStyleKey) return;
    currentStyleKey = key;
    map.setStyle(styleFor(), { diff: false }); // full reload so "style.load" fires and our layers are re-added
  }
  currentStyleKey = settings.mapType === "satellite" ? "sat" : isDark() ? "dark" : "light";

  // Our own layers. They are added again every time the map style changes.
  map.on("style.load", addAppLayers);
  map.on("styleimagemissing", (e) => {
    if (!map.hasImage(e.id)) map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
  });

  function firstSymbolLayer() {
    const l = map.getStyle().layers.find((x) => x.type === "symbol");
    return l && l.id;
  }

  function buildingsGeoJSON() {
    const feats = [];
    for (const p of places) {
      for (const id of p.osm || []) {
        const ring = (window.BUILDINGS || {})[id];
        if (!ring) continue;
        const coords = ring.map(([la, ln]) => [ln, la]);
        if (coords.length && (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])) coords.push(coords[0]);
        feats.push({ type: "Feature", properties: { id: p.id, cat: p.cat, color: CATEGORIES[p.cat].color }, geometry: { type: "Polygon", coordinates: [coords] } });
      }
    }
    return { type: "FeatureCollection", features: feats };
  }

  const CAT_RANK = { landmark: 1, gate: 2, hostel: 3, faculty: 4, lecture: 5, sport: 6, service: 7 };
  function labelsGeoJSON() {
    return {
      type: "FeatureCollection",
      features: places.filter(isVisible).map((p) => ({
        type: "Feature",
        properties: { id: p.id, name: p.name, rank: (CAT_RANK[p.cat] || 9) + (selected && selected.id === p.id ? -10 : 0) },
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      })),
    };
  }

  const EMPTY = { type: "FeatureCollection", features: [] };

  function addAppLayers() {
    const before = firstSymbolLayer();
    const sat = settings.mapType === "satellite";
    const dark = isDark() || sat;

    map.addSource("oau-campus", {
      type: "geojson",
      data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: (window.CAMPUS || []).map(([la, ln]) => [ln, la]) } },
    });
    map.addLayer({
      id: "oau-campus", type: "line", source: "oau-campus",
      paint: { "line-color": sat ? "#ffd54f" : "#1a73e8", "line-opacity": 0.55, "line-width": 2, "line-dasharray": [3, 2] },
    }, before);

    map.addSource("oau-buildings", { type: "geojson", data: buildingsGeoJSON() });
    map.addLayer({ id: "oau-bfill", type: "fill", source: "oau-buildings", paint: { "fill-color": ["get", "color"], "fill-opacity": sat ? 0.35 : dark ? 0.42 : 0.25 } }, before);
    map.addLayer({ id: "oau-bline", type: "line", source: "oau-buildings", paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 15, 1, 18, 2.5] } }, before);
    map.addLayer({
      id: "oau-b3d", type: "fill-extrusion", source: "oau-buildings",
      layout: { visibility: settings.threeD ? "visible" : "none" },
      paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-height": 14, "fill-extrusion-opacity": 0.85 },
    }, before);

    map.addSource("oau-acc", { type: "geojson", data: EMPTY });
    map.addLayer({ id: "oau-acc", type: "fill", source: "oau-acc", paint: { "fill-color": "#1a73e8", "fill-opacity": 0.12 } }, before);
    map.addLayer({ id: "oau-acc-line", type: "line", source: "oau-acc", paint: { "line-color": "#1a73e8", "line-opacity": 0.35, "line-width": 1 } }, before);

    map.addSource("oau-route", { type: "geojson", data: EMPTY });
    map.addSource("oau-route-links", { type: "geojson", data: EMPTY });
    const w = (a, b) => ["interpolate", ["linear"], ["zoom"], 14, a, 18, b];
    map.addLayer({ id: "oau-route-links", type: "line", source: "oau-route-links", layout: { "line-cap": "round" }, paint: { "line-color": "#4285f4", "line-width": w(2, 4), "line-dasharray": [0.1, 2] } }, before);
    map.addLayer({ id: "oau-route-casing", type: "line", source: "oau-route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#1557b0", "line-width": w(6, 13) } }, before);
    map.addLayer({ id: "oau-route", type: "line", source: "oau-route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#4285f4", "line-width": w(4, 9) } }, before);

    map.addSource("oau-labels", { type: "geojson", data: labelsGeoJSON() });
    map.addLayer({
      id: "oau-labels", type: "symbol", source: "oau-labels", minzoom: 15,
      layout: {
        "text-field": ["get", "name"], "text-font": LABEL_FONT,
        "text-size": ["interpolate", ["linear"], ["zoom"], 15, 11, 18, 14],
        "text-max-width": 9, "symbol-sort-key": ["get", "rank"],
        "text-variable-anchor-offset": ["left", [1.3, -1.4], "right", [-1.3, -1.4], "top", [0, 0.3]],
      },
      paint: {
        "text-color": dark ? "#f1f3f4" : "#202124",
        "text-halo-color": dark ? "rgba(0,0,0,.85)" : "rgba(255,255,255,.95)",
        "text-halo-width": 1.6,
      },
    });

    if (!settings.threeD) setBaseBuilding3D(false);
    refreshRoute();
    refreshAccuracy();
  }

  function setBaseBuilding3D(on) {
    if (map.getLayer("building-3d")) map.setLayoutProperty("building-3d", "visibility", on ? "visible" : "none");
    if (map.getLayer("oau-b3d")) map.setLayoutProperty("oau-b3d", "visibility", on ? "visible" : "none");
  }

  const setData = (id, data) => { const s = map.getSource(id); if (s) s.setData(data); };

  // ---------- Pins (HTML markers: crisp icons, survive style changes) ----------
  const markers = new Map(); // id -> { marker, el }
  let selected = null;
  let catFilter = null;      // category key, "saved", or null
  const isVisible = (p) => !catFilter || (catFilter === "saved" ? savedIds.has(p.id) : p.cat === catFilter);

  function addMarker(p) {
    const cat = CATEGORIES[p.cat];
    const el = document.createElement("div");
    el.className = "mk" + (p.mine ? " mine" : "");
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", p.name);
    el.innerHTML = `<div class="pin" style="--c:${cat.color}"><i>${cat.icon}</i></div>`;
    el.addEventListener("click", (e) => { e.stopPropagation(); openPlace(p, { fly: false }); });
    const marker = new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, -6] }).setLngLat([p.lng, p.lat]).addTo(map);
    markers.set(p.id, { marker, el });
  }
  places.forEach(addMarker);

  // Pins that would sit on top of a more important pin become small dots until you zoom in.
  function refreshMarkers() {
    const allTiny = map.getZoom() < 14.8;
    const placed = [];
    const order = [...places].sort((a, b) => (selected === a ? -1 : selected === b ? 1 : (CAT_RANK[a.cat] || 9) - (CAT_RANK[b.cat] || 9)));
    for (const p of order) {
      const m = markers.get(p.id);
      if (!m) continue;
      const vis = isVisible(p);
      m.el.hidden = !vis;
      const isSel = !!(selected && selected.id === p.id);
      let tiny = allTiny && !isSel;
      if (vis && !tiny) {
        const pt = map.project([p.lng, p.lat]);
        if (!isSel && placed.some((q) => Math.abs(q.x - pt.x) < 26 && Math.abs(q.y - pt.y) < 30)) tiny = true;
        else placed.push(pt);
      }
      m.el.classList.toggle("tiny", tiny);
      m.el.classList.toggle("sel", isSel);
      m.el.style.zIndex = isSel ? 5 : tiny ? 0 : 1;
    }
    setData("oau-labels", labelsGeoJSON());
  }
  map.on("zoomend", refreshMarkers);
  map.on("rotateend", refreshMarkers);
  map.on("pitchend", refreshMarkers);
  refreshMarkers();

  function setCatFilter(f) {
    catFilter = f;
    document.querySelectorAll("#chips .chip").forEach((c) => c.classList.toggle("on", c.dataset.cat === f));
    refreshMarkers();
  }

  // ---------- Camera helpers ----------
  let sheetH = 0;
  // Keeps the important part of the map clear of the search bar and the sheet.
  // While navigating, your dot sits low on the screen so you see more of the road ahead.
  const pad = () => nav
    ? { top: Math.round(innerHeight * 0.42), bottom: Math.min(sheetH, innerHeight * 0.5) + 20, left: 40, right: 40 }
    : { top: 120, bottom: Math.min(sheetH, innerHeight * 0.6) + 20, left: 40, right: 40 };
  function flyToPlace(p, zoom) {
    map.easeTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), zoom || 17.2), padding: pad(), duration: 700 });
  }
  function fitCoords(coords, maxZoom) {
    if (!coords.length) return;
    const b = new maplibregl.LngLatBounds(coords[0], coords[0]);
    coords.forEach((c) => b.extend(c));
    map.fitBounds(b, { padding: pad(), maxZoom: maxZoom || 17.5, duration: 700 });
  }

  // ---------- Bottom sheet ----------
  const sheet = $("#sheet"), sheetBody = $("#sheet-body"), fabs = $("#fabs");
  sheetBody.style.position = "relative";
  const stack = [];

  function showView(view, opts = {}) {
    if (!opts.push) while (stack.length) { const v = stack.pop(); v.leave && v.leave(); }
    else if (stack.length) { const top = stack[stack.length - 1]; top.leave && top.leave(true); }
    stack.push(view);
    renderTop(opts.snap || "peek");
    view.enter && view.enter(); // after the sheet has its height, so the map can fit around it
  }
  function renderTop(snap) {
    const view = stack[stack.length - 1];
    sheetBody.innerHTML = "";
    sheetBody.appendChild(view.render());
    sheet.hidden = false;
    sheetBody.scrollTop = 0;
    const hs = snapHeights(); // reading layout here gives the real height straight away
    setSheetHeight(hs[snap] || hs.peek);
  }
  function rerender() {
    if (!stack.length) return;
    const st = sheetBody.scrollTop, cur = sheet.offsetHeight;
    sheetBody.innerHTML = "";
    sheetBody.appendChild(stack[stack.length - 1].render());
    sheetBody.scrollTop = st;
    const hs = snapHeights();
    setSheetHeight(Math.min(Math.max(cur, hs.peek), hs.full));
  }
  function back() {
    const v = stack.pop();
    v && v.leave && v.leave();
    if (stack.length) { const top = stack[stack.length - 1]; top.enter && top.enter(true); renderTop("peek"); }
    else hideSheet();
  }
  function closeSheet() {
    while (stack.length) { const v = stack.pop(); v.leave && v.leave(); }
    hideSheet();
  }
  function hideSheet() {
    sheet.hidden = true;
    setSheetHeight(0);
  }
  function snapHeights() {
    const handle = 16;
    const pe = sheetBody.querySelector(".peek-end");
    const content = handle + sheetBody.scrollHeight + 8;
    const peek = Math.min(handle + (pe ? pe.offsetTop + pe.offsetHeight : 180) + 14, content);
    const full = Math.min(innerHeight - 70, content);
    const half = Math.min(Math.max(innerHeight * 0.5, peek), full);
    return { peek, half, full };
  }
  function setSheetHeight(px) {
    sheetH = px;
    if (px > 0) sheet.style.height = px + "px";
    const tall = px > innerHeight * 0.6;
    fabs.style.bottom = `calc(var(--safe-bottom) + ${px > 0 ? px + 12 : 24}px)`;
    fabs.style.opacity = tall ? 0 : 1;
    fabs.style.pointerEvents = tall ? "none" : "";
  }

  // Drag the sheet by its handle or header.
  (function enableSheetDrag() {
    let startY = 0, startH = 0, lastY = 0, lastT = 0, vel = 0, dragging = false;
    sheet.addEventListener("pointerdown", (e) => {
      if (!e.target.closest(".sheet-handle, .head, .nav-stats, .summary")) return;
      if (e.target.closest("button, a, input, select")) return;
      dragging = true; startY = lastY = e.clientY; startH = sheet.offsetHeight; lastT = e.timeStamp; vel = 0;
      sheet.classList.add("dragging");
      sheet.setPointerCapture(e.pointerId);
    });
    sheet.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const hs = snapHeights();
      const nh = Math.max(60, Math.min(hs.full, startH - (e.clientY - startY)));
      vel = (e.clientY - lastY) / Math.max(1, e.timeStamp - lastT);
      lastY = e.clientY; lastT = e.timeStamp;
      setSheetHeight(nh);
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      sheet.classList.remove("dragging");
      const hs = snapHeights(), cur = sheet.offsetHeight;
      if (Math.abs(e.clientY - startY) < 6) { // tap on handle: toggle
        setSheetHeight(cur < hs.half - 5 ? hs.half : hs.peek);
        return;
      }
      const top = stack[stack.length - 1];
      if ((cur < hs.peek * 0.65 || vel > 1.2 && cur < hs.peek + 30) && top && top.closable !== false) { closeSheet(); return; }
      const opts = [hs.peek, hs.half, hs.full];
      let target;
      if (vel < -0.6) target = opts.find((x) => x > cur + 10) || hs.full;
      else if (vel > 0.6) target = [...opts].reverse().find((x) => x < cur - 10) || hs.peek;
      else target = opts.reduce((a, b) => (Math.abs(b - cur) < Math.abs(a - cur) ? b : a));
      setSheetHeight(target);
    };
    sheet.addEventListener("pointerup", end);
    sheet.addEventListener("pointercancel", end);
  })();

  // ---------- Toast & dialogs ----------
  const toastEl = $("#toast");
  let toastTimer;
  function toast(msg, ms) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms || 3500);
  }
  function ask({ title, text, ok = "OK", cancel = "Cancel" }) {
    return new Promise((resolve) => {
      const wrap = document.createElement("div");
      wrap.id = "dialog";
      wrap.style.cssText = "position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.45);display:grid;place-items:center;padding:20px";
      wrap.innerHTML = `<div class="welcome-card" role="dialog" aria-modal="true" style="text-align:left;max-width:380px">
        <h1 style="margin-top:0">${esc(title)}</h1><p style="color:var(--muted);line-height:1.5">${esc(text)}</p>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          ${cancel ? `<button class="btn" data-r="0">${esc(cancel)}</button>` : ""}<button class="btn primary" data-r="1">${esc(ok)}</button></div></div>`;
      wrap.addEventListener("click", (e) => {
        const b = e.target.closest("[data-r]");
        if (b || e.target === wrap) { wrap.remove(); resolve(!!(b && b.dataset.r === "1")); }
      });
      document.body.appendChild(wrap);
    });
  }

  // ---------- Formatting ----------
  const fmtDist = (m) => (m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`);
  const mins = (m) => Math.max(1, Math.round(m / WALK_M_PER_MIN));
  const fmtMins = (n) => (n < 60 ? `${n} min` : `${Math.floor(n / 60)} h ${n % 60} min`);
  const clock = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const straight = (a, b) => Router.dist(a.lat, a.lng, b.lat, b.lng);
  const estWalk = (m) => mins(m * 1.3); // straight line -> rough walking time

  const ICON = {
    dir: '<svg viewBox="0 0 24 24"><path d="M12 2l10 10-10 10L2 12z"/><path d="M9 14v-2a2 2 0 0 1 2-2h4M13 8l2 2-2 2"/></svg>',
    save: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
    saved: '<svg viewBox="0 0 24 24"><path class="fill" d="M6 3h12v18l-6-4-6 4z"/></svg>',
    share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/></svg>',
    start: '<svg viewBox="0 0 24 24"><path class="fill" d="M12 2l7.5 19-7.5-4.5L4.5 21z"/></svg>',
    from: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    swap: '<svg viewBox="0 0 24 24"><path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
    ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  };
  const TURN = {
    depart: '<svg viewBox="0 0 24 24"><path d="M12 20V5M6 11l6-6 6 6"/></svg>',
    straight: '<svg viewBox="0 0 24 24"><path d="M12 20V5M6 11l6-6 6 6"/></svg>',
    left: '<svg viewBox="0 0 24 24"><path d="M17 21v-7a4 4 0 0 0-4-4H5M9 6l-4 4 4 4"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="M7 21v-7a4 4 0 0 1 4-4h8M15 6l4 4-4 4"/></svg>',
    "slight-left": '<svg viewBox="0 0 24 24"><path d="M15 21v-7L8 7M8 13V7h6"/></svg>',
    "slight-right": '<svg viewBox="0 0 24 24"><path d="M9 21v-7l7-7M16 13V7h-6"/></svg>',
    "sharp-left": '<svg viewBox="0 0 24 24"><path d="M17 3v9L7 19M7 13v6h6"/></svg>',
    "sharp-right": '<svg viewBox="0 0 24 24"><path d="M7 3v9l10 7M17 13v6h-6"/></svg>',
    arrive: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5" class="fill"/></svg>',
  };

  const badge = (p) => `<span class="badge" style="background:${CATEGORIES[p.cat].color}22">${CATEGORIES[p.cat].icon}</span>`;

  function placeRow(p, sub, right) {
    return `<button class="row" data-place="${esc(p.id)}">${badge(p)}<span class="grow"><div class="name">${esc(p.name)}</div><div class="sub">${sub || esc(CATEGORIES[p.cat].label)}</div></span>${right ? `<span class="right">${right}</span>` : ""}</button>`;
  }
  function distSub(p) {
    if (!myPos) return esc(CATEGORIES[p.cat].label);
    const d = straight(myPos, p);
    return `${esc(CATEGORIES[p.cat].label)} · ${fmtDist(d)}`;
  }
  function bindRows(root, onPick) {
    root.querySelectorAll("[data-place]").forEach((b) => b.addEventListener("click", () => {
      const p = byId.get(b.dataset.place);
      if (p) onPick(p);
    }));
  }

  // ---------- Place details ----------
  function walkFromMe(p) {
    if (!myPos) return null;
    const r = getRouter().route(myPos.lat, myPos.lng, p.lat, p.lng, p.name);
    if (!r || r.startSnap.off > NEAR_CAMPUS_M) return null;
    return r.meters + r.startSnap.off + r.endSnap.off;
  }

  function placeView(p) {
    return {
      enter() { selected = p; refreshMarkers(); },
      leave() { if (selected === p) { selected = null; refreshMarkers(); } },
      render() {
        const cat = CATEGORIES[p.cat];
        const walk = walkFromMe(p);
        const isSaved = savedIds.has(p.id);
        const nearby = places.filter((q) => q !== p).map((q) => [q, straight(p, q)]).sort((a, b) => a[1] - b[1]).slice(0, 5);
        const frag = h(`<div>
          <div class="head">
            ${stack.length > 1 ? `<button class="icon-btn" data-act="back" aria-label="Back">${ICON.back}</button>` : ""}
            <div class="grow">
              <h2>${esc(p.name)}</h2>
              <div class="meta"><span class="dot" style="background:${cat.color}"></span>${esc(cat.label)}${p.mine ? " · added by you" : ""}</div>
              ${p.aka ? `<div class="aka">Also: ${esc(p.aka)}</div>` : ""}
              <div class="walk">${walk != null ? `🚶 <b>${fmtMins(mins(walk))}</b> walk · ${fmtDist(walk)} from you` : myPos ? "" : `<span style="color:var(--muted)">Turn on location to see walking time</span>`}</div>
            </div>
            <button class="icon-btn close-x" data-act="close" aria-label="Close">${ICON.close}</button>
          </div>
          <div class="actions peek-end">
            <button class="btn primary" data-act="dir">${ICON.dir}Directions</button>
            ${myPos ? `<button class="btn" data-act="start">${ICON.start}Start</button>` : ""}
            <button class="btn" data-act="save">${isSaved ? ICON.saved + "Saved" : ICON.save + "Save"}</button>
            <button class="btn" data-act="share">${ICON.share}Share</button>
          </div>
          ${p.info ? `<div class="section"><div class="info">${esc(p.info)}</div></div>` : ""}
          <div class="section">
            <div class="section-title">Nearby</div>
            <div class="list">${nearby.map(([q, d]) => placeRow(q, `${esc(CATEGORIES[q.cat].label)} · ${fmtDist(d)}`, `~${estWalk(d)} min`)).join("")}</div>
          </div>
          <div class="section">
            <button class="kv" data-act="from">${ICON.from}<span>Directions from here</span></button>
            <button class="kv" data-act="copy">${ICON.pin}<span>${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</span></button>
            <a class="kv" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noopener">${ICON.ext}<span>Open in Google Maps</span></a>
            ${p.mine && isEditor() ? `<button class="kv danger" data-act="delete">${ICON.trash}<span>Delete this place</span></button>` : ""}
          </div>
        </div>`);
        const root = frag.firstElementChild;
        root.addEventListener("click", (e) => {
          const b = e.target.closest("[data-act]");
          if (!b) return;
          const act = b.dataset.act;
          if (act === "close") closeSheet();
          else if (act === "back") back();
          else if (act === "dir") openDirections(ME, p);
          else if (act === "start") { openDirections(ME, p); startNav(); }
          else if (act === "from") openDirections(p, null);
          else if (act === "save") toggleSaved(p, b);
          else if (act === "share") sharePlace(p);
          else if (act === "copy") copyText(`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`, "Coordinates copied");
          else if (act === "delete") deleteMyPlace(p);
        });
        bindRows(root, (q) => openPlace(q, { push: true }));
        return root;
      },
    };
  }

  function openPlace(p, opts = {}) {
    if (nav) return;
    closeSearch();
    pushRecent(p);
    if (catFilter && !isVisible(p)) setCatFilter(null);
    showView(placeView(p), { push: !!opts.push });
    if (opts.fly !== false) flyToPlace(p);
    else {
      // Keep the place visible above the sheet.
      const pt = map.project([p.lng, p.lat]);
      if (pt.y > innerHeight - sheetH - 40 || pt.y < 110) flyToPlace(p, map.getZoom());
    }
    buzz(8);
  }

  function toggleSaved(p, btn) {
    if (savedIds.has(p.id)) savedIds.delete(p.id); else savedIds.add(p.id);
    store.set(K.saved, [...savedIds]);
    const on = savedIds.has(p.id);
    btn.innerHTML = on ? ICON.saved + "Saved" : ICON.save + "Save";
    toast(on ? `Saved "${p.name}"` : "Removed from saved");
    buzz(10);
  }

  function appUrl(params) {
    const u = new URL(location.href);
    u.search = new URLSearchParams(params).toString();
    u.hash = "";
    return u.toString();
  }
  async function shareText(title, text, url) {
    try {
      if (navigator.share) { await navigator.share({ title, text, url }); return; }
    } catch (e) { if (e.name === "AbortError") return; }
    copyText(url ? `${text}\n${url}` : text, "Copied. Paste it in WhatsApp or anywhere.");
  }
  function sharePlace(p) {
    shareText(p.name, `${p.name} – OAU Campus Map\nGoogle Maps: https://maps.google.com/?q=${p.lat},${p.lng}`, appUrl({ place: p.id }));
  }
  async function copyText(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg || "Copied"); }
    catch (e) { window.prompt("Copy this:", text); }
  }

  // ---------- Category list ----------
  function listView(key) {
    const isSavedList = key === "saved";
    const title = isSavedList ? "Saved places" : CATEGORIES[key].label;
    return {
      enter(again) {
        setCatFilter(key);
        if (!again) {
          const ps = places.filter((p) => (isSavedList ? savedIds.has(p.id) : p.cat === key));
          if (ps.length) fitCoords(ps.map((p) => [p.lng, p.lat]), 16.5);
        }
      },
      leave(keep) { if (!keep) setCatFilter(null); },
      render() {
        let ps = places.filter((p) => (isSavedList ? savedIds.has(p.id) : p.cat === key));
        ps = myPos ? ps.sort((a, b) => straight(myPos, a) - straight(myPos, b)) : ps.sort((a, b) => a.name.localeCompare(b.name));
        const frag = h(`<div>
          <div class="head"><div class="grow"><h2>${esc(title)}</h2><div class="meta">${ps.length} place${ps.length === 1 ? "" : "s"}${myPos ? " · nearest first" : ""}</div></div>
          <button class="icon-btn close-x" data-act="close" aria-label="Close">${ICON.close}</button></div>
          <div class="peek-end" style="height:4px"></div>
          <div class="list" style="margin-top:6px">${ps.length ? ps.map((p) => placeRow(p, distSub(p), myPos ? `~${estWalk(straight(myPos, p))} min` : "")).join("") : `<div class="empty">${isSavedList ? "No saved places yet. Open a place and tap Save." : "Nothing here yet."}</div>`}</div>
        </div>`);
        const root = frag.firstElementChild;
        root.querySelector("[data-act=close]").addEventListener("click", closeSheet);
        bindRows(root, (p) => openPlace(p, { push: true }));
        return root;
      },
    };
  }
  function openList(key) {
    if (nav) return;
    if (catFilter === key && stack.length) { closeSheet(); return; }
    showView(listView(key), { snap: "half" });
  }

  // Category chips under the search bar
  const chipsEl = $("#chips");
  chipsEl.innerHTML = Object.entries(CATEGORIES).map(([k, c]) => `<button class="chip" data-cat="${k}"><span class="em">${c.icon}</span>${esc(c.label)}</button>`).join("")
    + `<button class="chip" data-cat="saved"><span class="em">🔖</span>Saved</button>`;
  chipsEl.addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) openList(c.dataset.cat); });

  // ---------- Search ----------
  const searchEl = $("#search"), panel = $("#searchpanel"), content = $("#search-content");
  const backBtn = $("#search-back"), clearBtn = $("#search-clear");
  let pickFor = null; // null | "from" | "to"  (choosing a directions end point)

  function lev1(a, b) { // true if edit distance <= 1
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  }
  function score(p, q) {
    const qn = norm(q);
    if (!qn) return 0;
    const n = norm(p.name), a = norm(p.aka || "");
    const nw = words(p.name), aw = words(p.aka || "");
    if (n === qn) return 100;
    if (n.startsWith(qn)) return 92;
    if (nw.some((w) => w.startsWith(qn))) return 85;
    if (aw.some((w) => w === qn)) return 84;
    if (aw.some((w) => w.startsWith(qn))) return 78;
    if (n.includes(qn)) return 72;
    if (a.includes(qn)) return 65;
    const qt = words(q);
    if (qt.length > 1 && qt.every((t) => nw.concat(aw).some((w) => w.startsWith(t)))) return 75;
    if (qn.length >= 4 && nw.concat(aw).some((w) => lev1(w.slice(0, qn.length), qn) || lev1(w, qn))) return 40;
    if (CATEGORIES[p.cat].label.toLowerCase().startsWith(q.toLowerCase().trim())) return 30;
    return 0;
  }
  function highlight(name, q) {
    const i = name.toLowerCase().indexOf(q.toLowerCase().trim());
    if (!q.trim() || i < 0) return esc(name);
    const L = q.trim().length;
    return esc(name.slice(0, i)) + "<mark>" + esc(name.slice(i, i + L)) + "</mark>" + esc(name.slice(i + L));
  }

  function openSearch(mode) {
    pickFor = mode || null;
    document.body.classList.add("searching");
    panel.hidden = false;
    backBtn.hidden = false;
    searchEl.placeholder = pickFor === "from" ? "Choose start point" : pickFor === "to" ? "Choose destination" : "Search OAU";
    if (mode) { $("#top").style.display = "block"; searchEl.value = ""; }
    renderSearch();
    searchEl.focus();
  }
  function closeSearch() {
    if (panel.hidden) return;
    panel.hidden = true;
    backBtn.hidden = true;
    document.body.classList.remove("searching");
    searchEl.value = "";
    clearBtn.hidden = true;
    searchEl.placeholder = "Search OAU";
    searchEl.blur();
    $("#top").style.display = "";
    pickFor = null;
  }

  function choose(p) { // p: place or ME
    const mode = pickFor;
    closeSearch();
    if (mode) { setDirEnd(mode, p); return; }
    if (p !== ME) openPlace(p);
  }

  function renderSearch() {
    const q = searchEl.value;
    clearBtn.hidden = !q;
    let html = "";
    if (q.trim().toLowerCase().startsWith("editor:")) {
      html = `<div class="empty">Press Enter to check the editor code.</div>`;
    } else if (q.trim()) {
      const hits = places.map((p) => [p, score(p, q)]).filter((x) => x[1] > 0)
        .sort((a, b) => b[1] - a[1] || (myPos ? straight(myPos, a[0]) - straight(myPos, b[0]) : a[0].name.localeCompare(b[0].name)))
        .slice(0, 25).map((x) => x[0]);
      html = hits.length
        ? `<div class="list">${hits.map((p) => `<button class="row" data-place="${esc(p.id)}">${badge(p)}<span class="grow"><div class="name">${highlight(p.name, q)}</div><div class="sub">${distSub(p)}</div></span></button>`).join("")}</div>`
        : `<div class="empty">No place called “${esc(q)}”.<br>Try another spelling, or browse a category.</div>`;
    } else {
      if (pickFor) {
        html += `<div class="sp-section"><button class="row" data-me="1"><span class="badge" style="background:#1a73e822">📍</span><span class="grow"><div class="name">Your location</div><div class="sub">${myPos ? "Using GPS" : "Waiting for GPS…"}</div></span></button></div>`;
      } else {
        html += `<div class="sp-section"><div class="sp-cats">${Object.entries(CATEGORIES).map(([k, c]) =>
          `<button class="sp-cat" data-cat="${k}"><span class="circle" style="background:${c.color}22">${c.icon}</span>${esc(c.label.split(" ")[0])}</button>`).join("")}
          <button class="sp-cat" data-cat="saved"><span class="circle" style="background:#fbbc0433">🔖</span>Saved</button></div></div>`;
      }
      const recent = recentIds.map((id) => byId.get(id)).filter(Boolean);
      if (recent.length) html += `<div class="sp-section"><div class="sp-title">Recent</div><div class="list">${recent.map((p) => placeRow(p, distSub(p), "🕘")).join("")}</div></div>`;
      if (myPos) {
        const near = [...places].sort((a, b) => straight(myPos, a) - straight(myPos, b)).slice(0, 5);
        html += `<div class="sp-section"><div class="sp-title">Near you</div><div class="list">${near.map((p) => placeRow(p, distSub(p), `~${estWalk(straight(myPos, p))} min`)).join("")}</div></div>`;
      }
    }
    content.innerHTML = html;
    bindRows(content, choose);
    content.querySelectorAll("[data-cat]").forEach((b) => b.addEventListener("click", () => { closeSearch(); openList(b.dataset.cat); }));
    const me = content.querySelector("[data-me]");
    if (me) me.addEventListener("click", () => choose(ME));
  }

  searchEl.addEventListener("focus", () => { if (panel.hidden) openSearch(null); });
  searchEl.addEventListener("input", renderSearch);
  searchEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const v = searchEl.value.trim();
      if (/^editor:/i.test(v)) { tryEditorCode(v.slice(7).trim()); return; }
      const first = content.querySelector("[data-place]");
      if (first) first.click();
    }
    if (e.key === "Escape") closeSearch();
  });
  backBtn.addEventListener("click", () => { const wasPick = pickFor; closeSearch(); if (wasPick && dirState) rerender(); });
  clearBtn.addEventListener("click", () => { searchEl.value = ""; renderSearch(); searchEl.focus(); });

  // ---------- Directions ----------
  const ME = { id: "__me", name: "Your location" };
  let dirState = null;   // { from, to, route }

  function endCoords(x) {
    if (x === ME) return myPos ? { lat: myPos.lat, lng: myPos.lng } : null;
    return x ? { lat: x.lat, lng: x.lng } : null;
  }

  function computeRoute() {
    const st = dirState;
    st.route = null; st.error = null;
    const a = endCoords(st.from), b = endCoords(st.to);
    if (!st.from || !st.to) { st.error = st.from ? "Choose a destination." : "Choose a start point."; return; }
    if (!a || !b) { st.error = "Waiting for your location… Make sure Location is on."; return; }
    if (st.from === st.to) { st.error = "Start and destination are the same."; return; }
    const r = getRouter().route(a.lat, a.lng, b.lat, b.lng, st.to === ME ? "your location" : st.to.name);
    if (!r) { st.error = "Sorry, no walking route found."; return; }
    if (st.from === ME && r.startSnap.off > NEAR_CAMPUS_M) { st.error = "You are not near OAU campus. Choose a start point on campus."; return; }
    if (st.to === ME && r.endSnap.off > NEAR_CAMPUS_M) { st.error = "You are not near OAU campus."; return; }
    r.total = r.meters + r.startSnap.off + r.endSnap.off;
    st.route = r;
  }

  function refreshRoute() {
    if (!map.getSource("oau-route")) return;
    const r = (nav && nav.route) || (dirState && dirState.route);
    if (!r) { setData("oau-route", EMPTY); setData("oau-route-links", EMPTY); return; }
    const a = nav ? myPos : endCoords(dirState.from), b = nav ? nav.dest : endCoords(dirState.to);
    setData("oau-route", { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: r.path.map(([la, ln]) => [ln, la]) } });
    const links = [];
    if (a) links.push([[a.lng, a.lat], [r.startSnap.lng, r.startSnap.lat]]);
    if (b) links.push([[r.endSnap.lng, r.endSnap.lat], [b.lng, b.lat]]);
    setData("oau-route-links", { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: links } });
  }

  function mainVia(r) {
    const totals = {};
    r.steps.forEach((s) => { if (s.label && !/^the /.test(s.label)) totals[s.label] = (totals[s.label] || 0) + s.dist; });
    const best = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
    return best ? `via ${best[0]}` : "via campus paths";
  }

  function dirView() {
    return {
      closable: true,
      enter() { document.body.classList.add("directions"); },
      leave() { document.body.classList.remove("directions"); if (!nav) { dirState = null; refreshRoute(); } },
      render() {
        const st = dirState, r = st.route;
        const endName = (x) => (x === ME ? "Your location" : x ? x.name : "Choose…");
        const endDot = (x) => (x === ME ? "#1a73e8" : x ? CATEGORIES[x.cat].color : "#bbb");
        const canStart = r && st.from === ME;
        const frag = h(`<div>
          <div class="head" style="padding-bottom:6px">
            <div class="grow"><h2 style="font-size:18px">Walking directions</h2></div>
            <button class="icon-btn close-x" data-act="close" aria-label="Close">${ICON.close}</button>
          </div>
          <div class="dir-box">
            <div class="dir-fields">
              <button class="dir-field" data-act="pick-from"><span class="pin-dot" style="background:${endDot(st.from)}"></span><span class="lbl">From</span><span class="val">${esc(endName(st.from))}</span></button>
              <button class="dir-field" data-act="pick-to"><span class="pin-dot" style="background:${endDot(st.to)}"></span><span class="lbl">To</span><span class="val">${esc(endName(st.to))}</span></button>
            </div>
            <button class="icon-btn" data-act="swap" aria-label="Swap start and destination">${ICON.swap}</button>
          </div>
          ${r ? `
          <div class="summary"><span class="big">${fmtMins(mins(r.total))}</span><span class="small">(${fmtDist(r.total)})</span>${st.from === ME ? `<span class="small">· arrive ${clock(new Date(Date.now() + mins(r.total) * 60000))}</span>` : ""}</div>
          <div class="via">${esc(mainVia(r))} · 🚶 walking</div>
          <div class="actions peek-end">
            ${canStart ? `<button class="btn primary" data-act="start">${ICON.start}Start</button>` : `<button class="btn primary" data-act="start-me" ${myPos ? "" : "disabled"}>${ICON.start}Start from my location</button>`}
            <button class="btn" data-act="steps">Steps</button>
            <button class="btn" data-act="share">${ICON.share}Share</button>
          </div>
          <div class="section"><ol class="steps">${r.steps.map((s, i) => `<li data-step="${i}"><span class="maneuver">${TURN[s.type] || TURN.straight}</span><span class="txt">${esc(s.text)}${s.dist ? `<div class="d">${fmtDist(s.dist)}</div>` : ""}</span></li>`).join("")}</ol>
          <p class="info" style="color:var(--muted);font-size:12px">Routes use paths mapped on OpenStreetMap. Some shortcuts may be missing.</p></div>`
          : `<div class="info peek-end" style="padding:16px 18px;color:var(--muted)">${esc(st.error || "")}</div>`}
        </div>`);
        const root = frag.firstElementChild;
        root.addEventListener("click", (e) => {
          const step = e.target.closest("[data-step]");
          if (step && r) {
            const s = r.steps[+step.dataset.step];
            const [la, ln] = r.path[Math.min(s.index, r.path.length - 1)];
            map.easeTo({ center: [ln, la], zoom: 18, padding: pad(), duration: 600 });
            setSheetHeight(snapHeights().peek);
            return;
          }
          const b = e.target.closest("[data-act]");
          if (!b) return;
          const act = b.dataset.act;
          if (act === "close") closeSheet();
          else if (act === "pick-from") openSearch("from");
          else if (act === "pick-to") openSearch("to");
          else if (act === "swap") { [st.from, st.to] = [st.to, st.from]; updateDirections(true); }
          else if (act === "start") startNav();
          else if (act === "start-me") { st.from = ME; updateDirections(true); startNav(); }
          else if (act === "steps") setSheetHeight(snapHeights().full);
          else if (act === "share" && st.to && st.to !== ME) shareText(`Directions to ${st.to.name}`, `Walk to ${st.to.name} on OAU Campus Map`, appUrl({ place: st.to.id }));
        });
        return root;
      },
    };
  }

  function openDirections(from, to) {
    if (nav) return;
    closeSearch();
    dirState = { from, to, route: null };
    if (from === ME && !myPos) startWatching();
    computeRoute();
    showView(dirView());
    fitRoute();
  }
  function setDirEnd(which, p) {
    if (!dirState) return;
    dirState[which] = p;
    updateDirections(true);
  }
  function updateDirections(fit) {
    if (!dirState) return;
    computeRoute();
    refreshRoute();
    if (stack.length && stack[stack.length - 1].render && document.body.classList.contains("directions")) {
      sheetBody.innerHTML = "";
      sheetBody.appendChild(stack[stack.length - 1].render());
      requestAnimationFrame(() => setSheetHeight(snapHeights().peek));
    }
    if (fit) fitRoute();
  }
  function fitRoute() {
    refreshRoute();
    const r = dirState && dirState.route;
    if (!r) return;
    const coords = r.path.map(([la, ln]) => [ln, la]);
    const a = endCoords(dirState.from), b = endCoords(dirState.to);
    if (a) coords.push([a.lng, a.lat]);
    if (b) coords.push([b.lng, b.lat]);
    requestAnimationFrame(() => fitCoords(coords, 17.5));
  }

  // ---------- Turn-by-turn navigation ----------
  let nav = null; // { to, dest, route, cum, offCount, arrived }
  let wakeLock = null;
  const banner = $("#navbanner");

  function prepNavRoute(r) {
    const cum = [0];
    for (let i = 1; i < r.path.length; i++) cum.push(cum[i - 1] + Router.dist(r.path[i - 1][0], r.path[i - 1][1], r.path[i][0], r.path[i][1]));
    return cum;
  }

  async function startNav() {
    if (!dirState || !dirState.route) { toast((dirState && dirState.error) || "No route to start."); return; }
    if (dirState.from !== ME) return;
    const to = dirState.to;
    nav = { to, dest: endCoords(to), route: dirState.route, cum: prepNavRoute(dirState.route), lastIdx: 0, offCount: 0, arrived: false, zoom: 18, pitch: 50 };
    document.body.classList.add("navigating");
    banner.hidden = false;
    showView(navView(), { snap: "peek" });
    setFollow(compassHeading != null ? "heading" : "follow");
    map.easeTo({ center: [myPos.lng, myPos.lat], zoom: nav.zoom, pitch: nav.pitch, padding: pad(), duration: 800 });
    try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch (e) { /* not allowed */ }
    buzz([15, 40, 15]);
    updateNav();
  }

  function endNav() {
    if (!nav) return;
    nav = null;
    banner.hidden = true;
    document.body.classList.remove("navigating");
    try { wakeLock && wakeLock.release(); } catch (e) { /* ignore */ }
    wakeLock = null;
    map.easeTo({ pitch: settings.threeD ? 50 : 0, padding: pad(), duration: 600 });
    setFollow("none");
    closeSheet();
    dirState = null;
    refreshRoute();
  }
  document.addEventListener("visibilitychange", async () => {
    if (nav && document.visibilityState === "visible" && "wakeLock" in navigator) {
      try { wakeLock = await navigator.wakeLock.request("screen"); } catch (e) { /* ignore */ }
    }
  });

  function navView() {
    return {
      closable: false,
      render() {
        const frag = h(`<div><div class="nav-stats peek-end">
            <div class="grow"><div class="big" id="nav-time">–</div><div class="small" id="nav-rest">–</div></div>
            <button class="btn" data-act="overview">Overview</button>
            <button class="btn primary" data-act="end" style="background:#d93025;border-color:#d93025;color:#fff">End</button>
          </div>
          <div class="section"><ol class="steps">${nav.route.steps.map((s) => `<li><span class="maneuver">${TURN[s.type] || TURN.straight}</span><span class="txt">${esc(s.text)}${s.dist ? `<div class="d">${fmtDist(s.dist)}</div>` : ""}</span></li>`).join("")}</ol></div></div>`);
        const root = frag.firstElementChild;
        root.addEventListener("click", (e) => {
          const b = e.target.closest("[data-act]");
          if (!b) return;
          if (b.dataset.act === "end") endNav();
          if (b.dataset.act === "overview") {
            setFollow("none");
            map.easeTo({ pitch: 0, bearing: 0, duration: 400 });
            fitCoords(nav.route.path.map(([la, ln]) => [ln, la]).concat([[myPos.lng, myPos.lat]]), 17.5);
          }
        });
        return root;
      },
    };
  }

  function updateNav() {
    if (!nav || !myPos) return;
    const r = nav.route, path = r.path;
    // Nearest point on the route (search forward from last position, a little backward too).
    let bestI = nav.lastIdx, bestD = Infinity;
    const from = Math.max(0, nav.lastIdx - 5);
    for (let i = from; i < path.length; i++) {
      const d = Router.dist(myPos.lat, myPos.lng, path[i][0], path[i][1]);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    nav.lastIdx = bestI;
    const toDest = Router.dist(myPos.lat, myPos.lng, nav.dest.lat, nav.dest.lng);
    const remaining = (nav.cum[nav.cum.length - 1] - nav.cum[bestI]) + bestD + r.endSnap.off;

    if (!nav.arrived && (toDest < ARRIVE_M || (bestI >= path.length - 2 && bestD < ARRIVE_M + 10 && remaining < 40))) {
      nav.arrived = true;
      buzz([200, 100, 200]);
      $("#nav-arrow").innerHTML = TURN.arrive;
      $("#nav-dist").textContent = "You have arrived";
      $("#nav-instr").textContent = nav.to.name;
      const t = $("#nav-time"); if (t) t.textContent = "Arrived 🎉";
      const rest = $("#nav-rest"); if (rest) rest.textContent = nav.to.name;
      setTimeout(() => { if (nav && nav.arrived) { const p = nav.to; endNav(); openPlace(p, { fly: false }); } }, 6000);
      return;
    }
    if (nav.arrived) return;

    // Off the route? Find a new one (after two bad readings, to ignore GPS jumps).
    if (bestD > OFF_ROUTE_M && myAcc < 40) {
      if (++nav.offCount >= 2) {
        const nr = getRouter().route(myPos.lat, myPos.lng, nav.dest.lat, nav.dest.lng, nav.to.name);
        if (nr) {
          nr.total = nr.meters + nr.startSnap.off + nr.endSnap.off;
          nav.route = nr; nav.cum = prepNavRoute(nr); nav.lastIdx = 0; nav.offCount = 0;
          toast("Rerouting…", 1500);
          buzz(30);
          rerender();
          refreshRoute();
          return updateNav();
        }
      }
    } else nav.offCount = 0;

    // Next instruction
    const next = r.steps.find((s) => s.type !== "depart" && s.index > bestI) || r.steps[r.steps.length - 1];
    const toNext = Math.max(0, nav.cum[Math.min(next.index, nav.cum.length - 1)] - nav.cum[bestI]);
    $("#nav-arrow").innerHTML = TURN[next.type] || TURN.straight;
    $("#nav-dist").textContent = toNext < 15 ? "Now" : fmtDist(toNext);
    $("#nav-instr").textContent = next.text;
    if (toNext < 15 && nav.lastSpoken !== next) { nav.lastSpoken = next; buzz(40); }
    const t = $("#nav-time"), rest = $("#nav-rest");
    if (t) t.textContent = fmtMins(mins(remaining));
    if (rest) rest.textContent = `${fmtDist(remaining)} · arrive ${clock(new Date(Date.now() + mins(remaining) * 60000))}`;
    refreshRoute();
  }

  // ---------- Location ----------
  let myPos = null, myAcc = null, watchId = null, firstFix = true;
  let compassHeading = null, gpsHeading = null;
  let follow = "none"; // none | follow | heading
  const locateBtn = $("#locate");

  const meEl = document.createElement("div");
  meEl.className = "me";
  meEl.innerHTML = '<div class="cone"></div><div class="dot"></div>';
  const meMarker = new maplibregl.Marker({ element: meEl, rotationAlignment: "map", pitchAlignment: "map" });

  function circlePolygon(lat, lng, r) {
    const pts = [], n = 48;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * 2 * Math.PI;
      pts.push([lng + (r * Math.sin(a)) / (111320 * Math.cos(lat * Math.PI / 180)), lat + (r * Math.cos(a)) / 110540]);
    }
    return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [pts] } };
  }
  function refreshAccuracy() {
    if (!myPos) return;
    setData("oau-acc", circlePolygon(myPos.lat, myPos.lng, Math.max(myAcc || 0, 5)));
  }

  function heading() { return compassHeading != null ? compassHeading : gpsHeading; }
  function updateMe() {
    if (!myPos) return;
    meMarker.setLngLat([myPos.lng, myPos.lat]);
    if (!meMarker._map) meMarker.addTo(map);
    const hd = heading();
    meEl.classList.toggle("has-heading", hd != null);
    if (hd != null) meMarker.setRotation(hd);
  }

  function startWatching() {
    if (!("geolocation" in navigator)) { toast("This phone cannot share its location."); return; }
    if (watchId !== null) return;
    firstFix = true;
    watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 });
    startCompass();
  }

  function onPosition(pos) {
    const c = pos.coords;
    const had = !!myPos;
    myPos = { lat: c.latitude, lng: c.longitude };
    myAcc = c.accuracy;
    if (c.heading != null && !isNaN(c.heading) && c.speed > 0.7) gpsHeading = c.heading;
    locateBtn.classList.add("active");
    updateMe();
    refreshAccuracy();
    onGpsForAdd();

    if (nav) updateNav();
    else if (dirState && (dirState.from === ME || dirState.to === ME)) {
      if (!dirState.route || !had) updateDirections(!had);
      else if (!dirState.lastMe || Router.dist(dirState.lastMe.lat, dirState.lastMe.lng, myPos.lat, myPos.lng) > 10) { dirState.lastMe = { ...myPos }; updateDirections(false); }
    }

    if (follow !== "none") {
      const cam = { center: [myPos.lng, myPos.lat], bearing: follow === "heading" && heading() != null ? heading() : map.getBearing(), padding: pad(), duration: 600 };
      if (nav) { cam.zoom = nav.zoom; cam.pitch = nav.pitch; }
      map.easeTo(cam);
    }
    if (firstFix) {
      firstFix = false;
      const inside = myPos.lng > MAX_BOUNDS[0][0] && myPos.lng < MAX_BOUNDS[1][0] && myPos.lat > MAX_BOUNDS[0][1] && myPos.lat < MAX_BOUNDS[1][1];
      if (!inside) toast("You are outside OAU. Your blue dot shows when you are on campus.", 4500);
      else if (!stack.length && follow === "none" && !wantPlace) map.easeTo({ center: [myPos.lng, myPos.lat], zoom: Math.max(map.getZoom(), 16.5), padding: pad(), duration: 900 });
    }
  }

  function onPositionError(err) {
    const msg = {
      1: "Location is blocked. Allow location for this app in your phone settings.",
      2: "Cannot find your location. Turn on Location (GPS).",
      3: "Finding your location is slow. Move to an open area.",
    }[err.code] || "Location error.";
    toast(msg, 4500);
    if (err.code === 1) { navigator.geolocation.clearWatch(watchId); watchId = null; locateBtn.classList.remove("active"); }
  }

  function startCompass() {
    const handler = (e) => {
      let hd = null;
      if (typeof e.webkitCompassHeading === "number") hd = e.webkitCompassHeading;
      else if (e.absolute && e.alpha != null) hd = 360 - e.alpha;
      if (hd == null) return;
      const screenAngle = (screen.orientation && screen.orientation.angle) || 0;
      compassHeading = (hd + screenAngle + 360) % 360;
      updateMe();
      if (follow === "heading") rotateWithHeading();
    };
    if ("ondeviceorientationabsolute" in window) window.addEventListener("deviceorientationabsolute", handler);
    else window.addEventListener("deviceorientation", handler);
  }
  let lastRotate = 0;
  function rotateWithHeading() {
    const now = Date.now();
    const hd = heading();
    if (hd == null || now - lastRotate < 250) return;
    let diff = Math.abs(((hd - map.getBearing() + 540) % 360) - 180);
    if (diff < 4) return;
    lastRotate = now;
    map.easeTo({ bearing: hd, center: myPos ? [myPos.lng, myPos.lat] : undefined, padding: pad(), duration: 240, easing: (t) => t });
  }

  function setFollow(mode) {
    follow = mode;
    locateBtn.classList.toggle("follow", mode === "follow");
    locateBtn.classList.toggle("heading", mode === "heading");
  }
  locateBtn.addEventListener("click", () => {
    buzz(8);
    if (watchId === null) { toast("Finding your location…"); startWatching(); setFollow("follow"); return; }
    if (!myPos) { toast("Still finding your location…"); setFollow("follow"); return; }
    if (follow === "follow" && heading() != null) {
      setFollow("heading");
      rotateWithHeading();
      toast("Map turns with your phone", 1500);
    } else if (follow === "heading") {
      setFollow("follow");
      map.easeTo({ bearing: 0, center: [myPos.lng, myPos.lat], padding: pad(), duration: 500 });
    } else {
      setFollow("follow");
      map.easeTo({ center: [myPos.lng, myPos.lat], zoom: Math.max(map.getZoom(), 17), padding: pad(), duration: 600 });
    }
  });
  map.on("dragstart", () => { if (follow !== "none") setFollow("none"); });
  map.on("zoomend", (e) => { if (nav && e.originalEvent) nav.zoom = map.getZoom(); });
  map.on("pitchend", (e) => { if (nav && e.originalEvent) nav.pitch = map.getPitch(); });

  // Compass button (shows when the map is rotated)
  const compassBtn = $("#compass");
  const syncCompass = () => {
    const b = map.getBearing();
    compassBtn.hidden = Math.abs(b) < 1;
    compassBtn.firstElementChild.style.transform = `rotate(${-b}deg)`;
  };
  map.on("rotate", syncCompass);
  compassBtn.addEventListener("click", () => { if (follow === "heading") setFollow("follow"); map.easeTo({ bearing: 0, pitch: settings.threeD ? 50 : 0, duration: 500 }); });

  // 3D button
  const btn3d = $("#btn-3d");
  function set3D(on) {
    settings.threeD = on; saveSettings();
    btn3d.classList.toggle("on", on);
    btn3d.textContent = on ? "2D" : "3D";
    btn3d.setAttribute("aria-label", on ? "Switch to flat 2D view" : "Switch to 3D view");
    setBaseBuilding3D(on);
    map.easeTo({ pitch: on ? 55 : 0, zoom: on ? Math.max(map.getZoom(), 16.5) : map.getZoom(), duration: 700 });
  }
  btn3d.addEventListener("click", () => { set3D(!settings.threeD); buzz(8); });
  btn3d.classList.toggle("on", settings.threeD);
  btn3d.textContent = settings.threeD ? "2D" : "3D";
  if (settings.threeD) map.once("load", () => map.easeTo({ pitch: 55, duration: 0 }));

  // ---------- Map taps ----------
  map.on("click", (e) => {
    if (picking) { picking = false; document.body.classList.remove("picking"); setDraft(e.lngLat, "map"); sheet.hidden = false; setSheetHeight(snapHeights().peek); return; }
    const f = map.queryRenderedFeatures(e.point, { layers: ["oau-bfill", "oau-labels"].filter((l) => map.getLayer(l)) })[0];
    if (f && byId.get(f.properties.id)) { openPlace(byId.get(f.properties.id), { fly: false }); return; }
    if (nav) return;
    const top = stack[stack.length - 1];
    if (top && !document.body.classList.contains("directions") && !document.body.classList.contains("adding")) closeSheet();
  });
  map.on("mousemove", (e) => {
    const f = map.queryRenderedFeatures(e.point, { layers: ["oau-bfill", "oau-labels"].filter((l) => map.getLayer(l)) })[0];
    map.getCanvas().style.cursor = f ? "pointer" : "";
  });

  // ---------- Settings sheet ----------
  function settingsView() {
    return {
      render() {
        const frag = h(`<div>
          <div class="head"><div class="grow"><h2>Map settings</h2></div><button class="icon-btn close-x" data-act="close" aria-label="Close">${ICON.close}</button></div>
          <div class="section-title">Map type</div>
          <div class="opt-grid">
            <button class="opt ${settings.mapType === "map" ? "on" : ""}" data-type="map"><div class="thumb map">🗺️</div><span>Default</span></button>
            <button class="opt ${settings.mapType === "satellite" ? "on" : ""}" data-type="satellite"><div class="thumb sat">🛰️</div><span>Satellite${settings.dataSaver ? " (off: data saver)" : ""}</span></button>
          </div>
          <div class="section-title">Theme</div>
          <div class="seg">${["auto", "light", "dark"].map((t) => `<button data-theme="${t}" class="${settings.theme === t ? "on" : ""}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}</div>
          <div class="toggle-row peek-end"><div class="grow">Data saver<div class="sub">Blocks satellite view, the biggest data user. The normal map is already light.</div></div>
            <label class="switch"><input type="checkbox" data-tog="dataSaver" ${settings.dataSaver ? "checked" : ""}><span class="track"></span></label></div>
          <div class="toggle-row"><div class="grow">3D buildings<div class="sub">Tilt the map to see building heights.</div></div>
            <label class="switch"><input type="checkbox" data-tog="threeD" ${settings.threeD ? "checked" : ""}><span class="track"></span></label></div>
          <div class="section">
            <div class="toggle-row"><div class="grow">Map data saved on this phone<div class="sub" id="storage-used">Checking…</div></div><button class="btn" data-act="clear">Clear</button></div>
          </div>
          ${isEditor() ? `<div class="section"><div class="section-title">Editor</div>
            <button class="kv" data-act="add">${ICON.pin}<span>Add a place</span></button>
            <button class="kv" data-act="export">${ICON.share}<span>Send my added places (${myPlaces.length})</span></button>
            <button class="kv danger" data-act="lock">${ICON.close}<span>Turn off editor mode</span></button></div>` : ""}
          <div class="section"><div class="info" style="color:var(--muted);font-size:12px">
            Map data © OpenStreetMap contributors. Map tiles: OpenFreeMap / OpenMapTiles. Satellite imagery © Esri.
            Walking routes are worked out on your phone and work offline.</div></div>
        </div>`);
        const root = frag.firstElementChild;
        root.addEventListener("click", async (e) => {
          const b = e.target.closest("button");
          if (!b) return;
          if (b.dataset.act === "close") closeSheet();
          else if (b.dataset.type) { await chooseMapType(b.dataset.type); rerender(); }
          else if (b.dataset.theme) { settings.theme = b.dataset.theme; saveSettings(); applyTheme(); setMapStyle(); rerender(); }
          else if (b.dataset.act === "clear") { await clearMapData(); showStorage(); }
          else if (b.dataset.act === "add") openAdd(null);
          else if (b.dataset.act === "export") exportMyPlaces();
          else if (b.dataset.act === "lock") { setEditor(false); rerender(); toast("Editor mode off"); }
        });
        root.addEventListener("change", (e) => {
          const t = e.target.dataset.tog;
          if (t === "dataSaver") {
            settings.dataSaver = e.target.checked; saveSettings();
            if (settings.dataSaver && settings.mapType === "satellite") { settings.mapType = "map"; saveSettings(); applyTheme(); setMapStyle(); }
            rerender();
            toast(settings.dataSaver ? "Data saver on" : "Data saver off");
          }
          if (t === "threeD") set3D(e.target.checked);
        });
        setTimeout(showStorage, 0);
        return root;
      },
    };
  }
  $("#menu-btn").addEventListener("click", () => { closeSearch(); if (nav) return; showView(settingsView(), { snap: "half" }); });

  async function chooseMapType(type) {
    if (type === settings.mapType) return;
    if (type === "satellite") {
      if (settings.dataSaver) { toast("Turn off Data saver to use Satellite view."); return; }
      if (!settings.satWarned) {
        const ok = await ask({
          title: "Use satellite view?",
          text: "Satellite pictures use much more data than the normal map — often 5 to 10 times more as you move around. Use Wi-Fi if you can.",
          ok: "Use satellite",
        });
        if (!ok) return;
        settings.satWarned = true;
      }
    }
    settings.mapType = type; saveSettings();
    applyTheme();
    setMapStyle();
  }

  async function showStorage() {
    const el = $("#storage-used");
    if (!el) return;
    try {
      const est = await navigator.storage.estimate();
      el.textContent = `${(est.usage / 1048576).toFixed(1)} MB used. Clearing frees space; the map downloads again when you look at it.`;
    } catch (e) { el.textContent = "Not available on this phone."; }
  }
  async function clearMapData() {
    if (!("caches" in window)) return;
    const ok = await ask({ title: "Clear saved map data?", text: "Map pictures saved for offline use will be deleted. They download again (using data) when you look at the map.", ok: "Clear" });
    if (!ok) return;
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.includes("tiles")).map((k) => caches.delete(k)));
    toast("Saved map data cleared");
  }

  // ---------- Editor: add your own places ----------
  // Places you add stay on this phone. "Send" shares them as text, so the map owner can add them for everyone.
  const isEditor = () => store.get(K.editor, "") === EDITOR_CODE_HASH;
  function setEditor(on) {
    store.set(K.editor, on ? EDITOR_CODE_HASH : "");
    $("#addbtn").hidden = !on;
  }
  setEditor(isEditor());
  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function tryEditorCode(code) {
    closeSearch();
    if (code.toLowerCase() === "off") { setEditor(false); toast("Editor mode off"); return; }
    let ok = false;
    try { ok = (await sha256(code)) === EDITOR_CODE_HASH; } catch (e) { /* needs https */ }
    setEditor(ok);
    toast(ok ? "Editor mode on. Tap the red + to add a place." : "Wrong code");
  }
  $("#addbtn").addEventListener("click", () => openAdd(null));

  let draft = null, draftSource = null, picking = false;
  const draftEl = document.createElement("div");
  draftEl.className = "mk draft";
  draftEl.innerHTML = '<div class="pin" style="--c:#e8453c"><i>➕</i></div>';

  function setDraft(lngLat, source) {
    draftSource = source;
    if (!draft) {
      draft = new maplibregl.Marker({ element: draftEl, anchor: "bottom", offset: [0, -6], draggable: true }).setLngLat(lngLat).addTo(map);
      draft.on("dragend", () => { draftSource = "map"; showDraftStatus(); });
    } else draft.setLngLat(lngLat);
    showDraftStatus();
  }
  function showDraftStatus() {
    const el = $("#add-loc");
    if (!el) return;
    if (draftSource === "gps") {
      const ok = myAcc <= GOOD_GPS_M;
      el.innerHTML = `Using your GPS · accurate to about <b>${Math.round(myAcc)} m</b> ${ok ? "✅" : `<br><span class="warn">Wait for better GPS (under ${GOOD_GPS_M} m). Stand in the open near the entrance.</span>`}`;
    } else if (draftSource === "map") el.textContent = "Using the spot you picked. Drag the red pin to adjust.";
    else el.textContent = "Finding your location… or tap “Pick on map”.";
  }
  function onGpsForAdd() { if (draft && draftSource === "gps") setDraft([myPos.lng, myPos.lat], "gps"); }

  function addView(startLngLat) {
    return {
      closable: true,
      enter() {
        document.body.classList.add("adding");
        if (startLngLat) setDraft(startLngLat, "map");
        else if (myPos) { setDraft([myPos.lng, myPos.lat], "gps"); map.easeTo({ center: [myPos.lng, myPos.lat], zoom: Math.max(map.getZoom(), 18), padding: pad() }); }
        else { draftSource = "gps"; startWatching(); }
      },
      leave() {
        document.body.classList.remove("adding", "picking");
        picking = false;
        if (draft) { draft.remove(); draft = null; }
        draftSource = null;
      },
      render() {
        const frag = h(`<div>
          <div class="head"><div class="grow"><h2>Add a place</h2></div><button class="icon-btn close-x" data-act="close" aria-label="Close">${ICON.close}</button></div>
          <div class="form">
            <p class="hint" id="add-loc"></p>
            <div class="two"><button class="btn" data-act="gps">📍 Use my location</button><button class="btn" data-act="pick">👆 Pick on map</button></div>
            <input id="add-name" type="text" maxlength="80" placeholder="Name, e.g. Ojaja Hostel" autocomplete="off">
            <select id="add-cat" aria-label="Category">${Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}" ${k === "hostel" ? "selected" : ""}>${c.icon} ${esc(c.label)}</option>`).join("")}</select>
            <button class="btn primary block peek-end" data-act="save">Save place</button>
          </div></div>`);
        const root = frag.firstElementChild;
        root.addEventListener("click", (e) => {
          const b = e.target.closest("[data-act]");
          if (!b) return;
          const act = b.dataset.act;
          if (act === "close") closeSheet();
          else if (act === "gps") { if (myPos) { setDraft([myPos.lng, myPos.lat], "gps"); map.easeTo({ center: [myPos.lng, myPos.lat], zoom: 18, padding: pad() }); } else { draftSource = "gps"; startWatching(); showDraftStatus(); } }
          else if (act === "pick") { picking = true; document.body.classList.add("picking"); sheet.hidden = true; toast("Tap the building on the map"); }
          else if (act === "save") saveDraft();
        });
        setTimeout(showDraftStatus, 0);
        return root;
      },
    };
  }
  function openAdd(lngLat) {
    if (nav) return;
    closeSearch();
    showView(addView(lngLat), { snap: "full" });
  }

  function saveDraft() {
    const name = ($("#add-name").value || "").trim();
    if (!name) { toast("Type the name of the place"); $("#add-name").focus(); return; }
    if (!draft) { toast("Choose where the place is first"); return; }
    if (draftSource === "gps" && myAcc > 50) { toast("GPS is not accurate yet. Wait a little, or use “Pick on map”."); return; }
    const ll = draft.getLngLat();
    const p = registerPlace({
      id: "my-" + slug(name) + "-" + Date.now().toString(36),
      name, cat: $("#add-cat").value, mine: true,
      lat: Math.round(ll.lat * 1e6) / 1e6, lng: Math.round(ll.lng * 1e6) / 1e6,
      acc: draftSource === "gps" ? Math.round(myAcc) : null,
    });
    myPlaces.push(p);
    store.set(K.mine, myPlaces.map(({ id, name, cat, lat, lng, acc }) => ({ id, name, cat, lat, lng, acc })));
    addMarker(p);
    refreshMarkers();
    closeSheet();
    openPlace(p, { fly: false });
    toast(`Saved “${name}” on this phone`);
    buzz([10, 30, 10]);
  }

  async function deleteMyPlace(p) {
    const ok = await ask({ title: "Delete place?", text: `“${p.name}” will be removed from your map.`, ok: "Delete" });
    if (!ok) return;
    closeSheet();
    const m = markers.get(p.id); if (m) m.marker.remove();
    markers.delete(p.id);
    places.splice(places.indexOf(p), 1);
    byId.delete(p.id);
    myPlaces = myPlaces.filter((x) => x !== p);
    store.set(K.mine, myPlaces.map(({ id, name, cat, lat, lng, acc }) => ({ id, name, cat, lat, lng, acc })));
    refreshMarkers();
  }

  function exportMyPlaces() {
    if (!myPlaces.length) { toast("You have not added any places yet"); return; }
    const lines = myPlaces.map((p) => `  { name: ${JSON.stringify(p.name)}, cat: "${p.cat}", lat: ${p.lat.toFixed(5)}, lng: ${p.lng.toFixed(5)} },` + (p.acc ? ` // GPS ±${p.acc} m` : " // picked on map"));
    shareText("OAU Map places", "OAU Map – places I added:\n" + lines.join("\n"));
  }

  // Long-press on the map adds a place there (editors only). Right-click on a laptop.
  map.on("contextmenu", (e) => { if (isEditor() && !nav) openAdd(e.lngLat); });
  (function longPress() {
    let timer = null, start = null;
    const canvas = map.getCanvasContainer();
    canvas.addEventListener("touchstart", (e) => {
      if (!isEditor() || nav || e.touches.length !== 1) return;
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY };
      timer = setTimeout(() => {
        const rect = canvas.getBoundingClientRect();
        buzz(30);
        openAdd(map.unproject([start.x - rect.left, start.y - rect.top]));
      }, 650);
    }, { passive: true });
    const cancel = () => { clearTimeout(timer); timer = null; };
    canvas.addEventListener("touchmove", (e) => { if (timer && start && Math.hypot(e.touches[0].clientX - start.x, e.touches[0].clientY - start.y) > 10) cancel(); }, { passive: true });
    canvas.addEventListener("touchend", cancel);
    canvas.addEventListener("touchcancel", cancel);
  })();

  // ---------- Back button (Android) ----------
  history.replaceState({ app: 1 }, "");
  history.pushState({ app: 2 }, "");
  window.addEventListener("popstate", () => {
    let handled = true;
    if (!panel.hidden) closeSearch();
    else if (nav) { handled = true; toast("Tap End to stop directions"); }
    else if (stack.length > 1) back();
    else if (stack.length) closeSheet();
    else if (catFilter) setCatFilter(null);
    else handled = false;
    if (handled) history.pushState({ app: 2 }, "");
    else history.back();
  });

  // ---------- First run & deep links ----------
  const params = new URLSearchParams(location.search);
  const wantPlace = params.get("place") && byId.get(params.get("place"));
  map.once("load", () => {
    if (wantPlace) openPlace(wantPlace);
  });

  const welcome = $("#welcome");
  if (!store.get(K.welcomed, false)) {
    welcome.hidden = false;
    $("#welcome-go").addEventListener("click", () => {
      welcome.hidden = true;
      store.set(K.welcomed, true);
      startWatching();
    });
  } else {
    startWatching();
  }

  // ---------- Offline support ----------
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service worker failed", e));
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController) toast("App updated. Close and reopen it to see what is new.", 5000);
    });
  }

  // For testing in the browser console.
  window.oauMap = { map, places, byId, openPlace, openList, openDirections, startNav, endNav, ME, set3D, chooseMapType, openAdd,
    fakePosition: (lat, lng, acc = 8) => onPosition({ coords: { latitude: lat, longitude: lng, accuracy: acc, heading: null, speed: 0 } }) };
})();
