/* 🔐 GET /api/auth/callback — exchange the code, allowlist check, session cookie */
import { sessionCookie, clearSessionCookie } from '../lib/auth.js';

export default async function handler(req, res) {
  const { code, state } = req.query;

  // CSRF: the state we set in /api/auth/login must match
  const m = String(req.headers.cookie || '').match(/(?:^|;\s*)wander_oauth_state=([^;]+)/);
  if (!code || !state || !m || decodeURIComponent(m[1]) !== state) {
    res.setHeader('Set-Cookie', clearState(req));
    return res.redirect(302, '/?auth=state-mismatch');
  }

  const host = req.headers.host || 'localhost:3000';
  const proto = /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https';
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'wander' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${proto}://${host}/api/auth/callback`,
      }),
    });
    const token = await tokenRes.json();
    if (!token.access_token) throw new Error(token.error_description || token.error || 'no token');

    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'wander' },
    });
    if (!userRes.ok) throw new Error(`github user ${userRes.status}`);
    const gh = await userRes.json();

    // only logins on the allowlist may edit
    const allow = (process.env.ALLOWED_LOGINS || '')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (allow.length && !allow.includes(String(gh.login || '').toLowerCase())) {
      res.setHeader('Set-Cookie', clearState(req));
      return res.redirect(302, `/?auth=not-allowed&login=${encodeURIComponent(gh.login || '')}`);
    }

    const user = { login: gh.login, name: gh.name || gh.login, avatar: gh.avatar_url };
    res.setHeader('Set-Cookie', [sessionCookie(req, user), clearState(req)]);
    return res.redirect(302, '/?auth=ok');
  } catch {
    res.setHeader('Set-Cookie', clearState(req));
    return res.redirect(302, '/?auth=error');
  }
}

function clearState(req) {
  const secure = /^(localhost|127\.0\.0\.1)(:|$)/.test(String(req.headers.host || '')) ? '' : ' Secure;';
  return `wander_oauth_state=; Path=/api/auth; HttpOnly;${secure} SameSite=Lax; Max-Age=0`;
}