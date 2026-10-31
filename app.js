'use strict';

/* 🪶 Wander — cute little places tracker
   Data lives in localStorage (key wander.places.v1). Nothing leaves the browser. */

/* ---------- tiny helpers ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const today = () => new Date().toISOString().slice(0, 10);

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`); // midday so timezones don't shift the day
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ---------- categories ---------- */
const CATEGORIES = [
  { id: 'landmark', label: 'landmark', emoji: '🗿' },
  { id: 'cafe', label: 'café', emoji: '🍰' },
  { id: 'food', label: 'food & drink', emoji: '🍜' },
  { id: 'beach', label: 'beach', emoji: '🏖️' },
  { id: 'nature', label: 'nature', emoji: '🌿' },
  { id: 'viewpoint', label: 'view & hike', emoji: '⛰️' },
  { id: 'park', label: 'park & garden', emoji: '🌺' },
  { id: 'museum', label: 'museum & art', emoji: '🖼️' },
  { id: 'city', label: 'city streets', emoji: '🏙️' },
  { id: 'shopping', label: 'shopping', emoji: '🛍️' },
  { id: 'night', label: 'nightlife', emoji: '🌙' },
  { id: 'other', label: 'something else', emoji: '✨' },
];
const catOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

/* ---------- travellers (the main couple 💞) ---------- */
const TRAVELLERS = [
  { id: 'us', name: 'us (Suyog & Susmita)', short: 'us', emoji: '💞' },
  { id: 'suyog', name: 'Suyog', short: 'Suyog', emoji: '🧑' },
  { id: 'susmita', name: 'Susmita', short: 'Susmita', emoji: '👩' },
];
const traveller = (id) => TRAVELLERS.find((t) => t.id === id);
function whoNames(p) {
  return (Array.isArray(p.who) && p.who.length ? p.who : ['us'])
    .map(traveller)
    .filter(Boolean)
    .map((t) => `${t.emoji} ${t.short}`);
}
function whoText(p) {
  return whoNames(p).join(' + ');
}

/* ---------- place search (Photon — open-source geocoder over OSM, no key, no billing) ---------- */
const PHOTON_URL = 'https://photon.komoot.io/api/';

async function photonSuggest(query, layers) {
  const params = new URLSearchParams({ q: query, limit: '6', lang: 'en' });
  if (layers) for (const layer of layers) params.append('layer', layer);
  const res = await fetch(`${PHOTON_URL}?${params}`);
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const data = await res.json();
  return (data.features || []).map((f) => ({
    ...f.properties,
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
  }));
}

/* guess a Wander category from OSM tags — nice little touch */
const OSM_CATEGORY = {
  cafe: 'cafe', restaurant: 'food', fast_food: 'food', food_court: 'food', ice_cream: 'food', brewery: 'food',
  bar: 'night', pub: 'night', nightclub: 'night',
  beach: 'beach', park: 'park', garden: 'park', playground: 'park',
  museum: 'museum', gallery: 'museum', aquarium: 'museum', zoo: 'museum', artwork: 'museum', theatre: 'museum',
  attraction: 'landmark', viewpoint: 'viewpoint', peak: 'viewpoint', tower: 'landmark', castle: 'landmark',
  monument: 'landmark', memorial: 'landmark', lighthouse: 'landmark', pier: 'landmark',
  mountain: 'nature', waterfall: 'nature', forest: 'nature', wood: 'nature', nature_reserve: 'nature',
};
function categoryFromOSM(r) {
  if (r.osm_key === 'shop' || r.osm_value === 'mall' || r.osm_value === 'supermarket') return 'shopping';
  return OSM_CATEGORY[r.osm_value] || null;
}

/* wider view for whole-city picks */
function guessZoom(r) {
  const cityish = ['city', 'town', 'village', 'hamlet', 'suburb', 'district', 'locality', 'state', 'country'];
  return cityish.includes(r.osm_value) || cityish.includes(r.type) ? 12 : 15;
}

/* reusable type-ahead dropdown (keyboard + mouse + debounced fetches) */
function attachAutocomplete(input, drop, cfg, apply) {
  let results = [];
  let active = -1;
  let aborter = null;
  let timer = null;

  const close = () => { drop.hidden = true; active = -1; };

  const paint = () => {
    if (!results.length) return close();
    drop.innerHTML = results
      .map((r, i) => `
        <div class="ac-item${i === active ? ' active' : ''}" data-i="${i}">
          <b>${esc(cfg.main(r))}</b>
          <span>${esc(cfg.sub(r))}</span>
        </div>`)
      .join('');
    drop.hidden = false;
    drop.querySelector('.ac-item.active')?.scrollIntoView({ block: 'nearest' });
  };

  const query = async () => {
    const q = input.value.trim();
    if (q.length < 2) { results = []; return close(); }
    aborter?.abort();
    aborter = new AbortController();
    try {
      const list = await photonSuggest(q, cfg.layers);
      if (input.value.trim() !== q) return; // stale response, a newer one is coming
      results = list;
      active = results.length ? 0 : -1;
      paint();
    } catch {
      /* photon hiccup — just close, typing still works */
      close();
    }
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(query, 250);
  });
  input.addEventListener('keydown', (e) => {
    if (drop.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!results.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      paint();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0) apply(results[active]);
      close();
    } else if (e.key === 'Escape') {
      e.stopPropagation(); // don’t also close the modal
      close();
    }
  });
  drop.addEventListener('mousedown', (e) => {
    const item = e.target.closest('.ac-item');
    if (!item) return;
    e.preventDefault(); // keep focus in the input
    apply(results[+item.dataset.i]);
    close();
  });
  document.addEventListener('mousedown', (e) => {
    if (!drop.contains(e.target) && e.target !== input) close();
  });
}

