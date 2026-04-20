/**
 * POST { password, fileBase64, contentType? }
 * Extracts text from PDF (pdf-parse), then parses rows { date, time, event, location }.
 * If OPENAI_API_KEY is set, uses GPT-4o-mini for structured extraction; otherwise regex heuristics.
 */
const pdfParse = require('pdf-parse');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_BYTES = 12 * 1024 * 1024;

function parseHeuristic(text) {
  const rows = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, ' ').trim())
    .filter(Boolean);

  let currentDate = '';

  const MONTH_MAP = new Map([
    [/jan(?:uary)?\.?/i, '01'],
    [/feb(?:ruary)?\.?/i, '02'],
    [/mar(?:ch)?\.?/i, '03'],
    [/apr(?:il)?\.?/i, '04'],
    [/may\.?/i, '05'],
    [/jun(?:e)?\.?/i, '06'],
    [/jul(?:y)?\.?/i, '07'],
    [/aug(?:ust)?\.?/i, '08'],
    [/sep(?:t(?:ember)?)?\.?/i, '09'],
    [/oct(?:ober)?\.?/i, '10'],
    [/nov(?:ember)?\.?/i, '11'],
    [/dec(?:ember)?\.?/i, '12'],
  ]);

  function extractDateFromLine(line) {
    let m = line.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = line.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      const mo = String(parseInt(m[1], 10)).padStart(2, '0');
      const da = String(parseInt(m[2], 10)).padStart(2, '0');
      let y = m[3];
      if (y.length === 2) y = parseInt(y, 10) < 50 ? `20${y}` : `19${y}`;
      return `${y}-${mo}-${da}`;
    }
    for (const [re, mm] of MONTH_MAP) {
      const mmMatch = line.match(
        new RegExp(re.source + '\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?', 'i')
      );
      if (mmMatch) {
        const day = String(parseInt(mmMatch[1], 10)).padStart(2, '0');
        const year = mmMatch[2] || '2026';
        return `${year}-${mm}-${day}`;
      }
    }
    m = line.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*,?\s*(.+)/i);
    if (m) {
      const inner = extractDateFromLine(m[1]);
      if (inner) return inner;
    }
    return '';
  }

  function splitTitleLocation(rest) {
    const seps = [' · ', ' | ', ' — ', ' – ', ' @ ', ' // '];
    for (const s of seps) {
      const i = rest.lastIndexOf(s);
      if (i > 4) {
        return {
          event: rest.slice(0, i).trim(),
          location: rest.slice(i + s.length).trim(),
        };
      }
    }
    return { event: rest.trim(), location: 'TBD' };
  }

  const timeRangeRe =
    /^((?:\d{1,2}(?::\d{2})?)\s*(?:am|pm|a\.m\.|p\.m\.))\s*[–—\-]\s*((?:\d{1,2}(?::\d{2})?)\s*(?:am|pm|a\.m\.|p\.m\.))\s+(.+)$/i;
  const time24RangeRe = /^(\d{1,2}:\d{2})\s*[–—\-]\s*(\d{1,2}:\d{2})\s+(.+)$/;
  const singleTimeRe = /^((?:\d{1,2}(?::\d{2})?)\s*(?:am|pm|a\.m\.|p\.m\.))\s+(.+)$/i;

  for (const line of lines) {
    if (
      /^(page|surf del mar|schedule|festival|table of contents)/i.test(line) ||
      /^\d+\s*$/.test(line)
    ) {
      continue;
    }

    const maybeDate = extractDateFromLine(line);
    if (
      maybeDate &&
      (line.length < 80 || /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|Oct(?:ober)?|November|December/i.test(line))
    ) {
      if (!timeRangeRe.test(line) && !time24RangeRe.test(line) && !singleTimeRe.test(line)) {
        currentDate = maybeDate;
        continue;
      }
    }

    const colParts = line.split(/\t|(?: {2,})/).map((p) => p.trim()).filter(Boolean);
    if (colParts.length >= 4 && /am|pm|\d{1,2}:\d{2}/i.test(colParts[1])) {
      rows.push({
        date: extractDateFromLine(colParts[0]) || currentDate || '2026-10-08',
        time: colParts[1],
        event: colParts[2],
        location: colParts.slice(3).join(' '),
      });
      continue;
    }
    if (colParts.length === 3 && /am|pm|\d{1,2}:\d{2}/i.test(colParts[0])) {
      rows.push({
        date: currentDate || '2026-10-08',
        time: colParts[0],
        event: colParts[1],
        location: colParts[2],
      });
      continue;
    }

    let m = line.match(timeRangeRe);
    if (m) {
      const timeStr = `${m[1].replace(/\s+/g, ' ').trim()} - ${m[2].replace(/\s+/g, ' ').trim()}`;
      const { event, location } = splitTitleLocation(m[3]);
      rows.push({
        date: currentDate || '2026-10-08',
        time: timeStr,
        event,
        location,
      });
      continue;
    }

    m = line.match(time24RangeRe);
    if (m) {
      const { event, location } = splitTitleLocation(m[3]);
      rows.push({
        date: currentDate || '2026-10-08',
        time: `${m[1]} - ${m[2]}`,
        event,
        location,
      });
      continue;
    }

    m = line.match(singleTimeRe);
    if (m && currentDate) {
      const { event, location } = splitTitleLocation(m[2]);
      rows.push({
        date: currentDate,
        time: m[1].replace(/\s+/g, ' ').trim(),
        event,
        location,
      });
    }
  }

  return rows.filter((r) => r.event && r.event.length > 1);
}

