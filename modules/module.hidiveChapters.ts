/**
 * Build OGM style chapters (CHAPTER01=00:00:00.000 / CHAPTER01NAME=Episode) from the
 * `skipMarkers` array of the HIDIVE playback response.
 *
 * The marker format is not documented, so the parser accepts the common field names
 * (type/name, startTime/start/startMs, endTime/end/endMs) in seconds, milliseconds or hh:mm:ss.
 */

type Marker = { name: string; start: number; end?: number };

const typeKeys = ['type', 'markerType', 'skipType', 'kind', 'category', 'name', 'label', 'title'];
const startKeys = ['startTime', 'start', 'startMs', 'startTimeMs', 'startOffset', 'begin', 'from', 'in', 'timeIn'];
const endKeys = ['endTime', 'end', 'endMs', 'endTimeMs', 'endOffset', 'stop', 'to', 'out', 'timeOut'];

function toNumber(v: unknown): number | undefined {
	if (typeof v === 'number' && Number.isFinite(v)) return v;
	if (typeof v !== 'string' || v.trim() === '') return undefined;
	const s = v.trim();
	if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
	// hh:mm:ss(.ms) or mm:ss(.ms) -> seconds
	const m = s.match(/^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/);
	if (m) return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
	return undefined;
}

function pick(obj: Record<string, unknown>, keys: string[]): { key: string; value: number } | undefined {
	for (const key of keys) {
		const value = toNumber(obj[key]);
		if (value !== undefined) return { key, value };
	}
	return undefined;
}

function chapterName(raw: string): string {
	const t = raw.toLowerCase().replace(/[^a-z]/g, '');
	if (/intro|opening|^op$|openingcredits/.test(t)) return 'Intro';
	if (/credit|outro|ending|^ed$|endcredits/.test(t)) return 'Credits';
	if (/recap/.test(t)) return 'Recap';
	if (/preview|nextepisode/.test(t)) return 'Preview';
	if (!raw) return 'Chapter';
	return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function formatTime(sec: number): string {
	const ms = Math.round(sec * 1000);
	const h = Math.floor(ms / 3600000);
	const m = Math.floor((ms % 3600000) / 60000);
	const s = Math.floor((ms % 60000) / 1000);
	const r = ms % 1000;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(r).padStart(3, '0')}`;
}

/** Parse skip markers into chapters sorted by start time (seconds). */
export function parseSkipMarkers(skipMarkers: unknown, durationSec?: number): Marker[] {
	if (!Array.isArray(skipMarkers)) return [];
	const markers: Marker[] = [];
	for (const item of skipMarkers) {
		if (!item || typeof item !== 'object') continue;
		const obj = item as Record<string, unknown>;
		const start = pick(obj, startKeys);
		if (!start) continue;
		const end = pick(obj, endKeys);
		const typeKey = typeKeys.find((k) => typeof obj[k] === 'string' && (obj[k] as string).trim() !== '');
		// decide the unit: explicit *Ms keys are milliseconds, otherwise values far past the episode length are too
		const looksMs = (key: string, value: number) => /ms$/i.test(key) || (durationSec ? value > durationSec * 1.5 && value / 1000 <= durationSec * 1.5 : value > 36000);
		const toSec = (p: { key: string; value: number }) => (looksMs(p.key, p.value) ? p.value / 1000 : p.value);
		markers.push({
			name: chapterName(typeKey ? (obj[typeKey] as string).trim() : ''),
			start: toSec(start),
			end: end ? toSec(end) : undefined
		});
	}
	return markers.filter((m) => m.start >= 0 && (m.end === undefined || m.end > m.start)).sort((a, b) => a.start - b.start);
}

/** Build the OGM chapter file lines, filling the gaps between markers with "Episode" chapters. */
export function buildHidiveChapters(skipMarkers: unknown, durationSec?: number): string[] {
	const markers = parseSkipMarkers(skipMarkers, durationSec);
	if (markers.length === 0) return [];
	const points: { time: number; name: string }[] = [];
	const add = (time: number, name: string) => {
		const last = points[points.length - 1];
		if (last && Math.abs(last.time - time) < 1) {
			// two chapters at (almost) the same time: the marker wins over the "Episode" filler
			if (name !== 'Episode') last.name = name;
			return;
		}
		points.push({ time, name });
	};
	if (markers[0].start > 1) add(0, 'Episode');
	markers.forEach((m, i) => {
		add(m.start, m.name);
		const next = markers[i + 1];
		const endsBeforeVideo = durationSec === undefined || (m.end !== undefined && m.end < durationSec - 3);
		if (m.end !== undefined && endsBeforeVideo && (!next || next.start - m.end >= 1)) add(m.end, 'Episode');
	});
	const lines: string[] = [];
	points.forEach((p, i) => {
		const n = String(i + 1).padStart(2, '0');
		lines.push(`CHAPTER${n}=${formatTime(p.time)}`, `CHAPTER${n}NAME=${p.name}`);
	});
	return lines;
}