/* ---------- mini static maps (one OSM tile, pin in the middle) ---------- */
function lonToTileX(lon, z) { return ((lon + 180) / 360) * Math.pow(2, z); }
function latToTileY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z);
}
function hasCoords(p) {
  return p.lat !== '' && p.lat != null && p.lon !== '' && p.lon != null;
}
function mapHTML(p) {
  if (!hasCoords(p)) return '';
  const z = p.zoom || 15;
  const x = lonToTileX(p.lon, z);
  const y = latToTileY(p.lat, z);
  const fx = x - Math.floor(x);
  const fy = y - Math.floor(y);
  const tile = `https://tile.openstreetmap.org/${z}/${Math.floor(x)}/${Math.floor(y)}.png`;
  const osm = `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#${z}/${p.lat}/${p.lon}`;
  // centre the chosen point inside the 108px-high window (256px tile)
  const offX = `calc(50% - ${(fx * 256).toFixed(1)}px)`;
  const offY = `calc(54px - ${(fy * 256).toFixed(1)}px)`;
  return `
  <a class="map" href="${osm}" target="_blank" rel="noopener" title="open in OpenStreetMap">
    <img src="${tile}" alt="little map of ${esc(p.name)}" loading="lazy" style="left:${offX};top:${offY}" width="256" height="256">
    <span class="pin" aria-hidden="true">📍</span>
    <span class="map-open" aria-hidden="true">🗺 open ↗</span>
  </a>`;
}

/* ---------- sample data (shown on first run, delete freely) ---------- */
const SEED = [
  { name: 'Sydney Opera House', city: 'Sydney', country: 'Australia', category: 'landmark', status: 'visited', date: '2024-11-02', who: ['us'], notes: 'Sat on the steps with a gelato while the sails turned gold. 🍦', favorite: true, lat: -33.8568, lon: 151.2153, zoom: 15 },
  { name: 'Bondi → Coogee walk', city: 'Sydney', country: 'Australia', category: 'beach', status: 'visited', date: '2024-11-04', who: ['us'], notes: 'Six kilometres of cliffs and little coves — swim stops mandatory.', favorite: false, lat: -33.8908, lon: 151.2743, zoom: 13 },
  { name: 'Royal Botanic Garden', city: 'Sydney', country: 'Australia', category: 'park', status: 'visited', date: '2024-11-03', who: ['suyog'], notes: 'Ibis everywhere. Harbour view from Mrs Macquarie’s Chair.', favorite: false, lat: -33.8616, lon: 151.2167, zoom: 15 },
  { name: 'The Grounds of Alexandria', city: 'Sydney', country: 'Australia', category: 'cafe', status: 'visited', date: '', who: ['susmita'], suggestedBy: 'Anisha', notes: 'Coffee in a garden full of flowers and fairy lights.', favorite: false, lat: -33.9106, lon: 151.1943, zoom: 16 },
  { name: 'Blue Mountains', city: 'Sydney', country: 'Australia', category: 'viewpoint', status: 'want', date: '', who: ['us'], suggestedBy: 'Komal di', notes: 'Ride the Scenic World skyway over the Jamison Valley.', favorite: true, lat: -33.7286, lon: 150.3119, zoom: 13 },
  { name: 'Manly ferry at sunset', city: 'Sydney', country: 'Australia', category: 'other', status: 'want', date: '', who: ['us'], notes: 'Cheapest harbour cruise there is — sit up top at golden hour.', favorite: false, lat: -33.7955, lon: 151.2761, zoom: 14 },
  { name: 'Laneway coffee crawl', city: 'Melbourne', country: 'Australia', category: 'cafe', status: 'visited', date: '2024-11-08', who: ['us'], notes: 'Found a tiny roaster off Degraves St. Flat white, perfect.', favorite: false, lat: -37.817, lon: 144.9658, zoom: 16 },
  { name: 'teamLab Planets', city: 'Tokyo', country: 'Japan', category: 'museum', status: 'want', date: '', who: ['us'], suggestedBy: 'Rahul', notes: 'Barefoot, wading through glowing water. Book ahead!', favorite: true, lat: 35.653, lon: 139.7897, zoom: 15 },
  { name: 'Yakitori under the arches', city: 'Tokyo', country: 'Japan', category: 'food', status: 'want', date: '', who: ['us'], notes: 'Yurakucho at night — smoke, chatter, cold beer.', favorite: false, lat: 35.6748, lon: 139.7617, zoom: 15 },
];

