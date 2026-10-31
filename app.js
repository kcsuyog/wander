'use strict';

/* 🪶 Wander — cute little travel tracker
   Stack: Preact + htm (vendored ES modules — no build step, no CDN)
          · Supabase (PostgREST + Storage) · Photon geocoding · OSM tiles
          · GitHub Pages hosting. */

import { h, render } from './vendor/preact.module.js';
import { useState, useEffect, useRef, useMemo } from './vendor/hooks.module.js';
import htm from './vendor/htm.module.js';

const html = htm.bind(h);

/* ---------- tiny helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
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

/* ---------- place search (Photon — open-source geocoder over OSM) ---------- */
const PHOTON_URL = 'https://photon.komoot.io/api/';

async function photonSuggest(query, layers, signal) {
  const params = new URLSearchParams({ q: query, limit: '6', lang: 'en' });
  if (layers) for (const layer of layers) params.append('layer', layer);
  const res = await fetch(`${PHOTON_URL}?${params}`, { signal });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const data = await res.json();
  return (data.features || []).map((f) => ({
    ...f.properties,
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
  }));
}

/* guess a Wander category from OSM tags */
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

/* ---------- mini static maps (one OSM tile, pin in the middle) ---------- */
function lonToTileX(lon, z) { return ((lon + 180) / 360) * Math.pow(2, z); }
function latToTileY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z);
}
function hasCoords(p) {
  return p.lat !== '' && p.lat != null && p.lon !== '' && p.lon != null;
}

function MapPreview({ p }) {
  if (!hasCoords(p)) return null;
  const z = p.zoom || 15;
  const x = lonToTileX(p.lon, z);
  const y = latToTileY(p.lat, z);
  const fx = x - Math.floor(x);
  const fy = y - Math.floor(y);
  const tile = `https://tile.openstreetmap.org/${z}/${Math.floor(x)}/${Math.floor(y)}.png`;
  const osm = `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#${z}/${p.lat}/${p.lon}`;
  return html`
    <a class="map" href=${osm} target="_blank" rel="noopener" title="open in OpenStreetMap">
      <img src=${tile} alt=${`little map of ${p.name}`} loading="lazy" width="256" height="256"
        style=${{ left: `calc(50% - ${(fx * 256).toFixed(1)}px)`, top: `calc(54px - ${(fy * 256).toFixed(1)}px)` }} />
      <span class="pin" aria-hidden="true">📍</span>
      <span class="map-open" aria-hidden="true">🗺 open ↗</span>
    </a>`;
}

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

/* ---------- one-time cleanup: the old first-run sample places ----------
   They used to be seeded into new browsers (and synced to the cloud) —
   removed 2026-10-31. Matches must be exact on name+city+country+notes so
   real places, even ones inspired by a sample, are never touched. */
const LEGACY_SAMPLES = [
  ['Sydney Opera House', 'Sydney', 'Australia', 'Sat on the steps with a gelato while the sails turned gold. 🍦'],
  ['Bondi → Coogee walk', 'Sydney', 'Australia', 'Six kilometres of cliffs and little coves — swim stops mandatory.'],
  ['Royal Botanic Garden', 'Sydney', 'Australia', 'Ibis everywhere. Harbour view from Mrs Macquarie’s Chair.'],
  ['The Grounds of Alexandria', 'Sydney', 'Australia', 'Coffee in a garden full of flowers and fairy lights.'],
  ['Blue Mountains', 'Sydney', 'Australia', 'Ride the Scenic World skyway over the Jamison Valley.'],
  ['Manly ferry at sunset', 'Sydney', 'Australia', 'Cheapest harbour cruise there is — sit up top at golden hour.'],
  ['Laneway coffee crawl', 'Melbourne', 'Australia', 'Found a tiny roaster off Degraves St. Flat white, perfect.'],
  ['teamLab Planets', 'Tokyo', 'Japan', 'Barefoot, wading through glowing water. Book ahead!'],
  ['Yakitori under the arches', 'Tokyo', 'Japan', 'Yurakucho at night — smoke, chatter, cold beer.'],
];
const isLegacySample = (p) => LEGACY_SAMPLES.some(([name, city, country, notes]) =>
  p.name === name && p.city === city && p.country === country && p.notes === notes);

function loadPlaces() {
  let list = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed.map(normalize);
    }
  } catch {
    /* fall through to an empty list */
  }
  list = list.filter((p) => !isLegacySample(p));
  persist(list);
  return list;
}

