// Paints fictional terrain as image overlays: real imagery from elsewhere is "transplanted" onto
// Takistan (Afghan desert + mountains) and the Black Mountains (Alps), and new sea is painted over land.
// Imagery: Sentinel-2 cloudless 2020 by EOX (CC BY-NC-SA 4.0). Usage: node terrain.js <dataDir> <tileCacheDir>
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const turf = require('@turf/turf');

const [, , dataDir, cacheDir] = process.argv;
const fiction = JSON.parse(fs.readFileSync(path.join(dataDir, 'fiction.json')));
const outDir = path.join(dataDir, 'terrain');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(cacheDir, { recursive: true });

const EOX = (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/${z}/${y}/${x}.jpg`;
const ESRI = (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const invMercY = (y) => (Math.atan(Math.exp(y)) * 360) / Math.PI - 90;
const lon2px = (lon, z) => ((lon + 180) / 360) * 256 * 2 ** z;
const lat2px = (lat, z) => ((1 - mercY(lat) / Math.PI) / 2) * 256 * 2 ** z;

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

// Raw RGB mosaic of source imagery covering [w, s, e, n]
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

function sample(m, lon, lat, out, o) {
  const fx = lon2px(lon, m.z) - m.ox - 0.5, fy = lat2px(lat, m.z) - m.oy - 0.5;
  const x = Math.max(0, Math.min(m.W - 2, Math.floor(fx))), y = Math.max(0, Math.min(m.H - 2, Math.floor(fy)));
  const ax = Math.min(1, Math.max(0, fx - x)), ay = Math.min(1, Math.max(0, fy - y));
  for (let c = 0; c < 3; c++) {
    const p = (yy, xx) => m.buf[(yy * m.W + xx) * 3 + c];
    const top = p(y, x) * (1 - ax) + p(y, x + 1) * ax;
    const bot = p(y + 1, x) * (1 - ax) + p(y + 1, x + 1) * ax;
    out[o + c] = top * (1 - ay) + bot * ay;
  }
}

// Alpha mask (feathered polygon) in the output image's pixel space
async function mask(geom, bbox, W, H, blur) {
  const [w, s, e, n] = bbox;
  const px = ([lon, lat]) => `${(((lon - w) / (e - w)) * W).toFixed(1)},${(((mercY(n) - mercY(lat)) / (mercY(n) - mercY(s))) * H).toFixed(1)}`;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const d = polys.map((rings) => rings.map((r) => 'M' + r.map(px).join('L') + 'Z').join('')).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#000"/><path d="${d}" fill="#fff" fill-rule="evenodd"/></svg>`;
  let img = sharp(Buffer.from(svg)).greyscale();
  if (blur) img = img.blur(blur);
  return img.raw().toBuffer();
}

function outputSize(bbox, W) {
  const [w, s, e, n] = bbox;
  const H = Math.round((W * (mercY(n) - mercY(s))) / (((e - w) * Math.PI) / 180));
  return H;
}

async function write(id, bbox, W, H, rgb, alpha) {
  const rgba = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4] = rgb[i * 3]; rgba[i * 4 + 1] = rgb[i * 3 + 1]; rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = alpha[i];
  }
  const file = `terrain/${id}.webp`;
  await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 80, alphaQuality: 70 }).toFile(path.join(dataDir, file));
  const [w, s, e, n] = bbox;
  console.log(id, `${W}x${H}`, Math.round(fs.statSync(path.join(dataDir, file)).size / 1024) + ' KB');
  return { id, url: `data/${file}`, coordinates: [[w, n], [e, n], [e, s], [w, s]] };
}

// Transplant imagery around srcCenter onto the target shape, keeping real-world scale (km).
async function transplant(id, geom, srcCenter, W, { z = 11, blur = 10, gain = 1 } = {}) {
  const b = turf.bbox(geom);
  const bbox = [b[0] - 0.08, b[1] - 0.06, b[2] + 0.08, b[3] + 0.06];
  const [w, s, e, n] = bbox;
  const midLat = (s + n) / 2;
  const kmW = (e - w) * 111.32 * Math.cos((midLat * Math.PI) / 180), kmH = (n - s) * 111.32;
  const dLon = kmW / (111.32 * Math.cos((srcCenter[1] * Math.PI) / 180)), dLat = kmH / 111.32;
  const src = [srcCenter[0] - dLon / 2, srcCenter[1] - dLat / 2, srcCenter[0] + dLon / 2, srcCenter[1] + dLat / 2];
  const m = await mosaic(EOX, 'eox', z, src);
  const H = outputSize(bbox, W);
  const rgb = new Float32Array(W * H * 3);
  const yN = mercY(n), yS = mercY(s);
  for (let j = 0; j < H; j++) {
    const lat = invMercY(yN + ((j + 0.5) / H) * (yS - yN));
    const v = (lat - s) / (n - s);
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W;
      sample(m, src[0] + u * (src[2] - src[0]), src[1] + v * (src[3] - src[1]), rgb, (j * W + i) * 3);
    }
  }
  const out = Buffer.alloc(W * H * 3);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, rgb[i] * gain));
  return write(id, bbox, W, H, out, await mask(geom, bbox, W, H, blur));
}

// Paint new sea in the colour of the real sea nearby.
async function seaPaint(geom, W) {
  const m = await mosaic(ESRI, 'esri', 9, [29.9, 43.8, 30.1, 43.95]);
  let r = 0, g = 0, b = 0;
  const n = m.W * m.H;
  for (let i = 0; i < n; i++) { r += m.buf[i * 3]; g += m.buf[i * 3 + 1]; b += m.buf[i * 3 + 2]; }
  const col = [r / n, g / n, b / n];
  const tb = turf.bbox(geom);
  const bbox = [tb[0] - 0.03, tb[1] - 0.03, tb[2] + 0.03, tb[3] + 0.03];
  const H = outputSize(bbox, W);
  const rgb = Buffer.alloc(W * H * 3);
  // a little texture so the painted water isn't perfectly flat
  for (let i = 0; i < W * H; i++) {
    const k = 1 + (Math.sin(i * 0.013) * Math.sin(i * 0.0007) * 0.03);
    for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.min(255, col[c] * k);
  }
  // soft shallow-water edge: dilate the shape slightly before blurring
  return write('sea', bbox, W, H, rgb, await mask(geom, bbox, W, H, 3));
}

(async () => {
  const layers = [];
  layers.push(await transplant('takistan', fiction.takistan, [66.05, 31.95], 2048, { blur: 14, gain: 0.95 }));
  layers.push(await transplant('zagoria', fiction.zagoria, [14.25, 49.35], 1200, { blur: 10, gain: 0.92 }));
  layers.push(await transplant('black-mountains', fiction.blackMountains, [8.05, 46.45], 1800, { blur: 12, gain: 0.92 }));
  layers.push(await seaPaint(fiction.seaPaint, 1200));
  fs.writeFileSync(path.join(dataDir, 'terrain.json'), JSON.stringify(layers));
})();
