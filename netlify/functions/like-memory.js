const admin = require('firebase-admin');

function getAdmin() {
  if (!admin.apps.length) {
    const cred = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!cred) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(cred)) });
  }
  return admin;
}

function getClientIp(headers) {
  // Netlify sets x-nf-client-connection-ip to the real client IP
  return (
    headers['x-nf-client-connection-ip'] ||
    headers['client-ip'] ||
    (headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    'unknown'
  );
}

// Public: increment like count for a shared memory, deduplicated by IP.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }
  const { memoryId } = body;
  if (!memoryId || typeof memoryId !== 'string') {
    return { statusCode: 400, body: JSON.stringify({ error: 'memoryId required' }) };
  }

  const ip = getClientIp(event.headers);

  try {
    const db = getAdmin().firestore();
    const ref = db.collection('sharedMemories').doc(memoryId);
    const snap = await ref.get();
    if (!snap.exists) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Memory not found' }) };
    }
    const data = snap.data();
    const current = data.likes ?? 0;
    const likedByIp = Array.isArray(data.likedByIp) ? data.likedByIp : [];

    if (ip !== 'unknown' && likedByIp.includes(ip)) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ likes: current, alreadyLiked: true }),
      };
    }

    const next = current + 1;
    await ref.update({
      likes: next,
      likedByIp: admin.firestore.FieldValue.arrayUnion(ip),
    });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ likes: next, alreadyLiked: false }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Like failed' }),
    };
  }
};
