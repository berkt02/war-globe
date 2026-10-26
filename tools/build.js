// Builds world.json (countries) and cities.json for the game from Natural Earth data.
const fs = require('fs');
const path = require('path');
const turf = require('@turf/turf');

const [, , dataDir, outDir] = process.argv;
const src = JSON.parse(fs.readFileSync(path.join(dataDir, 'countries.geojson')));
const places = JSON.parse(fs.readFileSync(path.join(dataDir, 'places.geojson')));

const fc = (...f) => turf.featureCollection(f);
const poly = (ring) => turf.polygon([[...ring, ring[0]]]);

const byId = {};
for (const f of src.features) {
  const p = f.properties;
  let id = p.ADM0_A3;
  if (byId[id]) id += '_' + p.NAME;
  byId[id] = {
    type: 'Feature',
    geometry: f.geometry,
    properties: {
      id,
      name: p.NAME_EN || p.NAME,
      nameRu: p.NAME_RU || p.NAME,
      lx: p.LABEL_X, ly: p.LABEL_Y,
      minLabel: p.MIN_LABEL || 3,
      iso2: (p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : '').toLowerCase(),
    },
  };
}

// --- Russia: Crimea + new regions + south up to Odesa
const occupied = poly([
  [41, 51], [38.3, 50.15], [38.05, 49.1], [37.1, 49.2], [36.55, 48.6], [35.8, 48.25],
  [34.9, 48.0], [34.1, 47.95], [33.2, 47.95], [32.5, 48.05], [31.7, 48.3], [30.6, 48.25],
  [29.9, 48.2], [29.35, 47.85], [29.55, 47.35], [29.9, 46.8], [29.6, 46.4], [28.9, 46.5],
  [28.5, 45.9], [28.1, 45.4], [28.0, 43.5], [41, 43.5],
]);
const ukr = byId.UKR;
const taken = turf.intersect(fc(ukr, occupied));
byId.RUS.geometry = turf.union(fc(byId.RUS, taken)).geometry;
ukr.geometry = turf.difference(fc(ukr, occupied)).geometry;

// --- Chernarus (exact silhouette from the game map, see chernarus.js) and Takistan
const CH = require('./chernarus').shapes();
// Takistan takes north-east Bulgaria and southern Dobruja
const takBox = poly([[29.0, 45.6], [29.0, 43.06], [27.9, 43.06], [27.75, 42.75], [27.2, 42.55], [26.5, 42.6], [25.9, 42.5],
  [25.45, 42.75], [25.6, 43.05], [25.35, 43.35], [25.45, 43.7], [25.9, 43.9], [26.4, 44.1], [26.9, 44.2], [27.3, 44.15],
  [27.75, 44.4], [27.95, 44.75], [27.88, 45.1], [28.0, 45.45], [27.95, 45.6]]);
const tParts = [];
for (const id of ['ROU', 'BGR']) {
  const c = byId[id];
  const a = turf.intersect(fc(c, takBox)); if (a) tParts.push(a);
  c.geometry = turf.difference(fc(c, takBox)).geometry;
}
// everything inside the redrawn zone is replaced by the traced shapes
const zb = turf.bbox(CH.zone);
for (const f of Object.values(byId)) {
  const b = turf.bbox(f);
  if (b[2] < zb[0] || b[0] > zb[2] || b[3] < zb[1] || b[1] > zb[3]) continue;
  const rest = turf.difference(fc(f, CH.zone));
  if (rest) f.geometry = rest.geometry; else delete byId[f.properties.id];
}
const tks = turf.difference(fc(turf.union(fc(...tParts)), CH.zone));
const tksZone = turf.intersect(fc(CH.takistan, CH.zone));
const rusZone = turf.difference(fc(turf.intersect(fc(CH.russia, CH.zone)), CH.lake));
byId.RUS.geometry = turf.union(fc(byId.RUS, rusZone)).geometry;
const chernGeom = turf.union(fc(CH.chernarus, ...CH.islands)).geometry;
byId.CHR = { type: 'Feature', geometry: chernGeom,
  properties: { id: 'CHR', name: 'Chernarus', nameRu: 'Чернорусь', lx: CH.label[0], ly: CH.label[1], minLabel: 2,
    cx: CH.cities[0][1], cy: CH.cities[0][2] } };
