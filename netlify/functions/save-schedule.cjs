const admin = require('firebase-admin');

const SCHEDULE_VERSION = 1.2;

function getAdmin() {
  if (!admin.apps.length) {
    const cred = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!cred) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(cred)) });
  }
  return admin;
}

/** Normalize legacy day-based schedule to flat events with id, date, startTime, endTime */
function legacyToEvents(legacySchedule) {
  if (!Array.isArray(legacySchedule)) return [];
  const events = [];
  const makeId = () => `ev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  for (const day of legacySchedule) {
    const dayStr = day.day || '';
    const dateMatch = dayStr.match(/(\d{1,2})\D*(\d{1,2})?(?:\D*(\d{4}))?/);
    const date = dateMatch
      ? `${dateMatch[3] || '2026'}-10-${String(parseInt(dateMatch[1], 10)).padStart(2, '0')}`
      : '2026-10-08';
    for (const ev of day.events || []) {
      const timeStr = ev.time || '';
      const parsed = parseTimeRange(timeStr);
      events.push({
        id: ev.id || makeId(),
        date,
        startTime: ev.startTime || parsed.startTime,
        endTime: ev.endTime || parsed.endTime,
        title: ev.title || '',
        venue: ev.venue || 'TBD',
        category: ev.category || 'General',
        description: ev.description || '',
        advocacy: !!ev.advocacy,
      });
    }
  }
  return events;
}

function parseTimeRange(s) {
  const def = { startTime: '09:00', endTime: '17:00' };
  if (!s || typeof s !== 'string') return def;
  const ampm = (t) => {
    const m = t.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2] || '0', 10);
    if ((m[3] || '').toLowerCase() === 'pm' && h < 12) h += 12;
    if ((m[3] || '').toLowerCase() === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  };
  const parts = s.split(/\s+to\s+|\s*[-–—]\s*|·/i).map((p) => p.trim()).filter(Boolean);
  const start = parts[0] ? ampm(parts[0]) : null;
  const end = parts[1] ? ampm(parts[1]) : null;
  return { startTime: start || def.startTime, endTime: end || def.endTime };
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

  let events = body.events;
  if (!Array.isArray(events)) {
    const legacy = body.schedule;
    if (!Array.isArray(legacy)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'schedule or events array required' }) };
    }
    events = legacyToEvents(legacy);
  }

  // Sanitize: Firestore does not accept undefined; use null or omit
  events = events.map((ev) => {
    const e = { ...ev };
    Object.keys(e).forEach((k) => {
      if (e[k] === undefined) e[k] = null;
    });
    return e;
  });

  const now = new Date().toISOString();
  const payload = {
    lastUpdated: now,
    updatedBy: 'admin',
    version: SCHEDULE_VERSION,
    events,
  };

  try {
    const app = getAdmin();
    const db = app.firestore();
    await db.doc('content/schedule').set(payload);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, lastUpdated: now }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Failed to save' }),
    };
  }
};
