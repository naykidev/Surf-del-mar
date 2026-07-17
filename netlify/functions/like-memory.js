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
  const h = headers || {};
  // Netlify lowercases header names; check a few common keys.
  return (
    h['x-nf-client-connection-ip'] ||
    h['X-NF-Client-Connection-Ip'] ||
    h['client-ip'] ||
    (h['x-forwarded-for'] || h['X-Forwarded-For'] || '').split(',')[0].trim() ||
    'unknown'
  );
}

// Public: increment like count for a shared memory, deduplicated by IP.
// Uses a transaction so missing `likes` on older docs still works.
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }
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

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        const err = new Error('Memory not found');
        err.code = 'NOT_FOUND';
        throw err;
      }
      const data = snap.data() || {};
      const current = typeof data.likes === 'number' ? data.likes : Number(data.likes) || 0;
      const likedByIp = Array.isArray(data.likedByIp) ? data.likedByIp : [];

      if (ip !== 'unknown' && likedByIp.includes(ip)) {
        return { likes: current, alreadyLiked: true };
      }

      const next = current + 1;
      tx.update(ref, {
        likes: next,
        likedByIp: admin.firestore.FieldValue.arrayUnion(ip),
      });
      return { likes: next, alreadyLiked: false };
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error(err);
    if (err && err.code === 'NOT_FOUND') {
      return { statusCode: 404, body: JSON.stringify({ error: 'Memory not found' }) };
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Like failed' }),
    };
  }
};
