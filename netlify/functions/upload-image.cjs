const admin = require('firebase-admin');

function getAdmin() {
  if (!admin.apps.length) {
    const cred = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!cred) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(cred)) });
  }
  return admin;
}

// Saves image overrides in Firestore only (no Firebase Storage). Data URLs are stored in content/imageOverrides.
// Note: Firestore document limit is 1MB; keep image count/size modest or you may need to split into a collection.
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
  let { originalSrc, fileBase64, contentType } = body;
  if (!originalSrc || !fileBase64) {
    return { statusCode: 400, body: JSON.stringify({ error: 'originalSrc and fileBase64 required' }) };
  }
  // Normalize to pathname so keys match between upload and revert (e.g. /surfers.jpg)
  try {
    const u = new URL(originalSrc, 'https://x');
    originalSrc = u.pathname || originalSrc;
  } catch (_) {
    if (!originalSrc.startsWith('/')) originalSrc = '/' + originalSrc.replace(/^\/+/, '');
  }
  try {
    const dataUrl = `data:${contentType || 'image/jpeg'};base64,${fileBase64}`;
    const app = getAdmin();
    const db = app.firestore();
    const ref = db.doc('content/imageOverrides');
    const snap = await ref.get();
    const overrides = (snap.exists && snap.data().overrides) ? { ...snap.data().overrides } : {};
    overrides[originalSrc] = dataUrl;
    const now = new Date().toISOString();
    await ref.set(
      { overrides, updatedAt: now, updatedBy: 'admin' },
      { merge: true }
    );
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: dataUrl }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Save failed' }),
    };
  }
};
