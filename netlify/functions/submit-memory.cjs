const admin = require('firebase-admin');

function getAdmin() {
  if (!admin.apps.length) {
    const cred = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!cred) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(cred)) });
  }
  return admin;
}

// Public submission: save a shared memory (photo + caption) to Firestore.
// No auth required; consider adding rate limiting or moderation in production.
exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }
  const { imageBase64, contentType, caption = '', name = '' } = body;
  if (!imageBase64) {
    return { statusCode: 400, body: JSON.stringify({ error: 'imageBase64 is required' }) };
  }
  // Firestore document limit 1MB; data URL = prefix + base64 (base64 ~4/3 of binary)
  const dataUrl = `data:${contentType || 'image/jpeg'};base64,${imageBase64}`;
  const approxDocSize = dataUrl.length + (String(caption).length + String(name).length) + 100;
  if (approxDocSize > 1024 * 1024) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Image is too large. Please choose a smaller photo and try again.' }),
    };
  }
  try {
    const app = getAdmin();
    const db = app.firestore();
    const ref = db.collection('sharedMemories').doc();
    await ref.set({
      imageUrl: dataUrl, // keep under 1MB total doc size
      caption: String(caption).trim().slice(0, 1000),
      name: String(name).trim().slice(0, 200),
      likes: 0,
      likedByIp: [],
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ref.id }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Save failed' }),
    };
  }
};