function loadView() {
  let mode = null;
  try { mode = new URLSearchParams(location.search).get('view'); } catch {}
  if (mode !== 'grid' && mode !== 'timeline') {
    mode = 'grid';
    try { if (localStorage.getItem('wander.view') === 'timeline') mode = 'timeline'; } catch {}
  }
  return { search: '', tab: 'all', mode };
}

/* ---------- backend (Vercel functions → Supabase) ----------
   All Supabase access goes through our /api/* functions — no keys in the
   browser. Reads are public; every write needs a signed-in session 🔐
   (GitHub OAuth, allowlisted logins only). */
const API = {
  async get(path) {
    const res = await fetch(`/api/${path}`);
    if (!res.ok) throw new Error(`api ${res.status}`);
    return res.json();
  },
  async send(path, method, data) {
    const res = await fetch(`/api/${path}`, {
      method,
      headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`api ${res.status}`);
    if (res.status === 204) return null;
    return res.json().catch(() => null);
  },
};

/* ---------- photo storage (goes through /api/photos 🔐) ---------- */
async function uploadPhoto(placeId, file) {
  const res = await fetch('/api/photos', {
    method: 'POST',
    headers: {
      'x-place-id': placeId,
      'x-file-name': encodeURIComponent(file.name || ''),
      'Content-Type': file.type || 'image/jpeg',
    },
    body: file,
  });
  if (!res.ok) throw new Error(`photo upload ${res.status}`);
  return (await res.json()).url;
}

async function deletePhotoObject(url) {
  await API.send('photos', 'DELETE', { url });
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

/* debounced write queue — survives bursts of ⭐ toggles */
let cloudOk = null;
const cloudSubs = new Set();
function setCloudOk(v) {
  cloudOk = v;
  cloudSubs.forEach((f) => f(v));
}

const pending = new Map(); // id → { op: 'up' | 'del', place }
let flushTimer = null;
let flushing = false;

function queueUpsert(list) {
  for (const p of list) pending.set(p.id, { op: 'up', place: p });
  scheduleFlush();
}
function queueDelete(id) {
  pending.set(id, { op: 'del' });
  scheduleFlush();
}
function scheduleFlush() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushQueue, 600);
}
async function flushQueue() {
  if (flushing || !pending.size) return;
  flushing = true;
  const batch = [...pending.entries()];
  pending.clear();
  try {
    const dels = batch.filter(([, e]) => e.op === 'del').map(([id]) => id);
    const ups = batch.filter(([, e]) => e.op === 'up').map(([, e]) => cloudRow(e.place));
    if (dels.length) {
      await API.send(`places?id=${encodeURIComponent(dels.join(','))}`, 'DELETE');
    }
    if (ups.length) {
      await API.send('places', 'POST', ups);
    }
    setCloudOk(true);
  } catch {
    setCloudOk(false); // changes stay in localStorage; they merge on a successful load
  }
  flushing = false;
}

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

/* ================= components ================= */

function Empty({ big, title, sub, children }) {
  return html`
    <div class="empty">
      <p class="big" aria-hidden="true">${big}</p>
      <h2>${title}</h2>
      <p>${sub}</p>
      ${children}
    </div>`;
}

function PlaceCard({ p, i, act }) {
  const cat = catOf(p.category);
  const visited = p.status === 'visited';
  return html`
    <article class=${'place ' + (visited ? 'is-visited' : 'is-want') + ' enter'} style=${{ '--d': `${Math.min(i * 45, 360)}ms` }}>
      ${p.photos.length
        ? html`
          <button type="button" class="cover" aria-label=${`photos of ${p.name}`}
            style=${{ backgroundImage: `url("${p.photos[0]}")` }} onClick=${() => act.photo(p.id, 0)}>
            ${p.photos.length > 1 ? html`<span class="photo-count">📷 ${p.photos.length}</span>` : null}
          </button>`
        : html`<${MapPreview} p=${p} />`}
      <div class="place-head">
        <span class="cat" aria-hidden="true">${cat.emoji}</span>
        <div class="place-title">
          <h3>${p.name}</h3>
          <p class="meta">${whoText(p)} · ${cat.label}${p.date ? ` · ${formatDate(p.date)}` : ''}</p>
        </div>
        <button type="button" class=${'star' + (p.favorite ? ' on' : '')} title="favourite"
          aria-label=${p.favorite ? 'remove favourite' : 'mark as favourite'} onClick=${() => act.fav(p.id)}>
          ${p.favorite ? '⭐' : '☆'}
        </button>
      </div>
      ${p.notes ? html`<p class="notes">${p.notes}</p>` : null}
      <footer class="place-foot">
        <span class=${'status-badge ' + (visited ? 'ok' : 'dream')}>${visited ? '✨ been!' : '💭 someday'}</span>
        ${p.suggestedBy ? html`<span class="status-badge sug" title="who suggested this place">💬 ${p.suggestedBy}</span>` : null}
        <span class="spacer"></span>
        <button type="button" class="ghost toggle" title=${visited ? 'Move to someday list' : 'Mark as visited'}
          onClick=${() => act.toggle(p.id)}>${visited ? '→ 💭 someday' : '→ ✨ been!'}</button>
        <button type="button" class="ghost icon" aria-label="edit" title="edit" onClick=${() => act.edit(p.id)}>✏️</button>
        <button type="button" class="ghost icon" aria-label="delete" title="delete" onClick=${() => act.del(p.id)}>🗑️</button>
      </footer>
    </article>`;
}