/* ---------- state ---------- */
const STORAGE_KEY = 'wander.places.v1';

function normalize(p) {
  const num = (v) => (v === '' || v == null || Number.isNaN(+v) ? '' : +v);
  return {
    id: p.id || uid(),
    name: p.name || 'A place',
    city: p.city || 'Somewhere ✨',
    country: p.country || '',
    category: CATEGORIES.some((c) => c.id === p.category) ? p.category : 'other',
    status: p.status === 'visited' ? 'visited' : 'want',
    date: p.date || '',
    favorite: !!p.favorite,
    notes: p.notes || '',
    lat: num(p.lat),
    lon: num(p.lon),
    zoom: num(p.zoom),
    who: (Array.isArray(p.who) ? p.who : [])
      .filter((w) => TRAVELLERS.some((t) => t.id === w)),
    suggestedBy: String(p.suggestedBy || '').trim().slice(0, 120),
    photos: (Array.isArray(p.photos) ? p.photos : []).filter((u) => typeof u === 'string' && u).slice(0, 40),
    createdAt: p.createdAt || Date.now(),
  };
}

function persist(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('Could not save places:', err);
  }
}

function loadPlaces() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(normalize);
    }
  } catch {
    /* fall through to first-run seeds */
  }
  const seeded = SEED.map((p) => ({ ...normalize(p), id: uid(), createdAt: Date.now() }));
  persist(seeded);
  return seeded;
}

let places = loadPlaces();
let view = {
  search: '',
  tab: 'all',
  mode: (() => {
    try { return localStorage.getItem('wander.view') === 'timeline' ? 'timeline' : 'grid'; } catch { return 'grid'; }
  })(),
};
let editingId = null;

/* ---------- cloud sync (Supabase) ----------
   Uses ONLY the publishable key — safe in a public frontend because Row Level
   Security on public.places decides what the anon role may do. The secret key
   and the database password are never used here (and never committed). */
const SUPABASE_URL = 'https://eozbynvaoidivxudplxr.supabase.co';
const SUPABASE_PUB_KEY = 'sb_publishable_7_5RUdFNFFxlJFqZzAVh6w_8NNXio0j';

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_PUB_KEY,
      Authorization: `Bearer ${SUPABASE_PUB_KEY}`,
      ...(opts.body && !(opts.body instanceof File) ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`supabase ${res.status}`);
  return res;
}

async function cloudFetch(path, opts = {}) {
  return sbFetch(`rest/v1/${path}`, opts);
}

/* ---------- photo storage (public bucket "photos" on Supabase) ---------- */
const PHOTO_URL_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/photos/`;

async function uploadPhoto(placeId, file) {
  const ext =
    ((file.name.includes('.') ? file.name.split('.').pop() : '') || 'jpg')
      .toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
  const path = `${placeId}/${uid()}.${ext}`;
  await sbFetch(`storage/v1/object/photos/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'image/jpeg', 'x-upsert': 'true' },
    body: file,
  });
  return `${PHOTO_URL_PREFIX}${path}`;
}

async function deletePhotoObject(url) {
  if (!url.startsWith(PHOTO_URL_PREFIX)) return;
  const path = url.slice(PHOTO_URL_PREFIX.length);
  await sbFetch(`storage/v1/object/photos/${path}`, { method: 'DELETE' });
}

const cloudRow = (p) => ({
  id: p.id,
  name: p.name,
  city: p.city,
  country: p.country,
  category: p.category,
  status: p.status,
  date: p.date,
  favorite: p.favorite,
  notes: p.notes,
  lat: p.lat === '' ? null : p.lat,
  lon: p.lon === '' ? null : p.lon,
  zoom: p.zoom === '' ? null : p.zoom,
  who: p.who && p.who.length ? p.who : ['us'],
  suggestedBy: p.suggestedBy || '',
  photos: p.photos || [],
  createdAt: p.createdAt || Date.now(),
});

let cloudOk = null; // null = connecting, true = synced, false = offline (localStorage keeps everything)

function cloudStatus() {
  const el = $('#cloud');
  if (!el) return;
  el.hidden = false;
  if (cloudOk === null) {
    el.textContent = '☁️ syncing…';
    el.title = 'connecting to the cloud…';
  } else if (cloudOk) {
    el.textContent = '☁️ synced';
    el.title = 'saved to Supabase — same list on every device';
  } else {
    el.textContent = '☁️ offline';
    el.title = 'cloud unreachable — changes stay in this browser and merge later';
  }
}