byId.TKS = { type: 'Feature', geometry: turf.union(fc(tks, tksZone)).geometry,
  properties: { id: 'TKS', name: 'Takistan', nameRu: 'Такистан', lx: 26.6, ly: 43.6, minLabel: 2, cx: 26.45, cy: 43.05 } };
byId.ROU.properties.lx = 24.6; byId.ROU.properties.ly = 45.8;
byId.BGR.properties.lx = 24.4; byId.BGR.properties.ly = 42.6;
byId.UKR.properties.lx = 31.2; byId.UKR.properties.ly = 49.4;

for (const pl of places.features) {
  const p = pl.properties;
  if (p.adm0cap !== 1 || !p.adm0_a3) continue;
  const f = byId[p.adm0_a3];
  if (f && f.properties.cx == null && p.featurecla !== 'Admin-0 capital alt') { f.properties.cx = +p.longitude.toFixed(3); f.properties.cy = +p.latitude.toFixed(3); }
}

// Green Sea: soft green tint rings in the western Black Sea, minus land
const land = ['CHR', 'TKS', 'BGR', 'ROU', 'UKR', 'RUS', 'TUR', 'MDA'].map((k) => byId[k]).filter(Boolean);
const tint = [];
for (const [r, o] of Array.from({ length: 12 }, (_, i) => [40 + i * 22, 0.028])) {
  let e = turf.ellipse([29.0, 44.0], r * 1.15, r, { units: 'kilometers', steps: 64 });
  for (const l of land) { if (!e) break; e = turf.difference(fc(e, l)); }
  if (e) tint.push({ ...e, properties: { o } });
}
fs.writeFileSync(path.join(outDir, 'greensea.json'), JSON.stringify(turf.featureCollection(tint)));
// shapes used by tools/terrain.js to paint the fictional terrain
fs.writeFileSync(path.join(outDir, 'fiction.json'), JSON.stringify({
  zone: CH.zone.geometry, chernarus: chernGeom, russia: rusZone.geometry, takistanZone: tksZone.geometry,
  ridge: CH.ridge.geometry, lake: CH.lake.geometry, takistan: byId.TKS.geometry,
}));

// round coordinates to keep the file small
const round = (g) => JSON.parse(JSON.stringify(g, (k, v) => typeof v === 'number' ? Math.round(v * 1000) / 1000 : v));
const world = turf.featureCollection(Object.values(byId).map((f) => ({ ...f, geometry: round(f.geometry) })));
fs.writeFileSync(path.join(outDir, 'world.json'), JSON.stringify(world));

// --- cities
const inBox = (b, x, y) => turf.booleanPointInPolygon([x, y], b);
const cities = places.features
  .map((f) => f.properties)
  .filter((p) => !inBox(CH.zone, p.longitude, p.latitude) && !inBox(takBox, p.longitude, p.latitude))
  .map((p) => ({ n: p.name, x: +p.longitude.toFixed(3), y: +p.latitude.toFixed(3),
    z: Math.max(1.5, p.min_zoom || 4), cap: p.adm0cap ? 1 : 0 }));
const custom = [
  ...CH.cities,
  ['Rasman', 26.45, 43.05, 1], ['Loy Manara', 25.8, 43.75, 0], ['Feruz Abad', 26.9, 43.6, 0], ['Garmsar', 25.7, 43.0, 0],
  ['Nagara', 27.6, 43.55, 0], ['Zavarak', 28.1, 44.25, 0],
].map(([n, x, y, cap]) => ({ n, x, y, z: 2.5, cap }));
fs.writeFileSync(path.join(outDir, 'cities.json'), JSON.stringify([...cities, ...custom]));
console.log('countries', world.features.length, 'cities', cities.length + custom.length,
  'world.json KB', Math.round(fs.statSync(path.join(outDir, 'world.json')).size / 1024));