function GroupSection({ all, items, act }) {
  const done = all.items.filter((p) => p.status === 'visited').length;
  const dream = all.items.length - done;
  const cards = [...items].sort((a, b) => a.name.localeCompare(b.name));
  return html`
    <section class="group">
      <header class="group-head">
        <div class="group-title">
          <span class="pin" aria-hidden="true">📍</span>
          <div>
            <h2>${all.label}</h2>
            ${all.country ? html`<span class="country">${all.country}</span>` : null}
          </div>
        </div>
        <div class="group-badges">
          <span class="chip ok">${done} been ✨</span>
          <span class="chip dream">${dream} someday 💭</span>
        </div>
      </header>
      <div class="grid">${cards.map((p, i) => html`<${PlaceCard} key=${p.id} p=${p} i=${i} act=${act} />`)}</div>
    </section>`;
}

function TimelineItem({ p, i, act }) {
  const cat = catOf(p.category);
  const visited = p.status === 'visited';
  return html`
    <div class=${'tl-item' + (visited ? '' : ' dream') + ' enter'} style=${{ '--d': `${Math.min((i ?? 0) * 40, 320)}ms` }}>
      <div class="tl-card">
        ${p.photos.length
          ? html`<button type="button" class="tl-cover" aria-label=${`photos of ${p.name}`}
              style=${{ backgroundImage: `url("${p.photos[0]}")` }} onClick=${() => act.photo(p.id, 0)} />`
          : html`<span class="tl-cover emoji-cat" aria-hidden="true">${cat.emoji}</span>`}
        <div class="tl-body">
          <div class="tl-top">
            <h3>${p.name}</h3>
            ${p.date ? html`<span class="tl-date">${formatDate(p.date)}</span>` : null}
          </div>
          <p class="meta">${whoText(p)} · 📍 ${p.city}${p.country ? `, ${p.country}` : ''} · ${cat.label}</p>
          ${p.notes ? html`<p class="notes">${p.notes}</p>` : null}
          ${p.suggestedBy ? html`<p class="meta sug">💬 suggested by ${p.suggestedBy}</p>` : null}
          ${p.photos.length > 1
            ? html`
              <div class="tl-photos">
                ${p.photos.map((u, k) => html`
                  <button key=${k} type="button" class="tl-thumb" aria-label=${`photo ${k + 1} of ${p.name}`}
                    style=${{ backgroundImage: `url("${u}")` }} onClick=${() => act.photo(p.id, k)} />`)}
              </div>`
            : null}
        </div>
      </div>
    </div>`;
}

function Timeline({ visible, act }) {
  const dated = visible.filter((p) => p.date).sort((a, b) => b.date.localeCompare(a.date));
  const undated = visible.filter((p) => !p.date && p.status === 'visited');
  const someday = visible.filter((p) => p.status === 'want' && !p.date);
  const out = [];
  let year = null;
  let i = 0;
  const push = (p) => out.push(html`<${TimelineItem} key=${p.id} p=${p} i=${i++} act=${act} />`);
  for (const p of dated) {
    const y = p.date.slice(0, 4);
    if (y !== year) {
      year = y;
      out.push(html`<h3 class="tl-year"><span>${y} ✈️</span></h3>`);
    }
    push(p);
  }
  if (undated.length) {
    out.push(html`<h3 class="tl-year dream"><span>✨ been · no date yet</span></h3>`);
    undated.forEach(push);
  }
  if (someday.length) {
    out.push(html`<h3 class="tl-year dream"><span>💭 someday</span></h3>`);
    someday.forEach(push);
  }
  if (!out.length) return null;
  return html`<div class="timeline">${out}</div>`;
}

