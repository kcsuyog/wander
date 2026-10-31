/* 🔐 GET /api/auth/me → { user } or 401 */
import { readSession } from '../lib/auth.js';

export default async function handler(req, res) {
  const user = readSession(req);
  if (!user) return res.status(401).json({ user: null });
  return res.status(200).json({ user });
}