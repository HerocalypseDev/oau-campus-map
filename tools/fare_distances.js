// Road distances for every route in the official fare list (transport.js).
// Output: JSON lines, one per pair of map places, used by tools/fit_fares.py to learn the fare rule.
// Run from the project folder:  node tools/fare_distances.js > tools/fare_data.json
global.window = globalThis;
require("../places.js");
require("../data/roads.js");
require("../router.js");
require("../transport.js");

const T = window.TRANSPORT;
const drive = new Router(window.ROADS, { filter: Router.isDrivable });
const byName = new Map(window.PLACES.map((p) => [p.name, p]));
const members = (point) => (T.points[point] || []).map((n) => byName.get(n)).filter(Boolean);

const rows = [];
const skipped = [];
for (const [a, b, fare] of T.fares) {
  const A = members(a), B = members(b);
  if (!A.length || !B.length) { skipped.push(`${a} -> ${b}`); continue; }
  for (const p of A) {
    for (const q of B) {
      const r = drive.route(p.lat, p.lng, q.lat, q.lng, q.name);
      if (!r) continue;
      rows.push({
        from: a, to: b, fromPlace: p.name, toPlace: q.name, fare,
        rideMeters: Math.round(r.meters),
        totalMeters: Math.round(r.meters + r.startSnap.off + r.endSnap.off),
        straightMeters: Math.round(Router.dist(p.lat, p.lng, q.lat, q.lng)),
      });
    }
  }
}
console.log(JSON.stringify({ rows, skipped }, null, 1));
