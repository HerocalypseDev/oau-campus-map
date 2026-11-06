// Walking route finder with turn-by-turn steps. Works offline using data/roads.js.
// Builds a graph of road points, then uses Dijkstra's shortest path.
(function (root) {
  "use strict";

  const M_PER_DEG_LAT = 110540;
  const M_PER_DEG_LNG = 111320;
  const RAD = Math.PI / 180;

  function dist(aLat, aLng, bLat, bLng) {
    const dy = (bLat - aLat) * M_PER_DEG_LAT;
    const dx = (bLng - aLng) * M_PER_DEG_LNG * Math.cos(((aLat + bLat) / 2) * RAD);
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Compass bearing in degrees (0 = north, 90 = east).
  function bearing(aLat, aLng, bLat, bLng) {
    const dy = (bLat - aLat) * M_PER_DEG_LAT;
    const dx = (bLng - aLng) * M_PER_DEG_LNG * Math.cos(((aLat + bLat) / 2) * RAD);
    return (Math.atan2(dx, dy) / RAD + 360) % 360;
  }

  // Human name for an unnamed road piece.
  function genericName(type) {
    if (/footway|path|pedestrian|steps|track|cycleway/.test(type)) return "the footpath";
    if (type === "service") return "the service road";
    return "the road";
  }

  // opts.filter(type) -> false skips that kind of road (e.g. footpaths for kekes and buses).
  function Router(roads, opts) {
    const keep = (opts && opts.filter) || (() => true);
    const index = new Map(); // "lat,lng" -> node id (roads that share a point are joined there)
    this.lat = []; this.lng = [];
    this.adj = [];   // per node: [neighbour, metres, edgeLabel, ...]
    this.segs = [];  // a, b, a, b, ...
    this.labels = []; // edge label strings
    const labelId = new Map();
    const node = (la, ln) => {
      const k = la + "," + ln;
      let id = index.get(k);
      if (id === undefined) {
        id = this.lat.length;
        index.set(k, id);
        this.lat.push(la); this.lng.push(ln); this.adj.push([]);
      }
      return id;
    };
    for (const [name, type, flat] of roads) {
      if (!keep(type)) continue;
      const label = name || genericName(type);
      let li = labelId.get(label);
      if (li === undefined) { li = this.labels.length; this.labels.push(label); labelId.set(label, li); }
      let prev = node(flat[0], flat[1]);
      for (let i = 2; i < flat.length; i += 2) {
        const cur = node(flat[i], flat[i + 1]);
        if (cur === prev) continue;
        const d = dist(this.lat[prev], this.lng[prev], this.lat[cur], this.lng[cur]);
        this.adj[prev].push(cur, d, li);
        this.adj[cur].push(prev, d, li);
        this.segs.push(prev, cur);
        prev = cur;
      }
    }
    // Find the biggest connected road network. Snapping only uses it, so a route
    // never starts on a stray path that does not join the other roads.
    const comp = new Int32Array(this.lat.length).fill(-1);
    const sizes = [];
    for (let i = 0; i < comp.length; i++) {
      if (comp[i] !== -1) continue;
      const c = sizes.length, stack = [i];
      comp[i] = c;
      let size = 0;
      while (stack.length) {
        const u = stack.pop(); size++;
        const list = this.adj[u];
        for (let k = 0; k < list.length; k += 3) {
          if (comp[list[k]] === -1) { comp[list[k]] = c; stack.push(list[k]); }
        }
      }
      sizes.push(size);
    }
    this.main = sizes.length ? sizes.indexOf(Math.max(...sizes)) : -1;
    this.comp = comp;
  }

  function edgeLabel(router, a, b) {
    const list = router.adj[a];
    for (let k = 0; k < list.length; k += 3) if (list[k] === b) return router.labels[list[k + 2]];
    return "the road";
  }

  // Closest point on the main road network to (lat, lng).
  Router.prototype.snap = function (lat, lng) {
    const kx = M_PER_DEG_LNG * Math.cos(lat * RAD), ky = M_PER_DEG_LAT;
    let best = null;
    for (let s = 0; s < this.segs.length; s += 2) {
      const a = this.segs[s], b = this.segs[s + 1];
      if (this.comp[a] !== this.main) continue;
      const ax = (this.lng[a] - lng) * kx, ay = (this.lat[a] - lat) * ky;
      const bx = (this.lng[b] - lng) * kx, by = (this.lat[b] - lat) * ky;
      const vx = bx - ax, vy = by - ay;
      const len2 = vx * vx + vy * vy;
      let t = len2 ? -(ax * vx + ay * vy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const px = ax + t * vx, py = ay + t * vy;
      const d2 = px * px + py * py;
      if (!best || d2 < best.d2) best = { a, b, t, d2 };
    }
    if (!best) return null;
    const { a, b, t } = best;
    return {
      a, b,
      lat: this.lat[a] + t * (this.lat[b] - this.lat[a]),
      lng: this.lng[a] + t * (this.lng[b] - this.lng[a]),
      off: Math.sqrt(best.d2), // metres from the point to the road
      label: edgeLabel(this, a, b),
    };
  };

  // Shortest walking route.
  // Returns { path: [[lat,lng],...], labels: [label per path segment], meters, startSnap, endSnap, steps } or null.
  Router.prototype.route = function (fromLat, fromLng, toLat, toLng, destName) {
    const s = this.snap(fromLat, fromLng), e = this.snap(toLat, toLng);
    if (!s || !e) return null;
    const n = this.lat.length, S = n, E = n + 1; // two temporary nodes on the snapped points
    const lat = (i) => (i === S ? s.lat : i === E ? e.lat : this.lat[i]);
    const lng = (i) => (i === S ? s.lng : i === E ? e.lng : this.lng[i]);
    const extra = new Map(); // node -> [neighbour, metres, label, ...] for the temporary links
    const tmpLabels = [s.label, e.label];
    const link = (x, y, li) => {
      const d = dist(lat(x), lng(x), lat(y), lng(y));
      if (!extra.has(x)) extra.set(x, []);
      if (!extra.has(y)) extra.set(y, []);
      extra.get(x).push(y, d, li); extra.get(y).push(x, d, li);
    };
    // Temporary labels use negative ids: -1 = start road, -2 = end road.
    link(S, s.a, -1); link(S, s.b, -1); link(E, e.a, -2); link(E, e.b, -2);
    if ((s.a === e.a && s.b === e.b) || (s.a === e.b && s.b === e.a)) link(S, E, -1); // same road piece

    const best = new Float64Array(n + 2).fill(Infinity);
    const prev = new Int32Array(n + 2).fill(-1);
    const prevLabel = new Int32Array(n + 2);
    best[S] = 0;
    const heap = new Heap();
    heap.push(0, S);
    while (heap.size) {
      const [d, u] = heap.pop();
      if (d > best[u]) continue;
      if (u === E) break;
      const lists = [u < n ? this.adj[u] : null, extra.get(u)];
      for (const list of lists) {
        if (!list) continue;
        for (let i = 0; i < list.length; i += 3) {
          const v = list[i], nd = d + list[i + 1];
          if (nd < best[v]) { best[v] = nd; prev[v] = u; prevLabel[v] = list[i + 2]; heap.push(nd, v); }
        }
      }
    }
    if (best[E] === Infinity) return null;
    const path = [], labels = [];
    for (let v = E; v !== -1; v = prev[v]) {
      path.push([lat(v), lng(v)]);
      if (prev[v] !== -1) {
        const li = prevLabel[v];
        labels.push(li < 0 ? tmpLabels[-li - 1] : this.labels[li]);
      }
    }
    path.reverse(); labels.reverse();
    const result = { path, labels, meters: best[E], startSnap: s, endSnap: e };
    result.steps = buildSteps(result, destName || "your destination");
    return result;
  };

  // ---- Turn-by-turn steps ----
  const CARDINAL = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

  function turnType(delta) {
    // delta: change of direction in degrees, -180..180 (negative = left)
    const a = Math.abs(delta);
    if (a < 25) return "straight";
    const side = delta < 0 ? "left" : "right";
    if (a < 60) return "slight-" + side;
    if (a < 135) return side;
    return "sharp-" + side;
  }

  const TURN_TEXT = {
    "straight": "Continue straight", "slight-left": "Keep left", "slight-right": "Keep right",
    "left": "Turn left", "right": "Turn right", "sharp-left": "Turn sharp left", "sharp-right": "Turn sharp right",
  };

  function buildSteps(r, destName) {
    const { path, labels } = r;
    const steps = [];
    if (path.length < 2) {
      steps.push({ type: "arrive", text: `Arrive at ${destName}`, dist: 0, index: 0 });
      return steps;
    }
    const segBearing = (i) => bearing(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]);
    const segLen = (i) => dist(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]);

    // Start
    const b0 = segBearing(0);
    steps.push({
      type: "depart", index: 0, label: labels[0],
      text: `Head ${CARDINAL[Math.round(b0 / 45) % 8]} on ${labels[0]}`, dist: 0,
    });

    // Look for turns: a change of road name, or a big change of direction.
    // Direction is measured over ~15 m before and after the point so small wiggles are ignored.
    const dirBefore = (i) => { let j = i - 1, d = 0; while (j > 0 && d < 15) { d += segLen(j); j--; } return bearing(path[j][0], path[j][1], path[i][0], path[i][1]); };
    const dirAfter = (i) => { let j = i + 1, d = segLen(i); while (j < path.length - 1 && d < 15) { d += segLen(j); j++; } return bearing(path[i][0], path[i][1], path[j][0], path[j][1]); };

    let current = steps[0];
    for (let i = 0; i < path.length - 1; i++) {
      current.dist += segLen(i);
      if (i + 1 >= path.length - 1) break;
      const nextLabel = labels[i + 1];
      const delta = ((dirAfter(i + 1) - dirBefore(i + 1) + 540) % 360) - 180;
      const type = turnType(delta);
      const nameChange = nextLabel !== current.label;
      const bigTurn = Math.abs(delta) >= 60; // smaller bends are just the road curving
      if (!nameChange && !bigTurn) continue;
      if (nameChange && type === "straight" && !bigTurn) {
        current = { type: "straight", index: i + 1, label: nextLabel, text: `Continue onto ${nextLabel}`, dist: 0 };
      } else {
        const onto = nameChange ? ` onto ${nextLabel}` : "";
        current = { type, index: i + 1, label: nextLabel, text: `${TURN_TEXT[type]}${onto}`, dist: 0 };
      }
      steps.push(current);
    }

    // Merge very short steps into the one before (they are usually junction wiggles).
    for (let k = steps.length - 1; k > 0; k--) {
      if (steps[k].dist < 25 && steps[k].type !== "depart") {
        steps[k - 1].dist += steps[k].dist;
        steps.splice(k, 1);
      }
    }
    // After merging, "Continue onto X" right after a step already on X says nothing new.
    for (let k = steps.length - 1; k > 0; k--) {
      if (steps[k].type === "straight" && steps[k].label === steps[k - 1].label) {
        steps[k - 1].dist += steps[k].dist;
        steps.splice(k, 1);
      }
    }
    steps.push({ type: "arrive", index: path.length - 1, text: `Arrive at ${destName}`, dist: 0 });
    return steps;
  }

  // Small binary min-heap of [priority, value].
  function Heap() { this.a = []; this.size = 0; }
  Heap.prototype.push = function (p, v) {
    const a = this.a; a.push([p, v]); this.size++;
    let i = a.length - 1;
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (a[j][0] <= a[i][0]) break;
      [a[i], a[j]] = [a[j], a[i]]; i = j;
    }
  };
  Heap.prototype.pop = function () {
    const a = this.a, top = a[0], last = a.pop(); this.size--;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  };

  // Roads a keke or bus can drive on.
  Router.isDrivable = (type) => !/^(footway|path|pedestrian|steps|track|cycleway|bridleway)$/.test(type);
  Router.dist = dist;
  Router.bearing = bearing;
  root.Router = Router;
})(typeof window !== "undefined" ? window : globalThis);
