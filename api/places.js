/* 🗺 /api/places — the backend for the map.
   GET (public): list all places.
   POST (🔐): upsert a list of rows (merge-duplicates).
   DELETE (🔐): remove by ?id=a,b,c */
import { sbRest } from './lib/db.js';
import { readSession } from './lib/auth.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const rows = await (await sbRest('places?select=*&order=createdAt.asc')).json();
      return res.status(200).json(rows);
    }

    // every write needs a signed-in session 🔐
    if (!readSession(req)) return res.status(401).json({ error: 'sign in to edit' });

    if (req.method === 'POST') {
      const rows = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!Array.isArray(rows) || rows.some((r) => !r || typeof r.id !== 'string')) {
        return res.status(400).json({ error: 'expected a list of place rows with ids' });
      }
      await sbRest('places', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
      });
      return res.status(204).end();
    }

    if (req.method === 'DELETE') {
      const ids = String(req.query.id || '')
        .split(',').map((s) => s.trim()).filter(Boolean);
      if (!ids.length) return res.status(400).json({ error: 'missing ?id=' });
      await sbRest(`places?id=in.(${ids.map((id) => encodeURIComponent(id)).join(',')})`, { method: 'DELETE' });
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    return res.status(502).json({ error: String((err && err.message) || err) });
  }
}