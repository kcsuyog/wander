/* 🔐 GET /api/auth/logout → clear the session, back home */
import { clearSessionCookie } from '../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Set-Cookie', clearSessionCookie(req));
  res.redirect(302, '/');
}