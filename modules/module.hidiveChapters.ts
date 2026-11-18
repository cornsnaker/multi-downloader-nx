/**
 * Build OGM style chapters (CHAPTER01=00:00:00.000 / CHAPTER01NAME=Episode) from the
 * `skipMarkers` array of the HIDIVE playback response.
 *
 * The marker format is not documented, so fields are matched by name (start/begin, end/stop,
 * duration, type/name/label) in seconds, milliseconds or hh:mm:ss. Markers without a known type
 * are named by their position (start of episode = Intro, last quarter = Credits).
 */

type Marker = { name: string; start: number; end?: number; raw: unknown };

const startKey = /start|begin|^from$|^in$|timein/i;
const endKey = /end|stop|finish|^to$|^out$|timeout/i;
const lengthKey = /duration|length/i;
const typeKey = /type|kind|name|label|title|category/i;

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

// flatten one level of nesting: { range: { start: 1 } } -> { 'range.start': 1 }
function flatten(obj: Record<string, unknown>): [string, unknown][] {
	const out: [string, unknown][] = [];
	for (const [k, v] of Object.entries(obj)) {
		if (v && typeof v === 'object' && !Array.isArray(v)) {
			for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) out.push([`${k}.${k2}`, v2]);
		} else {
			out.push([k, v]);
		}
	}
	return out;
}

const lastPart = (key: string) => key.split('.').pop() ?? key;

function chapterName(raw: string): string | undefined {
	const t = raw.toLowerCase().replace(/[^a-z]/g, '');
	if (/intro|opening|^op$/.test(t)) return 'Intro';
	if (/credit|outro|ending|closing|^ed$/.test(t)) return 'Credits';
	if (/recap/.test(t)) return 'Recap';
	if (/preview|nextepisode|next/.test(t)) return 'Preview';
	return undefined;
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
	// accept an array of markers or an object map like { intro: { start, end } }
	let items: [string, unknown][] = [];
	if (Array.isArray(skipMarkers)) items = skipMarkers.map((m) => ['', m]);
	else if (skipMarkers && typeof skipMarkers === 'object') items = Object.entries(skipMarkers as Record<string, unknown>);

	const markers: Marker[] = [];
	for (const [mapKey, item] of items) {
		if (!item || typeof item !== 'object') continue;
		const fields = flatten(item as Record<string, unknown>);
		const num = (rx: RegExp, exclude?: RegExp) => {
			for (const [k, v] of fields) {
				const key = lastPart(k);
				if (!rx.test(key) || (exclude && exclude.test(key))) continue;
				const value = toNumber(v);
				if (value !== undefined) return { key, value };
			}
			return undefined;
		};
		const start = num(startKey);
		if (!start) continue;
		const end = num(endKey, startKey);
		const length = num(lengthKey);

		// name: a type-like field, any string value that names a known chapter, or the map key
		let name: string | undefined;
		for (const [k, v] of fields) if (typeof v === 'string' && typeKey.test(lastPart(k))) name ??= chapterName(v);
		for (const [, v] of fields) if (typeof v === 'string') name ??= chapterName(v);
		if (mapKey) name ??= chapterName(mapKey);

		// unit: explicit *Ms keys are milliseconds, otherwise values far past the episode length are too
		const looksMs = (key: string, value: number) => /ms$|millis/i.test(key) || (durationSec ? value > durationSec * 1.5 && value / 1000 <= durationSec * 1.5 : value > 36000);
		const toSec = (p: { key: string; value: number }) => (looksMs(p.key, p.value) ? p.value / 1000 : p.value);
		const startSec = toSec(start);
		const endSec = end ? toSec(end) : length ? startSec + toSec(length) : undefined;

		// no recognisable type: guess from the position in the episode
		if (!name) {
			if (durationSec && startSec >= durationSec * 0.75) name = 'Credits';
			else if (durationSec && startSec <= durationSec * 0.25) name = 'Intro';
			else name = 'Chapter';
		}
		markers.push({ name, start: startSec, end: endSec, raw: item });
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