function Lightbox({ photos, name, idx, onNav, onClose }) {
  const n = photos.length;
  const i = ((idx % n) + n) % n;
  return html`
    <div class="lightbox" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <button type="button" class="lb-btn lb-close" aria-label="close" onClick=${onClose}>✕</button>
      <button type="button" class="lb-btn lb-prev" aria-label="previous photo" onClick=${() => onNav(-1)}>‹</button>
      <button type="button" class="lb-btn lb-next" aria-label="next photo" onClick=${() => onNav(1)}>›</button>
      <img src=${photos[i]} alt=${name} />
      <p class="lb-cap">${name} · ${i + 1}/${n}</p>
    </div>`;
}

/* ---------- autocomplete (type-ahead over Photon) ---------- */
function Autocomplete({ value, onInput, layers, main, sub, apply, placeholder }) {
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const timer = useRef(null);
  const abortRef = useRef(null);

  const query = async () => {
    const q = valueRef.current.trim();
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    try {
      const list = await photonSuggest(q, layers, abortRef.current.signal);
      setResults(list);
      setActive(list.length ? 0 : -1);
      setOpen(true);
    } catch {
      /* aborted or offline — a newer query is on its way */
    }
  };

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const onKeyDown = (e) => {
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
    } else if (e.key === 'Enter') {
      if (active >= 0) {
        e.preventDefault();
        apply(results[active]);
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.stopPropagation(); // don't also close the modal
      setOpen(false);
    }
  };

  return html`
    <span class="ac-wrap" ref=${wrapRef}>
      <input type="text" placeholder=${placeholder} value=${value} autocomplete="off" spellcheck="false"
        onInput=${(e) => {
          onInput(e.target.value);
          clearTimeout(timer.current);
          timer.current = setTimeout(query, 250);
        }}
        onKeyDown=${onKeyDown} />
      ${open && results.length
        ? html`
          <span class="ac-drop">
            ${results.map((r, i) => html`
              <div key=${i} class=${'ac-item' + (i === active ? ' active' : '')}
                onMouseDown=${(e) => { e.preventDefault(); apply(r); setOpen(false); }}>
                <b>${main(r)}</b><span>${sub(r)}</span>
              </div>`)}
          </span>`
        : null}
    </span>`;
}

