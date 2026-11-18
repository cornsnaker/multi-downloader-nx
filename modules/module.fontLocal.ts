import fs from 'fs';
import path from 'path';
import { console } from './log';
import { fontFamilies } from './module.fontsData';

/**
 * Local font support.
 *
 * Services like HIDIVE reference fonts (e.g. "Swis721 BT", "Aldine721 BT") that are not on the
 * Crunchyroll font CDN. Users can drop the real font files into the fonts dir; this module reads
 * the family names from the font files so they can be matched and attached when muxing.
 * Fonts that are neither downloadable nor available locally can be substituted with a close match.
 */

const fontExt = /\.(ttf|otf|ttc|otc)$/i;

// Closest freely available (Crunchyroll CDN) match for fonts used by other services.
// Swis721 BT is Bitstream's Helvetica clone, Aldine721 BT is Bitstream's Bembo clone.
const fontSubstitutes: Record<string, keyof typeof fontFamilies> = {
	'swis721 bt': 'Arial',
	'swiss 721': 'Arial',
	helvetica: 'Arial',
	'helvetica neue': 'Arial',
	'aldine721 bt': 'Times New Roman',
	'aldine 721': 'Times New Roman',
	bembo: 'Times New Roman',
	'sans-serif': 'Arial',
	serif: 'Times New Roman',
	monospace: 'Courier New'
};

const knownFamilies = new Set(Object.keys(fontFamilies).map((f) => f.toLowerCase()));

function decodeName(buf: Buffer, platformID: number, start: number, length: number) {
	if (start + length > buf.length) return '';
	const raw = buf.subarray(start, start + length);
	if (platformID === 0 || platformID === 3) {
		// UTF-16BE
		let out = '';
		for (let i = 0; i + 1 < raw.length; i += 2) out += String.fromCharCode(raw.readUInt16BE(i));
		return out;
	}
	return raw.toString('latin1');
}

// Read family (1), full (4) and typographic family (16) names from one sfnt font at `offset`.
function readSfntNames(buf: Buffer, offset: number): string[] {
	const names = new Set<string>();
	const numTables = buf.readUInt16BE(offset + 4);
	for (let t = 0; t < numTables; t++) {
		const rec = offset + 12 + t * 16;
		if (buf.toString('latin1', rec, rec + 4) !== 'name') continue;
		const tableOffset = buf.readUInt32BE(rec + 8);
		const count = buf.readUInt16BE(tableOffset + 2);
		const stringOffset = tableOffset + buf.readUInt16BE(tableOffset + 4);
		for (let i = 0; i < count; i++) {
			const r = tableOffset + 6 + i * 12;
			const platformID = buf.readUInt16BE(r);
			const nameID = buf.readUInt16BE(r + 6);
			if (nameID !== 1 && nameID !== 4 && nameID !== 16) continue;
			const name = decodeName(buf, platformID, stringOffset + buf.readUInt16BE(r + 10), buf.readUInt16BE(r + 8)).trim();
			if (name) names.add(name);
		}
	}
	return [...names];
}

/** Return the font names contained in a font file (empty if it cannot be parsed). */
export function readFontNames(file: string): string[] {
	try {
		const buf = fs.readFileSync(file);
		if (buf.toString('latin1', 0, 4) === 'ttcf') {
			const numFonts = buf.readUInt32BE(8);
			const names: string[] = [];
			for (let i = 0; i < numFonts; i++) names.push(...readSfntNames(buf, buf.readUInt32BE(12 + i * 4)));
			return [...new Set(names)];
		}
		return readSfntNames(buf, 0);
	} catch {
		return [];
	}
}

const cache: Record<string, Record<string, string[]>> = {};

/**
 * Map of lowercase font name -> font file names in fontsDir.
 * Every face of a family is listed under the family name, so bold/italic faces get attached too.
 */
export function scanLocalFonts(fontsDir: string): Record<string, string[]> {
	if (cache[fontsDir]) return cache[fontsDir];
	const map: Record<string, string[]> = {};
	if (fs.existsSync(fontsDir)) {
		for (const file of fs.readdirSync(fontsDir)) {
			if (!fontExt.test(file)) continue;
			for (const name of readFontNames(path.join(fontsDir, file))) {
				const key = name.toLowerCase();
				map[key] = [...new Set([...(map[key] ?? []), file])];
			}
		}
	}
	cache[fontsDir] = map;
	return map;
}

/** Forget the cached scan (call after adding files to fontsDir). */
export function resetLocalFontCache() {
	for (const k of Object.keys(cache)) delete cache[k];
}

/**
 * Replace fonts that are neither on the Crunchyroll CDN nor present in fontsDir with a close match,
 * in both Style lines and inline \fn tags. Returns the new ass text.
 */
export function substituteMissingFonts(ass: string, fontsDir: string): string {
	const local = scanLocalFonts(fontsDir);
	const replaced: Record<string, string> = {};
	const resolve = (name: string) => {
		const key = name.trim().toLowerCase();
		if (!key || knownFamilies.has(key) || local[key]) return name;
		const sub = fontSubstitutes[key] ?? 'Arial';
		replaced[name.trim()] = sub;
		return sub;
	};
	const out = ass
		.replace(/^(Style:\s*[^,]*,)([^,]*)/gm, (_m, head: string, font: string) => head + resolve(font))
		.replace(/\\fn([^\\}]+)/g, (_m, font: string) => '\\fn' + resolve(font));
	for (const [from, to] of Object.entries(replaced)) {
		console.warn(`Font "${from}" is not available, using "${to}" instead. Put the "${from}" font files in the fonts folder to keep the original.`);
	}
	return out;
}
