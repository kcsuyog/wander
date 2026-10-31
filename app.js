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

/* ---------- sample data (shown on first run, delete freely) ---------- */
const SEED = [
  { name: 'Sydney Opera House', city: 'Sydney', country: 'Australia', category: 'landmark', status: 'visited', date: '2024-11-02', notes: 'Sat on the steps with a gelato while the sails turned gold. 🍦', favorite: true },
  { name: 'Bondi → Coogee walk', city: 'Sydney', country: 'Australia', category: 'beach', status: 'visited', date: '2024-11-04', notes: 'Six kilometres of cliffs and little coves — swim stops mandatory.', favorite: false },
  { name: 'Royal Botanic Garden', city: 'Sydney', country: 'Australia', category: 'park', status: 'visited', date: '2024-11-03', notes: 'Ibis everywhere. Harbour view from Mrs Macquarie’s Chair.', favorite: false },
  { name: 'The Grounds of Alexandria', city: 'Sydney', country: 'Australia', category: 'cafe', status: 'visited', date: '', notes: 'Coffee in a garden full of flowers and fairy lights.', favorite: false },
  { name: 'Blue Mountains', city: 'Sydney', country: 'Australia', category: 'viewpoint', status: 'want', date: '', notes: 'Ride the Scenic World skyway over the Jamison Valley.', favorite: true },
  { name: 'Manly ferry at sunset', city: 'Sydney', country: 'Australia', category: 'other', status: 'want', date: '', notes: 'Cheapest harbour cruise there is — sit up top at golden hour.', favorite: false },
  { name: 'Laneway coffee crawl', city: 'Melbourne', country: 'Australia', category: 'cafe', status: 'visited', date: '2024-11-08', notes: 'Found a tiny roaster off Degraves St. Flat white, perfect.', favorite: false },
  { name: 'teamLab Planets', city: 'Tokyo', country: 'Japan', category: 'museum', status: 'want', date: '', notes: 'Barefoot, wading through glowing water. Book ahead!', favorite: true },
  { name: 'Yakitori under the arches', city: 'Tokyo', country: 'Japan', category: 'food', status: 'want', date: '', notes: 'Yurakucho at night — smoke, chatter, cold beer.', favorite: false },
];

/* ---------- state ---------- */
const STORAGE_KEY = 'wander.places.v1';

function normalize(p) {
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
let view = { search: '', tab: 'all' };
let editingId = null;

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

function cardHTML(p) {
  const cat = catOf(p.category);
  const visited = p.status === 'visited';
  return `
  <article class="place ${visited ? 'is-visited' : 'is-want'}" data-id="${p.id}">
    <div class="place-head">
      <span class="cat" aria-hidden="true">${cat.emoji}</span>
      <div class="place-title">
        <h3>${esc(p.name)}</h3>
        <p class="meta">${esc(cat.label)}${p.date ? ` · <time>${esc(formatDate(p.date))}</time>` : ''}</p>
      </div>
      <button type="button" class="star ${p.favorite ? 'on' : ''}" data-action="fav"
        aria-label="${p.favorite ? 'remove favourite' : 'mark as favourite'}" title="favourite">${p.favorite ? '⭐' : '☆'}</button>
    </div>
    ${p.notes ? `<p class="notes">${esc(p.notes)}</p>` : ''}
    <footer class="place-foot">
      <span class="status-badge ${visited ? 'ok' : 'dream'}">${visited ? '✨ been!' : '💭 someday'}</span>
      <span class="spacer"></span>
      <button type="button" class="ghost toggle" data-action="toggle"
        title="${visited ? 'Move to someday list' : 'Mark as visited'}">${visited ? '→ 💭 someday' : '→ ✨ been!'}</button>
      <button type="button" class="ghost icon" data-action="edit" aria-label="edit" title="edit">✏️</button>
      <button type="button" class="ghost icon" data-action="delete" aria-label="delete" title="delete">🗑️</button>
    </footer>
  </article>`;
}

function sectionHTML(allGroup, items) {
  const done = allGroup.items.filter((p) => p.status === 'visited').length;
  const dream = allGroup.items.length - done;
  const cards = [...items].sort((a, b) => a.name.localeCompare(b.name)).map(cardHTML).join('');
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

function render() {
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
    return [p.name, p.city, p.country, p.notes, catOf(p.category).label]
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

  const groupsAll = groupByCity(places);
  const groupsVis = groupByCity(visible);
  els.list.innerHTML = [...groupsVis.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((key) => sectionHTML(groupsAll.get(key), groupsVis.get(key).items))
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
    places = places.filter((p) => p.id !== place.id);
  }

  persist(places);
  render();
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
  els.modal.classList.add('open');
  $('#f-name').focus();
}

function closeModal() {
  els.modal.classList.remove('open');
  editingId = null;
}

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!els.form.reportValidity()) return;

  const data = {
    name: $('#f-name').value.trim(),
    city: $('#f-city').value.trim(),
    country: $('#f-country').value.trim(),
    category: $('#f-category').value,
    status: document.querySelector('input[name="f-status"]:checked')?.value === 'visited' ? 'visited' : 'want',
    date: $('#f-date').value,
    favorite: $('#f-fav').checked,
    notes: $('#f-notes').value.trim(),
  };
  if (!data.name || !data.city) return;

  if (editingId) {
    const p = places.find((x) => x.id === editingId);
    if (p) Object.assign(p, normalize({ ...p, ...data }));
  } else {
    places.push(normalize({ ...data, id: uid(), createdAt: Date.now() }));
  }
  persist(places);
  closeModal();
  render();
});

els.addBtn.addEventListener('click', () => openModal());
els.cancelBtn.addEventListener('click', closeModal);
els.modal.addEventListener('click', (e) => {
  if (e.target === els.modal) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
  if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
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
    render();
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
      render();
    }
  } catch {
    alert("Couldn't read that file 🙈 — expected a wander-places.json backup.");
  }
});

$('#reset-btn').addEventListener('click', () => {
  if (places.length && !confirm('Clear ALL places and start fresh? This cannot be undone.')) return;
  places = [];
  persist(places);
  render();
});

/* ---------- go ---------- */
render();