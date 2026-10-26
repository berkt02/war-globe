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

// --- Chernarus and Takistan carved out of Romania / Bulgaria
const chernBox = poly([[27.95, 45.6], [30.2, 45.6], [30.2, 42.5], [28.0, 42.5], [27.75, 42.75], [27.4, 42.95],
  [27.15, 43.25], [27.35, 43.55], [27.25, 43.9], [27.3, 44.15], [27.75, 44.4], [27.95, 44.75], [27.88, 45.1], [28.0, 45.45]]);
const takBox = turf.difference(fc(poly([[27.3, 44.15], [27.25, 43.9], [27.35, 43.55], [27.15, 43.25], [27.4, 42.95],
  [27.75, 42.75], [27.2, 42.55], [26.5, 42.6], [25.9, 42.5], [25.45, 42.75], [25.6, 43.05], [25.35, 43.35],
  [25.45, 43.7], [25.9, 43.9], [26.4, 44.1], [26.9, 44.2]]), chernBox));
const parts = { CHR: [], TKS: [] };
for (const id of ['ROU', 'BGR']) {
  const c = byId[id];
  const a = turf.intersect(fc(c, chernBox)); if (a) parts.CHR.push(a);
  const b = turf.intersect(fc(c, takBox)); if (b) parts.TKS.push(b);
  c.geometry = turf.difference(fc(c, chernBox)).geometry;
  c.geometry = turf.difference(fc(c, takBox)).geometry;
}
const merge = (arr) => arr.length > 1 ? turf.union(fc(...arr)).geometry : arr[0].geometry;
// Utes island off the coast
const utes = turf.circle([29.1, 44.2], 7, { steps: 14, units: 'kilometers' });
const chernGeom = turf.union(fc(turf.feature(merge(parts.CHR)), utes)).geometry;
byId.CHR = { type: 'Feature', geometry: chernGeom,
  properties: { id: 'CHR', name: 'Chernarus', nameRu: 'Чернорусь', lx: 28.3, ly: 44.3, minLabel: 2, cx: 27.92, cy: 43.2 } };
byId.TKS = { type: 'Feature', geometry: merge(parts.TKS),
  properties: { id: 'TKS', name: 'Takistan', nameRu: 'Такистан', lx: 26.3, ly: 43.4, minLabel: 2, cx: 26.45, cy: 43.05 } };
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
const land = ['CHR', 'TKS', 'BGR', 'ROU', 'UKR', 'RUS', 'TUR', 'MDA'].map((k) => byId[k]);
const tint = [];
for (const [r, o] of Array.from({ length: 12 }, (_, i) => [40 + i * 22, 0.028])) {
  let e = turf.ellipse([29.9, 43.75], r * 1.15, r, { units: 'kilometers', steps: 64 });
  for (const l of land) { if (!e) break; e = turf.difference(fc(e, l)); }
  if (e) tint.push({ ...e, properties: { o } });
}
fs.writeFileSync(path.join(outDir, 'greensea.json'), JSON.stringify(turf.featureCollection(tint)));

// round coordinates to keep the file small
const round = (g) => JSON.parse(JSON.stringify(g, (k, v) => typeof v === 'number' ? Math.round(v * 1000) / 1000 : v));
const world = turf.featureCollection(Object.values(byId).map((f) => ({ ...f, geometry: round(f.geometry) })));
fs.writeFileSync(path.join(outDir, 'world.json'), JSON.stringify(world));

// --- cities
const inBox = (b, x, y) => turf.booleanPointInPolygon([x, y], b);
const cities = places.features
  .map((f) => f.properties)
  .filter((p) => !inBox(chernBox, p.longitude, p.latitude) && !inBox(takBox, p.longitude, p.latitude))
  .map((p) => ({ n: p.name, x: +p.longitude.toFixed(3), y: +p.latitude.toFixed(3),
    z: Math.max(1.5, p.min_zoom || 4), cap: p.adm0cap ? 1 : 0 }));
const custom = [
  ['Novigrad', 27.92, 43.2, 1], ['Chernogorsk', 28.63, 44.18, 0], ['Primorsk', 28.58, 43.82, 0],
  ['Miroslavl', 28.3, 44.75, 0], ['Kirovograd', 27.6, 44.0, 0], ['Belozersk', 28.15, 45.2, 0],
  ['Utes', 29.1, 44.2, 0],
  ['Rasman', 26.45, 43.05, 1], ['Loy Manara', 25.8, 43.75, 0], ['Feruz Abad', 26.9, 43.6, 0], ['Garmsar', 25.7, 43.0, 0],
].map(([n, x, y, cap]) => ({ n, x, y, z: 2.5, cap }));
fs.writeFileSync(path.join(outDir, 'cities.json'), JSON.stringify([...cities, ...custom]));
console.log('countries', world.features.length, 'cities', cities.length + custom.length,
  'world.json KB', Math.round(fs.statSync(path.join(outDir, 'world.json')).size / 1024));
