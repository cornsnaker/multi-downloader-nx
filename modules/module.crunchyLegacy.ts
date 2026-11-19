import { console } from './log';
import { FetchParams, Req } from './module.fetch';
import { LanguageItem } from './module.langsData';
import { MPDParsed, parse } from './module.transform-mpd';

/**
 * Crunchyroll "Legacy" video encodes.
 *
 * Crunchyroll's playback service only returns the newer encode ("Current", .../static/majin/<id>/clean/cenc/dash/...).
 * The older, higher bitrate encodes are still served from the same CDN under .../static/<id>/0/clean/dash/... and
 * .../static/<id>/1/clean/dash/..., with the same query string (token). They use their own DRM keys (PSSH in the MPD),
 * which the normal license request returns because the playback session is the same.
 *
 * URL mapping adapted from XxUnkn0wnxX/multi-downloader-nx (MIT), modules/module.crunchy-manifests.ts.
 */

export type LegacyFamily = 'Legacy 0' | 'Legacy 1';

/** Build the Legacy manifest URLs for a Current manifest URL (empty if the URL has another layout). */
export function legacyUrls(url: string): string[] {
	const match = /^(https?:\/\/[^/?#]+)([^?#]*)([?#][\s\S]*)?$/.exec(url);
	if (!match) return [];
	const clean = /^(.*\/static\/)(?:majin\/)?([^/]+)\/(?:\d+\/)?clean\/(?:cenc\/)?dash\/(.*)$/.exec(match[2]);
	if (!clean) return [];
	return [...new Set([0, 1].map((n) => `${match[1]}${clean[1]}${clean[2]}/${n}/clean/dash/${clean[3]}${match[3] || ''}`).filter((candidate) => candidate !== url))];
}

const familyOf = (url: string): LegacyFamily => (/\/0\/clean\/dash\//.test(url.split(/[?#]/, 1)[0]) ? 'Legacy 0' : 'Legacy 1');

/**
 * Fetch and parse the Legacy manifests. Missing or invalid manifests are skipped quietly,
 * since many episodes have no Legacy encode.
 */
export async function fetchLegacyManifests(
	req: Req,
	url: string,
	headers: FetchParams,
	language: LanguageItem | undefined,
	debug = false
): Promise<{ family: LegacyFamily; playlists: MPDParsed }[]> {
	const results = await Promise.all(
		legacyUrls(url).map(async (candidate) => {
			const family = familyOf(candidate);
			try {
				const res = await req.getData(candidate, { ...headers, quiet: true });
				if (!res.ok || !res.res) {
					if (debug) console.debug(`[DEBUG] ${family} manifest not available (${res.res?.status ?? 'request failed'})`);
					return undefined;
				}
				const body = await res.res.text();
				if (!body.includes('<MPD')) return undefined;
				const playlists = await parse(body, language, candidate.match(/.*\.urlset\//)?.[0]);
				if (!Object.values(playlists).some((server) => server.video.length > 0)) return undefined;
				return { family, playlists };
			} catch (e) {
				if (debug) console.debug(`[DEBUG] ${family} manifest skipped: ${String(e)}`);
				return undefined;
			}
		})
	);
	return results.filter((r): r is NonNullable<typeof r> => !!r);
}
