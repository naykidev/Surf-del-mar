/**
 * Merge updates into content/siteConfig (page backgrounds, dynamic block arrays, CMS page definitions).
 * POST { password, patch } where patch is shallow-merged at top level; use dot paths avoided — nested merge for known keys.
 */
const admin = require('firebase-admin');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function getAdmin() {
  if (!admin.apps.length) {
    const cred = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!cred) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(cred)) });
  }
  return admin;
}

function deepMerge(target, source) {
  if (!source || typeof source !== 'object') return target;
  const out = { ...target };
  for (const k of Object.keys(source)) {
    const sv = source[k];
    const tv = out[k];
    // Shallow-merge maps so one page key doesn't wipe others (arrays are leaf values).
    if (k === 'dynamicBlocks' && sv && typeof sv === 'object' && !Array.isArray(sv)) {
      out.dynamicBlocks = { ...(target.dynamicBlocks || {}), ...sv };
      continue;
    }
    if (k === 'pageBackgrounds' && sv && typeof sv === 'object' && !Array.isArray(sv)) {
      out.pageBackgrounds = { ...(target.pageBackgrounds || {}), ...sv };
      continue;
    }
    if (k === 'cmsPages' && sv && typeof sv === 'object' && !Array.isArray(sv)) {
      out.cmsPages = { ...(target.cmsPages || {}), ...sv };
      continue;
    }
    if (sv && typeof sv === 'object' && !Array.isArray(sv) && tv && typeof tv === 'object' && !Array.isArray(tv)) {
      out[k] = deepMerge(tv, sv);
    } else {
      out[k] = sv;
    }
  }
  return out;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  const expectedPassword = process.env.ADMIN_PASSWORD || process.env.admin_password;
  if (!expectedPassword) {
    return { statusCode: 500, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'ADMIN_PASSWORD is not set.' }) };
  }
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }
  if (body.password !== expectedPassword) {
    return { statusCode: 403, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  const patch = body.patch;
  if (!patch || typeof patch !== 'object') {
    return { statusCode: 400, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'patch object required' }) };
  }

  try {
    const app = getAdmin();
    const db = app.firestore();
    const ref = db.doc('content/siteConfig');
    const snap = await ref.get();
    const existing = snap.exists ? snap.data() : {};
    const merged = deepMerge(existing, patch);
    merged.updatedAt = new Date().toISOString();
    merged.updatedBy = 'admin';
    await ref.set(merged, { merge: false });
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, updatedAt: merged.updatedAt }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Failed to save' }),
    };
  }
};
