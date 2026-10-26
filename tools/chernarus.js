// Chernarus silhouette traced from the official Chernarus map (pixel coords of a 1280x1020 map, 5.95 px = 1 km)
// and placed on the western Black Sea. Shared by build.js (country shapes) and terrain.js (imagery masks).
const turf = require('@turf/turf');

const PX_PER_KM = 5.95;
const LON0 = 27.6, LAT0 = 45.75, LAT_MID = 45.0;
const toLonLat = ([x, y]) => [
  LON0 + x / PX_PER_KM / (111.32 * Math.cos((LAT_MID * Math.PI) / 180)),
  LAT0 - y / PX_PER_KM / 111.32,
];

// --- traced polylines (map pixels)
// northern border with Russia along the Black Mountains, west -> east
const NB = [[240, 172], [265, 182], [300, 195], [340, 205], [380, 222], [410, 240], [425, 255], [440, 240], [465, 215],
  [495, 180], [520, 150], [555, 132], [600, 125], [650, 128], [700, 140], [745, 150], [790, 170], [820, 185], [848, 190],
  [880, 178], [920, 168], [960, 172], [1000, 172], [1050, 168], [1095, 162]];
// coastline, north-east (Svetlojarsk) -> south-west (Novigrad)
const COAST = [[1095, 162], [1085, 190], [1060, 225], [1050, 260], [1040, 290], [1045, 320], [1035, 350], [1045, 380],
  [1030, 400], [1000, 415], [960, 420], [915, 422], [880, 410], [850, 410], [820, 415], [800, 430], [785, 455], [770, 480],
  [740, 495], [700, 497], [680, 492], [650, 500], [625, 515], [600, 538], [580, 560], [562, 590], [555, 615], [550, 640],
  [538, 660], [545, 690], [545, 720], [530, 745], [505, 758], [470, 765], [440, 770], [420, 778], [410, 800], [405, 830],
  [390, 855], [360, 868], [320, 874], [290, 877], [260, 870], [235, 862], [220, 850]];
// western border, Novigrad -> Lake Beloe (Takistan below Pervomaysk, Russia above)
const WB_TKS = [[220, 850], [212, 800], [210, 755], [205, 700], [200, 660], [190, 640], [150, 610], [110, 575], [85, 545],
  [70, 520], [62, 495]];
const WB_RUS = [[62, 495], [50, 465], [38, 430], [35, 395], [42, 355], [58, 322], [85, 298], [107, 295], [120, 262],
  [133, 243], [165, 215], [200, 192], [240, 172]];
// Takistan coast west of Novigrad, then on beyond the map edge until it meets the real Dobruja coast
const TKS_COAST = [[220, 850], [195, 858], [160, 868], [125, 885], [95, 910], [75, 945], [60, 985], [50, 1020]];
const TKS_COAST_LL = [[27.95, 44.0], [28.3, 43.82], [28.62, 43.72]];
// Russian coast north of Chernarus
const RUS_COAST = [[1095, 162], [1140, 150], [1200, 132], [1228, 100], [1240, 60], [1238, -20]];
const LAKE_BELOE = [[75, 165], [105, 150], [140, 155], [180, 170], [215, 160], [240, 165], [238, 180], [205, 192],
  [170, 212], [140, 232], [112, 244], [86, 236], [92, 205]];
const ISLANDS = {
  Utes: [[1030, 590], [1050, 584], [1063, 598], [1058, 616], [1044, 613], [1034, 603]],
  Moschnyi: [[478, 862], [494, 858], [499, 871], [486, 878]],
  Skalisty: [[1040, 404], [1058, 404], [1061, 418], [1045, 421]],
};
// black mountains ridge: follows the northern border from Zagorsk to the coast
const RIDGE = [[440, 245], [500, 190], [560, 150], [650, 140], [745, 165], [850, 200], [960, 185], [1090, 175]];