async function parseWithOpenAI(text) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');

  const body = {
    model: process.env.OPENAI_SCHEDULE_MODEL || 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You extract festival/event schedule rows from noisy PDF text. Return ONLY valid JSON: {"rows":[{"date":"string","time":"string","event":"string","location":"string"}]}. Each row is one scheduled item. Use TBD for missing location. Use ISO date YYYY-MM-DD when possible; else keep the date phrase from the document. For time use a range like "10:00 AM - 2:00 PM" or a single time. Skip headers, footers, page numbers, and blank lines.',
      },
      {
        role: 'user',
        content: text.slice(0, 120000),
      },
    ],
    temperature: 0.1,
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('OpenAI returned no content');
  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
  return rows.map((r) => ({
    date: String(r.date || '').trim() || '2026-10-08',
    time: String(r.time || '').trim() || '9:00 AM',
    event: String(r.event || '').trim() || 'Untitled',
    location: String(r.location || '').trim() || 'TBD',
  }));
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const expectedPassword = process.env.ADMIN_PASSWORD || process.env.admin_password;
  if (!expectedPassword) {
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'ADMIN_PASSWORD is not set.' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON' }),
    };
  }

  if (body.password !== expectedPassword) {
    return {
      statusCode: 403,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  const b64 = body.fileBase64;
  if (!b64 || typeof b64 !== 'string') {
    return {
      statusCode: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'fileBase64 required' }),
    };
  }

  let buffer;
  try {
    buffer = Buffer.from(b64, 'base64');
  } catch {
    return {
      statusCode: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid base64' }),
    };
  }

  if (buffer.length > MAX_BYTES) {
    return {
      statusCode: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `PDF too large (max ${MAX_BYTES} bytes).` }),
    };
  }

  let text;
  try {
    const pdfData = await pdfParse(buffer);
    text = typeof pdfData.text === 'string' ? pdfData.text : '';
  } catch (err) {
    console.error(err);
    return {
      statusCode: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Could not read PDF' }),
    };
  }

  if (!text.trim()) {
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        rows: [],
        parser: 'none',
        warning: 'No text found in PDF (may be image-only). Try OCR or paste schedule as CSV.',
        rawTextPreview: '',
      }),
    };
  }

  let rows = [];
  let parser = 'regex';

  if (process.env.OPENAI_API_KEY) {
    try {
      rows = await parseWithOpenAI(text);
      parser = 'openai';
    } catch (e) {
      console.warn('OpenAI parse failed, using regex:', e);
      rows = parseHeuristic(text);
      parser = 'regex';
    }
  } else {
    rows = parseHeuristic(text);
  }

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      rows,
      parser,
      rawTextPreview: text.slice(0, 2500),
    }),
  };
};
