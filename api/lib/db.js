/* server-side Supabase access — the keys never reach the browser.
   Reads are public (same as before); writes are gated by api/lib/auth.js 🔐 */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://eozbynvaoidivxudplxr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_7_5RUdFNFFxlJFqZzAVh6w_8NNXio0j';

export const PHOTO_PUBLIC_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/photos/`;

export async function sbRest(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`supabase ${res.status} ${await res.text().catch(() => '')}`);
  return res;
}

export async function sbStorage(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      ...(opts.headers || {}),
    },
  });
  if (!res.ok && res.status !== 404) throw new Error(`storage ${res.status}`);
  return res;
}