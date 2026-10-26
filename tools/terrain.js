// Paints the fictional terrain as image overlays. Real imagery from elsewhere is "transplanted" at true scale:
// Chernarus = Czech countryside, Black Mountains = the Alps, Takistan = southern Afghanistan, northern shore = Ukraine;
// sea is painted wherever the traced map has water. Imagery: Sentinel-2 cloudless 2020 by EOX (CC BY-NC-SA 4.0).
// Usage: node terrain.js <dataDir> <tileCacheDir>
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const turf = require('@turf/turf');

const [, , dataDir, cacheDir] = process.argv;
const fiction = JSON.parse(fs.readFileSync(path.join(dataDir, 'fiction.json')));
fs.rmSync(path.join(dataDir, 'terrain'), { recursive: true, force: true });
fs.mkdirSync(path.join(dataDir, 'terrain'), { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });

const EOX = (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/${z}/${y}/${x}.jpg`;
const ESRI = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const invMercY = (y) => (Math.atan(Math.exp(y)) * 360) / Math.PI - 90;
const lon2px = (lon, z) => ((lon + 180) / 360) * 256 * 2 ** z;
const lat2px = (lat, z) => ((1 - mercY(lat) / Math.PI) / 2) * 256 * 2 ** z;
const cos = (d) => Math.cos((d * Math.PI) / 180);

async function tile(urlFn, name, z, x, y) {
  const f = path.join(cacheDir, `${name}-${z}-${x}-${y}.jpg`);
  if (!fs.existsSync(f)) {
    for (let i = 0; i < 4; i++) {
      try {
        const r = await fetch(urlFn(z, x, y));
        if (!r.ok) throw new Error(r.status);
        fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
        break;
      } catch (e) { if (i === 3) throw e; }
    }
  }
  return f;
}

// Raw RGB mosaic of imagery covering [w, s, e, n]
async function mosaic(urlFn, name, z, [w, s, e, n]) {
  const x0 = Math.floor(lon2px(w, z) / 256), x1 = Math.floor(lon2px(e, z) / 256);
  const y0 = Math.floor(lat2px(n, z) / 256), y1 = Math.floor(lat2px(s, z) / 256);
  const jobs = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push([x, y]);
  const files = [];
  for (let i = 0; i < jobs.length; i += 8) {
    files.push(...await Promise.all(jobs.slice(i, i + 8).map(([x, y]) => tile(urlFn, name, z, x, y).then((f) => ({ f, x, y })))));
  }
  const W = (x1 - x0 + 1) * 256, H = (y1 - y0 + 1) * 256;
  const buf = await sharp({ create: { width: W, height: H, channels: 3, background: '#000' } })
    .composite(files.map(({ f, x, y }) => ({ input: f, left: (x - x0) * 256, top: (y - y0) * 256 })))
    .removeAlpha().raw().toBuffer();
  return { buf, W, H, ox: x0 * 256, oy: y0 * 256, z };
}

// A sampler that reads imagery around srcCenter as if it were located at tgtCenter (same km scale).
async function sampler(tgtCenter, srcCenter, bbox, z, gain = 1) {
  const kx = cos(tgtCenter[1]) / cos(srcCenter[1]);
  const map = (lon, lat) => [srcCenter[0] + (lon - tgtCenter[0]) * kx, srcCenter[1] + (lat - tgtCenter[1])];
  const [a, b] = map(bbox[0], bbox[1]), [c, d] = map(bbox[2], bbox[3]);
  const m = await mosaic(EOX, 'eox', z, [a, b, c, d]);
  return (lon, lat, out, o) => {
    const [sl, sa] = map(lon, lat);
    const fx = lon2px(sl, m.z) - m.ox - 0.5, fy = lat2px(sa, m.z) - m.oy - 0.5;
    const x = Math.max(0, Math.min(m.W - 2, Math.floor(fx))), y = Math.max(0, Math.min(m.H - 2, Math.floor(fy)));
    const ax = Math.min(1, Math.max(0, fx - x)), ay = Math.min(1, Math.max(0, fy - y));
    for (let ch = 0; ch < 3; ch++) {
      const p = (yy, xx) => m.buf[(yy * m.W + xx) * 3 + ch];
      const top = p(y, x) * (1 - ax) + p(y, x + 1) * ax;
      const bot = p(y + 1, x) * (1 - ax) + p(y + 1, x + 1) * ax;
      out[o + ch] = (top * (1 - ay) + bot * ay) * gain;
    }
  };
}

// Feathered polygon mask (0..1 floats) in the output image's pixel space
async function mask(geom, bbox, W, H, blur) {
  const [w, s, e, n] = bbox;
  const px = ([lon, lat]) => `${(((lon - w) / (e - w)) * W).toFixed(1)},${(((mercY(n) - mercY(lat)) / (mercY(n) - mercY(s))) * H).toFixed(1)}`;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const d = polys.map((rings) => rings.map((r) => 'M' + r.map(px).join('L') + 'Z').join('')).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#000"/><path d="${d}" fill="#fff" fill-rule="evenodd"/></svg>`;
  let img = sharp(Buffer.from(svg)).greyscale();
  if (blur) img = img.blur(blur);
  const raw = await img.raw().toBuffer();
  const out = new Float32Array(W * H);
  for (let i = 0; i < out.length; i++) out[i] = raw[i] / 255;
  return out;
}

const heightFor = ([w, s, e, n], W) => Math.round((W * (mercY(n) - mercY(s))) / (((e - w) * Math.PI) / 180));
const centerOf = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

