/**
 * Find the sign / on-screen text lines in an ASS file converted from HIDIVE VTT.
 *
 * HIDIVE puts dialogue and signs in one subtitle file. A line is treated as a sign when
 * - it is positioned or moved ({\pos}, {\move}) or aligned somewhere else than bottom center ({\an1-9} except 2), or
 * - its style uses a different font, font size or alignment than the main dialogue style
 *   (the style used by most lines). Bold / italic / colour differences alone do not count,
 *   since those are used for normal dialogue (thoughts, off-screen voices, ...).
 */

type StyleInfo = { font: string; size: string; align: string };

export type SignsResult = {
	/** the input ass with the Name field of sign lines set to "Sign" */
	ass: string;
	/** ass file containing only the sign lines (undefined when no signs were found) */
	signsAss?: string;
	/** number of sign lines */
	count: number;
	/** styles that were classified as sign styles */
	signStyles: string[];
	/** main dialogue style */
	dialogueStyle?: string;
};

const signature = (s: StyleInfo) => `${s.font.trim().toLowerCase()}|${parseFloat(s.size)}|${s.align.trim()}`;

export function findSigns(ass: string): SignsResult {
	const nl = ass.includes('\r\n') ? '\r\n' : '\n';
	const lines = ass.split(/\r?\n/);
	const styles: Record<string, StyleInfo> = {};
	const usage: Record<string, number> = {};

	for (const l of lines) {
		if (l.startsWith('Style:')) {
			// Name, Fontname, Fontsize, ..., Alignment (index 18), ...
			const p = l.replace(/^Style:\s*/, '').split(',');
			styles[p[0].trim()] = { font: p[1] ?? '', size: p[2] ?? '', align: p[18] ?? '2' };
		} else if (l.startsWith('Dialogue:')) {
			const style = l.split(',')[3]?.trim();
			usage[style] = (usage[style] ?? 0) + 1;
		}
	}

	const dialogueStyle = Object.entries(usage).sort((a, b) => b[1] - a[1])[0]?.[0];
	const main = dialogueStyle ? styles[dialogueStyle] : undefined;
	const signStyles = Object.keys(usage).filter((name) => {
		const s = styles[name];
		if (!s || !main || name === dialogueStyle) return false;
		return signature(s) !== signature(main) || s.align.trim() !== '2';
	});
	if (main && main.align.trim() !== '2' && dialogueStyle) signStyles.push(dialogueStyle);

	const isSignText = (text: string) => /\\(pos|move)\(/.test(text) || /\\an[13-9]/.test(text);

	let count = 0;
	const signLines: string[] = [];
	const out = lines.map((l) => {
		if (!l.startsWith('Dialogue:')) return l;
		const p = l.split(',');
		const text = p.slice(9).join(',');
		if (!signStyles.includes(p[3]?.trim()) && !isSignText(text)) return l;
		count++;
		if (!p[4]?.trim()) p[4] = 'Sign';
		const tagged = p.join(',');
		signLines.push(tagged);
		return tagged;
	});

	let signsAss: string | undefined;
	if (count > 0) {
		const eventsAt = out.findIndex((l) => l.trim() === '[Events]');
		const formatAt = out.findIndex((l, i) => i > eventsAt && l.startsWith('Format:'));
		if (eventsAt !== -1 && formatAt !== -1) {
			signsAss = [...out.slice(0, formatAt + 1), ...signLines].join(nl) + nl;
		}
	}

	return { ass: out.join(nl), signsAss, count, signStyles, dialogueStyle };
}
