import fs from 'fs';
import path from 'path';
import { console } from './log';
import { api } from './module.api-urls';
import { fontFamilies, root } from './module.fontsData';
import { Req } from './module.fetch';

type FontName = keyof typeof fontFamilies;

/**
 * Map font family names (as returned by assFonts) to font file names.
 * Unknown families are ignored, since there is nothing to download for them.
 */
export function fontFilesFor(names: string[]): string[] {
	const files: string[] = [];
	for (const name of names) {
		const list = fontFamilies[name as FontName];
		if (list) files.push(...list);
	}
	return [...new Set(files)];
}

/**
 * Download font files from the Crunchyroll libass font CDN into fontsDir.
 * Files that already exist (and are not empty) are skipped.
 * Returns the list of files that are available locally afterwards.
 */
export async function downloadFonts(fontsDir: string, files: string[], req: Req = new Req(), quiet = false): Promise<string[]> {
	if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true });
	const available: string[] = [];
	for (const f of files) {
		const fontLoc = path.join(fontsDir, f);
		if (fs.existsSync(fontLoc) && fs.statSync(fontLoc).size != 0) {
			if (!quiet) console.info(`${f} already downloaded!`);
			available.push(f);
			continue;
		}
		if (fs.existsSync(fontLoc)) fs.rmSync(fontLoc, { force: true });
		const getFont = await req.getData(root + f, { headers: api.crunchyDefHeader });
		if (getFont.ok && getFont.res) {
			fs.writeFileSync(fontLoc, Buffer.from(await getFont.res.arrayBuffer()));
			console.info(`Downloaded font: ${f}`);
			available.push(f);
		} else {
			console.warn(`Failed to download font: ${f}`);
		}
	}
	return available;
}

/** Download every font known to fontFamilies. */
export async function downloadAllFonts(fontsDir: string, req: Req = new Req()) {
	console.info('Downloading fonts...');
	await downloadFonts(fontsDir, fontFilesFor(Object.keys(fontFamilies)), req);
	console.info('All required fonts downloaded!');
}
