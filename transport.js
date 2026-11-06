// Keke and bus settings for directions.
// After changing anything here, bump APP_VERSION in sw.js so phones get the update.

window.TRANSPORT = {
  keke: { speedKmh: 18, waitMin: 3 },  // kekes: stop one on any road
  bus: { speedKmh: 15, waitMin: 6 },   // buses/shuttles: run on the fixed routes below

  // Fare points used in the fare list. Each lists the map places (exact names from places.js) it covers.
  // An empty list means the place is not on the map yet: routes using it stay off until it is added.
  points: {
    "Road 1 Gate": ["OAU Main Gate"],
    "SUB": ["Student Union Building (SUB)"],
    "Market": ["New Market"],
    "Int'l School": [],
    "Hall": ["Moremi Hall", "Awolowo Hall", "Adekunle Fajuyi Hall", "ETF Hall", "Angola Hall (Anglo-Moz)", "Mozambique Hall (Anglo-Moz)", "Alumni Hall", "Postgraduate Hall"],
    "Religious Ground": ["Religious Ground"],
    "Central Academic Area": ["White House", "Faculty of Social Sciences", "1000 Seater Lecture Theatre", "Faculty of Arts"],
    "Spider House": ["Spider Building"],
    "PG College/ICT": ["Postgraduate College"],
    "Tonkere Gate/Agric Ext": ["Tonkere Gate"],
    "Road 7 Gate": ["Road 7 Gate"],
    "Ojaja": ["Ojaja Hostel"],
    "Health Centre": ["OAU Health Centre"],
    "DSA/Ajose/Faculty of Agric": ["Ajose"],
  },

  // Official fares in naira. Source: Transport Management Commission, Great Ife Students' Union,
  // "Cost of Transport", 2024/2025 session. Each fare applies in both directions, for buses and kekes.
  fares: [
    ["Road 1 Gate", "SUB", 200],
    ["Road 1 Gate", "Market", 300],
    ["Road 1 Gate", "Int'l School", 300],
    ["Road 1 Gate", "Hall", 300],
    ["Road 1 Gate", "Religious Ground", 300],
    ["SUB", "Central Academic Area", 100],
    ["SUB", "Spider House", 200],
    ["SUB", "PG College/ICT", 100],
    ["SUB", "Tonkere Gate/Agric Ext", 200],
    ["SUB", "Road 7 Gate", 200],
    ["SUB", "Market", 100],
    ["Market", "Ojaja", 100],
    ["SUB", "Ojaja", 200],
    ["SUB", "Religious Ground", 200],
    ["Hall", "SUB", 100],
    ["Hall", "Health Centre", 100],
    ["Hall", "Int'l School", 200],
    ["Hall", "PG College/ICT", 200],
    ["Hall", "DSA/Ajose/Faculty of Agric", 300],
    ["Hall", "Religious Ground", 300],
    ["Market", "Tonkere Gate/Agric Ext", 300],
  ],

  // For trips that are not in the list, the app estimates the fare (shown as "about").
  // Rule learned from the official fares with tools/fit_fares.py (scikit-learn, leave-one-out tested):
  // on 19 official routes it had not seen, it was exact 84% of the time and never more than N100 off.
  estimate: {
    tiers: [[1247, 100], [2788, 200], [Infinity, 300]], // road distance (m) -> fare
    adjust: { "Religious Ground": 100, "DSA/Ajose/Faculty of Agric": 100 }, // extra for these places
    min: 100,
    max: 300,
  },

  // How close (metres) a place must be to a fare point to count as that fare point.
  pointRadius: 350,
};
