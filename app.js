/* War Globe — личная песочница-карта. Всё состояние хранится в localStorage браузера. */
(() => {
  'use strict';

  const VERSION = 5;
  const SAVE_KEY = 'warglobe.v2';
  const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  const FONT = ['Noto Sans Regular'];
  const FONT_B = ['Noto Sans Bold'];
  const FONT_I = ['Noto Sans Italic'];
  // Чернорусь + Такистан: здесь скрываем реальные названия городов из векторных тайлов
  const FICTION_AREA = { type: 'Polygon', coordinates: [[[25.3, 44.25], [27.3, 44.15], [27.6, 44.2], [27.6, 45.78],
    [30.36, 45.78], [30.36, 42.5], [25.9, 42.5], [25.45, 42.75], [25.6, 43.05], [25.35, 43.35], [25.45, 43.7], [25.3, 44.25]]] };

  // Главы государств (можно поменять в панели страны). wiki — статья английской Википедии, оттуда берётся фото.
  const LEADERS = {
    RUS: ['Владимир Путин', 'Vladimir_Putin'], UKR: ['Владимир Зеленский', 'Volodymyr_Zelenskyy'],
    BLR: ['Александр Лукашенко', 'Alexander_Lukashenko'], USA: ['Дональд Трамп', 'Donald_Trump'],
    CHN: ['Си Цзиньпин', 'Xi_Jinping'], FIN: ['Александр Стубб', 'Alexander_Stubb'], EST: ['Алар Карис', 'Alar_Karis'],
    LVA: ['Эдгар Ринкевич', 'Edgars_Rinkēvičs'], LTU: ['Гитанас Науседа', 'Gitanas_Nausėda'], POL: ['Дональд Туск', 'Donald_Tusk'],
    MDA: ['Майя Санду', 'Maia_Sandu'], ROU: ['Никушор Дан', 'Nicușor_Dan'], SRB: ['Александр Вучич', 'Aleksandar_Vučić'],
    TUR: ['Реджеп Эрдоган', 'Recep_Tayyip_Erdoğan'], GEO: ['Михаил Кавелашвили', 'Mikheil_Kavelashvili'],
    ARM: ['Никол Пашинян', 'Nikol_Pashinyan'], AZE: ['Ильхам Алиев', 'Ilham_Aliyev'], KAZ: ['Касым-Жомарт Токаев', 'Kassym-Jomart_Tokayev'],
    DEU: ['Фридрих Мерц', 'Friedrich_Merz'], FRA: ['Эммануэль Макрон', 'Emmanuel_Macron'], GBR: ['Кир Стармер', 'Keir_Starmer'],
    ITA: ['Джорджа Мелони', 'Giorgia_Meloni'], ISR: ['Биньямин Нетаньяху', 'Benjamin_Netanyahu'], IND: ['Нарендра Моди', 'Narendra_Modi'],
    JPN: ['Санаэ Такаити', 'Sanae_Takaichi'], CAN: ['Марк Карни', 'Mark_Carney'], SVK: ['Роберт Фицо', 'Robert_Fico'],
    PRK: ['Ким Чен Ын', 'Kim_Jong_Un'], CHR: ['Президент Чернорусии', ''], TKS: ['Полковник Азиз', ''],
  };

  const DEFAULT_COLORS = {
    RUS: '#8e5bd6', UKR: '#e8d63c', CHR: '#2fbf71', TKS: '#e0892e', BLR: '#7a4fb5',
    ROU: '#3f8fd8', BGR: '#4fc0b0', MDA: '#d6567e', TUR: '#d84a3a', POL: '#e06a6a',
    GEO: '#9acd32', USA: '#3c6fd1', CHN: '#d43c3c',
  };
  const MISSILES = {
    iskander: ['Искандер-М', 18], kalibr: ['Калибр', 15], kinzhal: ['Кинжал', 22], oreshnik: ['Орешник', 60],
    atacms: ['ATACMS', 14], storm: ['Storm Shadow', 12], tomahawk: ['Tomahawk', 16], ballistic: ['МБР', 120],
  };

  const SEAS = [
    ['Black Sea', 34.6, 43.2], ['Green Sea', 29.33, 44.7], ['Sea of Azov', 36.6, 46.2], ['Caspian Sea', 50.5, 41.8],
    ['Mediterranean Sea', 18, 35], ['North Atlantic Ocean', -40, 38], ['Barents Sea', 40, 72.5], ['Arabian Sea', 64, 15],
    ['Baltic Sea', 19.4, 57], ['North Sea', 3, 56], ['Indian Ocean', 78, -15], ['Pacific Ocean', -150, 8],
    ['South Atlantic Ocean', -15, -25], ['Arctic Ocean', 10, 84], ['Red Sea', 38.4, 20.5], ['Persian Gulf', 51.4, 27.2],
    ['Norwegian Sea', 2, 68], ['Kara Sea', 70, 75], ['Sea of Japan', 135, 40], ['Bay of Bengal', 88, 15],
  ];
  const REGIONS = [['BLACK MOUNTAINS', 29.27, 45.54, 12], ['NORTH MOUNTAINS', 28.8, 45.48, 9],
    ['SOUTH ZAGORIA', 29.6, 45.36, 11], ['Lake Beloe', 27.93, 45.48, 9]];

  // ---------- state ----------
  let baseWorld = null;
  let world = null;
  let cities = [];
  let state = blankState();
  const featById = new Map();
  const bboxCache = new Map();

  function blankState() {
    return { side: 'RUS', colors: {}, names: {}, geo: {}, added: [], control: {}, arrows: [], strikes: [], labels: [], leaders: {} };
  }
  const uid = () => Math.random().toString(36).slice(2, 9);

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
    catch (e) { toast('Не удалось сохранить в браузере — используй 💾'); }
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s) return { ...blankState(), ...s };
      // перенос из первой версии: стрелки, удары, лидеры, цвета и названия (границы карты поменялись)
      const old = JSON.parse(localStorage.getItem('warglobe.v1'));
      if (old) return { ...blankState(), side: old.side || 'RUS', colors: old.colors || {}, names: old.names || {},
        arrows: old.arrows || [], strikes: old.strikes || [], leaders: old.leaders || {} };
    } catch (e) { /* пусто */ }
    return null;
  }

  // ---------- undo / redo ----------
  const undoStack = [], redoStack = [];
  function snapshot() {
    undoStack.push(JSON.stringify(state));
    if (undoStack.length > 60) undoStack.shift();
    redoStack.length = 0;
  }
  function restore(json) {
    state = JSON.parse(json);
    rebuildWorld(); renderAll(); updateSide(); refreshPanel(); save();
  }
  function undo() { if (!undoStack.length) return toast('Нечего отменять'); redoStack.push(JSON.stringify(state)); restore(undoStack.pop()); }
  function redo() { if (!redoStack.length) return; undoStack.push(JSON.stringify(state)); restore(redoStack.pop()); }

  function hashColor(id) {
    let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `hsl(${h % 360} 55% 55%)`;
  }
  const colorOf = (id) => state.colors[id] || DEFAULT_COLORS[id] || hashColor(id);
  const nameOf = (id) => state.names[id] || featById.get(id)?.properties.nameRu || id;
  const labelOf = (id) => state.names[id] || featById.get(id)?.properties.name || id;

  function rebuildWorld() {
    world = JSON.parse(JSON.stringify(baseWorld));
    for (const f of state.added) world.features.push(JSON.parse(JSON.stringify(f)));
    world.features = world.features.filter((f) => state.geo[f.properties.id] !== null);
    for (const f of world.features) if (state.geo[f.properties.id]) f.geometry = state.geo[f.properties.id];
    indexWorld();
  }
  function indexWorld() {
    featById.clear(); bboxCache.clear();
    for (const f of world.features) featById.set(f.properties.id, f);
  }
  const bboxOf = (f) => {
    let b = bboxCache.get(f.properties.id);
    if (!b) { b = turf.bbox(f); bboxCache.set(f.properties.id, b); }
    return b;
  };
  const bboxHit = (a, b) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);

  // ---------- map ----------
  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      projection: { type: 'globe' },
      glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] },
      sources: {
        sat: { type: 'raster', tiles: [SAT], tileSize: 256, maxzoom: 18, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics; Sentinel-2 cloudless by EOX (Contains modified Copernicus Sentinel data 2020)' },
        ofm: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '© OpenFreeMap © OpenStreetMap' },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#0b1a33' } },
        { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-saturation': 0.05, 'raster-contrast': 0.08, 'raster-brightness-max': 0.88 } },
      ],
    },
    center: [29, 45], zoom: 2.4, maxPitch: 70,
    attributionControl: { compact: true },
  });
  map.doubleClickZoom.disable();
  window.wg = { map, get state() { return state; } }; // для отладки из консоли
  new ResizeObserver(() => map.resize()).observe(document.getElementById('map'));
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

  const empty = () => turf.featureCollection([]);
  const getJSON = (n) => fetch(`data/${n}.json?v=${VERSION}`).then((r) => r.json());

  map.once('style.load', async () => {
    const [w, c, g, terrain] = await Promise.all(['world', 'cities', 'greensea', 'terrain'].map(getJSON));
    baseWorld = w; cities = c;
    map.addSource('greensea', { type: 'geojson', data: g });
    map.addLayer({ id: 'greensea', type: 'fill', source: 'greensea', paint: { 'fill-color': '#1ed98a', 'fill-opacity': ['*', 1.6, ['get', 'o']] } });
    state = load() || blankState();
    rebuildWorld();

    map.addSource('countries', { type: 'geojson', data: countriesData(), promoteId: 'id' });
    map.addSource('clabels', { type: 'geojson', data: labelsData() });
    map.addSource('cities', { type: 'geojson', data: citiesData() });
    map.addSource('seas', { type: 'geojson', data: turf.featureCollection(SEAS.map(([n, x, y]) => turf.point([x, y], { n }))) });
    map.addSource('regions', { type: 'geojson', data: turf.featureCollection(REGIONS.map(([n, x, y, sz]) => turf.point([x, y], { n, sz }))) });
    for (const s of ['control', 'arrows', 'strikes', 'draft', 'flight']) map.addSource(s, { type: 'geojson', data: empty() });

    map.addLayer({ id: 'admin1', type: 'line', source: 'ofm', 'source-layer': 'boundary', minzoom: 3.5,
      filter: ['all', ['match', ['get', 'admin_level'], [3, 4], true, false], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': '#e0302a', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 8, 1.3], 'line-opacity': 0.75 } });
    map.addLayer({ id: 'roads', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 4.5,
      filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], true, false],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#f3e7c4', 'line-opacity': 0.55,
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, ['match', ['get', 'class'], 'motorway', 1.2, 0.6], 10, ['match', ['get', 'class'], 'motorway', 3, 1.6]] } });
    // вымышленный рельеф (Такистан, Чернорусь с Чёрными горами и новым берегом) — поверх реальных дорог, под заливкой стран
    for (const t of terrain) {
      map.addSource('terrain-' + t.id, { type: 'image', url: `${t.url}?v=${VERSION}`, coordinates: t.coordinates });
      map.addLayer({ id: 'terrain-' + t.id, type: 'raster', source: 'terrain-' + t.id, paint: { 'raster-fade-duration': 0 } });
    }
    map.moveLayer('greensea');

    map.addLayer({ id: 'fills', type: 'fill', source: 'countries', paint: {
      'fill-color': ['get', 'color'],
      'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.45, 0.3],
    } });
    map.addLayer({ id: 'control-fill', type: 'fill', source: 'control', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.55 } });
    map.addLayer({ id: 'borders', type: 'line', source: 'countries', paint: {
      'line-color': '#0d0d0d', 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.5, 6, 1.6], 'line-opacity': 0.85,
    } });
    map.addLayer({ id: 'borders-color', type: 'line', source: 'countries', minzoom: 3.5, paint: {
      'line-color': ['get', 'color'], 'line-width': 1.2, 'line-offset': 1.5, 'line-opacity': 0.9,
    } });
    map.addLayer({ id: 'control-line', type: 'line', source: 'control', paint: {
      'line-color': '#fff', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 8, 2.5], 'line-dasharray': [1.2, 1.2],
    } });
    map.addLayer({ id: 'selected', type: 'line', source: 'countries', filter: ['==', ['get', 'id'], ''], paint: {
      'line-color': '#ffffff', 'line-width': 2.5, 'line-dasharray': [2, 1],
    } });
    map.addLayer({ id: 'arrows-fill', type: 'fill', source: 'arrows', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.8 } });
    map.addLayer({ id: 'arrows-line', type: 'line', source: 'arrows', paint: { 'line-color': '#111', 'line-width': 1.3 } });
    map.addLayer({ id: 'strikes-path', type: 'line', source: 'strikes', filter: ['==', ['geometry-type'], 'LineString'], paint: {
      'line-color': '#ff3b30', 'line-width': 1.5, 'line-dasharray': [2, 2], 'line-opacity': 0.75,
    } });
    map.addLayer({ id: 'strikes-area', type: 'fill', source: 'strikes', filter: ['==', ['geometry-type'], 'Polygon'], paint: {
      'fill-color': '#ff3b30', 'fill-opacity': 0.25, 'fill-outline-color': '#ff3b30',
    } });
    map.addLayer({ id: 'strikes-pt', type: 'symbol', source: 'strikes', filter: ['==', ['geometry-type'], 'Point'], layout: {
      'text-field': '✸', 'text-font': FONT_B, 'text-size': ['interpolate', ['linear'], ['zoom'], 2, 14, 8, 30], 'text-allow-overlap': true,
    }, paint: { 'text-color': '#ff3b30', 'text-halo-color': '#ffd34d', 'text-halo-width': 1.2 } });
    map.addLayer({ id: 'flight', type: 'circle', source: 'flight', paint: {
      'circle-radius': 5, 'circle-color': '#fff6d0', 'circle-stroke-color': '#ff6a00', 'circle-stroke-width': 3, 'circle-blur': 0.2,
    } });
    map.addLayer({ id: 'draft-fill', type: 'fill', source: 'draft', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': ['coalesce', ['get', 'color'], '#fff'], 'fill-opacity': 0.45 } });
    map.addLayer({ id: 'draft-line', type: 'line', source: 'draft', paint: { 'line-color': '#fff', 'line-width': 2, 'line-dasharray': [2, 1] } });

    map.addLayer({ id: 'seas', type: 'symbol', source: 'seas', layout: {
      'text-field': ['get', 'n'], 'text-font': FONT_I, 'text-size': 11.5, 'text-letter-spacing': 0.15, 'text-max-width': 6,
    }, paint: { 'text-color': '#a9bcd8', 'text-halo-color': '#0a1530', 'text-halo-width': 1 } });
    map.addLayer({ id: 'regions', type: 'symbol', source: 'regions', minzoom: 5.5, layout: {
      'text-field': ['get', 'n'], 'text-font': FONT_B, 'text-size': ['get', 'sz'], 'text-letter-spacing': 0.2,
    }, paint: { 'text-color': '#e9e2c8', 'text-halo-color': '#000', 'text-halo-width': 1.2 } });
    map.addLayer({ id: 'places', type: 'symbol', source: 'ofm', 'source-layer': 'place', minzoom: 5.5,
      filter: ['all', ['match', ['get', 'class'], ['city', 'town'], true, false], ['!', ['within', FICTION_AREA]]],
      layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']], 'text-font': FONT_B,
        'text-size': ['match', ['get', 'class'], 'city', 12, 10], 'symbol-sort-key': ['get', 'rank'] },
      paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.3 } });
    map.addLayer({ id: 'cities-dot', type: 'circle', source: 'cities', maxzoom: 5.5, filter: ['<=', ['get', 'z'], ['+', ['zoom'], 0.6]], paint: {
      'circle-radius': ['case', ['==', ['get', 'cap'], 1], 3, 2], 'circle-color': '#fff', 'circle-stroke-color': '#000', 'circle-stroke-width': 1,
    } });
    map.addLayer({ id: 'cities-custom', type: 'symbol', source: 'cities', minzoom: 5.5, filter: ['==', ['get', 'custom'], 1], layout: {
      'text-field': ['get', 'n'], 'text-font': FONT_B, 'text-size': ['case', ['==', ['get', 'cap'], 1], 13, 11],
    }, paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.3 } });
    map.addLayer({ id: 'cities', type: 'symbol', source: 'cities', maxzoom: 5.5, filter: ['<=', ['get', 'z'], ['+', ['zoom'], 0.6]], layout: {
      'text-field': ['get', 'n'], 'text-font': FONT, 'text-size': ['case', ['==', ['get', 'cap'], 1], 12, 10.5],
      'text-offset': [0, 0.9], 'text-anchor': 'top', 'symbol-sort-key': ['get', 'z'],
    }, paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.3 } });
    map.addLayer({ id: 'country-labels', type: 'symbol', source: 'clabels', filter: ['<=', ['get', 'minLabel'], ['+', ['zoom'], 1.6]], layout: {
      'text-field': ['get', 'label'], 'text-font': FONT_B, 'text-size': ['interpolate', ['linear'], ['zoom'], 1, 9, 5, 14],
      'text-max-width': 7, 'symbol-sort-key': ['get', 'minLabel'],
    }, paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.4 } });

    renderAll();
    bindEvents();
    updateSide();
    setTool('select');
    document.getElementById('loading').remove();
    document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
  });

  function countriesData() {
    return turf.featureCollection(world.features.filter((f) => f.geometry).map((f) => ({
      type: 'Feature', geometry: f.geometry, properties: { id: f.properties.id, color: colorOf(f.properties.id) },
    })));
  }
  function labelsData() {
    return turf.featureCollection(world.features.filter((f) => f.properties.lx != null).map((f) => turf.point(
      [f.properties.lx, f.properties.ly], { id: f.properties.id, label: labelOf(f.properties.id), minLabel: f.properties.minLabel },
    )));
  }
  function citiesData() {
    return turf.featureCollection(cities.map((c) => turf.point([c.x, c.y], { n: c.n, z: c.z, cap: c.cap, custom: c.z === 2.5 ? 1 : 0 })));
  }
  function refreshCountries() {
    map.getSource('countries').setData(countriesData());
    map.getSource('clabels').setData(labelsData());
  }
  function renderAll() {
    refreshCountries();
    renderControl();
    renderArrows();
    renderStrikes();
    renderLabels();
    renderLeaders();
  }

  // ---------- geometry helpers ----------
  const fc = (...f) => turf.featureCollection(f);
  const feat = (g) => (g ? (g.type === 'Feature' ? g : turf.feature(g)) : null);
  function union(a, b) { if (!a) return feat(b); if (!b) return feat(a); return turf.union(fc(feat(a), feat(b))); }
  function diff(a, b) { if (!a) return null; if (!b) return feat(a); return turf.difference(fc(feat(a), feat(b))); }
  function inter(a, b) { if (!a || !b) return null; return turf.intersect(fc(feat(a), feat(b))); }
  // суша под областью (объединение кусков стран, которые она задевает)
  function landUnder(poly) {
    const pb = turf.bbox(poly);
    let land = null;
    for (const f of world.features) {
      if (!f.geometry || !bboxHit(bboxOf(f), pb)) continue;
      const part = inter(f, poly);
      if (part) land = union(land, part);
    }
    return land;
  }
  function countryAt(lng, lat) {
    for (const f of world.features) {
      if (!f.geometry) continue;
      const b = bboxOf(f);
      if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue;
      if (turf.booleanPointInPolygon([lng, lat], f)) return f.properties.id;
    }
    return null;
  }

  // ---------- control zones (кисть) ----------
  function renderControl() {
    const feats = Object.entries(state.control).filter(([, g]) => g)
      .map(([cid, g]) => ({ type: 'Feature', geometry: g, properties: { cid, color: colorOf(cid) } }));
    map.getSource('control').setData(turf.featureCollection(feats));
  }
  // side захватывает (или освобождает) сушу под мазком кистью
  function paintControl(stroke, side, erase) {
    const land = landUnder(stroke);
    if (!land) return;
    for (const cid of Object.keys(state.control)) {
      const g = diff(state.control[cid], land);
      state.control[cid] = g ? g.geometry : null;
      if (!g) delete state.control[cid];
    }
    if (erase) return;
    const own = featById.get(side);
    const gain = own ? diff(land, own) : land;   // своя законная территория не красится — она и так своя
    if (gain) state.control[side] = union(state.control[side], gain).geometry;
  }
  // официальная граница: суша под мазком переходит стране side
  function paintBorder(stroke, side) {
    const land = landUnder(stroke);
    if (!land) return;
    const pb = turf.bbox(stroke);
    for (const f of world.features) {
      const id = f.properties.id;
      if (id === side || !f.geometry || !bboxHit(bboxOf(f), pb)) continue;
      if (!inter(f, stroke)) continue;
      const rest = diff(f, stroke);
      f.geometry = rest ? rest.geometry : null;
      state.geo[id] = f.geometry;
    }
    const t = featById.get(side);
    t.geometry = union(t.geometry ? t : null, land).geometry;
    state.geo[side] = t.geometry;
    if (t.properties.lx == null || t.properties.autoLabel) {
      // новая страна: подпись ставим на её землю
      const [lx, ly] = turf.pointOnFeature(t).geometry.coordinates;
      Object.assign(t.properties, { lx, ly, autoLabel: false });
      const a = state.added.find((x) => x.properties.id === side);
      if (a) Object.assign(a.properties, { lx, ly, autoLabel: false });
    }
    // зона контроля на ставшей своей земле больше не нужна
    if (state.control[side]) { const g = diff(state.control[side], land); if (g) state.control[side] = g.geometry; else delete state.control[side]; }
    world.features = world.features.filter((f) => f.geometry);
    indexWorld();
  }
  // закрепить всю зону контроля стороны как официальную территорию
  function annexControl(side) {
    const g = state.control[side];
    if (!g) return toast('У этой страны нет зоны контроля');
    snapshot();
    paintBorder(feat(g), side);
    delete state.control[side];
    refreshCountries(); renderControl(); save(); refreshPanel();
  }

  // ---------- arrows ----------
  function fatArrow(pts, color, id) {
    const line = turf.lineString(pts);
    const L = turf.length(line);
    if (L < 1) return null;
    const w = Math.min(Math.max(L * 0.05, 1.5), 45);
    const headLen = Math.min(L * 0.35, w * 3.2);
    const headW = w * 2.3;
    const shaft = turf.lineSliceAlong(line, 0, L - headLen).geometry.coordinates;
    if (shaft.length < 2) shaft.push(turf.along(line, L - headLen).geometry.coordinates);
    const brg = (a, b) => turf.bearing(a, b);
    const dest = (p, d, a) => turf.destination(p, d, a).geometry.coordinates;
    const left = [], right = [];
    shaft.forEach((p, i) => {
      let a;
      if (i === 0) a = brg(p, shaft[1]);
      else if (i === shaft.length - 1) a = brg(shaft[i - 1], p);
      else {
        const a1 = brg(shaft[i - 1], p) * Math.PI / 180, a2 = brg(p, shaft[i + 1]) * Math.PI / 180;
        a = Math.atan2(Math.sin(a1) + Math.sin(a2), Math.cos(a1) + Math.cos(a2)) * 180 / Math.PI;
      }
      const ww = w * (0.55 + 0.45 * (i / (shaft.length - 1)));
      left.push(dest(p, ww, a - 90)); right.push(dest(p, ww, a + 90));
    });
    const base = shaft[shaft.length - 1], tip = pts[pts.length - 1];
    const a = brg(base, tip);
    const ring = [...left, dest(base, headW, a - 90), tip, dest(base, headW, a + 90), ...right.reverse(), left[0]];
    return turf.polygon([ring], { id, color });
  }
  function renderArrows() {
    const feats = state.arrows.map((a) => fatArrow(a.pts, colorOf(a.cid), a.id)).filter(Boolean);
    map.getSource('arrows').setData(turf.featureCollection(feats));
  }

  // ---------- missiles ----------
  function arcCoords(from, to) {
    const gc = turf.greatCircle(from, to, { npoints: 90 });
    return gc.geometry.type === 'MultiLineString' ? gc.geometry.coordinates.flat() : gc.geometry.coordinates;
  }
  function renderStrikes() {
    const feats = [];
    for (const s of state.strikes) {
      if (s.from) feats.push(turf.lineString(arcCoords(s.from, s.to), { id: s.id }));
      feats.push(turf.circle(s.to, s.r, { steps: 32, units: 'kilometers', properties: { id: s.id } }));
      feats.push(turf.point(s.to, { id: s.id }));
    }
    map.getSource('strikes').setData(turf.featureCollection(feats));
  }
  function launchMissile(from, to, kind) {
    const [, radius] = MISSILES[kind];
    const coords = arcCoords(from, to);
    const dur = Math.min(4000, 1200 + turf.distance(from, to) * 1.2);
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const p = coords[Math.min(coords.length - 1, Math.floor(k * (coords.length - 1)))];
      map.getSource('flight').setData(turf.featureCollection([turf.point(p), turf.lineString(coords.slice(0, Math.max(2, Math.floor(k * coords.length))))]));
      if (k < 1) return requestAnimationFrame(step);
      map.getSource('flight').setData(empty());
      const boom = document.createElement('div'); boom.className = 'boom';
      const bm = new maplibregl.Marker({ element: boom }).setLngLat(to).addTo(map);
      setTimeout(() => bm.remove(), 1500);
      snapshot();
      state.strikes.push({ id: uid(), cid: state.side, kind, from, to, r: radius });
      renderStrikes(); save();
    };
    requestAnimationFrame(step);
  }

  // ---------- text labels (группировки, численность) ----------
  const labelMarkers = new Map();
  function renderLabels() {
    const ids = new Set(state.labels.map((l) => l.id));
    for (const [id, m] of labelMarkers) if (!ids.has(id)) { m.remove(); labelMarkers.delete(id); }
    for (const l of state.labels) {
      let m = labelMarkers.get(l.id);
      if (!m) {
        const el = document.createElement('div');
        el.className = 'tlabel';
        el.addEventListener('click', (e) => { e.stopPropagation(); lastMarkerClick = Date.now(); if (tool === 'erase') deleteItem('labels', l.id); });
        el.addEventListener('dblclick', (e) => { e.stopPropagation(); editLabel(l.id); });
        el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); deleteItem('labels', l.id); });
        m = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([l.lng, l.lat]).addTo(map);
        m.on('dragstart', snapshot);
        m.on('dragend', () => { const it = state.labels.find((x) => x.id === l.id); if (!it) return; const p = m.getLngLat(); it.lng = p.lng; it.lat = p.lat; save(); });
        labelMarkers.set(l.id, m);
      }
      m.setLngLat([l.lng, l.lat]);
      m.setDraggable(['select', 'label'].includes(tool));
      const el = m.getElement();
      el.textContent = l.text;
      el.style.setProperty('--c', colorOf(l.cid));
      el.title = 'Двойной клик — изменить, правый клик — удалить, тащи — переместить';
    }
  }
  function addLabel(p) {
    const text = prompt('Подпись (например: Группировка «Север» — 45 000)');
    if (!text || !text.trim()) return;
    snapshot();
    state.labels.push({ id: uid(), cid: state.side, text: text.trim(), lng: p[0], lat: p[1] });
    renderLabels(); save();
  }
  function editLabel(id) {
    const l = state.labels.find((x) => x.id === id); if (!l) return;
    const text = prompt('Изменить подпись (пусто — удалить)', l.text);
    if (text === null) return;
    snapshot();
    if (!text.trim()) state.labels = state.labels.filter((x) => x.id !== id); else l.text = text.trim();
    renderLabels(); save();
  }
  function deleteItem(kind, id) {
    snapshot();
    state[kind] = state[kind].filter((x) => x.id !== id);
    renderArrows(); renderStrikes(); renderLabels(); save();
  }

  // ---------- leaders ----------
  const leaderMarkers = new Map();
  const photoCache = (() => { try { return JSON.parse(localStorage.getItem('warglobe.photos')) || {}; } catch (e) { return {}; } })();
  function leaderOf(id) {
    const o = state.leaders[id];
    if (o === null) return null;
    const d = LEADERS[id];
    if (!o && !d) return null;
    const f = featById.get(id)?.properties || {};
    return { name: o?.name ?? d?.[0] ?? '', wiki: o?.wiki ?? d?.[1] ?? '', photo: o?.photo || '',
      lng: o?.lng ?? f.cx ?? f.lx, lat: o?.lat ?? f.cy ?? f.ly };
  }
  async function photoFor(l) {
    if (l.photo) return l.photo;
    if (!l.wiki) return '';
    if (photoCache[l.wiki] !== undefined) return photoCache[l.wiki];
    try {
      const r = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(l.wiki));
      const j = await r.json();
      photoCache[l.wiki] = j.thumbnail?.source || '';
      try { localStorage.setItem('warglobe.photos', JSON.stringify(photoCache)); } catch (e) { /* пусто */ }
    } catch (e) { return ''; }
    return photoCache[l.wiki];
  }
  function renderLeaders() {
    const want = new Set();
    for (const f of world.features) {
      const id = f.properties.id;
      const l = leaderOf(id);
      if (!l || l.lng == null) continue;
      want.add(id);
      let m = leaderMarkers.get(id);
      if (!m) {
        const el = document.createElement('div');
        el.className = 'leader';
        el.innerHTML = '<div class="face"><span></span></div><div class="lname"></div>';
        el.addEventListener('click', (e) => { e.stopPropagation(); lastMarkerClick = Date.now(); if (tool === 'select') openLeaderModal(id); });
        m = new maplibregl.Marker({ element: el, draggable: true, anchor: 'bottom', offset: [0, -8] }).setLngLat([l.lng, l.lat]).addTo(map);
        m.on('dragstart', snapshot);
        m.on('dragend', () => { const p = m.getLngLat(); state.leaders[id] = { ...state.leaders[id], lng: p.lng, lat: p.lat }; save(); });
        leaderMarkers.set(id, m);
      }
      m.setLngLat([l.lng, l.lat]);
      m.setDraggable(tool === 'select');
      const el = m.getElement();
      const iso = f.properties.iso2;
      el.style.setProperty('--c', colorOf(id));
      el.querySelector('.face').style.backgroundImage = iso ? `url(https://flagcdn.com/w80/${iso}.png)` : '';
      el.querySelector('.lname').textContent = l.name;
      el.title = `${l.name} — ${nameOf(id)}`;
      const span = el.querySelector('.face span');
      span.textContent = l.name.split(' ').map((w) => w[0]).join('').slice(0, 2);
      photoFor(l).then((src) => { span.style.backgroundImage = src ? `url("${src}")` : ''; span.classList.toggle('has', !!src); });
    }
    for (const [id, m] of leaderMarkers) if (!want.has(id)) { m.remove(); leaderMarkers.delete(id); }
  }
  function openLeaderModal(id) {
    const l = leaderOf(id) || { name: '', wiki: '', photo: '' };
    form.innerHTML = `
      <h3>Глава страны — ${esc(nameOf(id))}</h3>
      <div class="grid">
        <label class="full">Имя<input name="name" value="${esc(l.name)}" placeholder="Имя лидера"></label>
        <label class="full">Статья Википедии (англ., для фото)<input name="wiki" value="${esc(l.wiki)}" placeholder="например, Vladimir_Putin"></label>
        <label class="full">…или прямая ссылка на фото<input name="photo" value="${esc(l.photo)}" placeholder="https://…"></label>
      </div>
      <div class="actions">
        <button type="button" class="btn danger" id="mDel">Убрать</button>
        <button type="button" class="btn" id="mCancel">Отмена</button>
        <button class="btn primary">Сохранить</button>
      </div>`;
    form.querySelector('#mCancel').onclick = () => modal.close();
    form.querySelector('#mDel').onclick = () => { snapshot(); state.leaders[id] = null; modal.close(); save(); renderLeaders(); refreshPanel(); };
    form.onsubmit = (e) => {
      e.preventDefault();
      snapshot();
      const v = Object.fromEntries(new FormData(form));
      state.leaders[id] = { ...(state.leaders[id] || {}), name: v.name.trim(), wiki: v.wiki.trim(), photo: v.photo.trim() };
      if (!state.leaders[id].name) state.leaders[id] = null;
      modal.close(); save(); renderLeaders(); refreshPanel();
    };
    modal.showModal();
  }

  // ---------- tools ----------
  let tool = 'select';
  let lastMarkerClick = 0;
  let selectedCountry = null;
  let missileFrom = null;
  const brush = { size: 40, mode: 'control' };   // размер кисти в пикселях экрана

  const HINTS = {
    select: '',
    brush: 'Зажми и веди — земля переходит стороне. Правая кнопка или «Стереть» — убрать. Ctrl+Z — отмена',
    arrow: 'Зажми и проведи стрелку одним движением',
    label: 'Кликни на карту и напиши подпись. Тащи — переместить, двойной клик — изменить',
    missile: 'Кликни точку пуска, затем цель',
    erase: 'Кликни по стрелке, удару или подписи, чтобы удалить (или правый клик в любом режиме)',
  };

  function setTool(t) {
    tool = t; missileFrom = null; setDraft(null);
    document.querySelectorAll('#toolbar button[data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
    const hint = document.getElementById('toolhint');
    hint.textContent = HINTS[t]; hint.classList.toggle('show', !!HINTS[t]);
    renderToolOpts();
    const drawing = ['brush', 'arrow'].includes(t);
    if (drawing) { map.dragPan.disable(); map.dragRotate.disable(); } else { map.dragPan.enable(); map.dragRotate.enable(); }
    map.getCanvas().style.cursor = t === 'select' ? '' : 'crosshair';
    document.getElementById('brushCursor').hidden = t !== 'brush';
    renderLabels(); renderLeaders();
  }
  function renderToolOpts() {
    const box = document.getElementById('toolopts');
    let html = '';
    if (tool === 'brush') {
      html += `<div class="seg"><button data-mode="control" class="${brush.mode === 'control' ? 'on' : ''}">Контроль</button>` +
        `<button data-mode="border" class="${brush.mode === 'border' ? 'on' : ''}">Граница</button>` +
        `<button data-mode="erase" class="${brush.mode === 'erase' ? 'on' : ''}">Стереть</button></div>` +
        `<label>Кисть <input type="range" id="optSize" min="8" max="160" value="${brush.size}"></label>`;
    }
    if (tool === 'missile') {
      html += `Ракета: <select id="optMissile">${Object.entries(MISSILES).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select>`;
    }
    if (['brush', 'arrow', 'missile', 'label'].includes(tool)) {
      html += `<span>за: <b style="color:${colorOf(state.side)}">${esc(nameOf(state.side))}</b> <button id="optSide" class="btn small">сменить</button></span>`;
    }
    box.innerHTML = html;
    box.classList.toggle('show', !!html);
    box.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { brush.mode = b.dataset.mode; renderToolOpts(); });
    const sz = box.querySelector('#optSize');
    if (sz) sz.oninput = () => { brush.size = +sz.value; };
    const ms = box.querySelector('#optMissile');
    if (ms) { ms.value = state.missile || 'iskander'; ms.onchange = () => { state.missile = ms.value; save(); }; }
    const os = box.querySelector('#optSide');
    if (os) os.onclick = openSidePicker;
  }
  function setDraft(f) { map.getSource('draft')?.setData(f ? turf.featureCollection([f]) : empty()); }

  const kmPerPx = () => {
    const c = map.getCenter();
    return (40075.016686 * Math.cos((c.lat * Math.PI) / 180)) / (512 * 2 ** map.getZoom());
  };
  function strokePolygon(pts, radiusKm) {
    const line = pts.length > 1 ? turf.lineString(pts) : turf.point(pts[0]);
    return turf.buffer(line, radiusKm, { units: 'kilometers', steps: 8 });
  }

  function bindEvents() {
    document.querySelectorAll('#toolbar button[data-tool]').forEach((b) => b.onclick = () => setTool(b.dataset.tool));
    document.getElementById('btnUndo').onclick = undo;
    document.getElementById('btnRedo').onclick = redo;
    map.on('zoom', scaleMarkers);
    scaleMarkers();

    let hoverId = null;
    map.on('mousemove', 'fills', (e) => {
      const id = e.features[0]?.id;
      if (hoverId !== null && hoverId !== id) map.setFeatureState({ source: 'countries', id: hoverId }, { hover: false });
      hoverId = id; if (id != null && tool === 'select') map.setFeatureState({ source: 'countries', id }, { hover: true });
    });
    map.on('mouseleave', 'fills', () => {
      if (hoverId !== null) map.setFeatureState({ source: 'countries', id: hoverId }, { hover: false });
      hoverId = null;
    });

    // --- рисование одним движением (кисть / стрелка), мышь и палец
    const cursor = document.getElementById('brushCursor');
    let drag = null;
    const start = (e, erase) => {
      if (!['brush', 'arrow'].includes(tool) || (tool === 'arrow' && erase)) return;
      drag = { pts: [[e.lngLat.lng, e.lngLat.lat]], last: e.point, erase };
    };
    const move = (e) => {
      if (tool === 'brush') {
        const d = brush.size;
        Object.assign(cursor.style, { width: d + 'px', height: d + 'px', left: e.point.x - d / 2 + 'px', top: e.point.y - d / 2 + 'px' });
      }
      if (!drag) return;
      if (Math.hypot(e.point.x - drag.last.x, e.point.y - drag.last.y) < 4) return;
      drag.last = e.point;
      drag.pts.push([e.lngLat.lng, e.lngLat.lat]);
      if (tool === 'brush') {
        const erase = drag.erase || brush.mode === 'erase';
        const f = strokePolygon(drag.pts, (brush.size / 2) * kmPerPx());
        f.properties = { color: erase ? '#000' : colorOf(state.side) };
        setDraft(f);
      } else setDraft(turf.lineString(drag.pts));
    };
    const end = () => {
      if (!drag) return;
      const d = drag; drag = null;
      setDraft(null);
      if (tool === 'brush') {
        const stroke = strokePolygon(d.pts, (brush.size / 2) * kmPerPx());
        snapshot();
        if (brush.mode === 'border' && !d.erase) { paintBorder(stroke, state.side); refreshCountries(); renderLeaders(); }
        paintControl(stroke, state.side, d.erase || brush.mode === 'erase' || brush.mode === 'border');
        renderControl(); save(); refreshPanel();
      } else if (tool === 'arrow' && d.pts.length > 2) {
        const line = turf.simplify(turf.lineString(d.pts), { tolerance: kmPerPx() * 6 / 111, highQuality: true });
        snapshot();
        state.arrows.push({ id: uid(), cid: state.side, pts: line.geometry.coordinates });
        renderArrows(); save();
      }
    };
    map.on('mousedown', (e) => { if (e.originalEvent.button === 0 || e.originalEvent.button === 2) start(e, e.originalEvent.button === 2); });
    map.on('mousemove', move);
    map.on('mouseup', end);
    map.getCanvasContainer().addEventListener('mouseleave', end);
    map.on('touchstart', (e) => { if (e.points.length === 1) start(e, false); });
    map.on('touchmove', move);
    map.on('touchend', end);
    map.getCanvas().addEventListener('contextmenu', (e) => e.preventDefault());

    map.on('click', (e) => {
      if (Date.now() - lastMarkerClick < 250) return;
      const p = [e.lngLat.lng, e.lngLat.lat];
      if (tool === 'select') {
        const id = countryAt(p[0], p[1]);
        if (id) selectCountry(id); else closePanel();
      } else if (tool === 'label') addLabel(p);
      else if (tool === 'missile') {
        if (!missileFrom) { missileFrom = p; setDraft(turf.point(p)); toast('Теперь кликни цель'); }
        else { launchMissile(missileFrom, p, state.missile || 'iskander'); missileFrom = null; setDraft(null); }
      } else if (tool === 'erase') eraseAt(e.point);
    });
    // правый клик по стрелке / удару удаляет в любом режиме
    map.on('contextmenu', (e) => { if (tool !== 'brush') eraseAt(e.point); });

    window.addEventListener('keydown', (e) => {
      if (document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.code === 'KeyY') { e.preventDefault(); redo(); return; }
      if (e.key === 'Escape') setTool('select');
      const keys = { Digit1: 'select', Digit2: 'brush', Digit3: 'arrow', Digit4: 'label', Digit5: 'missile', Digit6: 'erase' };
      if (!mod && keys[e.code]) setTool(keys[e.code]);
      if (tool === 'brush' && (e.key === '[' || e.key === ']')) { brush.size = Math.max(8, Math.min(160, brush.size + (e.key === ']' ? 8 : -8))); renderToolOpts(); }
    });
  }
  function eraseAt(point) {
    const f = map.queryRenderedFeatures(point, { layers: ['arrows-fill', 'strikes-area', 'strikes-pt'] })[0];
    if (!f) return;
    const id = f.properties.id;
    deleteItem(state.arrows.some((a) => a.id === id) ? 'arrows' : 'strikes', id);
  }
  function scaleMarkers() {
    const z = map.getZoom();
    document.body.classList.toggle('hide-labels', z < 3.2);
    document.body.classList.toggle('hide-leaders-far', z < 2.6);
    document.documentElement.style.setProperty('--ts', Math.max(0.7, Math.min(1.3, 0.45 + z * 0.12)));
  }

  // ---------- side / panel ----------
  function updateSide() {
    document.getElementById('sideName').textContent = nameOf(state.side);
    document.getElementById('sideSwatch').style.background = colorOf(state.side);
    renderToolOpts();
  }
  function selectCountry(id) {
    selectedCountry = id;
    state.side = id; save();
    map.setFilter('selected', ['==', ['get', 'id'], id]);
    updateSide();
    refreshPanel();
  }
  function closePanel() {
    selectedCountry = null;
    document.getElementById('panel').hidden = true;
    map.setFilter('selected', ['==', ['get', 'id'], '']);
  }
  function openSidePicker() {
    form.innerHTML = `<h3>За какую страну</h3><div class="grid"><label class="full">Страна<select name="cid">${countryOptions(state.side)}</select></label></div>
      <div class="actions"><button type="button" class="btn" id="mCancel">Отмена</button><button class="btn primary">Выбрать</button></div>`;
    form.querySelector('#mCancel').onclick = () => modal.close();
    form.onsubmit = (e) => { e.preventDefault(); state.side = new FormData(form).get('cid'); modal.close(); save(); updateSide(); };
    modal.showModal();
  }
  function countryOptions(sel) {
    return world.features.map((f) => f.properties.id)
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'ru'))
      .map((id) => `<option value="${id}" ${id === sel ? 'selected' : ''}>${esc(nameOf(id))}</option>`).join('');
  }
  function refreshPanel() {
    const id = selectedCountry;
    const panel = document.getElementById('panel');
    if (!id || !featById.get(id)) { panel.hidden = true; return; }
    const area = Math.round(turf.area(featById.get(id)) / 1e6);
    const ctl = state.control[id] ? Math.round(turf.area(state.control[id]) / 1e6) : 0;
    panel.hidden = false;
    panel.innerHTML = `
      <button class="close" id="pClose">×</button>
      <h2><input type="color" id="pColor" value="${toHex(colorOf(id))}"> ${esc(nameOf(id))}</h2>
      <div class="sub">${esc(labelOf(id))} · ${area.toLocaleString('ru')} км²${ctl ? ` · контролирует ещё ${ctl.toLocaleString('ru')} км²` : ''}</div>
      <div class="row"><span>👤 Глава: <b>${esc(leaderOf(id)?.name || '—')}</b></span> <button class="btn small" id="pLeader">изменить</button></div>
      <div class="row">
        <button class="btn primary" id="pBrush">🖌 Кисть за эту страну</button>
        <button class="btn" id="pRename">✏ Переименовать</button>
      </div>
      <div class="row">
        <button class="btn" id="pAnnex" ${ctl ? '' : 'disabled'}>📜 Закрепить зону контроля как границу</button>
        <button class="btn danger" id="pClear" ${ctl ? '' : 'disabled'}>Снять контроль</button>
      </div>
      <div class="row"><button class="btn" id="pNew">🌐 Создать новую страну</button></div>`;
    panel.querySelector('#pClose').onclick = closePanel;
    panel.querySelector('#pLeader').onclick = () => openLeaderModal(id);
    panel.querySelector('#pBrush').onclick = () => { state.side = id; updateSide(); setTool('brush'); };
    panel.querySelector('#pAnnex').onclick = () => annexControl(id);
    panel.querySelector('#pClear').onclick = () => { snapshot(); delete state.control[id]; renderControl(); save(); refreshPanel(); };
    panel.querySelector('#pNew').onclick = newCountry;
    panel.querySelector('#pColor').onchange = () => snapshot();
    panel.querySelector('#pColor').oninput = (e) => {
      state.colors[id] = e.target.value; save(); refreshCountries(); renderControl(); renderArrows(); renderLabels(); renderLeaders(); updateSide();
    };
    panel.querySelector('#pRename').onclick = () => {
      const n = prompt('Новое название страны', nameOf(id));
      if (n && n.trim()) { snapshot(); state.names[id] = n.trim(); save(); refreshCountries(); updateSide(); refreshPanel(); renderLeaders(); }
    };
  }
  function newCountry() {
    const name = prompt('Название новой страны'); if (!name || !name.trim()) return;
    snapshot();
    const id = 'NEW_' + uid();
    const f = { type: 'Feature', geometry: null, properties: { id, name: name.trim(), nameRu: name.trim(), minLabel: 2, autoLabel: true } };
    state.added.push(f);
    state.colors[id] = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    world.features.push(JSON.parse(JSON.stringify(f)));
    indexWorld();
    state.side = id; save(); updateSide();
    brush.mode = 'border'; setTool('brush');
    toast(`«${name.trim()}»: закрась кистью её территорию`);
  }

  // ---------- modals ----------
  const modal = document.getElementById('modal');
  const form = document.getElementById('modalForm');

  // ---------- top bar ----------
  document.getElementById('btnLayers').onclick = () => { const m = document.getElementById('layersMenu'); m.hidden = !m.hidden; };
  document.querySelectorAll('#layersMenu input').forEach((cb) => cb.onchange = () => {
    const vis = cb.checked ? 'visible' : 'none';
    const groups = {
      fills: ['fills', 'borders-color'], cities: ['cities', 'cities-dot', 'cities-custom', 'places'], arrows: ['arrows-fill', 'arrows-line'],
      strikes: ['strikes-path', 'strikes-area', 'strikes-pt'], sat: ['sat'], control: ['control-fill', 'control-line'], details: ['admin1', 'roads'],
    };
    if (cb.dataset.layer === 'labels') document.body.classList.toggle('hide-tlabels', !cb.checked);
    else if (cb.dataset.layer === 'leaders') document.body.classList.toggle('hide-leaders', !cb.checked);
    else groups[cb.dataset.layer].forEach((l) => map.setLayoutProperty(l, 'visibility', vis));
  });
  document.getElementById('btnExport').onclick = () => {
    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `war-globe-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  document.getElementById('btnImport').onclick = () => document.getElementById('importFile').click();
  document.getElementById('importFile').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { snapshot(); restore(JSON.stringify({ ...blankState(), ...JSON.parse(await f.text()) })); closePanel(); toast('Сохранение загружено'); }
    catch (err) { toast('Не получилось прочитать файл'); }
    e.target.value = '';
  };
  document.getElementById('btnReset').onclick = () => {
    if (!confirm('Сбросить всё: границы, контроль, стрелки, подписи, удары? (Ctrl+Z вернёт)')) return;
    snapshot(); restore(JSON.stringify(blankState())); closePanel();
  };

  // ---------- utils ----------
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function toHex(c) {
    if (c.startsWith('#')) return c;
    const ctx = document.createElement('canvas').getContext('2d'); ctx.fillStyle = c; return ctx.fillStyle;
  }
  let toastTimer;
  function toast(msg) {
    const h = document.getElementById('toolhint');
    h.textContent = msg; h.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { h.textContent = HINTS[tool]; h.classList.toggle('show', !!HINTS[tool]); }, 2600);
  }
})();
