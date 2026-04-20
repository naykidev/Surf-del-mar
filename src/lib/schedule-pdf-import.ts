/**
 * Map PDF parser rows → Firestore schedule events (same shape as manual CSV import).
 */
import type { ScheduleEvent } from './firebase';

export interface ParsedScheduleRow {
	date: string;
	time: string;
	event: string;
	location: string;
}

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

/** Normalize to YYYY-MM-DD; defaults to Surf Del Mar festival window Oct 8–11 2026 when ambiguous. */
export function normalizeScheduleDate(raw: string): string {
	const t = (raw || '').trim();
	if (!t) return '2026-10-08';
	const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
	const slash = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
	if (slash) {
		const mo = pad2(parseInt(slash[1], 10));
		const da = pad2(parseInt(slash[2], 10));
		let y = slash[3];
		if (y.length === 2) y = parseInt(y, 10) < 50 ? `20${y}` : `19${y}`;
		return `${y}-${mo}-${da}`;
	}
	const monthDay = t.match(
		/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/i
	);
	if (monthDay) {
		const months: Record<string, string> = {
			jan: '01',
			feb: '02',
			mar: '03',
			apr: '04',
			may: '05',
			jun: '06',
			jul: '07',
			aug: '08',
			sep: '09',
			oct: '10',
			nov: '11',
			dec: '12',
		};
		const mk = monthDay[1].toLowerCase().slice(0, 3);
		const mm = months[mk];
		if (mm) {
			const day = pad2(parseInt(monthDay[2], 10));
			const year = monthDay[3] || '2026';
			return `${year}-${mm}-${day}`;
		}
	}
	return '2026-10-08';
}

function parseAmPmToken(tok: string): { h: number; m: number } | null {
	const t = tok.trim().replace(/\./g, '').toLowerCase();
	const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
	if (!m) return null;
	let h = parseInt(m[1], 10);
	const min = parseInt(m[2] || '0', 10);
	const ap = m[3];
	if (ap === 'pm' && h < 12) h += 12;
	if (ap === 'am' && h === 12) h = 0;
	if (!ap && h < 24 && !t.includes(':')) {
		// bare hour without am/pm — treat as 24h if <= 23 else assume morning
	}
	return { h: h % 24, m: min % 60 };
}

function parse24(tok: string): { h: number; m: number } | null {
	const m = tok.trim().match(/^(\d{1,2}):(\d{2})$/);
	if (!m) return null;
	return { h: parseInt(m[1], 10) % 24, m: parseInt(m[2], 10) % 60 };
}

/** Turn a freeform time cell into start/end HH:MM (24h). */
export function parseTimeRangeToStartEnd(timeStr: string): { startTime: string; endTime: string } {
	const s = (timeStr || '').trim();
	const def = { startTime: '10:00', endTime: '12:00' };
	if (!s) return def;

	const rangeAm = s.match(
		/(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.))\s*[–—\-]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.))/i
	);
	if (rangeAm) {
		const a = parseAmPmToken(rangeAm[1]);
		const b = parseAmPmToken(rangeAm[2]);
		if (a && b) {
			return {
				startTime: `${pad2(a.h)}:${pad2(a.m)}`,
				endTime: `${pad2(b.h)}:${pad2(b.m)}`,
			};
		}
	}

	const range24 = s.match(/(\d{1,2}:\d{2})\s*[–—\-]\s*(\d{1,2}:\d{2})/);
	if (range24) {
		const a = parse24(range24[1]);
		const b = parse24(range24[2]);
		if (a && b) {
			return {
				startTime: `${pad2(a.h)}:${pad2(a.m)}`,
				endTime: `${pad2(b.h)}:${pad2(b.m)}`,
			};
		}
	}

	const single = s.match(/^(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.))/i);
	if (single) {
		const p = parseAmPmToken(single[1]);
		if (p) {
			const endH = (p.h + 1) % 24;
			return {
				startTime: `${pad2(p.h)}:${pad2(p.m)}`,
				endTime: `${pad2(endH)}:${pad2(p.m)}`,
			};
		}
	}

	const single24 = s.match(/^(\d{1,2}:\d{2})$/);
	if (single24) {
		const p = parse24(single24[1]);
		if (p) {
			const endH = (p.h + 1) % 24;
			return {
				startTime: `${pad2(p.h)}:${pad2(p.m)}`,
				endTime: `${pad2(endH)}:${pad2(p.m)}`,
			};
		}
	}

	return def;
}

export function mapParsedRowsToScheduleEvents(
	rows: ParsedScheduleRow[],
	makeId: () => string,
	defaultCategory = 'General'
): ScheduleEvent[] {
	return rows.map((r) => {
		const { startTime, endTime } = parseTimeRangeToStartEnd(r.time);
		return {
			id: makeId(),
			date: normalizeScheduleDate(r.date),
			startTime,
			endTime,
			title: (r.event || 'Untitled').trim(),
			venue: (r.location || 'TBD').trim(),
			category: defaultCategory,
			description: '',
			advocacy: false,
		};
	});
}
