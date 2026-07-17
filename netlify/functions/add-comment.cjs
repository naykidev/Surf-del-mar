const admin = require('firebase-admin');

function getAdmin() {
  if (!admin.apps.length) {
    const cred = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!cred) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(cred)) });
  }
  return admin;
}

// Public: add a comment to a shared memory.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { memoryId, text, name = '' } = body;
  if (!memoryId || typeof memoryId !== 'string')
    return { statusCode: 400, body: JSON.stringify({ error: 'memoryId required' }) };
  if (!text || typeof text !== 'string' || !text.trim())
    return { statusCode: 400, body: JSON.stringify({ error: 'text required' }) };

  try {
    const db = getAdmin().firestore();
    const memRef = db.collection('sharedMemories').doc(memoryId);
    if (!(await memRef.get()).exists)
      return { statusCode: 404, body: JSON.stringify({ error: 'Memory not found' }) };

    const ref = memRef.collection('comments').doc();
    await ref.set({
      text: String(text).trim().slice(0, 500),
      name: String(name).trim().slice(0, 100),
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ref.id }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Failed to save comment' }) };
  }
};
