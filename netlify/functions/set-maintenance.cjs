/**
 * Set maintenance mode on/off. Requires ADMIN_PASSWORD.
 * When enabled, the site redirects to /maintenance/ (client reads from Firestore).
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
  const enabled = !!body.enabled;
  try {
    const app = getAdmin();
    const db = app.firestore();
    const now = new Date().toISOString();
    await db.doc('content/maintenanceMode').set(
      { enabled, updatedAt: now, updatedBy: 'admin' },
      { merge: true }
    );
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, enabled }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Failed to update' }),
    };
  }
};
