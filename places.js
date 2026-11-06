// OAU campus places.
// Positions come from OpenStreetMap (© OpenStreetMap contributors, ODbL).
// To add a place: copy one line, change name, category and lat/lng.
// Get lat/lng from Google Maps: press and hold (phone) or right-click (laptop) on the spot.
// "aka" = other names people search for.
// "osm" = OpenStreetMap way ids of the building outline (optional). Run tools/fetch_osm.py after changing.

window.CATEGORIES = {
  gate:     { label: "Gates",            color: "#d62828", icon: "🚪" },
  hostel:   { label: "Hostels",          color: "#7b2cbf", icon: "🛏️" },
  faculty:  { label: "Faculties",        color: "#1d4ed8", icon: "🎓" },
  lecture:  { label: "Lecture Theatres", color: "#0891b2", icon: "📖" },
  landmark: { label: "Landmarks",        color: "#c2410c", icon: "⭐" },
  sport:    { label: "Sports",           color: "#15803d", icon: "⚽" },
  service:  { label: "Banks & Services", color: "#4b5563", icon: "🏦" },
};

window.PLACES = [
  // Gates
  { name: "OAU Main Gate", cat: "gate", lat: 7.49761, lng: 4.52262, aka: "entrance" },

  // Hostels
  { name: "Moremi Hall", cat: "hostel", lat: 7.51965, lng: 4.51860, aka: "female hostel", osm: [619270924] },
  { name: "Awolowo Hall", cat: "hostel", lat: 7.52058, lng: 4.51472, aka: "Awo", osm: [618217519] },
  { name: "Adekunle Fajuyi Hall", cat: "hostel", lat: 7.51735, lng: 4.51774, aka: "Fajuyi", osm: [619368836] },
  { name: "ETF Hall", cat: "hostel", lat: 7.51828, lng: 4.51466, aka: "Education Trust Fund", osm: [619368837] },
  { name: "Angola Hall (Anglo-Moz)", cat: "hostel", lat: 7.52180, lng: 4.51247, aka: "Anglomoz Anglo Moz", osm: [617970610] },
  { name: "Mozambique Hall (Anglo-Moz)", cat: "hostel", lat: 7.52286, lng: 4.51413, aka: "Anglomoz Anglo Moz", osm: [617970630] },
  { name: "Alumni Hall", cat: "hostel", lat: 7.52161, lng: 4.51718, osm: [620253753] },
  { name: "Postgraduate Hall", cat: "hostel", lat: 7.52271, lng: 4.51647, aka: "PG Hall", osm: [620256439] },
  { name: "Shadeyrin Hostel", cat: "hostel", lat: 7.51750, lng: 4.50746, aka: "Shadeyrin private hostel off campus" },
  { name: "Ojaja Hostel", cat: "hostel", lat: 7.51755, lng: 4.50926, aka: "Ojaja private hostel off campus" },

  // Faculties
  { name: "Faculty of Administration", cat: "faculty", lat: 7.52053, lng: 4.52231, aka: "Admin", osm: [617712368] },
  { name: "Faculty of Arts", cat: "faculty", lat: 7.51974, lng: 4.52410, osm: [617712370, 617712372, 617712373] },
  { name: "Faculty of Education", cat: "faculty", lat: 7.52074, lng: 4.52360, osm: [617712367] },
  { name: "Faculty of Law", cat: "faculty", lat: 7.52094, lng: 4.52237, osm: [617712365] },
  { name: "Faculty of Social Sciences", cat: "faculty", lat: 7.52130, lng: 4.52269, aka: "Social Science", osm: [617712366] },
  { name: "Faculty of Pharmacy", cat: "faculty", lat: 7.51676, lng: 4.52713, osm: [618243408] },
  { name: "Faculty of Technology", cat: "faculty", lat: 7.51786, lng: 4.52831, aka: "Engineering Tech", osm: [599038666] },
  { name: "Faculty of Environmental Design and Management", cat: "faculty", lat: 7.51583, lng: 4.52731, aka: "EDM", osm: [652826031] },
  { name: "Department of Architecture", cat: "faculty", lat: 7.52123, lng: 4.51848, aka: "EDM", osm: [617712423] },
  { name: "Postgraduate College", cat: "faculty", lat: 7.51623, lng: 4.53000, aka: "PG College", osm: [618642097] },

  // Lecture theatres
  { name: "1000 Seater Lecture Theatre", cat: "lecture", lat: 7.52084, lng: 4.51965, aka: "1000 seater", osm: [617712421] },
  { name: "AUD I", cat: "lecture", lat: 7.52000, lng: 4.52438, aka: "Auditorium 1", osm: [617712371] },
  { name: "AUD II", cat: "lecture", lat: 7.51943, lng: 4.52427, aka: "Auditorium 2", osm: [617712374] },
  { name: "First Bank Lecture Theatre", cat: "lecture", lat: 7.52179, lng: 4.52390, aka: "FBLT" },
  { name: "HSLT A, B, C", cat: "lecture", lat: 7.51672, lng: 4.52491, aka: "HSLT", osm: [618243403, 618243404, 618243405] },
  { name: "BOOA, BOOB, BOOC", cat: "lecture", lat: 7.51909, lng: 4.52540, aka: "BOO", osm: [618241274, 618241275, 595564740] },
  { name: "PG Lecture Theatre", cat: "lecture", lat: 7.51627, lng: 4.53004, aka: "PGLT", osm: [599038674] },
  { name: "Chemical Engineering Lecture Theatre", cat: "lecture", lat: 7.51938, lng: 4.52868, osm: [599038661] },

  // Landmarks
  { name: "Student Union Building (SUB)", cat: "landmark", lat: 7.51785, lng: 4.52137, aka: "SUB", osm: [616403563] },
  { name: "Oduduwa Hall", cat: "landmark", lat: 7.51880, lng: 4.52203, osm: [617712376] },
  { name: "Amphitheatre", cat: "landmark", lat: 7.51924, lng: 4.52213, aka: "Amphi", osm: [617712375] },
  { name: "Hezekiah Oluwasanmi Library", cat: "landmark", lat: 7.51984, lng: 4.52305, aka: "Library HOL", osm: [617712369] },
  { name: "Senate Building", cat: "landmark", lat: 7.51865, lng: 4.52349, aka: "Senate", osm: [617712377] },
  { name: "White House", cat: "landmark", lat: 7.51989, lng: 4.52089, osm: [617712411] },
  { name: "OAU Health Centre", cat: "landmark", lat: 7.52027, lng: 4.51636, aka: "Clinic Hospital", osm: [619971213] },
  { name: "Central Science Laboratory", cat: "landmark", lat: 7.52022, lng: 4.52753, aka: "CSL", osm: [599038653] },
  { name: "Museum of Natural History", cat: "landmark", lat: 7.51657, lng: 4.52857, aka: "Museum", osm: [599038677] },
  { name: "Civil Engineering Building", cat: "landmark", lat: 7.52308, lng: 4.52915, osm: [595564741] },
  { name: "Ogunbanjo Hall", cat: "landmark", lat: 7.52690, lng: 4.53249, osm: [618049262] },
  { name: "Religious Ground", cat: "landmark", lat: 7.51109, lng: 4.51844, aka: "church mosque chapel worship religious" },
  { name: "OAU Staff School", cat: "landmark", lat: 7.52341, lng: 4.53396, osm: [598416497] },

  // Sports
  { name: "OAU Sports Centre", cat: "sport", lat: 7.51525, lng: 4.52095, aka: "Stadium", osm: [625664968] },
  { name: "Main Bowl", cat: "sport", lat: 7.51620, lng: 4.52175, aka: "Football Pitch", osm: [619270909] },

  // Banks and services
  { name: "Access Bank", cat: "service", lat: 7.51356, lng: 4.52329, aka: "bank ATM", osm: [618765176] },
  { name: "Zenith Bank", cat: "service", lat: 7.51403, lng: 4.52324, aka: "bank ATM", osm: [618765174] },
  { name: "GTBank", cat: "service", lat: 7.51419, lng: 4.52326, aka: "Guaranty Trust bank ATM", osm: [618765173] },
  { name: "UBA", cat: "service", lat: 7.51439, lng: 4.52330, aka: "bank ATM", osm: [618765172] },
  { name: "OAU Microfinance Bank", cat: "service", lat: 7.51462, lng: 4.52335, aka: "bank ATM", osm: [618765171] },
  { name: "Polaris Bank", cat: "service", lat: 7.51483, lng: 4.52336, aka: "bank ATM", osm: [618765170] },
  { name: "First Bank", cat: "service", lat: 7.51528, lng: 4.52343, aka: "bank ATM", osm: [618765175] },
  { name: "Wema Bank", cat: "service", lat: 7.51555, lng: 4.52315, aka: "bank ATM", osm: [652826036] },
  { name: "Ecobank", cat: "service", lat: 7.51805, lng: 4.52013, aka: "bank ATM", osm: [617712417] },
  { name: "OAU Service Station", cat: "service", lat: 7.49830, lng: 4.52374, aka: "Fuel Petrol Filling", osm: [618664731] },
  { name: "ETF Hall Mosque", cat: "service", lat: 7.51878, lng: 4.51469, aka: "Mosque", osm: [616403572] },
  { name: "New Buka", cat: "service", lat: 7.51691, lng: 4.51391, aka: "Food Restaurant" },
];