const CITIES = [
  ['Novigrad', 268, 855, 1], ['Zelenomorsk', 343, 863], ['Severnoe', 281, 745], ['Svetlograd', 311, 632],
  ['Leninsk', 226, 612], ['Kirovograd', 397, 603], ['Primorsk', 415, 768], ['Miroslavl', 693, 497],
  ['Chernogorsk', 913, 421], ['Elektrozavodsk', 988, 421], ['Svetlojarsk', 1057, 225], ['Krasnostav', 1030, 262],
  ['Berezino', 955, 325], ['Vybor', 858, 302], ['Zagorsk', 740, 217], ['Severniy', 617, 183], ['Kuznetsk', 506, 290],
  ['Dobkovicy', 566, 372], ['Zernovo', 380, 440], ['Belozersk', 194, 270], ['Trotsk', 243, 195],
  ['Pervomaysk', 95, 490], ['Kislozavodsk', 225, 398], ['Rossoha', 225, 493], ['Stekolniy', 548, 470],
  ['Pavlovo', 592, 545], ['Komsomolsk', 533, 622], ['Utes', 1046, 600], ['Moschnyi', 488, 868],
];

// deterministic small wobble so the traced polylines get natural-looking detail without changing the silhouette
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
function wobble(pts, ampKm, depth = 4) {
  let line = pts, amp = ampKm;
  for (let d = 0; d < depth; d++, amp *= 0.55) {
    const out = [line[0]];
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      const mid = turf.midpoint(a, b).geometry.coordinates;
      out.push(turf.destination(mid, rnd() * 2 * amp, turf.bearing(a, b) + 90).geometry.coordinates, b);
    }
    line = out;
  }
  return line;
}
const ll = (pts) => pts.map(toLonLat);
const rev = (a) => [...a].reverse();
const ring = (...parts) => {
  const r = [];
  for (const p of parts) for (const q of p) if (!r.length || r[r.length - 1][0] !== q[0] || r[r.length - 1][1] !== q[1]) r.push(q);
  if (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) r.push(r[0]);
  return turf.polygon([r]);
};

function shapes() {
  const nb = wobble(ll(NB), 0.5), coast = wobble(ll(COAST), 0.8);
  const wbT = wobble(ll(WB_TKS), 0.5), wbR = wobble(ll(WB_RUS), 0.5);
  const tCoast = wobble([...ll(TKS_COAST), ...TKS_COAST_LL], 0.8), rCoast = wobble(ll(RUS_COAST), 0.8);
  const [w, n] = toLonLat([0, 0]), [e, s] = toLonLat([1280, 1020]);
  const chernarus = ring(nb, coast, wbT, wbR);
  const left = toLonLat([-200, 0])[0];
  const russia = ring([[left, n + 0.2]], [[rCoast[rCoast.length - 1][0], n + 0.2]], rev(rCoast), rev(nb), rev(wbR),
    [[left, toLonLat([0, 495])[1]]]);
  const takistan = ring([[left, toLonLat([0, 495])[1]]], rev(wbT), tCoast, [[28.62, 43.5], [left, 43.5]]);
  // the area whose imagery and countries are fully redrawn
  // irregular outline so the edge of the redrawn area doesn't read as a rectangle
  const zone = turf.polygon([wobble([[w, 44.0], [w, (n + s) / 2], [w, n], [(w + e) / 2, n], [e, n], [e, 43.65],
    [28.62, 43.65], [28.62, 43.72], [28.3, 43.82], [27.95, 44.0], [w, 44.0]], 6, 5)]);
  const islands = Object.values(ISLANDS).map((p) => ring(ll(p)));
  const lake = ring(ll(LAKE_BELOE));
  const ridge = turf.buffer(turf.lineString(ll(RIDGE)), 11, { units: 'kilometers' });
  const cities = CITIES.map(([name, x, y, cap]) => [name, ...toLonLat([x, y]), cap || 0]);
  return { chernarus, russia, takistan, zone, islands, lake, ridge, cities, label: toLonLat([600, 470]) };
}

module.exports = { shapes, toLonLat };
