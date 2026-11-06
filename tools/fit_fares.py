"""Learn a fare rule for trips that are not in the official fare list.

Input:  tools/fare_data.json  (from: node tools/fare_distances.js > tools/fare_data.json)
Output: prints the best rule and how accurate it is, and writes tools/fare_model.json
        (distance tiers + extra charge for some places) to copy into transport.js.

Each official route is one example (median road distance between its places).
Models are compared with leave-one-out testing: each route is hidden in turn, the model
learns from the rest, then must guess the hidden route's fare. Score = share of exact guesses.
"""
import json
import os
import statistics
from collections import defaultdict

import numpy as np
from sklearn.model_selection import LeaveOneOut
from sklearn.tree import DecisionTreeClassifier

HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(HERE, "fare_data.json"), encoding="utf-8"))

# One example per official route.
groups = defaultdict(list)
for r in data["rows"]:
    groups[(r["from"], r["to"], r["fare"])].append(r["rideMeters"])
routes = [{"a": a, "b": b, "fare": f, "dist": statistics.median(v)} for (a, b, f), v in groups.items()]
points = sorted({x for r in routes for x in (r["a"], r["b"])})
y = np.array([r["fare"] for r in routes])
dist = np.array([[r["dist"]] for r in routes])

print(f"{len(routes)} official routes with both ends on the map")
for r in sorted(routes, key=lambda r: r["dist"]):
    print(f"  {r['dist']:6.0f} m  N{r['fare']}  {r['a']} -> {r['b']}")


def loo_score(fit_predict):
    """Share of exact guesses; also records how many were within N100."""
    hits = near = 0
    for tr, te in LeaveOneOut().split(dist):
        g = fit_predict(tr, te[0])
        hits += int(g == y[te[0]])
        near += int(abs(g - y[te[0]]) <= 100)
    loo_score.near = near / len(routes)
    return hits / len(routes)


# Model A: fare from road distance only (decision tree = learns distance cut-offs).
def model_a(tr, i):
    m = DecisionTreeClassifier(max_depth=2, random_state=0).fit(dist[tr], y[tr])
    return m.predict(dist[[i]])[0]


# Model B: distance + "extra charge" places. A place gets an extra charge when, in the
# training routes, trips touching it cost more than the distance alone suggests.
def learn_surcharge(tr):
    base = DecisionTreeClassifier(max_depth=2, random_state=0).fit(dist[tr], y[tr])
    resid = defaultdict(list)
    for j in tr:
        d = y[j] - base.predict(dist[[j]])[0]
        resid[routes[j]["a"]].append(d)
        resid[routes[j]["b"]].append(d)
    # A place is "extra" if every training trip touching it cost more than distance predicts.
    return {p for p, ds in resid.items() if ds and min(ds) > 0}


def features(idx, extra):
    return np.array([[routes[j]["dist"], int(routes[j]["a"] in extra or routes[j]["b"] in extra)] for j in idx])


def model_b(tr, i):
    extra = learn_surcharge(tr)
    m = DecisionTreeClassifier(max_depth=3, random_state=0).fit(features(tr, extra), y[tr])
    return m.predict(features([i], extra))[0]


# Model C: simple rounding rule tiers (hand rule), for comparison.
def model_c(tr, i):
    d = dist[i][0]
    return 100 if d < 1300 else 200 if d < 2700 else 300


# Model D: search every pair of distance cut-offs together with up to 2 places that cost
# 100 more (extra) or 100 less (e.g. the SUB hub), and keep the rule with fewest wrong fares.
# Ties are broken by the simplest rule (fewest place adjustments).
import itertools

def rule_fare(d, a, b, t1, t2, adj):
    base = 100 if d < t1 else 200 if d < t2 else 300
    return int(min(300, max(100, base + adj.get(a, 0) + adj.get(b, 0))))

ADJ_SETS = [{}]
for k in (1, 2):
    for ps in itertools.combinations(points, k):
        for signs in itertools.product((100, -100), repeat=k):
            ADJ_SETS.append(dict(zip(ps, signs)))

def search(idx):
    ds = sorted({routes[j]["dist"] for j in idx})
    cands = [(x + z) / 2 for x, z in zip(ds, ds[1:])] + [ds[-1] + 1]
    best = None
    for t1, t2 in itertools.combinations(cands, 2):
        for adj in ADJ_SETS:
            err = sum(rule_fare(routes[j]["dist"], routes[j]["a"], routes[j]["b"], t1, t2, adj) != y[j] for j in idx)
            key = (err, len(adj), -t2)
            if best is None or key < best[0]:
                best = (key, t1, t2, adj)
    return best

def model_d(tr, i):
    _, t1, t2, adj = search(tr)
    r = routes[i]
    return rule_fare(r["dist"], r["a"], r["b"], t1, t2, adj)

for name, fn in [("A", model_a), ("C", model_c), ("D", model_d)]:
    loo_score(fn)
    print(f"  model {name}: within N100 on unseen routes: {loo_score.near:.0%}")
scores = {"A: distance only": loo_score(model_a), "B: distance + extra-charge places": loo_score(model_b), "C: fixed tiers 1.3/2.7 km": loo_score(model_c), "D: searched cut-offs + place adjustments": loo_score(model_d)}
print("\nAccuracy on routes the model had not seen (leave-one-out):")
for k, v in scores.items():
    print(f"  {k:42s} exact {v:.0%}")

(_, t1, t2, adj) = search(list(range(len(routes))))
print()
print("Model D trained on all routes: cut-offs", round(t1), round(t2), "m; place adjustments", adj)
json.dump({"tiers": [[round(t1), 100], [round(t2), 200], [None, 300]], "adjust": adj, "minFare": 100, "maxFare": 300,
           "looAccuracy": scores}, open(os.path.join(HERE, "fare_model_d.json"), "w"), indent=1)
for r in routes:
    f = rule_fare(r["dist"], r["a"], r["b"], t1, t2, adj)
    if f != r["fare"]:
        print(f"  D miss: {r['a']} -> {r['b']}  official N{r['fare']}, rule N{f}")

print("wrote tools/fare_model_d.json  (copy tiers/adjust into transport.js)")
