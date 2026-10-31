/* 📷 /api/photos — bucket uploads & deletes (🔐 both).
   POST: raw image bytes + x-place-id / x-file-name headers → { url }
   DELETE: { url } (must point into our photos bucket) */
import crypto from 'node:crypto';
import { sbStorage, PHOTO_PUBLIC_PREFIX } from './lib/db.js';
import { readSession } from './lib/auth.js';

const uid = () => crypto.randomBytes(6).toString('hex');

function readRaw(req) {
  return new Promise((ok, fail) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => ok(Buffer.concat(chunks)));
    req.on('error', fail);
  });
}

export default async function handler(req, res) {
  try {
    if (!readSession(req)) return res.status(401).json({ error: 'sign in to edit' });

    if (req.method === 'POST') {
      const placeId = String(req.headers['x-place-id'] || '').replace(/[^a-z0-9-]/gi, '');
      if (!placeId) return res.status(400).json({ error: 'missing x-place-id' });
      const name = String(req.headers['x-file-name'] || '');
      const ext = ((name.includes('.') ? name.split('.').pop() : '') || 'jpg')
        .toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
      const buf = await readRaw(req);
      if (!buf.length) return res.status(400).json({ error: 'empty upload' });
      const file = `${uid()}.${ext}`;
      const up = await sbStorage(`photos/${placeId}/${file}`, {
        method: 'POST',
        headers: { 'Content-Type': req.headers['content-type'] || 'image/jpeg', 'x-upsert': 'true' },
        body: new Uint8Array(buf),
      });
      if (!up.ok) throw new Error(`upload ${up.status}`);
      return res.status(200).json({ url: `${PHOTO_PUBLIC_PREFIX}${placeId}/${file}` });
    }

    if (req.method === 'DELETE') {
      const { url } = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      if (!url || !url.startsWith(PHOTO_PUBLIC_PREFIX)) return res.status(400).json({ error: 'bad photo url' });
      await sbStorage(`photos/${url.slice(PHOTO_PUBLIC_PREFIX.length)}`, { method: 'DELETE' });
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    return res.status(502).json({ error: String((err && err.message) || err) });
  }
}