# 🪶 Wander — a cute little places tracker

A tiny web app for tracking places you've **visited** and places you **dream of visiting**,
grouped by city (Sydney, Melbourne, Tokyo, …).

**→ Live: <https://kcsuyog.github.io/wander/>** (free GitHub Pages hosting, deploys on every push to `main`)

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

In the browser's `localStorage` (key `wander.places.v1`). Nothing leaves your machine.
The first run shows a few sample Sydney / Melbourne / Tokyo places — delete them freely,
or use **start over** to begin with an empty map.

## Files

| File | What it is |
|---|---|
| `index.html` | Markup |
| `style.css` | Pastel cute styling (Baloo 2 + Quicksand) |
| `app.js` | State, rendering, search, CRUD, backup |