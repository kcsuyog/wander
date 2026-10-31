/* 🔐 GET /api/auth/login → redirect to GitHub (state-cookie CSRF check) */
import crypto from 'node:crypto';

export default async function handler(req, res) {
  const { GITHUB_CLIENT_ID: clientId, GITHUB_CLIENT_SECRET: clientSecret } = process.env;
  if (!clientId || !clientSecret) {
    return res.status(503).send(
      '🔐 GitHub login isn’t configured yet — set GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET ' +
      '(and AUTH_SECRET + ALLOWED_LOGINS) as Vercel env vars.',
    );
  }
  const host = req.headers.host || 'localhost:3000';
  const proto = /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https';
  const redirectUri = `${proto}://${host}/api/auth/callback`;
  const state = crypto.randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie', [
    `wander_oauth_state=${state}; Path=/api/auth; HttpOnly;${proto === 'https' ? ' Secure;' : ''} SameSite=Lax; Max-Age=600`,
  ]);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read:user',
    state,
  });
  res.redirect(302, `https://github.com/login/oauth/authorize?${params}`);
}