/* ---------- add/edit modal ---------- */
function PlaceModal({ initial, onSave, onClose }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [country, setCountry] = useState(initial?.country ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'landmark');
  const [status, setStatus] = useState(initial?.status ?? 'want');
  const [date, setDate] = useState(initial?.date ?? '');
  const [favorite, setFavorite] = useState(!!initial?.favorite);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [who, setWho] = useState(() => new Set(initial?.who?.length ? initial.who : ['us']));
  const [suggested, setSuggested] = useState(initial?.suggestedBy ?? '');
  const [lat, setLat] = useState(initial?.lat ?? '');
  const [lon, setLon] = useState(initial?.lon ?? '');
  const [zoom, setZoom] = useState(initial?.zoom ?? '');
  const [kept, setKept] = useState(() => [...(initial?.photos ?? [])]);
  const [staged, setStaged] = useState([]); // { file, url } — uploads on save
  const [busy, setBusy] = useState(false);

  const stagedRef = useRef(staged);
  stagedRef.current = staged;
  useEffect(() => () => { stagedRef.current.forEach((s) => URL.revokeObjectURL(s.url)); }, []);

  const toggleWho = (id, on) => setWho((prev) => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  const addFiles = (files) => {
    const next = [];
    for (const f of files) {
      if (f.size > 10 * 1024 * 1024) { alert(`“${f.name}” is over 10MB 🙈 — skipped`); continue; }
      next.push({ file: f, url: URL.createObjectURL(f) });
    }
    setStaged((arr) => [...arr, ...next]);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !city.trim()) return;
    setBusy(true);
    const placeId = initial?.id || uid();
    const uploaded = [];
    for (const s of staged) {
      try {
        uploaded.push(await uploadPhoto(placeId, s.file));
      } catch {
        alert(`couldn't upload “${s.file.name}” 🙈 — it was skipped`);
      }
    }
    const removed = (initial?.photos ?? []).filter((u) => !kept.includes(u));
    await onSave(placeId, {
      name: name.trim(),
      city: city.trim(),
      country: country.trim(),
      category,
      status,
      date,
      favorite,
      notes: notes.trim(),
      lat, lon, zoom,
      who: [...who],
      suggestedBy: suggested.trim(),
      photos: [...kept, ...uploaded],
    }, removed);
    staged.forEach((s) => URL.revokeObjectURL(s.url));
    setBusy(false);
  };

  return html`
    <div class="modal open" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="panel" role="dialog" aria-modal="true" aria-label=${initial ? 'edit place' : 'add place'}>
        <h2>${initial ? 'edit this place ✏️' : 'add a place ✈️'}</h2>
        <form onSubmit=${submit}>
          <label>place name
            <${Autocomplete} value=${name} onInput=${setName} placeholder="start typing… e.g. Sydney Opera House"
              main=${(r) => r.name || r.street || 'unnamed place'}
              sub=${(r) => [r.city || r.district || r.county || r.state, r.country].filter(Boolean).join(', ')}
              apply=${(r) => {
                if (r.name) setName(r.name);
                const c = r.city || r.district || r.county || r.state;
                if (c) setCity(c);
                if (r.country) setCountry(r.country);
                if (r.lat && r.lon) { setLat(r.lat); setLon(r.lon); setZoom(guessZoom(r)); }
                const cat = categoryFromOSM(r);
                if (cat) setCategory(cat);
              }} />
            ${(lat && lon) ? html`<span class="ac-hint">📍 found on OpenStreetMap — it’ll get a mini map ✨</span>` : null}
          </label>

          <div class="row">
            <label>city / area
              <${Autocomplete} value=${city} onInput=${setCity} placeholder="e.g. Sydney"
                layers=${['city', 'locality', 'district']}
                main=${(r) => r.name}
                sub=${(r) => [r.state, r.country].filter(Boolean).join(', ')}
                apply=${(r) => {
                  if (r.name) setCity(r.name);
                  if (r.country) setCountry(r.country);
                  if (r.lat && r.lon && !(lat && lon)) { setLat(r.lat); setLon(r.lon); setZoom(guessZoom(r)); }
                }} />
            </label>
            <label>country
              <input type="text" maxlength="60" placeholder="e.g. Australia" value=${country} onInput=${(e) => setCountry(e.target.value)} />
            </label>
          </div>

          <div class="row">
            <label>kind of place
              <select value=${category} onChange=${(e) => setCategory(e.target.value)}>
                ${CATEGORIES.map((c) => html`<option key=${c.id} value=${c.id}>${c.emoji} ${c.label}</option>`)}
              </select>
            </label>
            <label>when?
              <input type="date" value=${date} onInput=${(e) => setDate(e.target.value)} />
            </label>
          </div>

          <div class="status-pick" role="radiogroup" aria-label="been or a dream?">
            <label>
              <input type="radio" name="f-status" value="visited" checked=${status === 'visited'} onChange=${() => setStatus('visited')} />
              <span>✨ i’ve been!</span>
            </label>
            <label>
              <input type="radio" name="f-status" value="want" checked=${status === 'want'} onChange=${() => setStatus('want')} />
              <span>💭 i dream of it</span>
            </label>
          </div>

          <fieldset class="who-field">
            <legend>who’s been / who’s dreaming? 💞</legend>
            <div class="who-chips">
              ${TRAVELLERS.map((t) => html`
                <label key=${t.id} class="who-chip" title=${t.name}>
                  <input type="checkbox" checked=${who.has(t.id)}
                    onChange=${(e) => toggleWho(t.id, e.target.checked)} />
                  <span>${t.emoji} ${t.short}</span>
                </label>`)}
            </div>
          </fieldset>

          <label class="favline"><input type="checkbox" checked=${favorite} onChange=${(e) => setFavorite(e.target.checked)} /> ⭐ one of my favourites</label>

          <label>little notes
            <textarea rows="3" placeholder="memories, plans, who was there…" value=${notes} onInput=${(e) => setNotes(e.target.value)}></textarea>
          </label>

          <label>suggested by (optional)
            <input type="text" maxlength="120" placeholder="who told you about it? e.g. Riya 🙌" value=${suggested} onInput=${(e) => setSuggested(e.target.value)} />
          </label>

          <fieldset class="who-field photos-field">
            <legend>photos 📸 <small>jpg/png/webp/gif · up to 10MB each</small></legend>
            <div class="photo-row">
              ${kept.map((u, i) => html`
                <span key=${'k' + i} class="photo-thumb" style=${{ backgroundImage: `url("${u}")` }} title="saved photo">
                  <button type="button" class="rm" aria-label="remove this photo" onClick=${() => setKept((k) => k.filter((_, j) => j !== i))}>✕</button>
                </span>`)}
              ${staged.map((s, i) => html`
                <span key=${'s' + i} class="photo-thumb" style=${{ backgroundImage: `url("${s.url}")` }} title="new photo (uploads on save)">
                  <button type="button" class="rm" aria-label="remove this photo"
                    onClick=${() => { URL.revokeObjectURL(s.url); setStaged((arr) => arr.filter((_, j) => j !== i)); }}>✕</button>
                </span>`)}
              <label class="photo-add">＋ add photos
                <input type="file" multiple hidden accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
                  onChange=${(e) => { addFiles([...e.target.files]); e.target.value = ''; }} />
              </label>
            </div>
          </fieldset>

          <div class="modal-actions">
            <button type="button" class="btn ghost" onClick=${onClose}>cancel</button>
            <button type="submit" class="btn primary" disabled=${busy}>${busy ? '☁️ uploading…' : 'save place'}</button>
          </div>
        </form>
      </div>
    </div>`;
}

