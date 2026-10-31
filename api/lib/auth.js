/* 🔐 signed sessions — HMAC-signed cookie, no dependencies */
import crypto from 'node:crypto';

const SECRET = process.env.AUTH_SECRET || 'dev-insecure-secret-change-me';
const NAME = 'wander_session';
const isLocal = (host) => /^(localhost|127\.0\.0\.1)(:|$)/.test(String(host || ''));
const secure = (host) => (isLocal(host) ? '' : ' Secure;');

export function signSession(user, maxAgeSec = 60 * 60 * 24 * 30) {
  const body = Buffer.from(JSON.stringify({ u: user, e: Date.now() + maxAgeSec * 1000 })).toString('base64url');
  const mac = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function readSession(req) {
  const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${NAME}=([^;]+)`));
  if (!m) return null;
  const [body, mac] = decodeURIComponent(m[1]).split('.');
  if (!body || !mac) return null;
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const { u, e } = JSON.parse(Buffer.from(body, 'base64url'));
    return e > Date.now() ? u : null;
  } catch {
    return null;
  }
}

export const sessionCookie = (req, user) =>
  `${NAME}=${encodeURIComponent(signSession(user))}; Path=/; HttpOnly;${secure(req.headers.host)} SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;

export const clearSessionCookie = (req) =>
  `${NAME}=; Path=/; HttpOnly;${secure(req.headers.host)} SameSite=Lax; Max-Age=0`;