export type AssFixOptions = {
	playResX: number;
	playResY: number;
	layoutResFix?: boolean;
	scaledBorderAndShadowFix?: boolean;
	scaledBorderAndShadow?: 'yes' | 'no' | string;
	originalScriptFix?: boolean;
	subtitleTimestampFix?: boolean;
	durationMs?: number;
};

/**
 * Generic ASS clean-up shared by the services (originally inline in crunchy.ts).
 * - LayoutResX/Y so libass scales borders, blur and fonts like Crunchyroll's player
 * - ScaledBorderAndShadow normalisation
 * - Original Script URL removal (VLC fails to load fonts when the URL does not return 200)
 * - comment, Aegisub project garbage and YCbCr Matrix removal
 * - optional clamping of dialogue lines that run past the video length
 */
export function applyAssFixes(sBody: string, options: AssFixOptions): string {
	const { playResX, playResY } = options;

	// LayoutRes Fix
	if (options.layoutResFix && !sBody.includes('LayoutResX') && !sBody.includes('LayoutResY')) {
		sBody = sBody.replace(/^(PlayResY:\s*\d+)/m, `$1\nLayoutResX: ${playResX}\nLayoutResY: ${playResY}`);
	}

	// ScaleBorderAndShadow Fix (True and doesn't exist)
	if (options.scaledBorderAndShadowFix && !sBody.includes('ScaledBorderAndShadow')) {
		sBody = sBody.replace(/^(WrapStyle:.*)$/m, `$1\nScaledBorderAndShadow: ${options.scaledBorderAndShadow}`);
	}

	// ScaleBorderAndShadow Fix (True and exists)
	if (options.scaledBorderAndShadowFix && sBody.includes('ScaledBorderAndShadow')) {
		sBody = sBody.replace(/ScaledBorderAndShadow:\s*(yes|no)/, `ScaledBorderAndShadow: ${options.scaledBorderAndShadow}`);
	}

	// Fix VLC wrong parsing if URL not avaiable
	if (options.originalScriptFix) {
		sBody = sBody.replace(/^Original Script:.*$/gm, 'Original Script: Crunchyroll');
	}

	// Remove All Comments
	sBody = sBody.replace(/^[ \t]*;.*\r?\n?/gm, '');

	// Remove Aegisub Project Garbage
	sBody = sBody.replace(/\[Aegisub Project Garbage\][\s\S]*?(?:\r?\n(?=\[)|$)/, '');

	// Remove YCbCr
	sBody = sBody.replace(/^[ \t]*YCbCr Matrix:\s*.*\r?\n?/m, '');

	// Make sure no Dialogue timestamp goes over video length
	if (options.subtitleTimestampFix && options.durationMs && options.durationMs > 15000) {
		const lines = sBody.split('\n');
		const newLines: string[] = [];
		const durationS = options.durationMs / 1000;

		const toSec = (t: string) => {
			const [h, m, s] = t.replace(',', '.').split(/[:.]/).map(Number);
			return h * 3600 + m * 60 + s;
		};

		for (let line of lines) {
			if (line.startsWith('Dialogue:')) {
				const parts = line.split(',');
				const start = parts[1];
				const end = parts[2];

				const s = toSec(start);
				const e = toSec(end);

				// If start time is longer than durationS skip the subtitle line completely
				if (s > durationS) continue;

				// If only end time is longer than durationS short it down
				if (e > durationS) {
					const h = String(Math.floor(durationS / 3600));
					const m = String(Math.floor((durationS % 3600) / 60)).padStart(2, '0');
					const sec = (durationS % 60).toFixed(2).padStart(5, '0');
					parts[2] = `${h}:${m}:${sec}`;
					line = parts.join(',');
				}
			}

			newLines.push(line);
		}

		sBody = newLines.join('\n');
	}

	return sBody;
}
