import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { MetadataMedia } from "../notion/knowledgeBase";

/** Narrow structural subset of `fetch` — real `fetch` satisfies this. */
export interface FetchLike {
	(url: string): Promise<{
		ok: boolean;
		status: number;
		headers: { get(name: string): string | null };
		arrayBuffer(): Promise<ArrayBuffer>;
	}>;
}

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/gif": "gif",
	"video/mp4": "mp4",
	"video/webm": "webm",
};

/** Downloads each of an entry's media items into `<publicDir>/portfolio/<slug>/<index>.<ext>`
 * and returns the media array with `url` rewritten to that local, same-origin path — Notion's
 * hosted media URLs are short-lived presigned links and can't be referenced directly from the
 * deployed site. A failed download (non-2xx, thrown error, unrecognized content-type) is caught,
 * logged as a warning, and that one item is dropped from the result — never throws, so one bad
 * media item can't fail the whole sync. */
export async function downloadEntryMedia(
	slug: string,
	media: MetadataMedia[],
	options: { fetchImpl?: FetchLike; publicDir?: string } = {},
): Promise<MetadataMedia[]> {
	const { fetchImpl = fetch as unknown as FetchLike, publicDir = "public" } =
		options;
	const results: MetadataMedia[] = [];

	for (const [index, item] of media.entries()) {
		try {
			const response = await fetchImpl(item.url);
			if (!response.ok) {
				console.warn(
					`Skipping media for "${slug}" (HTTP ${response.status}): ${item.url}`,
				);
				continue;
			}
			const contentType = (response.headers.get("content-type") ?? "")
				.split(";")[0]
				.trim();
			const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
			if (!extension) {
				console.warn(
					`Skipping media for "${slug}" (unrecognized content-type "${contentType}"): ${item.url}`,
				);
				continue;
			}
			const relativePath = `portfolio/${slug}/${index}.${extension}`;
			const absolutePath = resolve(publicDir, relativePath);
			mkdirSync(dirname(absolutePath), { recursive: true });
			writeFileSync(absolutePath, Buffer.from(await response.arrayBuffer()));
			results.push({ ...item, url: `/${relativePath}` });
		} catch (error) {
			console.warn(
				`Skipping media for "${slug}" (download failed): ${item.url} — ${String(error)}`,
			);
		}
	}

	return results;
}