/* debounced write queue — survives bursts of ⭐ toggles */
const pending = new Map(); // id → 'up' | 'del'
let flushTimer = null;
let flushing = false;

function queueUpsert(list) {
  for (const p of list) pending.set(p.id, 'up');
  scheduleFlush();
}
function queueDelete(id) {
  pending.set(id, 'del');
  scheduleFlush();
}
function scheduleFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushQueue, 600);
}
async function flushQueue() {
  if (flushing || !pending.size) return;
  flushing = true;
  const batch = [...pending];
  pending.clear();
  try {
    const dels = batch.filter(([, op]) => op === 'del').map(([id]) => id);
    const ups = batch
      .filter(([, op]) => op === 'up')
      .map(([id]) => places.find((p) => p.id === id))
      .filter(Boolean)
      .map(cloudRow);
    if (dels.length) {
      await Promise.all(
        dels.map((id) => cloudFetch(`places?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }))
      );
    }
    if (ups.length) {
      await cloudFetch('places', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(ups),
      });
    }
    cloudOk = true;
  } catch {
    cloudOk = false; // changes stay in localStorage; they merge back on a successful load
  }
  flushing = false;
  cloudStatus();
}

/* load: cloud wins; local-only rows get uploaded so nothing is lost */
async function syncFromCloud() {
  try {
    const res = await cloudFetch('places?select=*&order=createdAt.asc');
    const rows = await res.json();
    const cloud = rows.map(normalize);
    const localOnly = places.filter((p) => !cloud.some((c) => c.id === p.id));
    places = [...cloud, ...localOnly];
    persist(places);
    render();
    cloudOk = true;
    if (localOnly.length) queueUpsert(localOnly);
  } catch {
    cloudOk = false;
  }
  cloudStatus();
}

/* ---------- element refs ---------- */
const els = {
  form: $('#place-form'),
  list: $('#groups'),
  search: $('#search'),
  stats: $('#stats'),
  modal: $('#modal'),
  modalTitle: $('#modal-title'),
  addBtn: $('#add-btn'),
  cancelBtn: $('#cancel-btn'),
  tabs: $$('[data-tab]'),
};

$('#f-category').innerHTML = CATEGORIES.map(
  (c) => `<option value="${c.id}">${c.emoji} ${esc(c.label)}</option>`
).join('');

$('#who-chips').innerHTML = TRAVELLERS.map(
  (t) => `<label class="who-chip" title="${esc(t.name)}">
    <input type="checkbox" class="who-check" value="${t.id}">
    <span>${t.emoji} ${esc(t.short)}</span>
  </label>`
).join('');

/* ---------- grouping ---------- */
const cityKey = (p) => (p.city || '').trim().toLowerCase() || 'somewhere';

function groupByCity(list) {
  const map = new Map();
  for (const p of list) {
    const key = cityKey(p);
    if (!map.has(key)) {
      map.set(key, { label: (p.city || '').trim() || 'Somewhere ✨', country: p.country || '', items: [] });
    }
    const g = map.get(key);
    if (!g.country && p.country) g.country = p.country;
    g.items.push(p);
  }
  return map;
}

/* ---------- rendering ---------- */
function emptyHTML(big, title, sub, actionsHTML) {
  return `
  <div class="empty">
    <p class="big" aria-hidden="true">${big}</p>
    <h2>${title}</h2>
    <p>${sub}</p>
    ${actionsHTML}
  </div>`;
}

function cardHTML(p, i) {
  const cat = catOf(p.category);
  const visited = p.status === 'visited';
  const animCls = i == null ? '' : ' enter';
  const animStyle = i == null ? '' : ` style="--d:${Math.min(i * 45, 360)}ms"`;
  const cover = p.photos.length
    ? `<button type="button" class="cover" data-action="photo" data-idx="0" aria-label="photos of ${esc(p.name)}" style="background-image:url('${esc(p.photos[0])}')">${p.photos.length > 1 ? `<span class="photo-count">📷 ${p.photos.length}</span>` : ''}</button>`
    : mapHTML(p);
  return `
  <article class="place ${visited ? 'is-visited' : 'is-want'}${animCls}" data-id="${p.id}"${animStyle}>
    ${cover}
    <div class="place-head">
      <span class="cat" aria-hidden="true">${cat.emoji}</span>
      <div class="place-title">
        <h3>${esc(p.name)}</h3>
        <p class="meta">${esc(whoText(p))} · ${esc(cat.label)}${p.date ? ` · <time>${esc(formatDate(p.date))}</time>` : ''}</p>
      </div>
      <button type="button" class="star ${p.favorite ? 'on' : ''}" data-action="fav"
        aria-label="${p.favorite ? 'remove favourite' : 'mark as favourite'}" title="favourite">${p.favorite ? '⭐' : '☆'}</button>
    </div>
    ${p.notes ? `<p class="notes">${esc(p.notes)}</p>` : ''}
    <footer class="place-foot">
      <span class="status-badge ${visited ? 'ok' : 'dream'}">${visited ? '✨ been!' : '💭 someday'}</span>
      ${p.suggestedBy ? `<span class="status-badge sug" title="who suggested this place">💬 ${esc(p.suggestedBy)}</span>` : ''}
      <span class="spacer"></span>
      <button type="button" class="ghost toggle" data-action="toggle"
        title="${visited ? 'Move to someday list' : 'Mark as visited'}">${visited ? '→ 💭 someday' : '→ ✨ been!'}</button>
      <button type="button" class="ghost icon" data-action="edit" aria-label="edit" title="edit">✏️</button>
      <button type="button" class="ghost icon" data-action="delete" aria-label="delete" title="delete">🗑️</button>
    </footer>
  </article>`;
}

function sectionHTML(allGroup, items, animate) {
  const done = allGroup.items.filter((p) => p.status === 'visited').length;
  const dream = allGroup.items.length - done;
  const cards = [...items]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p, i) => cardHTML(p, animate ? i : null))
    .join('');
  return `
  <section class="group">
    <header class="group-head">
      <div class="group-title">
        <span class="pin" aria-hidden="true">📍</span>
        <div>
          <h2>${esc(allGroup.label)}</h2>
          ${allGroup.country ? `<span class="country">${esc(allGroup.country)}</span>` : ''}
        </div>
      </div>
      <div class="group-badges">
        <span class="chip ok">${done} been ✨</span>
        <span class="chip dream">${dream} someday 💭</span>
      </div>
    </header>
    <div class="grid">${cards}</div>
  </section>`;
}

/* ---------- timeline view (chronological journal of the two of you) ---------- */
function tlItemHTML(p, i) {
  const cat = catOf(p.category);
  const visited = p.status === 'visited';
  const animCls = i == null ? '' : ' enter';
  const animStyle = i == null ? '' : ` style="--d:${Math.min(i * 40, 320)}ms"`;
  const cover = p.photos.length
    ? `<button type="button" class="tl-cover" data-action="photo" data-idx="0" aria-label="photos of ${esc(p.name)}" style="background-image:url('${esc(p.photos[0])}')"></button>`
    : `<span class="tl-cover emoji-cat" aria-hidden="true">${cat.emoji}</span>`;
  const thumbs = p.photos.length > 1
    ? `<div class="tl-photos">${p.photos.map((u, k) => `
        <button type="button" class="tl-thumb" data-action="photo" data-idx="${k}" aria-label="photo ${k + 1} of ${esc(p.name)}" style="background-image:url('${esc(u)}')"></button>`).join('')}</div>`
    : '';
  return `
  <div class="tl-item${visited ? '' : ' dream'}${animCls}" data-id="${p.id}"${animStyle}>
    <div class="tl-card">
      ${cover}
      <div class="tl-body">
        <div class="tl-top">
          <h3>${esc(p.name)}</h3>
          ${p.date ? `<span class="tl-date"><time>${esc(formatDate(p.date))}</time></span>` : ''}
        </div>
        <p class="meta">${esc(whoText(p))} · 📍 ${esc(p.city)}${p.country ? `, ${esc(p.country)}` : ''} · ${esc(cat.label)}</p>
        ${p.notes ? `<p class="notes">${esc(p.notes)}</p>` : ''}
        ${p.suggestedBy ? `<p class="meta sug">💬 suggested by ${esc(p.suggestedBy)}</p>` : ''}
        ${thumbs}
      </div>
    </div>
  </div>`;
}

function timelineHTML(visible, animate) {
  const dated = visible.filter((p) => p.date).sort((a, b) => b.date.localeCompare(a.date));
  const undated = visible.filter((p) => !p.date && p.status === 'visited');
  const someday = visible.filter((p) => p.status === 'want' && !p.date);
  if (!dated.length && !undated.length && !someday.length) return '';

  const chunks = [];
  let year = null;
  let i = 0;
  const seq = (p) => tlItemHTML(p, animate ? i++ : null);

  for (const p of dated) {
    const y = p.date.slice(0, 4);
    if (y !== year) {
      year = y;
      chunks.push(`<h3 class="tl-year"><span>${y} ✈️</span></h3>`);
    }
    chunks.push(seq(p));
  }
  if (undated.length) {
    chunks.push(`<h3 class="tl-year dream"><span>✨ been · no date yet</span></h3>`);
    undated.forEach((p) => chunks.push(seq(p)));
  }
  if (someday.length) {
    chunks.push(`<h3 class="tl-year dream"><span>💭 someday</span></h3>`);
    someday.forEach((p) => chunks.push(seq(p)));
  }
  return `<div class="timeline">${chunks.join('')}</div>`;
}

function render(opts = {}) {
  const animate = !!opts.animate;
  const visitedCount = places.filter((p) => p.status === 'visited').length;
  const cityCount = new Set(places.map(cityKey)).size;
  els.stats.innerHTML = places.length
    ? `<b>${places.length}</b> place${places.length === 1 ? '' : 's'} in <b>${cityCount}</b> cit${cityCount === 1 ? 'y' : 'ies'} · <b>${visitedCount}</b> been ✨ · <b>${places.length - visitedCount}</b> someday 💭`
    : 'a fresh empty map 🗺️';

  const counts = { all: places.length, visited: visitedCount, want: places.length - visitedCount };
  const labels = { all: '🌏 all', visited: '✨ been', want: '💭 someday' };
  els.tabs.forEach((btn) => {
    const tab = btn.dataset.tab;
    btn.classList.toggle('active', view.tab === tab);
    btn.innerHTML = `${labels[tab]} <span class="count">${counts[tab]}</span>`;
  });

  const q = view.search.trim().toLowerCase();
  const visible = places.filter((p) => {
    if (view.tab === 'visited' && p.status !== 'visited') return false;
    if (view.tab === 'want' && p.status !== 'want') return false;
    if (!q) return true;
    return [p.name, p.city, p.country, p.notes, catOf(p.category).label, whoText(p), p.suggestedBy]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  if (places.length === 0) {
    els.list.innerHTML = emptyHTML(
      '🪶',
      'no places yet!',
      'add your first spot — been or dreamed, both count.',
      '<button type="button" class="btn primary" data-action="add">＋ add a place</button>'
    );
    return;
  }
  if (visible.length === 0) {
    els.list.innerHTML = emptyHTML(
      '🔍',
      'nothing matches',
      'try a different word, or peek at another tab.',
      '<button type="button" class="btn ghost" data-action="clear-search">clear search</button>'
    );
    return;
  }

  if (view.mode === 'timeline') {
    const html = timelineHTML(visible, animate);
    els.list.innerHTML = html || emptyHTML(
      '🪶',
      'no places yet!',
      'add your first spot — the timeline writes itself ✨',
      '<button type="button" class="btn primary" data-action="add">＋ add a place</button>'
    );
    return;
  }

  const groupsAll = groupByCity(places);
  const groupsVis = groupByCity(visible);
  els.list.innerHTML = [...groupsVis.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((key) => sectionHTML(groupsAll.get(key), groupsVis.get(key).items, animate))
    .join('');
}

/* ---------- card actions (event delegation) ---------- */
els.list.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === 'add') return openModal();
  if (action === 'clear-search') {
    view.search = '';
    els.search.value = '';
    render();
    return;
  }

  const place = places.find((p) => p.id === btn.closest('[data-id]')?.dataset.id);
  if (!place) return;

  if (action === 'photo') {
    return openLightbox(place.id, +btn.dataset.idx || 0);
  }

  if (action === 'fav') {
    place.favorite = !place.favorite;
  } else if (action === 'toggle') {
    place.status = place.status === 'visited' ? 'want' : 'visited';
    if (place.status === 'visited' && !place.date) place.date = today(); // remember the day 🎉
    if (place.status === 'want') place.date = '';
  } else if (action === 'edit') {
    return openModal(place);
  } else if (action === 'delete') {
    if (!confirm(`say goodbye to “${place.name}”? 🥺`)) return;
    (place.photos || []).forEach((u) => deletePhotoObject(u).catch(() => {}));
    places = places.filter((p) => p.id !== place.id);
  }

  persist(places);
  if (action === 'delete') queueDelete(place.id);
  else queueUpsert([place]);
  render();
});

/* ---------- lightbox ---------- */
let lb = { placeId: null, idx: 0 };

function openLightbox(placeId, idx = 0) {
  const p = places.find((x) => x.id === placeId);
  if (!p || !p.photos.length) return;
  lb = { placeId, idx: Math.max(0, Math.min(idx, p.photos.length - 1)) };
  $('#lightbox').hidden = false;
  paintLightbox();
}

function paintLightbox() {
  const p = places.find((x) => x.id === lb.placeId);
  if (!p || !p.photos.length) return closeLightbox();
  const n = p.photos.length;
  lb.idx = ((lb.idx % n) + n) % n;
  $('#lb-img').src = p.photos[lb.idx];
  $('#lb-img').alt = p.name;
  $('#lb-cap').textContent = `${p.name} · ${lb.idx + 1}/${n}`;
}

function closeLightbox() {
  $('#lightbox').hidden = true;
}

$('#lb-close').addEventListener('click', closeLightbox);
$('#lb-prev').addEventListener('click', () => { lb.idx -= 1; paintLightbox(); });
$('#lb-next').addEventListener('click', () => { lb.idx += 1; paintLightbox(); });
$('#lightbox').addEventListener('click', (e) => {
  if (e.target.id === 'lightbox') closeLightbox();
});

/* ---------- photos in the form ---------- */
let stagedPhotos = [];      // new files waiting for upload
let keptPhotos = [];        // already-saved photo urls kept as-is
let removedPhotoUrls = [];  // removed urls → delete from storage on save

function paintPhotoRow() {
  const row = $('#f-photo-row');
  row.innerHTML =
    keptPhotos.map((u, i) => `
      <span class="photo-thumb" style="background-image:url('${esc(u)}')" title="saved photo">
        <button type="button" class="rm" data-rm-kept="${i}" aria-label="remove this photo">✕</button>
      </span>`).join('') +
    stagedPhotos.map((s, i) => `
      <span class="photo-thumb" style="background-image:url('${esc(s.url)}')" title="new photo (not uploaded yet)">
        <button type="button" class="rm" data-rm-new="${i}" aria-label="remove this photo">✕</button>
      </span>`).join('');
}

$('#f-photo-row').addEventListener('click', (e) => {
  const rm = e.target.closest('[data-rm-kept],[data-rm-new]');
  if (!rm) return;
  if (rm.dataset.rmKept != null) {
    removedPhotoUrls.push(keptPhotos.splice(+rm.dataset.rmKept, 1)[0]);
  } else {
    const s = stagedPhotos.splice(+rm.dataset.rmNew, 1)[0];
    if (s) URL.revokeObjectURL(s.url);
  }
  paintPhotoRow();
});

$('#f-photo-input').addEventListener('change', (e) => {
  for (const f of e.target.files) {
    if (f.size > 10 * 1024 * 1024) {
      alert(`“${f.name}” is over 10MB 🙈 — skipped`);
      continue;
    }
    stagedPhotos.push({ file: f, url: URL.createObjectURL(f) });
  }
  e.target.value = '';
  paintPhotoRow();
});

/* ---------- modal ---------- */
function openModal(place) {
  editingId = place ? place.id : null;
  els.form.reset();
  els.modalTitle.textContent = place ? 'edit this place ✏️' : 'add a place ✈️';
  $('#f-name').value = place?.name ?? '';
  $('#f-city').value = place?.city ?? '';
  $('#f-country').value = place?.country ?? '';
  $('#f-category').value = place?.category ?? 'landmark';
  $('#f-date').value = place?.date ?? '';
  const statusRadio = document.querySelector(`input[name="f-status"][value="${place?.status ?? 'want'}"]`);
  if (statusRadio) statusRadio.checked = true;
  $('#f-fav').checked = !!place?.favorite;
  $('#f-notes').value = place?.notes ?? '';
  $('#f-lat').value = place?.lat ?? '';
  $('#f-lon').value = place?.lon ?? '';
  $('#f-zoom').value = place?.zoom ?? '';
  const who = place?.who?.length ? place.who : ['us'];
  $$('.who-check').forEach((cb) => { cb.checked = who.includes(cb.value); });
  $('#f-suggested').value = place?.suggestedBy ?? '';
  keptPhotos = [...(place?.photos || [])];
  stagedPhotos = [];
  removedPhotoUrls = [];
  paintPhotoRow();
  coordHint();
  els.modal.classList.add('open');
  $('#f-name').focus();
}

function closeModal() {
  els.modal.classList.remove('open');
  editingId = null;
  stagedPhotos.forEach((s) => URL.revokeObjectURL(s.url));
  stagedPhotos = [];
}

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!els.form.reportValidity()) return;

  // upload new photos to the public bucket first (they need a place id)
  const placeId = editingId || uid();
  const uploadedPhotos = [];
  for (const s of stagedPhotos) {
    try {
      uploadedPhotos.push(await uploadPhoto(placeId, s.file));
    } catch {
      alert(`couldn't upload “${s.file.name}” 🙈 — it was skipped`);
    }
  }

  const data = {
    name: $('#f-name').value.trim(),
    city: $('#f-city').value.trim(),
    country: $('#f-country').value.trim(),
    category: $('#f-category').value,
    status: document.querySelector('input[name="f-status"]:checked')?.value === 'visited' ? 'visited' : 'want',
    date: $('#f-date').value,
    favorite: $('#f-fav').checked,
    notes: $('#f-notes').value.trim(),
    lat: $('#f-lat').value || '',
    lon: $('#f-lon').value || '',
    zoom: $('#f-zoom').value || '',
    who: $$('.who-check').filter((cb) => cb.checked).map((cb) => cb.value),
    suggestedBy: $('#f-suggested').value.trim(),
    photos: [...keptPhotos, ...uploadedPhotos],
  };
  if (!data.name || !data.city) return;

  if (editingId) {
    const p = places.find((x) => x.id === editingId);
    if (p) {
      Object.assign(p, normalize({ ...p, ...data }));
      queueUpsert([p]);
    }
  } else {
    const created = normalize({ ...data, id: placeId, createdAt: Date.now() });
    places.push(created);
    queueUpsert([created]);
  }

  // tidy up photos the user removed from an existing place
  removedPhotoUrls.forEach((u) => deletePhotoObject(u).catch(() => {}));
  removedPhotoUrls = [];

  persist(places);
  closeModal();
  render({ animate: true });
});

els.addBtn.addEventListener('click', () => openModal());
els.cancelBtn.addEventListener('click', closeModal);
els.modal.addEventListener('click', (e) => {
  if (e.target === els.modal) closeModal();
});
document.addEventListener('keydown', (e) => {
  const lbOpen = !$('#lightbox').hidden;
  if (e.key === 'Escape') { closeModal(); closeLightbox(); }
  if (lbOpen && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();
    lb.idx += e.key === 'ArrowRight' ? 1 : -1;
    paintLightbox();
  }
  if (e.key === '/' && !lbOpen && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const t = document.activeElement;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (!typing) {
      e.preventDefault();
      els.search.focus();
    }
  }
});

/* ---------- search + tabs ---------- */
els.search.addEventListener('input', () => {
  view.search = els.search.value;
  render();
});

els.tabs.forEach((btn) =>
  btn.addEventListener('click', () => {
    view.tab = btn.dataset.tab;
    render({ animate: true });
  })
);

$$('[data-view]').forEach((btn) =>
  btn.addEventListener('click', () => {
    view.mode = btn.dataset.view === 'timeline' ? 'timeline' : 'grid';
    try { localStorage.setItem('wander.view', view.mode); } catch {}
    $$('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === view.mode));
    render({ animate: true });
  })
);

/* ---------- backup / restore / reset ---------- */
$('#export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(places, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'wander-places.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#import-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data)) throw new Error('not a list');
    if (confirm(`Replace your ${places.length} places with the ${data.length} in this file?`)) {
      places = data.map(normalize);
      persist(places);
      queueUpsert(places);
      render();
    }
  } catch {
    alert("Couldn't read that file 🙈 — expected a wander-places.json backup.");
  }
});

$('#reset-btn').addEventListener('click', () => {
  if (places.length && !confirm('Clear ALL places and start fresh? This cannot be undone.')) return;
  places.forEach((p) => (p.photos || []).forEach((u) => deletePhotoObject(u).catch(() => {})));
  const gone = places.map((p) => p.id);
  places = [];
  persist(places);
  gone.forEach(queueDelete);
  render({ animate: true });
});

/* ---------- autocomplete (Photon / OpenStreetMap — open source, free, no key) ---------- */
function coordHint() {
  $('#f-coord-hint').hidden = !($('#f-lat').value && $('#f-lon').value);
}

attachAutocomplete($('#f-name'), $('#ac-name'), {
  main: (r) => r.name || r.street || 'unnamed place',
  sub: (r) => [r.city || r.district || r.county || r.state, r.country].filter(Boolean).join(', '),
}, (r) => {
  if (r.name) $('#f-name').value = r.name;
  const city = r.city || r.district || r.county || r.state;
  if (city) $('#f-city').value = city;
  if (r.country) $('#f-country').value = r.country;
  if (r.lat && r.lon) {
    $('#f-lat').value = r.lat;
    $('#f-lon').value = r.lon;
    $('#f-zoom').value = guessZoom(r);
  }
  const cat = categoryFromOSM(r);
  if (cat) $('#f-category').value = cat;
  coordHint();
});

attachAutocomplete($('#f-city'), $('#ac-city'), {
  layers: ['city', 'locality', 'district'],
  main: (r) => r.name,
  sub: (r) => [r.state, r.country].filter(Boolean).join(', '),
}, (r) => {
  if (r.name) $('#f-city').value = r.name;
  if (r.country) $('#f-country').value = r.country;
  if (r.lat && r.lon && !$('#f-lat').value) { // don’t clobber more precise POI coords
    $('#f-lat').value = r.lat;
    $('#f-lon').value = r.lon;
    $('#f-zoom').value = guessZoom(r);
  }
  coordHint();
});

/* ---------- parallax sky (pointer-driven, soft & smooth) ---------- */
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const layers = $$('.sky [data-depth]');
  let tx = 0, ty = 0, cx = 0, cy = 0;
  addEventListener('pointermove', (e) => {
    tx = e.clientX / innerWidth - 0.5;
    ty = e.clientY / innerHeight - 0.5;
  }, { passive: true });
  const tick = () => {
    cx += (tx - cx) * 0.05;
    cy += (ty - cy) * 0.05;
    for (const el of layers) {
      const d = +el.dataset.depth || 10;
      el.style.transform = `translate3d(${(-cx * d).toFixed(1)}px, ${(-cy * d * 0.6).toFixed(1)}px, 0)`;
    }
    requestAnimationFrame(tick);
  };
  if (layers.length) requestAnimationFrame(tick);
}

/* ---------- go ---------- */
$$('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === view.mode));
render({ animate: true });
cloudStatus();
syncFromCloud();