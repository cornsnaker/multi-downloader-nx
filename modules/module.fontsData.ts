// fonts src
const root = 'https://static.crunchyroll.com/vilos-v2/web/vilos/assets/libass-fonts/';

// file list
const fontFamilies = {
	'Adobe Arabic': ['AdobeArabic-Bold.otf'],
	'Andale Mono': ['andalemo.ttf'],
	Arial: ['arial.ttf'],
	'Arial Black': ['ariblk.ttf'],
	'Arial Bold': ['arialbd.ttf'],
	'Arial Bold Italic': ['arialbi.ttf'],
	'Arial Italic': ['ariali.ttf'],
	'Arial Unicode MS': ['arialuni.ttf'],
	'Comic Sans MS': ['comic.ttf'],
	'Comic Sans MS Bold': ['comicbd.ttf'],
	'Courier New': ['cour.ttf'],
	'Courier New Bold': ['courbd.ttf'],
	'Courier New Bold Italic': ['courbi.ttf'],
	'Courier New Italic': ['couri.ttf'],
	'DejaVu LGC Sans Mono': ['DejaVuLGCSansMono.ttf'],
	'DejaVu LGC Sans Mono Bold': ['DejaVuLGCSansMono-Bold.ttf'],
	'DejaVu LGC Sans Mono Bold Oblique': ['DejaVuLGCSansMono-BoldOblique.ttf'],
	'DejaVu LGC Sans Mono Oblique': ['DejaVuLGCSansMono-Oblique.ttf'],
	'DejaVu Sans': ['DejaVuSans.ttf'],
	'DejaVu Sans Bold': ['DejaVuSans-Bold.ttf'],
	'DejaVu Sans Bold Oblique': ['DejaVuSans-BoldOblique.ttf'],
	'DejaVu Sans Condensed': ['DejaVuSansCondensed.ttf'],
	'DejaVu Sans Condensed Bold': ['DejaVuSansCondensed-Bold.ttf'],
	'DejaVu Sans Condensed Bold Oblique': ['DejaVuSansCondensed-BoldOblique.ttf'],
	'DejaVu Sans Condensed Oblique': ['DejaVuSansCondensed-Oblique.ttf'],
	'DejaVu Sans ExtraLight': ['DejaVuSans-ExtraLight.ttf'],
	'DejaVu Sans Mono': ['DejaVuSansMono.ttf'],
	'DejaVu Sans Mono Bold': ['DejaVuSansMono-Bold.ttf'],
	'DejaVu Sans Mono Bold Oblique': ['DejaVuSansMono-BoldOblique.ttf'],
	'DejaVu Sans Mono Oblique': ['DejaVuSansMono-Oblique.ttf'],
	'DejaVu Sans Oblique': ['DejaVuSans-Oblique.ttf'],
	Gautami: ['gautami.ttf'],
	Georgia: ['georgia.ttf'],
	'Georgia Bold': ['georgiab.ttf'],
	'Georgia Bold Italic': ['georgiaz.ttf'],
	'Georgia Italic': ['georgiai.ttf'],
	Impact: ['impact.ttf'],
	'Meera Inimai': ['MeeraInimai-Regular.ttf'],
	Mangal: ['MANGAL.TTF'],
	'Noto Sans Thai': ['NotoSansThai.ttf'],
	'Noto Sans Telugu': ['NotoSansTeluguVariable.ttf'],
	'Noto Sans Tamil': ['NotoSansTamilVariable.ttf'],
	Rubik: ['Rubik-Regular.ttf'],
	'Rubik Black': ['Rubik-Black.ttf'],
	'Rubik Black Italic': ['Rubik-BlackItalic.ttf'],
	'Rubik Bold': ['Rubik-Bold.ttf'],
	'Rubik Bold Italic': ['Rubik-BoldItalic.ttf'],
	'Rubik Italic': ['Rubik-Italic.ttf'],
	'Rubik Light': ['Rubik-Light.ttf'],
	'Rubik Light Italic': ['Rubik-LightItalic.ttf'],
	'Rubik Medium': ['Rubik-Medium.ttf'],
	'Rubik Medium Italic': ['Rubik-MediumItalic.ttf'],
	Tahoma: ['tahoma.ttf'],
	'Times New Roman': ['times.ttf'],
	'Times New Roman Bold': ['timesbd.ttf'],
	'Times New Roman Bold Italic': ['timesbi.ttf'],
	'Times New Roman Italic': ['timesi.ttf'],
	'Trebuchet MS': ['trebuc.ttf'],
	'Trebuchet MS Bold': ['trebucbd.ttf'],
	'Trebuchet MS Bold Italic': ['trebucbi.ttf'],
	'Trebuchet MS Italic': ['trebucit.ttf'],
	Verdana: ['verdana.ttf'],
	'Verdana Bold': ['verdanab.ttf'],
	'Verdana Bold Italic': ['verdanaz.ttf'],
	'Verdana Italic': ['verdanai.ttf'],
	Vrinda: ['vrinda.ttf'],
	'Vrinda Bold': ['vrindab.ttf'],
	Webdings: ['webdings.ttf']
};

