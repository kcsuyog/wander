# 🪶 Wander — a cute little places tracker

A tiny web app for tracking places you've **visited** and places you **dream of visiting**,
grouped by city (Sydney, Melbourne, Tokyo, …).

**→ Live: <https://kcsuyog.github.io/wander/>** (free GitHub Pages hosting, deploys on every push to `main`)

## Stack

| Layer | Choice |
|---|---|
| UI | **Preact + htm** (vendored ES modules in `vendor/`, ~17KB raw / ~5KB gzipped) — React-style components, **no build step**, no bundler, no CDN |
| Styling | Hand-written CSS + Google Fonts (Baloo 2 / Quicksand) |
| Data | Supabase Postgres via PostgREST (`fetch`, no SDK) + `localStorage` fallback |
| Photos | Supabase Storage (public `photos` bucket, browser uploads) |
| Geocoding | Photon (open-source, OSM data) · Mini maps: single OSM tiles |
| Hosting | GitHub Pages |

## Cloud sync (Supabase)

Places sync to a Supabase Postgres table (`public.places`), so the list is the same on every
device. A local copy stays in `localStorage` and the app works offline (a ☁️ chip in the
toolbar shows `synced` / `offline`).

- **API:** plain `fetch` against PostgREST (`/rest/v1/places`) — no SDK, no build step.
- **Key used in the frontend:** only the *publishable* key (`app.js`) — that is safe in a public
  site because Row Level Security decides what the `anon` role may do. The **secret key and the
  database password are never used in the frontend and are not committed anywhere.**
- **Mode: open** — anyone with the site link can read *and write* the places (chosen deliberately,
  no sign-in). That's what the RLS policies allow; see "Sign-in gate" below to lock it down.
- **Conflict handling:** last write wins (upsert by `id`). On load, cloud wins; any local-only
  rows are uploaded so nothing is lost. Offline edits merge on the next successful load.

### Schema (already applied to the project)

```sql
create table public.places (
  "id" text primary key, "name" text not null,
  "city" text not null default 'Somewhere', "country" text not null default '',
  "category" text not null default 'other',
  "status" text not null default 'want' check ("status" in ('visited','want')),
  "date" text not null default '', "favorite" boolean not null default false,
  "notes" text not null default '',
  "who" text[] not null default '{us}'::text[],        -- 💞 us | suyog | susmita
  "suggestedBy" text not null default '',             -- 💬 who suggested it
  "photos" text[] not null default '{}'::text[],       -- 📸 public storage URLs
  "lat" double precision, "lon" double precision, "zoom" double precision,
  "createdAt" bigint not null default 0
);
alter table public.places enable row level security;
-- + open SELECT / INSERT / UPDATE / DELETE policies for anon (see schema in the Supabase project)
```

Photos upload straight from the browser to the public `photos` bucket
(`POST /storage/v1/object/photos/<placeId>/<file>`) and are referenced by their public URL
(`/storage/v1/object/public/photos/...`). The bucket allows images ≤ 10MB; open-mode policies
let the `anon` role insert/select/delete objects in that bucket.

### Sign-in gate (optional, recommended if the list turns personal)

1. In Supabase: **Authentication → Providers → Email** (enable).
2. Disable the four `places_open_*` policies; add `using (auth.uid() = <owner id>)` style
   policies instead (or a simple `for authenticated using (true)` if it's just you).
3. Add a sign-in form in `app.js` (Supabase Auth REST `/auth/v1/token?grant_type=password`).

## Run it

No build step, no dependencies — just open `index.html` in a browser, or use the live site:

```sh
open index.html                       # macOS
# or serve it: python3 -m http.server # → http://localhost:8000
```

## Features

- **Add places** with name, city/area, country, category, date, notes and a ⭐ favourite
- **Two statuses** — ✨ been! / 💭 someday — with a one-click toggle (marking a place "been"
  auto-stamps today's date)
- **Who travelled** — 💞 us (Suyog & Susmita), 🧑 Suyog, 👩 Susmita chips on every place
- **Suggested by** — remember who tipped you off about a place 💬
- **Photos 📸** — attach photos to any place (stored in a public Supabase Storage bucket);
  each card gets a cover photo + 📷 count, and a lightbox viewer (arrows/‹›, Esc) shows the gallery
- **Two views** — 🗂 **by city** (grid) or 📜 **timeline**: a chronological journal grouped by
  year (newest first), photos and dates inline, plus a 💭 someday section for dreams
- **Grouped by city**, with per-city "been / someday" counts
- **Live search** across names, cities, countries, notes, people and categories (press `/` to jump to search)
- **Filter tabs** — all / been / someday — plus little stats up top
- **Animated & parallax** — a fixed sky scene (drifting clouds, pulsing sun, birds, a plane)
  with pointer-driven parallax layers, and staggered pop-in entrances for cards
  (respects `prefers-reduced-motion`)
- **Backup / restore** as JSON, and a "start over" reset — all from the footer

## Where data lives

- **Cloud:** Supabase Postgres `public.places` (synced on load + after every change).
- **Local fallback:** the browser's `localStorage` (key `wander.places.v1`) — offline edits merge
  back into the cloud on the next successful load.
- The app starts empty — add your own places, and use **start over** to wipe the map clean.

## Files

| File | What it is |
|---|---|
| `index.html` | Shell: sky scene, `#app` mount point, footer |
| `style.css` | Pastel cute styling (Baloo 2 + Quicksand) |
| `app.js` | Preact components: cards, timeline, modal, autocomplete, lightbox, cloud sync |
| `vendor/` | Vendored framework: `preact.module.js`, `hooks.module.js`, `htm.module.js` |
| `package.json` | Just `"type": "module"` (for `node --check`); no dependencies |