/**
 * Admin memory moderation: approve (set approved: true) or delete.
 * Requires ADMIN_PASSWORD.
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
  const { action, memoryId } = body;
  if (!memoryId || typeof memoryId !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'memoryId required' }) };
  }
  if (action !== 'approve' && action !== 'hide' && action !== 'delete') {
    return { statusCode: 400, body: JSON.stringify({ error: 'action must be approve, hide, or delete' }) };
  }
  try {
    const app = getAdmin();
    const db = app.firestore();
    const ref = db.collection('sharedMemories').doc(memoryId);
    if (action === 'delete') {
      await ref.delete();
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, deleted: true }),
      };
    }
    await ref.set({ approved: action === 'approve' }, { merge: true });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Failed' }),
    };
  }
};