// case-insensitive lookup table: "arial" -> "Arial"
const fontFamiliesLower: Record<string, keyof typeof fontFamilies> = Object.fromEntries(
	(Object.keys(fontFamilies) as (keyof typeof fontFamilies)[]).map((name) => [name.toLowerCase(), name])
);

// resolve a font name to its canonical fontFamilies key (or keep it as-is if unknown)
function canonicalFont(name: string): string {
	const clean = name.trim().replace(/^@/, '');
	return fontFamiliesLower[clean.toLowerCase()] ?? clean;
}

// add the bold / italic font file variants that libass will look for
function addVariants(out: Set<string>, family: string, bold: boolean, italic: boolean) {
	out.add(canonicalFont(family));
	const candidates: string[] = [];
	if (bold && italic) candidates.push(`${family} Bold Italic`, `${family} Bold Oblique`);
	if (bold) candidates.push(`${family} Bold`);
	if (italic) candidates.push(`${family} Italic`, `${family} Oblique`);
	for (const c of candidates) {
		const known = fontFamiliesLower[c.toLowerCase()];
		if (known) out.add(known);
	}
}

// ASS booleans are -1/1 (true) or 0 (false); \b also accepts weights like \b700
const isOn = (v: string | undefined) => v !== undefined && v.trim() !== '' && v.trim() !== '0';

// collect the fonts (including bold/italic variants) used by an ass string
function assFonts(ass: string) {
	const strings = ass.replace(/\r/g, '').split('\n');
	const fonts = new Set<string>();
	const styles: Record<string, { font: string; bold: boolean; italic: boolean }> = {};
	for (const s of strings) {
		if (s.match(/^Style:\s*/)) {
			// Style: Name, Fontname, Fontsize, Primary, Secondary, Outline, Back, Bold, Italic, ...
			const addStyle = s.replace(/^Style:\s*/, '').split(',');
			const style = { font: addStyle[1]?.trim() ?? '', bold: isOn(addStyle[7]), italic: isOn(addStyle[8]) };
			if (!style.font) continue;
			styles[addStyle[0].trim()] = style;
			addVariants(fonts, style.font, style.bold, style.italic);
		}
	}
	for (const s of strings) {
		if (!s.startsWith('Dialogue:')) continue;
		// Dialogue: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
		const parts = s.split(',');
		const text = parts.slice(9).join(',');
		if (!text.includes('{')) continue;
		const lineStyle = styles[parts[3]?.trim()];
		const lineFonts = [...text.matchAll(/\\fn([^\\}]+)/g)].map((m) => m[1].trim());
		const bold = /\\b[1-9]/.test(text);
		const italic = /\\i1/.test(text);
		if (lineStyle) lineFonts.push(lineStyle.font);
		for (const f of lineFonts) {
			addVariants(fonts, f, bold || !!lineStyle?.bold, italic || !!lineStyle?.italic);
		}
	}
	return [...fonts];
}

// font mime type (case-insensitive, e.g. MANGAL.TTF)
function fontMime(fontFile: string) {
	if (fontFile.match(/\.otf$/i)) {
		return 'application/vnd.ms-opentype';
	}
	if (fontFile.match(/\.ttf$/i)) {
		return 'application/x-truetype-font';
	}
	if (fontFile.match(/\.(ttc|otc)$/i)) {
		return 'font/collection';
	}
	return 'application/octet-stream';
}

export type AvailableFonts = keyof typeof fontFamilies;

// output
export { root, fontFamilies, assFonts, fontMime, canonicalFont };