async function write(id, bbox, W, H, rgb, alpha) {
  const rgba = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.max(0, Math.min(255, rgb[i * 3 + c]));
    rgba[i * 4 + 3] = Math.round(alpha[i] * 255);
  }
  const file = `terrain/${id}.webp`;
  await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 80, alphaQuality: 80 }).toFile(path.join(dataDir, file));
  const [w, s, e, n] = bbox;
  console.log(id, `${W}x${H}`, Math.round(fs.statSync(path.join(dataDir, file)).size / 1024) + ' KB');
  return { id, url: `data/${file}`, coordinates: [[w, n], [e, n], [e, s], [w, s]] };
}

function forEachPixel(bbox, W, H, fn) {
  const [w, s, e, n] = bbox;
  const yN = mercY(n), yS = mercY(s);
  for (let j = 0; j < H; j++) {
    const lat = invMercY(yN + ((j + 0.5) / H) * (yS - yN));
    for (let i = 0; i < W; i++) fn(j * W + i, w + ((i + 0.5) / W) * (e - w), lat);
  }
}

const SRC = { afghan: [66.05, 31.95], czech: [15.35, 49.45], alps: [8.05, 46.45], ukraine: [33.2, 48.9] };
const pad = (b, d) => [b[0] - d, b[1] - d, b[2] + d, b[3] + d];

(async () => {
  const layers = [];

  // 1. Takistan (whole country): Afghan desert and mountains
  const tBox = pad(turf.bbox(fiction.takistan), 0.06);
  const tCenter = centerOf(tBox);
  const afghan = await sampler(tCenter, SRC.afghan, tBox, 10, 0.95);
  {
    const W = 2048, H = heightFor(tBox, W);
    const rgb = new Float32Array(W * H * 3);
    forEachPixel(tBox, W, H, (i, lon, lat) => afghan(lon, lat, rgb, i * 3));
    layers.push(await write('takistan', tBox, W, H, rgb, await mask(fiction.takistan, tBox, W, H, 3)));
  }

  // 2. The redrawn Chernarus zone: sea + land textures exactly following the traced map
  const zBox = pad(turf.bbox(fiction.zone), 0.02);
  const W = 2400, H = heightFor(zBox, W);
  const zCenter = centerOf(zBox);
  const czech = await sampler(zCenter, SRC.czech, zBox, 10, 0.95);
  const alps = await sampler([zCenter[0], 45.3], SRC.alps, zBox, 10, 0.92);
  const ukraine = await sampler(zCenter, SRC.ukraine, zBox, 10, 0.92);
  const zAfghan = await sampler(tCenter, SRC.afghan, zBox, 10, 0.95);
  const [mZone, mChr, mRus, mTks, mRidge] = await Promise.all([
    mask(fiction.zone, zBox, W, H, 40), mask(fiction.chernarus, zBox, W, H, 1.5), mask(fiction.russia, zBox, W, H, 1.5),
    mask(fiction.takistanZone, zBox, W, H, 1.5), mask(fiction.ridge, zBox, W, H, 22),
  ]);
  const land = new Float32Array(W * H);
  for (let i = 0; i < land.length; i++) land[i] = Math.min(1, mChr[i] + mRus[i] + mTks[i]);
  const landImg = await sharp(Buffer.from(land.map((v) => v * 255)), { raw: { width: W, height: H, channels: 1 } }).blur(16).raw().toBuffer();

  const sea = await mosaic(ESRI, 'esri', 9, [29.9, 43.8, 30.1, 43.95]);
  const deep = [0, 0, 0];
  for (let i = 0; i < sea.W * sea.H; i++) for (let c = 0; c < 3; c++) deep[c] += sea.buf[i * 3 + c] / (sea.W * sea.H);
  const shallow = [deep[0] * 0.6 + 70 * 0.4, deep[1] * 0.6 + 120 * 0.4, deep[2] * 0.6 + 125 * 0.4];

  const rgb = new Float32Array(W * H * 3);
  const t = [0, 0, 0], u = [0, 0, 0];
  forEachPixel(zBox, W, H, (i, lon, lat) => {
    const o = i * 3;
    const near = landImg[i] / 255;
    for (let c = 0; c < 3; c++) rgb[o + c] = deep[c] + (shallow[c] - deep[c]) * near;
    if (land[i] > 0) {
      const total = mChr[i] + mRus[i] + mTks[i];
      for (let c = 0; c < 3; c++) t[c] = 0;
      if (mChr[i] > 0) { czech(lon, lat, u, 0); for (let c = 0; c < 3; c++) t[c] += u[c] * mChr[i] / total; }
      if (mRus[i] > 0) { ukraine(lon, lat, u, 0); for (let c = 0; c < 3; c++) t[c] += u[c] * mRus[i] / total; }
      if (mTks[i] > 0) { zAfghan(lon, lat, u, 0); for (let c = 0; c < 3; c++) t[c] += u[c] * mTks[i] / total; }
      const r = mRidge[i] * (1 - mTks[i]);
      if (r > 0.01) { alps(lon, lat, u, 0); for (let c = 0; c < 3; c++) t[c] = t[c] * (1 - r) + u[c] * r; }
      for (let c = 0; c < 3; c++) rgb[o + c] = rgb[o + c] * (1 - land[i]) + t[c] * land[i];
    }
  });
  layers.push(await write('chernarus', zBox, W, H, rgb, mZone));

  fs.writeFileSync(path.join(dataDir, 'terrain.json'), JSON.stringify(layers));
})();