/* ================= app ================= */

function App() {
  const [places, setPlaces] = useState(loadPlaces);
  const [view, setViewState] = useState(loadView);
  const [modal, setModal] = useState(null); // null | { place }
  const [lb, setLb] = useState(null);       // { placeId, idx }
  const [cloud, setCloud] = useState(cloudOk);
  const [me, setMe] = useState(undefined);   // undefined=checking · null=anon · {login,name,avatar}
  const searchRef = useRef(null);

  const placesRef = useRef(places);
  placesRef.current = places;
  const lbRef = useRef(lb);
  lbRef.current = lb;
  const meRef = useRef(me);
  meRef.current = me;
  const canEdit = !!me;
  const goLogin = () => { location.href = '/api/auth/login'; };

  /* who am i? → /api/auth/me */
  useEffect(() => {
    fetch('/api/auth/me')
      .then(async (r) => setMe(r.ok ? (await r.json()).user : null))
      .catch(() => setMe(null));
  }, []);

  /* feedback from the OAuth redirect (?auth=…) */
  useEffect(() => {
    const q = new URLSearchParams(location.search).get('auth');
    if (!q) return;
    history.replaceState(null, '', location.pathname);
    if (q === 'not-allowed') alert('🔐 that GitHub account isn’t on the edit allowlist — add its login to ALLOWED_LOGINS.');
    else if (q !== 'ok') alert('🙈 sign-in didn’t work — please try again.');
  }, []);

  const setView = (patch) => setViewState((v) => {
    if (patch.mode != null) {
      try { localStorage.setItem('wander.view', patch.mode); } catch {}
    }
    return { ...v, ...patch };
  });

  /* cloud status → chip */
  useEffect(() => {
    cloudSubs.add(setCloud);
    setCloud(cloudOk);
    return () => cloudSubs.delete(setCloud);
  }, []);

  /* register the little API the static footer buttons use */
  useEffect(() => {
    api.getPlaces = () => placesRef.current;
    api.replaceAll = (rows) => { setPlaces(rows); persist(rows); queueUpsert(rows); };
    api.canEdit = () => {
      if (!meRef.current) { location.href = '/api/auth/login'; return false; }
      return true;
    };
  }, []);

  /* initial cloud load — waits for the auth check; cloud wins for everyone,
     but only 🔐 signed-in visitors may upload or purge cloud-side */
  const cloudLoadedRef = useRef(false);
  useEffect(() => {
    if (me === undefined || cloudLoadedRef.current) return;
    cloudLoadedRef.current = true;
    (async () => {
      try {
        const rows = await API.get('places');
        const allCloud = rows.map(normalize);
        // purge any first-run samples still hanging around in the cloud (needs 🔐)
        const cloudList = allCloud.filter((p) => !isLegacySample(p));
        if (me) {
          allCloud.filter(isLegacySample).forEach((p) => queueDelete(p.id));
          // local rows that aren't in the cloud yet are uploaded so nothing is lost
          const localOnly = placesRef.current.filter((p) => !cloudList.some((c) => c.id === p.id));
          const merged = [...cloudList, ...localOnly];
          setPlaces(merged);
          persist(merged);
          if (localOnly.length) queueUpsert(localOnly);
        } else {
          // read-only: just show what the cloud has
          setPlaces(cloudList);
          persist(cloudList);
        }
        setCloudOk(true);
      } catch {
        setCloudOk(false);
      }
    })();
  }, [me]);

  /* actions for cards — every edit needs a 🔐 session */
  const act = useMemo(() => ({
    fav: (id) => {
      if (!meRef.current) return goLogin();
      setPlaces((ps) => {
        const next = ps.map((p) => (p.id === id ? { ...p, favorite: !p.favorite } : p));
        persist(next);
        const t = next.find((p) => p.id === id);
        if (t) queueUpsert([t]);
        return next;
      });
    },
    toggle: (id) => {
      if (!meRef.current) return goLogin();
      setPlaces((ps) => {
        const next = ps.map((p) => {
          if (p.id !== id) return p;
          const visited = p.status === 'visited';
          return { ...p, status: visited ? 'want' : 'visited', date: visited ? '' : (p.date || today()) };
        });
        persist(next);
        const t = next.find((p) => p.id === id);
        if (t) queueUpsert([t]);
        return next;
      });
    },
    edit: (id) => {
      if (!meRef.current) return goLogin();
      const p = placesRef.current.find((x) => x.id === id);
      if (p) setModal({ place: p });
    },
    del: (id) => {
      if (!meRef.current) return goLogin();
      const p = placesRef.current.find((x) => x.id === id);
      if (!p) return;
      if (!confirm(`say goodbye to “${p.name}”? 🥺`)) return;
      (p.photos || []).forEach((u) => deletePhotoObject(u).catch(() => {}));
      setPlaces((ps) => { const next = ps.filter((x) => x.id !== id); persist(next); return next; });
      queueDelete(id);
    },
    photo: (id, idx) => {
      const p = placesRef.current.find((x) => x.id === id);
      if (p && p.photos && p.photos.length) setLb({ placeId: id, idx: idx || 0 });
    },
  }), []);

  const savePlace = (placeId, data, removedUrls) => {
    if (!meRef.current) return goLogin();
    setPlaces((ps) => {
      const exists = ps.some((p) => p.id === placeId);
      const next = exists
        ? ps.map((p) => (p.id === placeId ? normalize({ ...p, ...data }) : p))
        : [...ps, normalize({ ...data, id: placeId, createdAt: Date.now() })];
      persist(next);
      const t = next.find((p) => p.id === placeId);
      if (t) queueUpsert([t]);
      return next;
    });
    removedUrls.forEach((u) => deletePhotoObject(u).catch(() => {}));
    setModal(null);
  };

  /* keyboard: Esc closes, arrows navigate lightbox, / focuses search */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { setModal(null); setLb(null); }
      if (lbRef.current && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        setLb((s) => ({ ...s, idx: s.idx + (e.key === 'ArrowRight' ? 1 : -1) }));
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !lbRef.current) {
        const t = document.activeElement;
        const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
        if (!typing) { e.preventDefault(); searchRef.current?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const visitedCount = places.filter((p) => p.status === 'visited').length;
  const cityCount = new Set(places.map(cityKey)).size;
  const counts = { all: places.length, visited: visitedCount, want: places.length - visitedCount };

  const visible = useMemo(() => {
    const q = view.search.trim().toLowerCase();
    return places.filter((p) => {
      if (view.tab === 'visited' && p.status !== 'visited') return false;
      if (view.tab === 'want' && p.status !== 'want') return false;
      if (!q) return true;
      return [p.name, p.city, p.country, p.notes, catOf(p.category).label, whoText(p), p.suggestedBy]
        .join(' ').toLowerCase().includes(q);
    });
  }, [places, view.search, view.tab]);

  let content;
  if (!places.length) {
    content = html`
      <${Empty} big="🪶" title="no places yet!" sub="add your first spot — been or dreamed, both count.">
        <button type="button" class="btn primary" onClick=${() => (me ? setModal({ place: null }) : goLogin())}>＋ add a place</button>
      <//>`;
  } else if (!visible.length) {
    content = html`
      <${Empty} big="🔍" title="nothing matches" sub="try a different word, or peek at another tab.">
        <button type="button" class="btn ghost" onClick=${() => setView({ search: '' })}>clear search</button>
      <//>`;
  } else if (view.mode === 'timeline') {
    content = html`<${Timeline} visible=${visible} act=${act} />`;
  } else {
    const groupsAll = groupByCity(places);
    const groupsVis = groupByCity(visible);
    content = [...groupsVis.keys()]
      .sort((a, b) => a.localeCompare(b))
      .map((key) => html`<${GroupSection} key=${key} all=${groupsAll.get(key)} items=${groupsVis.get(key).items} act=${act} />`);
  }

  const cloudText = cloud == null ? '☁️ syncing…' : cloud ? '☁️ synced' : '☁️ offline';
  const cloudTitle = cloud == null
    ? 'connecting to the cloud…'
    : cloud ? 'saved to Supabase — same list on every device'
            : 'cloud unreachable — changes stay in this browser and merge later';
  const lbPlace = lb ? places.find((p) => p.id === lb.placeId) : null;

  const TABS = [['all', '🌏 all'], ['visited', '✨ been'], ['want', '💭 someday']];
  const VIEWS = [['grid', '🗂 by city'], ['timeline', '📜 timeline']];

  return html`
    <div>
      <header class="top">
        <div class="brand">
          <h1>🪶 Wander</h1>
          <p class="tagline">places i’ve been &amp; places i dream of ✨</p>
        </div>
        <p class="stats">${places.length
          ? html`<b>${places.length}</b> place${places.length === 1 ? '' : 's'} in <b>${cityCount}</b> cit${cityCount === 1 ? 'y' : 'ies'} · <b>${visitedCount}</b> been ✨ · <b>${counts.want}</b> someday 💭`
          : 'a fresh empty map 🗺️'}</p>
      </header>

      <div class="toolbar">
        <label class="search">
          <span aria-hidden="true">🔍</span>
          <input ref=${searchRef} type="search" placeholder="search places, cities, notes…  ( / )"
            aria-label="Search places" value=${view.search} onInput=${(e) => setView({ search: e.target.value })} />
        </label>
        <nav class="tabs" aria-label="Filter places">
          ${TABS.map(([id, label]) => html`
            <button key=${id} type="button" class=${view.tab === id ? 'active' : ''} onClick=${() => setView({ tab: id })}>
              ${label} <span class="count">${counts[id]}</span>
            </button>`)}
        </nav>
        <nav class="tabs view-tabs" aria-label="View">
          ${VIEWS.map(([id, label]) => html`
            <button key=${id} type="button" class=${view.mode === id ? 'active' : ''} onClick=${() => setView({ mode: id })}>
              ${label}
            </button>`)}
        </nav>
        <span class="cloud" title=${cloudTitle}>${cloudText}</span>
        ${me === undefined
          ? html`<span class="me" title="checking login…">🔐 …</span>`
          : me
            ? html`<span class="me" title=${`signed in as ${me.login} 🔐`}>
                <img src=${me.avatar} alt=${me.login} width="22" height="22" />
                <b class="me-name">${me.name || me.login}</b>
                <a class="link" href="/api/auth/logout">sign out</a>
              </span>`
            : html`<a class="btn ghost" href="/api/auth/login" title="sign in to add & edit places">🔐 sign in</a>`}
        <button type="button" class="btn primary" title=${canEdit ? '' : 'sign in first 🔐'}
          onClick=${() => (me ? setModal({ place: null }) : goLogin())}>＋ add a place</button>
      </div>

      <main id="groups">${content}</main>

      ${modal ? html`<${PlaceModal} initial=${modal.place} onSave=${savePlace} onClose=${() => setModal(null)} />` : null}
      ${lb && lbPlace ? html`
        <${Lightbox} photos=${lbPlace.photos} name=${lbPlace.name} idx=${lb.idx}
          onNav=${(d) => setLb((s) => ({ ...s, idx: s.idx + d }))} onClose=${() => setLb(null)} />
        ` : null}
    </div>`;
}

/* ---------- footer buttons (static markup in index.html, wired here) ---------- */
const api = {};

/* ---------- boot (browser only — keeps `node --check`-style imports happy) ---------- */
if (typeof document !== 'undefined') {
  $('#export-btn')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(api.getPlaces?.() ?? [], null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'wander-places.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#import-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!api.canEdit?.()) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error('not a list');
      const rows = data.map(normalize);
      if (confirm(`Replace your places with the ${rows.length} in this file?`)) api.replaceAll?.(rows);
    } catch {
      alert("Couldn't read that file 🙈 — expected a wander-places.json backup.");
    }
  });

  $('#reset-btn')?.addEventListener('click', () => {
    if (!api.canEdit?.()) return;
    const current = api.getPlaces?.() ?? [];
    if (current.length && !confirm('Clear ALL places and start fresh? This cannot be undone.')) return;
    current.forEach((p) => (p.photos || []).forEach((u) => deletePhotoObject(u).catch(() => {})));
    current.forEach((p) => queueDelete(p.id));
    api.replaceAll?.([]);
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

  render(html`<${App} />`, document.getElementById('app'));
}