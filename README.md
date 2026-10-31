# 🪶 Wander — a cute little places tracker

A tiny web app for tracking places you've **visited** and places you **dream of visiting**,
grouped by city (Sydney, Melbourne, Tokyo, …).

**→ Live: <https://kcsuyog.github.io/wander/>** (free GitHub Pages hosting, deploys on every push to `main`)

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
  "lat" double precision, "lon" double precision, "zoom" double precision,
  "createdAt" bigint not null default 0
);
alter table public.places enable row level security;
-- + open SELECT / INSERT / UPDATE / DELETE policies for anon (see schema in the Supabase project)
```

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
- **Grouped by city**, with per-city "been / someday" counts
- **Live search** across names, cities, countries, notes and categories (press `/` to jump to search)
- **Filter tabs** — all / been / someday — plus little stats up top
- **Backup / restore** as JSON, and a "start over" reset — all from the footer

## Where data lives

- **Cloud:** Supabase Postgres `public.places` (synced on load + after every change).
- **Local fallback:** the browser's `localStorage` (key `wander.places.v1`) — offline edits merge
  back into the cloud on the next successful load.
- The first run shows a few sample Sydney / Melbourne / Tokyo places — delete them freely,
  or use **start over** to begin with an empty map.

## Files

| File | What it is |
|---|---|
| `index.html` | Markup |
| `style.css` | Pastel cute styling (Baloo 2 + Quicksand) |
| `app.js` | State, rendering, search, CRUD, Photon autocomplete, Supabase sync |