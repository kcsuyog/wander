#!/usr/bin/env node
/* smoke test — run against any deployment:
     node scripts/smoke.mjs https://wander-one-omega.vercel.app
   Verifies the 🔐 contract: reads public, every anon write rejected,
   OAuth flow reachable. Exits non-zero on any failure. */
const BASE = process.argv[2] || 'https://wander-one-omega.vercel.app';

let failed = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failed += 1;
};

const anonHeaders = { 'Content-Type': 'application/json' };

// 1. public read
{
  const r = await fetch(`${BASE}/api/places`);
  const rows = r.status === 200 ? await r.json().catch(() => null) : null;
  ok('GET /api/places is public JSON', r.status === 200 && Array.isArray(rows), `${r.status}, ${Array.isArray(rows) ? rows.length : '?'} rows`);
}

// 2-4. anon writes must all 401
{
  const post = await fetch(`${BASE}/api/places`, { method: 'POST', headers: anonHeaders, body: JSON.stringify([{ id: 'smoke', name: 'nope' }]) });
  ok('POST /api/places anon → 401', post.status === 401, String(post.status));

  const del = await fetch(`${BASE}/api/places?id=smoke`, { method: 'DELETE' });
  ok('DELETE /api/places anon → 401', del.status === 401, String(del.status));

  const photo = await fetch(`${BASE}/api/photos`, { method: 'POST', headers: { 'x-place-id': 'smoke' }, body: 'x' });
  ok('POST /api/photos anon → 401', photo.status === 401, String(photo.status));
}

// 5. me is anon
{
  const r = await fetch(`${BASE}/api/auth/me`);
  ok('GET /api/auth/me anon → 401', r.status === 401, String(r.status));
}

// 6. login starts the OAuth flow (302 to github with our client_id) or 503 if unconfigured
{
  const r = await fetch(`${BASE}/api/auth/login`, { redirect: 'follow' });
  const landed = r.url || '';
  const onGithub = landed.startsWith('https://github.com/login/oauth/authorize') || landed.startsWith('https://github.com/login');
  ok('GET /api/auth/login → GitHub OAuth', r.status === 200 && onGithub, landed.slice(0, 60) || String(r.status));
}

// 7. no secrets in the served frontend
{
  const js = await (await fetch(`${BASE}/app.js`)).text();
  ok('frontend leaks no Supabase keys', !/sb_publishable_|sb_secret_|service_role/.test(js));
  ok('photo compression shipped', js.includes('compressImage'));
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed ✅');
process.exit(failed ? 1 : 0);