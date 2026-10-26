/* War Globe — личная песочница-карта. Всё состояние хранится в localStorage браузера. */
(() => {
  'use strict';

  const SAVE_KEY = 'warglobe.v1';
  const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  const FONT = ['Noto Sans Regular'];
  const FONT_B = ['Noto Sans Bold'];
  const FONT_I = ['Noto Sans Italic'];
  // Чернорусь + Такистан: здесь скрываем реальные названия городов из векторных тайлов
  const FICTION_AREA = { type: 'Polygon', coordinates: [[[25.3, 44.25], [27.3, 44.15], [27.75, 44.4], [27.95, 44.75],
    [27.88, 45.1], [28.0, 45.6], [30.2, 45.6], [30.2, 42.5], [25.9, 42.5], [25.45, 42.75], [25.6, 43.05], [25.35, 43.35],
    [25.45, 43.7], [25.3, 44.25]]] };
  const CUSTOM_CITIES = ['Novigrad', 'Chernogorsk', 'Primorsk', 'Miroslavl', 'Kirovograd', 'Belozersk', 'Utes',
    'Rasman', 'Loy Manara', 'Feruz Abad', 'Garmsar'];

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

  const UNIT_TYPES = {
    inf: 'Пехота', mech: 'Мотострелки', tank: 'Танковая', art: 'Артиллерия',
    vdv: 'ВДВ / десант', sf: 'Спецназ', pvo: 'ПВО', rv: 'Ракетные войска', air: 'Авиация', navy: 'Флот',
  };
  const UNIT_LEVELS = {
    bat: ['Батальон', 'II'], brig: ['Бригада', 'X'], div: ['Дивизия', 'XX'],
    corp: ['Корпус', 'XXX'], army: ['Армия', 'XXXX'], front: ['Фронт / группа', 'XXXXX'],
  };
  const MISSILES = {
    iskander: ['Искандер-М', 18, 500], kalibr: ['Калибр', 15, 2000], kinzhal: ['Кинжал', 22, 2000],
    oreshnik: ['Орешник', 60, 5000], atacms: ['ATACMS', 14, 300], storm: ['Storm Shadow', 12, 560],
    tomahawk: ['Tomahawk', 16, 2500], ballistic: ['МБР', 120, 15000],
  };

  const SEAS = [
    ['Black Sea', 34.6, 43.2], ['Green Sea', 30.1, 43.75], ['Sea of Azov', 36.6, 46.2], ['Caspian Sea', 50.5, 41.8],
    ['Mediterranean Sea', 18, 35], ['North Atlantic Ocean', -40, 38], ['Barents Sea', 40, 72.5], ['Arabian Sea', 64, 15],
    ['Baltic Sea', 19.4, 57], ['North Sea', 3, 56], ['Indian Ocean', 78, -15], ['Pacific Ocean', -150, 8],
    ['South Atlantic Ocean', -15, -25], ['Arctic Ocean', 10, 84], ['Red Sea', 38.4, 20.5], ['Persian Gulf', 51.4, 27.2],
    ['Norwegian Sea', 2, 68], ['Kara Sea', 70, 75], ['Sea of Japan', 135, 40], ['Bay of Bengal', 88, 15],
  ];
  const REGIONS = [['BLACK MOUNTAINS', 28.55, 45.38], ['SOUTH ZAGORIA', 28.95, 44.8]];

  // ---------- state ----------
  let baseWorld = null;          // исходная карта (из data/world.json)
  let world = null;              // текущая карта (с изменениями)
  let cities = [];
  let state = blankState();
  const featById = new Map();
  const bboxCache = new Map();

  function blankState() {
    return { side: 'RUS', colors: {}, names: {}, geo: {}, added: [], units: [], arrows: [], strikes: [], zones: [], leaders: {}, log: [] };
  }
  const uid = () => Math.random().toString(36).slice(2, 9);

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
    catch (e) { console.warn('save failed', e); toast('Не удалось сохранить в браузере — используй 💾'); }
  }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.units) return { ...blankState(), ...s }; }
    catch (e) { /* пусто */ }
    return null;
  }

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

  // ---------- map ----------
  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      projection: { type: 'globe' },
      glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] },
      sources: {
        sat: { type: 'raster', tiles: [SAT], tileSize: 256, maxzoom: 18, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' },
        ofm: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '© OpenFreeMap © OpenStreetMap' },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#0b1a33' } },
        { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-saturation': 0.05, 'raster-contrast': 0.08, 'raster-brightness-max': 0.88 } },
      ],
    },
    center: [30, 45], zoom: 2.3, maxPitch: 70,
    attributionControl: { compact: true },
  });
  map.doubleClickZoom.disable();
  window.wg = { map, get state() { return state; } }; // для отладки из консоли
  new ResizeObserver(() => map.resize()).observe(document.getElementById('map'));
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

  const empty = () => turf.featureCollection([]);

  map.once('style.load', async () => {
    const [w, c, g] = await Promise.all(['world', 'cities', 'greensea'].map((n) => fetch(`data/${n}.json`).then((r) => r.json())));
    baseWorld = w; cities = c;
    map.addSource('greensea', { type: 'geojson', data: g });
    map.addLayer({ id: 'greensea', type: 'fill', source: 'greensea', paint: { 'fill-color': '#1ed98a', 'fill-opacity': ['*', 1.6, ['get', 'o']] } });
    const saved = load();
    if (saved) state = saved; else { state = blankState(); seedScenario(); }
    rebuildWorld();

    map.addSource('countries', { type: 'geojson', data: countriesData(), promoteId: 'id' });
    map.addSource('labels', { type: 'geojson', data: labelsData() });
    map.addSource('cities', { type: 'geojson', data: citiesData() });
    map.addSource('seas', { type: 'geojson', data: turf.featureCollection(SEAS.map(([n, x, y]) => turf.point([x, y], { n }))) });
    map.addSource('regions', { type: 'geojson', data: turf.featureCollection(REGIONS.map(([n, x, y]) => turf.point([x, y], { n }))) });
    map.addSource('arrows', { type: 'geojson', data: empty() });
    map.addSource('zones', { type: 'geojson', data: empty() });
    map.addSource('strikes', { type: 'geojson', data: empty() });
    map.addSource('draft', { type: 'geojson', data: empty() });
    map.addSource('flight', { type: 'geojson', data: empty() });

    map.addLayer({ id: 'fills', type: 'fill', source: 'countries', paint: {
      'fill-color': ['get', 'color'],
      'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.5, ['==', ['get', 'id'], ['literal', state.side]], 0.42, 0.3],
    } });
    map.addLayer({ id: 'borders', type: 'line', source: 'countries', paint: {
      'line-color': '#0d0d0d', 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.5, 6, 1.6], 'line-opacity': 0.85,
    } });
    map.addLayer({ id: 'borders-color', type: 'line', source: 'countries', minzoom: 3.5, paint: {
      'line-color': ['get', 'color'], 'line-width': 1.2, 'line-offset': 1.5, 'line-opacity': 0.9,
    } });
    map.addLayer({ id: 'zones-fill', type: 'fill', source: 'zones', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.5 } });
    map.addLayer({ id: 'zones-line', type: 'line', source: 'zones', paint: { 'line-color': '#fff', 'line-width': 2, 'line-dasharray': [1, 1] } });
    map.addLayer({ id: 'admin1', type: 'line', source: 'ofm', 'source-layer': 'boundary', minzoom: 3.5,
      filter: ['all', ['match', ['get', 'admin_level'], [3, 4], true, false], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': '#e0302a', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 8, 1.3], 'line-opacity': 0.75 } });
    map.addLayer({ id: 'roads', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 4.5,
      filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], true, false],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#f3e7c4', 'line-opacity': 0.55,
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, ['match', ['get', 'class'], 'motorway', 1.2, 0.6], 10, ['match', ['get', 'class'], 'motorway', 3, 1.6]] } });
    map.addLayer({ id: 'selected', type: 'line', source: 'countries', filter: ['==', ['get', 'id'], ''], paint: {
      'line-color': '#ffffff', 'line-width': 2.5, 'line-dasharray': [2, 1],
    } });

    map.addLayer({ id: 'arrows-fill', type: 'fill', source: 'arrows', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.75 } });
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

    map.addLayer({ id: 'draft-fill', type: 'fill', source: 'draft', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#fff', 'fill-opacity': 0.15 } });
    map.addLayer({ id: 'draft-line', type: 'line', source: 'draft', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': '#fff', 'line-width': 2, 'line-dasharray': [2, 1] } });
    map.addLayer({ id: 'draft-pt', type: 'circle', source: 'draft', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 4, 'circle-color': '#fff', 'circle-stroke-color': '#000', 'circle-stroke-width': 1 } });

    map.addLayer({ id: 'seas', type: 'symbol', source: 'seas', layout: {
      'text-field': ['get', 'n'], 'text-font': FONT_I, 'text-size': 11.5, 'text-letter-spacing': 0.15, 'text-max-width': 6,
    }, paint: { 'text-color': '#a9bcd8', 'text-halo-color': '#0a1530', 'text-halo-width': 1 } });
    map.addLayer({ id: 'regions', type: 'symbol', source: 'regions', minzoom: 5, layout: {
      'text-field': ['get', 'n'], 'text-font': FONT_B, 'text-size': 11, 'text-letter-spacing': 0.2,
    }, paint: { 'text-color': '#e9e2c8', 'text-halo-color': '#000', 'text-halo-width': 1.2 } });
    map.addLayer({ id: 'places', type: 'symbol', source: 'ofm', 'source-layer': 'place', minzoom: 5.5,
      filter: ['all', ['match', ['get', 'class'], ['city', 'town'], true, false], ['!', ['within', FICTION_AREA]]],
      layout: { 'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']], 'text-font': FONT_B,
        'text-size': ['match', ['get', 'class'], 'city', 12, 10], 'symbol-sort-key': ['get', 'rank'] },
      paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.3 } });
    map.addLayer({ id: 'cities-dot', type: 'circle', source: 'cities', maxzoom: 5.5, filter: ['<=', ['get', 'z'], ['+', ['zoom'], 0.6]], paint: {
      'circle-radius': ['case', ['==', ['get', 'cap'], 1], 3, 2], 'circle-color': '#fff', 'circle-stroke-color': '#000', 'circle-stroke-width': 1,
    } });
    map.addLayer({ id: 'cities-custom', type: 'symbol', source: 'cities', minzoom: 5.5, filter: ['in', ['get', 'n'], ['literal', CUSTOM_CITIES]], layout: {
      'text-field': ['get', 'n'], 'text-font': FONT_B, 'text-size': ['case', ['==', ['get', 'cap'], 1], 13, 11.5],
    }, paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.3 } });
    map.addLayer({ id: 'cities', type: 'symbol', source: 'cities', maxzoom: 5.5, filter: ['<=', ['get', 'z'], ['+', ['zoom'], 0.6]], layout: {
      'text-field': ['get', 'n'], 'text-font': FONT, 'text-size': ['case', ['==', ['get', 'cap'], 1], 12, 10.5],
      'text-offset': [0, 0.9], 'text-anchor': 'top', 'symbol-sort-key': ['get', 'z'],
    }, paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.3 } });
    map.addLayer({ id: 'country-labels', type: 'symbol', source: 'labels', filter: ['<=', ['get', 'minLabel'], ['+', ['zoom'], 1.6]], layout: {
      'text-field': ['get', 'label'], 'text-font': FONT_B, 'text-size': ['interpolate', ['linear'], ['zoom'], 1, 9, 5, 14],
      'text-max-width': 7, 'symbol-sort-key': ['get', 'minLabel'],
    }, paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.4 } });

    renderAll();
    bindMapEvents();
    updateSide();
    renderLog();
    document.getElementById('loading').remove();
  });

  function countriesData() {
    return turf.featureCollection(world.features.map((f) => ({
      type: 'Feature', geometry: f.geometry, properties: { id: f.properties.id, color: colorOf(f.properties.id) },
    })));
  }
  function labelsData() {
    return turf.featureCollection(world.features.filter((f) => f.properties.lx != null).map((f) => turf.point(
      [f.properties.lx, f.properties.ly], { id: f.properties.id, label: labelOf(f.properties.id), minLabel: f.properties.minLabel },
    )));
  }
  function citiesData() {
    return turf.featureCollection(cities.map((c) => turf.point([c.x, c.y], { n: c.n, z: c.z, cap: c.cap })));
  }

  function refreshCountries() {
    map.getSource('countries').setData(countriesData());
    map.getSource('labels').setData(labelsData());
    map.setPaintProperty('fills', 'fill-opacity',
      ['case', ['boolean', ['feature-state', 'hover'], false], 0.5, ['==', ['get', 'id'], state.side], 0.42, 0.3]);
  }

  function renderAll() {
    refreshCountries();
    renderArrows();
    renderStrikes();
    renderZones();
    renderUnits();
    renderLeaders();
  }

  // ---------- zones of control ----------
  function renderZones() {
    map.getSource('zones').setData(turf.featureCollection(state.zones.map((z) =>
      turf.polygon([[...z.pts, z.pts[0]]], { id: z.id, color: colorOf(z.cid) }))));
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
        el.addEventListener('click', (e) => {
          e.stopPropagation(); lastMarkerClick = Date.now();
          if (['unit', 'arrow', 'missile', 'capture', 'newcountry', 'zone'].includes(tool)) { const p = m.getLngLat(); handlePoint([p.lng, p.lat]); return; }
          openLeaderModal(id);
        });
        m = new maplibregl.Marker({ element: el, draggable: true, anchor: 'bottom', offset: [0, -8] }).setLngLat([l.lng, l.lat]).addTo(map);
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
    form.querySelector('#mDel').onclick = () => { state.leaders[id] = null; modal.close(); save(); renderLeaders(); refreshPanel(); };
    form.onsubmit = (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(form));
      const old = state.leaders[id] || {};
      state.leaders[id] = { ...old, name: v.name.trim(), wiki: v.wiki.trim(), photo: v.photo.trim() };
      if (!state.leaders[id].name) state.leaders[id] = null;
      modal.close(); save(); renderLeaders(); refreshPanel();
    };
    modal.showModal();
  }

  // ---------- scenario ----------
  function seedScenario() {
    const u = (cid, name, type, level, lng, lat, troops, tanks = 0, ifv = 0, art = 0, air = 0) =>
      state.units.push({ id: uid(), cid, name, type, level, lng, lat, troops, tanks, ifv, art, air });
    u('RUS', '58-я армия', 'mech', 'army', 35.2, 46.9, 42000, 310, 520, 260);
    u('RUS', '1-я танковая армия', 'tank', 'army', 38.6, 49.9, 38000, 640, 450, 220);
    u('RUS', '7-я гв. ДШД', 'vdv', 'div', 30.3, 46.6, 9000, 40, 210, 60);
    u('RUS', 'Черноморский флот', 'navy', 'army', 33.5, 44.6, 25000, 0, 0, 0, 40);
    u('UKR', '3-я ОШБр', 'inf', 'brig', 36.1, 49.5, 5000, 30, 90, 40);
    u('UKR', '47-я ОМБр', 'mech', 'brig', 34.6, 48.2, 4500, 60, 110, 36);
    u('UKR', 'ОК «Юг»', 'mech', 'corp', 31.3, 48.6, 30000, 160, 380, 200);
    u('CHR', '1-я мотострелковая дивизия ЧДКЗ', 'mech', 'div', 28.3, 44.4, 12000, 90, 210, 72);
    u('CHR', 'Береговая охрана Утёса', 'navy', 'bat', 29.1, 44.2, 900, 0, 0, 8);
    u('CHR', 'NAPA (партизаны)', 'inf', 'brig', 27.9, 45.0, 2500);
    u('TKS', 'Армия Такистана', 'inf', 'army', 26.2, 43.3, 35000, 120, 260, 140, 18);
    u('TKS', 'ТЛА (ополчение)', 'inf', 'brig', 25.8, 43.75, 4000);
    state.arrows.push({ id: uid(), cid: 'RUS', pts: [[31.4, 46.9], [30.9, 46.65], [30.55, 46.48]] });
    state.zones.push({ id: uid(), cid: 'RUS', pts: [[37.3, 50.35], [36.95, 50.0], [37.05, 49.6], [37.5, 49.3], [38.0, 49.25], [38.25, 50.1]] });
    addLog('Карта загружена. Двигай фишки, рисуй фронт и границы как хочешь.', null);
  }

  // ---------- units ----------
  const markers = new Map();

  function unitSvg(type) {
    const s = 'stroke="#111" stroke-width="1.6" fill="none"';
    const X = `<path d="M1 1L29 17M29 1L1 17" ${s}/>`;
    const E = `<rect x="7" y="4" width="16" height="10" rx="5" ${s}/>`;
    switch (type) {
      case 'inf': return X;
      case 'tank': return E;
      case 'mech': return X + E;
      case 'art': return '<circle cx="15" cy="9" r="3.4" fill="#111"/>';
      case 'vdv': return X + `<path d="M9 17q3-5 6 0q3-5 6 0" ${s}/>`;
      case 'sf': return '<text x="15" y="13.5" text-anchor="middle" font-size="10" font-weight="700" fill="#111">SF</text>';
      case 'pvo': return `<path d="M3 17Q15 0 27 17" ${s}/>`;
      case 'rv': return `<path d="M15 16V3M10 8l5-5 5 5" ${s}/>`;
      case 'air': return `<path d="M3 9q6-7 12 0q6 7 12 0q-6-7-12 0q-6 7-12 0z" ${s}/>`;
      case 'navy': return '<text x="15" y="14" text-anchor="middle" font-size="13" fill="#111">⚓</text>';
      default: return X;
    }
  }
  const fmt = (n) => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));

  function unitEl(u) {
    const el = document.createElement('div');
    el.className = 'unit';
    el.innerHTML = `<div class="inner"><div class="lvl"></div><div class="box"><svg viewBox="0 0 30 18"></svg></div><div class="ulabel"></div></div>`;
    el.addEventListener('click', (e) => { e.stopPropagation(); lastMarkerClick = Date.now(); onUnitClick(u.id); });
    return el;
  }
  function paintUnit(el, u) {
    el.style.setProperty('--c', colorOf(u.cid));
    el.querySelector('.lvl').textContent = UNIT_LEVELS[u.level]?.[1] || '';
    el.querySelector('svg').innerHTML = unitSvg(u.type);
    const short = u.name.length > 22 ? u.name.slice(0, 21) + '…' : u.name;
    el.querySelector('.ulabel').textContent = `${short} · ${fmt(u.troops)}${u.tanks ? ' · ' + u.tanks + '🛡' : ''}`;
    el.title = `${u.name}\n${nameOf(u.cid)} — ${UNIT_TYPES[u.type]}, ${UNIT_LEVELS[u.level]?.[0]}\nЛ/с: ${u.troops}, танки: ${u.tanks}, ББМ: ${u.ifv}, арт.: ${u.art}, авиация: ${u.air}`;
  }
  function renderUnits() {
    const ids = new Set(state.units.map((u) => u.id));
    for (const [id, m] of markers) if (!ids.has(id)) { m.remove(); markers.delete(id); }
    for (const u of state.units) {
      let m = markers.get(u.id);
      if (!m) {
        m = new maplibregl.Marker({ element: unitEl(u), draggable: true }).setLngLat([u.lng, u.lat]).addTo(map);
        m.on('dragend', () => {
          const unit = state.units.find((x) => x.id === u.id); if (!unit) return;
          const { lng, lat } = m.getLngLat(); unit.lng = lng; unit.lat = lat;
          addLog(`${unit.name} передислоцирована${whereText(lng, lat)}.`, unit.cid); save();
        });
        markers.set(u.id, m);
      }
      m.setLngLat([u.lng, u.lat]);
      m.setDraggable(tool === 'select');
      paintUnit(m.getElement(), u);
      m.getElement().classList.toggle('sel', u.id === pending.unit);
    }
    scaleUnits();
  }
  function scaleUnits() {
    const z = map.getZoom();
    const s = Math.max(0.4, Math.min(1.1, 0.2 + z * 0.13));
    document.getElementById('map').style.setProperty('--s', s);
    for (const m of markers.values()) m.getElement().style.setProperty('--s', s);
    document.body.classList.toggle('hide-labels', z < 3.2);
    document.body.classList.toggle('hide-leaders-far', z < 2.6);
  }

  function countryAt(lng, lat) {
    const pt = [lng, lat];
    for (const f of world.features) {
      const b = bboxOf(f);
      if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue;
      if (turf.booleanPointInPolygon(pt, f)) return f.properties.id;
    }
    return null;
  }
  const whereText = (lng, lat) => { const c = countryAt(lng, lat); return c ? ` (${nameOf(c)})` : ' (море)'; };

  // ---------- arrows ----------
  function fatArrow(pts, color, id) {
    const line = turf.lineString(pts);
    const L = turf.length(line);
    if (L < 1) return null;
    const w = Math.min(Math.max(L * 0.05, 3), 45);
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
    const [title, radius, range] = MISSILES[kind];
    const dist = turf.distance(from, to);
    if (dist > range) toast(`Внимание: дальность ${title} ~${range} км, а цель в ${Math.round(dist)} км`);
    const coords = arcCoords(from, to);
    const dur = Math.min(4000, 1200 + dist * 1.2);
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const p = coords[Math.min(coords.length - 1, Math.floor(k * (coords.length - 1)))];
      map.getSource('flight').setData(turf.featureCollection([turf.point(p), turf.lineString(coords.slice(0, Math.max(2, Math.floor(k * coords.length))))]));
      if (k < 1) requestAnimationFrame(step);
      else {
        map.getSource('flight').setData(empty());
        const boom = document.createElement('div'); boom.className = 'boom';
        const bm = new maplibregl.Marker({ element: boom }).setLngLat(to).addTo(map);
        setTimeout(() => bm.remove(), 1500);
        const cid = state.side;
        state.strikes.push({ id: uid(), cid, kind, from, to, r: radius });
        const hits = strikeDamage(to, radius);
        addLog(`🚀 ${nameOf(cid)}: удар «${title}» по${whereText(to[0], to[1])}${hits ? '. ' + hits : ''}`, cid);
        renderStrikes(); renderUnits(); save(); refreshPanel();
      }
    };
    requestAnimationFrame(step);
  }
  function strikeDamage(to, radius) {
    const out = [];
    for (const u of [...state.units]) {
      const d = turf.distance(to, [u.lng, u.lat]);
      if (d > radius * 1.5) continue;
      const k = (d <= radius ? 0.12 : 0.05) + Math.random() * 0.08;
      const lost = Math.round(u.troops * k);
      applyLosses(u, k);
      out.push(`${u.name}: −${lost} чел.`);
    }
    return out.join('; ');
  }
  function applyLosses(u, k) {
    for (const f of ['troops', 'tanks', 'ifv', 'art', 'air']) u[f] = Math.max(0, Math.round(u[f] * (1 - k * (f === 'troops' ? 1 : 0.9 + Math.random() * 0.3))));
    if (u.troops < 50) {
      state.units = state.units.filter((x) => x.id !== u.id);
      addLog(`☠ ${u.name} уничтожена.`, u.cid);
    }
  }

  // ---------- battles ----------
  const power = (u) => u.troops + u.tanks * 30 + u.ifv * 10 + u.art * 25 + u.air * 60;
  function battle(att, def) {
    const pa = power(att) * (0.7 + Math.random() * 0.6);
    const pd = power(def) * 1.25 * (0.7 + Math.random() * 0.6);
    const win = pa > pd;
    const ratio = Math.min(3, Math.max(pa, pd) / Math.max(1, Math.min(pa, pd)));
    const kLose = 0.08 + 0.06 * ratio + Math.random() * 0.06;
    const kWin = 0.03 + Math.random() * 0.06;
    const [a0, d0] = [att.troops, def.troops];
    const [at0, dt0] = [att.tanks, def.tanks];
    state.arrows.push({ id: uid(), cid: att.cid, pts: [[att.lng, att.lat], [def.lng, def.lat]] });
    applyLosses(att, win ? kWin : kLose);
    applyLosses(def, win ? kLose : kWin);
    if (win && state.units.includes(def)) {
      // обороняющиеся отходят, атакующие занимают позицию
      const b = turf.bearing([att.lng, att.lat], [def.lng, def.lat]);
      const [nx, ny] = turf.destination([def.lng, def.lat], 25, b).geometry.coordinates;
      const [ax, ay] = turf.destination([def.lng, def.lat], 6, b + 180).geometry.coordinates;
      Object.assign(def, { lng: nx, lat: ny }); Object.assign(att, { lng: ax, lat: ay });
    }
    const loss = (u, t0, tk0) => `−${t0 - u.troops} чел., −${tk0 - u.tanks} танков`;
    addLog(`⚔ ${att.name} (${nameOf(att.cid)}) атакует ${def.name} (${nameOf(def.cid)}) — ${win ? 'УСПЕХ, противник отступил' : 'атака отбита'}. ` +
      `Потери: атакующие ${loss(att, a0, at0)}; обороняющиеся ${loss(def, d0, dt0)}.`, att.cid);
    renderArrows(); renderUnits(); save(); refreshPanel();
  }

  // ---------- territory ----------
  function captureTerritory(ring, targetId, newCountry) {
    const drawn = turf.polygon([[...ring, ring[0]]]);
    const db = turf.bbox(drawn);
    const taken = [];
    const changed = [];
    for (const f of world.features) {
      const id = f.properties.id;
      if (id === targetId) continue;
      const b = bboxOf(f);
      if (b[2] < db[0] || b[0] > db[2] || b[3] < db[1] || b[1] > db[3]) continue;
      let part;
      try { part = turf.intersect(turf.featureCollection([f, drawn])); } catch (e) { continue; }
      if (!part) continue;
      taken.push(part);
      const rest = turf.difference(turf.featureCollection([f, drawn]));
      changed.push(nameOf(id));
      if (rest) f.geometry = rest.geometry; else f.geometry = null;
      state.geo[id] = f.geometry;
    }
    if (!taken.length) { toast('В выделенной области нет суши других стран'); return false; }
    let gain = taken.length > 1 ? turf.union(turf.featureCollection(taken)) : taken[0];
    if (newCountry) {
      const f = { type: 'Feature', geometry: gain.geometry, properties: {
        id: targetId, name: newCountry.name, nameRu: newCountry.name, minLabel: 2, ...labelPoint(gain),
      } };
      state.added.push(f); world.features.push(f);
      state.colors[targetId] = newCountry.color;
      state.geo[targetId] = gain.geometry;
      addLog(`🌐 Провозглашена новая страна «${newCountry.name}» (территория: ${changed.join(', ')}).`, targetId);
    } else {
      const t = featById.get(targetId);
      gain = t.geometry ? turf.union(turf.featureCollection([t, gain])) : gain;
      t.geometry = gain.geometry;
      state.geo[targetId] = t.geometry;
      addLog(`🏴 ${nameOf(targetId)} берёт под контроль территорию: ${changed.join(', ')}.`, targetId);
    }
    world.features = world.features.filter((f) => f.geometry);
    indexWorld();
    refreshCountries(); save(); refreshPanel();
    return true;
  }
  function labelPoint(f) {
    const p = turf.pointOnFeature(f).geometry.coordinates;
    return { lx: p[0], ly: p[1] };
  }

  // ---------- tools ----------
  let tool = 'select';
  let draft = [];
  const pending = { unit: null };
  let lastMarkerClick = 0;
  let selectedCountry = null;

  const HINTS = {
    select: '',
    unit: 'Кликни по карте, чтобы поставить подразделение',
    attack: 'Выбери своё подразделение, затем — цель',
    arrow: 'Кликай точки пути стрелки. Двойной клик или Enter — готово, Esc — отмена',
    missile: 'Кликни точку пуска, затем цель',
    capture: 'Обведи территорию кликами. Двойной клик / Enter — она отойдёт стороне (границы меняются)',
    zone: 'Обведи зону контроля / оккупации. Двойной клик / Enter — готово (границы не меняются)',
    newcountry: 'Обведи территорию новой страны. Двойной клик / Enter — готово',
    erase: 'Кликни по стрелке, удару или зоне контроля, чтобы удалить',
  };

  function setTool(t) {
    tool = t; draft = []; pending.unit = null; setDraft();
    document.querySelectorAll('#toolbar button').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
    const hint = document.getElementById('toolhint');
    hint.textContent = HINTS[t]; hint.classList.toggle('show', !!HINTS[t]);
    renderToolOpts();
    map.getCanvas().style.cursor = t === 'select' ? '' : 'crosshair';
    renderUnits();
  }
  function renderToolOpts() {
    const box = document.getElementById('toolopts');
    box.innerHTML = '';
    if (tool === 'missile') {
      box.innerHTML = `Ракета: <select id="optMissile">${Object.entries(MISSILES).map(([k, v]) =>
        `<option value="${k}">${v[0]} (r≈${v[1]} км, до ${v[2]} км)</option>`).join('')}</select>`;
      const sel = box.querySelector('select'); sel.value = state.missile || 'iskander';
      sel.onchange = () => { state.missile = sel.value; save(); };
    }
    if (['arrow', 'missile', 'capture', 'attack', 'zone'].includes(tool)) {
      box.insertAdjacentHTML('beforeend', `<span>за: <b style="color:${colorOf(state.side)}">${nameOf(state.side)}</b> <small>(смени сторону кликом по стране)</small></span>`);
    }
    box.classList.toggle('show', !!box.innerHTML);
  }
  function setDraft() {
    const feats = draft.map((p) => turf.point(p));
    if (draft.length >= 2) feats.push(turf.lineString(draft));
    if (draft.length >= 3 && ['capture', 'newcountry', 'zone'].includes(tool)) feats.push(turf.polygon([[...draft, draft[0]]]));
    map.getSource('draft')?.setData(turf.featureCollection(feats));
  }

  function bindMapEvents() {
    document.querySelectorAll('#toolbar button').forEach((b) => b.onclick = () => setTool(b.dataset.tool));
    map.on('zoom', scaleUnits);

    let hoverId = null;
    map.on('mousemove', 'fills', (e) => {
      const id = e.features[0]?.id;
      if (hoverId !== null && hoverId !== id) map.setFeatureState({ source: 'countries', id: hoverId }, { hover: false });
      hoverId = id; if (id != null) map.setFeatureState({ source: 'countries', id }, { hover: true });
    });
    map.on('mouseleave', 'fills', () => {
      if (hoverId !== null) map.setFeatureState({ source: 'countries', id: hoverId }, { hover: false });
      hoverId = null;
    });

    map.on('click', (e) => {
      if (Date.now() - lastMarkerClick < 250) return;
      handlePoint([e.lngLat.lng, e.lngLat.lat], e);
    });
    map.on('dblclick', (e) => { e.preventDefault(); finishDraft(); });
    window.addEventListener('keydown', (e) => {
      if (document.querySelector('dialog[open]')) return;
      if (e.key === 'Escape') { if (draft.length) { draft = []; setDraft(); } else setTool('select'); }
      if (e.key === 'Enter') finishDraft();
      if (e.key === 'Backspace' && draft.length) { draft.pop(); setDraft(); }
    });
  }

  function handlePoint(p, e) {
      switch (tool) {
        case 'select': {
          const id = countryAt(p[0], p[1]);
          if (id) selectCountry(id); else closePanel();
          break;
        }
        case 'unit': openUnitModal(null, p); break;
        case 'arrow': case 'capture': case 'newcountry': case 'zone':
          draft.push(p); setDraft(); break;
        case 'missile':
          draft.push(p); setDraft();
          if (draft.length === 2) { launchMissile(draft[0], draft[1], state.missile || 'iskander'); draft = []; setTimeout(setDraft, 50); }
          break;
        case 'erase': {
          if (!e) return;
          const f = map.queryRenderedFeatures(e.point, { layers: ['arrows-fill', 'strikes-area', 'strikes-pt', 'zones-fill'] })[0];
          if (!f) return;
          const id = f.properties.id;
          state.arrows = state.arrows.filter((a) => a.id !== id);
          state.strikes = state.strikes.filter((s) => s.id !== id);
          state.zones = state.zones.filter((z) => z.id !== id);
          renderArrows(); renderStrikes(); renderZones(); save();
          break;
        }
        case 'attack': toast('Кликни по значку подразделения'); break;
      }
  }

  function finishDraft() {
    // dblclick добавляет лишнюю точку на последнем клике — убираем дубли
    draft = draft.filter((p, i) => i === 0 || turf.distance(p, draft[i - 1]) > 0.5);
    if (tool === 'arrow' && draft.length >= 2) {
      state.arrows.push({ id: uid(), cid: state.side, pts: draft });
      addLog(`➜ ${nameOf(state.side)}: направление наступления${whereText(...draft[draft.length - 1])}.`, state.side);
      renderArrows(); save();
    } else if (tool === 'zone' && draft.length >= 3) {
      state.zones.push({ id: uid(), cid: state.side, pts: draft });
      addLog(`🟥 ${nameOf(state.side)}: новая зона контроля${whereText(...draft[0])}.`, state.side);
      renderZones(); save();
    } else if (tool === 'capture' && draft.length >= 3) {
      captureTerritory(draft, state.side);
    } else if (tool === 'newcountry' && draft.length >= 3) {
      const ring = draft;
      openNewCountryModal((nc) => {
        const id = 'NEW_' + uid();
        captureTerritory(ring, id, nc);
        selectCountry(id);
      });
    } else return;
    draft = []; setDraft();
  }

  function onUnitClick(id) {
    const u = state.units.find((x) => x.id === id); if (!u) return;
    if (tool === 'attack') {
      if (!pending.unit) { pending.unit = id; renderUnits(); toast(`${u.name}: выбери цель`); return; }
      if (pending.unit === id) { pending.unit = null; renderUnits(); return; }
      const att = state.units.find((x) => x.id === pending.unit);
      pending.unit = null;
      if (att.cid === u.cid) { toast('Нельзя атаковать своих'); renderUnits(); return; }
      battle(att, u);
      return;
    }
    // в режимах рисования значок войск — просто точка на карте (например, пуск ракеты из позиции части)
    if (['unit', 'arrow', 'missile', 'capture', 'newcountry', 'zone'].includes(tool)) { handlePoint([u.lng, u.lat]); return; }
    if (tool === 'erase') { if (confirm(`Расформировать «${u.name}»?`)) deleteUnit(u.id); return; }
    openUnitModal(u);
  }
  function deleteUnit(id) {
    const u = state.units.find((x) => x.id === id);
    state.units = state.units.filter((x) => x.id !== id);
    if (u) addLog(`${u.name} расформирована.`, u.cid);
    renderUnits(); save(); refreshPanel();
  }

  // ---------- side / panel ----------
  function updateSide() {
    document.getElementById('sideName').textContent = nameOf(state.side);
    document.getElementById('sideSwatch').style.background = colorOf(state.side);
    if (map.getLayer('fills')) refreshCountries();
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
  function refreshPanel() {
    const id = selectedCountry;
    const panel = document.getElementById('panel');
    if (!id || !featById.get(id)) { panel.hidden = true; return; }
    const us = state.units.filter((u) => u.cid === id);
    const sum = (k) => us.reduce((a, u) => a + (u[k] || 0), 0);
    const area = Math.round(turf.area(featById.get(id)) / 1e6);
    panel.hidden = false;
    panel.innerHTML = `
      <button class="close" id="pClose">×</button>
      <h2><input type="color" id="pColor" value="${toHex(colorOf(id))}"> ${esc(nameOf(id))}</h2>
      <div class="sub">${esc(labelOf(id))} · ${area.toLocaleString('ru')} км²</div>
      <div class="row"><span>👤 Глава: <b>${esc(leaderOf(id)?.name || '—')}</b></span> <button class="btn" id="pLeader">изменить</button></div>
      <div class="stats">
        <div class="stat"><b>${us.length}</b><small>подразделений</small></div>
        <div class="stat"><b>${sum('troops').toLocaleString('ru')}</b><small>личный состав</small></div>
        <div class="stat"><b>${sum('tanks').toLocaleString('ru')}</b><small>танков</small></div>
        <div class="stat"><b>${sum('ifv').toLocaleString('ru')}</b><small>ББМ</small></div>
        <div class="stat"><b>${sum('art').toLocaleString('ru')}</b><small>артиллерия</small></div>
        <div class="stat"><b>${sum('air').toLocaleString('ru')}</b><small>авиация</small></div>
      </div>
      <div class="row">
        <button class="btn primary" id="pAdd">➕ Подразделение</button>
        <button class="btn" id="pRename">✏ Переименовать</button>
      </div>
      <ul class="ulist">${us.map((u) => `
        <li data-id="${u.id}"><span style="color:${colorOf(id)}">■</span>
          <div><div>${esc(u.name)}</div><div class="meta">${UNIT_LEVELS[u.level]?.[0]} · ${UNIT_TYPES[u.type]} · ${u.troops.toLocaleString('ru')} чел. · ${u.tanks} танков</div></div></li>`).join('')}
      </ul>
      ${us.length ? '' : '<div class="sub">Войск пока нет. Нажми «Подразделение» или инструмент ➕.</div>'}
    `;
    panel.querySelector('#pClose').onclick = closePanel;
    panel.querySelector('#pLeader').onclick = () => openLeaderModal(id);
    panel.querySelector('#pColor').oninput = (e) => {
      state.colors[id] = e.target.value; save(); refreshCountries(); renderArrows(); renderZones(); renderUnits(); renderLeaders(); updateSide();
    };
    panel.querySelector('#pAdd').onclick = () => {
      const f = featById.get(id);
      openUnitModal(null, [f.properties.lx ?? turf.pointOnFeature(f).geometry.coordinates[0], f.properties.ly ?? turf.pointOnFeature(f).geometry.coordinates[1]], id);
    };
    panel.querySelector('#pRename').onclick = () => {
      const n = prompt('Новое название страны', nameOf(id));
      if (n && n.trim()) { state.names[id] = n.trim(); save(); refreshCountries(); updateSide(); refreshPanel(); renderUnits(); renderLeaders(); }
    };
    panel.querySelectorAll('.ulist li').forEach((li) => li.onclick = () => {
      const u = state.units.find((x) => x.id === li.dataset.id);
      map.flyTo({ center: [u.lng, u.lat], zoom: Math.max(map.getZoom(), 6) });
      openUnitModal(u);
    });
  }

  // ---------- modals ----------
  const modal = document.getElementById('modal');
  const form = document.getElementById('modalForm');

  function countryOptions(sel) {
    return [...world.features].map((f) => f.properties.id)
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'ru'))
      .map((id) => `<option value="${id}" ${id === sel ? 'selected' : ''}>${esc(nameOf(id))}</option>`).join('');
  }
  const opts = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${Array.isArray(v) ? v[0] : v}</option>`).join('');

  function openUnitModal(u, at, cid) {
    const isNew = !u;
    const d = u || { cid: cid || countryAt(at[0], at[1]) || state.side, name: '', type: 'mech', level: 'div', troops: 10000, tanks: 100, ifv: 200, art: 60, air: 0 };
    form.innerHTML = `
      <h3>${isNew ? 'Новое подразделение' : 'Подразделение'}</h3>
      <div class="grid">
        <label class="full">Название<input name="name" required value="${esc(d.name)}" placeholder="например, 20-я гв. мотострелковая дивизия"></label>
        <label class="full">Страна<select name="cid">${countryOptions(d.cid)}</select></label>
        <label>Род войск<select name="type">${opts(UNIT_TYPES, d.type)}</select></label>
        <label>Уровень<select name="level">${opts(UNIT_LEVELS, d.level)}</select></label>
        <label>Личный состав<input name="troops" type="number" min="0" value="${d.troops}"></label>
        <label>Танки<input name="tanks" type="number" min="0" value="${d.tanks}"></label>
        <label>ББМ (БМП/БТР)<input name="ifv" type="number" min="0" value="${d.ifv}"></label>
        <label>Артиллерия<input name="art" type="number" min="0" value="${d.art}"></label>
        <label>Авиация / вертолёты<input name="air" type="number" min="0" value="${d.air}"></label>
      </div>
      <div class="actions">
        ${isNew ? '' : '<button type="button" class="btn danger" id="mDel">Расформировать</button>'}
        <button type="button" class="btn" id="mCancel">Отмена</button>
        <button type="submit" class="btn primary">${isNew ? 'Развернуть' : 'Сохранить'}</button>
      </div>`;
    form.querySelector('#mCancel').onclick = () => modal.close();
    form.querySelector('#mDel')?.addEventListener('click', () => { modal.close(); deleteUnit(u.id); });
    form.onsubmit = (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(form));
      for (const k of ['troops', 'tanks', 'ifv', 'art', 'air']) v[k] = Math.max(0, parseInt(v[k], 10) || 0);
      v.name = v.name.trim() || `${UNIT_LEVELS[v.level][0]} (${UNIT_TYPES[v.type]})`;
      if (isNew) {
        const nu = { id: uid(), ...v, lng: at[0], lat: at[1] };
        state.units.push(nu);
        addLog(`➕ ${nameOf(nu.cid)} разворачивает «${nu.name}» — ${nu.troops.toLocaleString('ru')} чел., ${nu.tanks} танков${whereText(at[0], at[1])}.`, nu.cid);
      } else {
        Object.assign(u, v);
      }
      modal.close(); renderUnits(); save(); refreshPanel();
    };
    modal.showModal();
  }

  function openNewCountryModal(done) {
    form.innerHTML = `
      <h3>Новая страна</h3>
      <div class="grid">
        <label class="full">Название<input name="name" required placeholder="Новороссия, Чернорусь-2…"></label>
        <label>Цвет<input name="color" type="color" value="#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}"></label>
      </div>
      <div class="actions"><button type="button" class="btn" id="mCancel">Отмена</button><button class="btn primary">Провозгласить</button></div>`;
    form.querySelector('#mCancel').onclick = () => modal.close();
    form.onsubmit = (e) => { e.preventDefault(); const v = Object.fromEntries(new FormData(form)); modal.close(); done({ name: v.name.trim(), color: v.color }); };
    modal.showModal();
  }

  // ---------- log ----------
  function addLog(text, cid) {
    const d = new Date();
    state.log.unshift({ t: d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }), text, cid });
    state.log = state.log.slice(0, 300);
    renderLog();
  }
  function renderLog() {
    document.getElementById('logList').innerHTML = state.log.slice(0, 80).map((l) =>
      `<li><small>${typeof l.t === 'number' ? '' : esc(l.t)}</small> ${l.cid ? `<span style="color:${colorOf(l.cid)}">■</span> ` : ''}${esc(l.text)}</li>`).join('');
  }

  // ---------- top bar ----------
  document.getElementById('logToggle').onclick = (e) => {
    const l = document.getElementById('log'); l.classList.toggle('collapsed');
    e.target.textContent = l.classList.contains('collapsed') ? '▸' : '▾';
  };
  document.getElementById('btnLayers').onclick = () => { const m = document.getElementById('layersMenu'); m.hidden = !m.hidden; };
  document.querySelectorAll('#layersMenu input').forEach((cb) => cb.onchange = () => {
    const vis = cb.checked ? 'visible' : 'none';
    const groups = {
      fills: ['fills', 'borders-color'], cities: ['cities', 'cities-dot', 'cities-custom', 'places'], arrows: ['arrows-fill', 'arrows-line'],
      strikes: ['strikes-path', 'strikes-area', 'strikes-pt'], sat: ['sat'],
      zones: ['zones-fill', 'zones-line'], details: ['admin1', 'roads'],
    };
    if (cb.dataset.layer === 'units') document.body.classList.toggle('hide-units', !cb.checked);
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
    try { state = { ...blankState(), ...JSON.parse(await f.text()) }; rebuildWorld(); renderAll(); renderLog(); updateSide(); closePanel(); save(); toast('Сохранение загружено'); }
    catch (err) { toast('Не получилось прочитать файл'); }
    e.target.value = '';
  };
  document.getElementById('btnReset').onclick = () => {
    if (!confirm('Сбросить всё: границы, войска, стрелки, удары?')) return;
    state = blankState(); seedScenario(); rebuildWorld(); renderAll(); renderLog(); updateSide(); closePanel(); save();
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
