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
const chernBox = poly([[27.95, 45.6], [30.2, 45.6], [30.2, 43.06], [27.9, 43.06], [27.45, 43.1],
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
// deterministic midpoint-displacement wobble, so cut lines look like natural coast / borders
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
function wobble(pts, ampKm, depth = 5) {
  let line = pts;
  let amp = ampKm;
  for (let d = 0; d < depth; d++, amp *= 0.55) {
    const out = [line[0]];
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      const mid = turf.midpoint(a, b).geometry.coordinates;
      const brg = turf.bearing(a, b) + 90;
      out.push(turf.destination(mid, rnd() * 2 * amp, brg).geometry.coordinates, b);
    }
    line = out;
  }
  return line;
}

// New coastline: runs diagonally from the north-east (Chernogorsk) to Novigrad in the south-west, like the game map.
const coast = wobble([[29.8, 45.02], [29.35, 44.88], [29.15, 44.8], [28.75, 44.55], [28.45, 44.2], [28.3, 43.85],
  [28.1, 43.5], [27.95, 43.2], [27.97, 43.08]], 3.2);
const seaCut = poly([...coast, [28.6, 43.07], [30.6, 43.07], [30.6, 45.02]]);
// Black Mountains: alpine ridge along the northern border of Chernarus
const blackMountains = poly(wobble([[27.92, 44.98], [28.4, 44.95], [28.9, 44.97], [29.3, 44.93], [29.78, 45.04],
  [29.8, 45.28], [29.2, 45.42], [28.6, 45.47], [28.1, 45.43], [27.9, 45.3], [27.92, 44.98]], 2.5, 4));

const merge = (arr) => arr.length > 1 ? turf.union(fc(...arr)).geometry : arr[0].geometry;
// Utes island off the coast
const chernLand = turf.feature(merge(parts.CHR));
const islands = [turf.circle([29.5, 44.5], 6, { steps: 16, units: 'kilometers' }),
  turf.circle([28.1, 43.13], 2.5, { steps: 10, units: 'kilometers' })];
// South Zagoria: the Razim lagoons under the Black Mountains become forested hills
const zagoria = turf.difference(fc(poly(wobble([[28.72, 44.6], [28.6, 44.82], [28.68, 45.03], [29.4, 45.02],
  [29.85, 45.08], [29.85, 44.6], [28.72, 44.6]], 2, 4)), seaCut));
const chernGeom = turf.union(fc(turf.difference(fc(chernLand, seaCut)), zagoria, ...islands)).geometry;
// land that becomes sea (painted over the satellite image), with a small margin into the real sea
const seaPaint = turf.difference(fc(turf.intersect(fc(turf.buffer(chernLand, 3, { units: 'kilometers' }), seaCut)), ...islands));
byId.CHR = { type: 'Feature', geometry: chernGeom,
  properties: { id: 'CHR', name: 'Chernarus', nameRu: 'Чернорусь', lx: 28.05, ly: 44.3, minLabel: 2, cx: 27.88, cy: 43.22 } };
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
  let e = turf.ellipse([29.3, 43.85], r * 1.15, r, { units: 'kilometers', steps: 64 });
  for (const l of land) { if (!e) break; e = turf.difference(fc(e, l)); }
  if (e) tint.push({ ...e, properties: { o } });
}
fs.writeFileSync(path.join(outDir, 'greensea.json'), JSON.stringify(turf.featureCollection(tint)));
// shapes used by tools/terrain.js to paint the fictional terrain
fs.writeFileSync(path.join(outDir, 'fiction.json'), JSON.stringify({
  seaPaint: seaPaint.geometry, zagoria: zagoria.geometry, blackMountains: blackMountains.geometry, takistan: byId.TKS.geometry,
}));

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
  ['Novigrad', 27.88, 43.22, 1], ['Chernogorsk', 29.0, 44.76, 0], ['Primorsk', 28.13, 43.75, 0],
  ['Miroslavl', 28.55, 44.52, 0], ['Kirovograd', 27.7, 44.05, 0], ['Belozersk', 28.05, 44.9, 0],
  ['Utes', 29.5, 44.5, 0], ['Moschnyi', 28.1, 43.13, 0],
  ['Rasman', 26.45, 43.05, 1], ['Loy Manara', 25.8, 43.75, 0], ['Feruz Abad', 26.9, 43.6, 0], ['Garmsar', 25.7, 43.0, 0],
].map(([n, x, y, cap]) => ({ n, x, y, z: 2.5, cap }));
fs.writeFileSync(path.join(outDir, 'cities.json'), JSON.stringify([...cities, ...custom]));
console.log('countries', world.features.length, 'cities', cities.length + custom.length,
  'world.json KB', Math.round(fs.statSync(path.join(outDir, 'world.json')).size / 1024));
