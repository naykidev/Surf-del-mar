/**
 * Removes a single image override (revert to original).
 * Requires ADMIN_PASSWORD. Writes updatedAt, updatedBy for audit.
 */
const admin = require('firebase-admin');

function getAdmin() {
  if (!admin.apps.length) {
    const cred = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!cred) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(cred)) });
  }
  return admin;
}

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  const expectedPassword = process.env.ADMIN_PASSWORD || process.env.admin_password;
  if (!expectedPassword) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ADMIN_PASSWORD is not set. In Netlify: Site configuration → Environment variables, add ADMIN_PASSWORD (all caps), then trigger a new deploy.' }) };
  }
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }
  if (body.password !== expectedPassword) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  let { originalSrc } = body;
  if (!originalSrc || typeof originalSrc !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'originalSrc required' }) };
  }
  // Normalize to pathname so key matches regardless of origin (e.g. /surfers.jpg)
  try {
    const u = new URL(originalSrc, 'https://x');
    originalSrc = u.pathname || originalSrc;
  } catch (_) {
    if (originalSrc.startsWith('/')) {
      // already path-like
    } else {
      originalSrc = '/' + originalSrc.replace(/^\/+/, '');
    }
  }
  try {
    const app = getAdmin();
    const db = app.firestore();
    const ref = db.doc('content/imageOverrides');
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : {};
    const overrides = data.overrides && typeof data.overrides === 'object' ? { ...data.overrides } : {};
    delete overrides[originalSrc];
    if (body.originalSrcRaw && body.originalSrcRaw !== originalSrc) {
      delete overrides[body.originalSrcRaw];
    }
    const now = new Date().toISOString();
    await ref.set({ overrides, updatedAt: now, updatedBy: 'admin' }, { merge: true });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Failed to revert' }),
    };
  }
};
