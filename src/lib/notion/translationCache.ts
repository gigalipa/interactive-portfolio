import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TranslationCache } from "./translate";

// Resolved from the project root (which `astro build` always runs from), not
// `import.meta.url` — this module gets bundled into an SSR output chunk at
// build time, so `import.meta.url` would resolve to wherever that chunk lands
// on disk instead of `src/lib/notion/`.
//
// This cache is a manually-refreshed, committed artifact: it's only updated
// when someone runs `astro build` locally (with real NOTION_TOKEN /
// GOOGLE_API_KEY_LLM available) and commits the resulting
// `.cv-translation-cache.json`. CI and Cloudflare Pages builds read whatever
// is committed but never write their own output back, since their filesystem
// is ephemeral. That's an accepted tradeoff for a small, infrequently-edited
// Knowledge Base — not a bug to fix with an auto-commit step or remote store.
const CACHE_PATH = resolve(process.cwd(), "src/lib/notion/.cv-translation-cache.json");

/** Loads the committed translation cache. Never throws — a missing or
 * corrupted cache file just means every entry gets re-translated this build. */
export function loadTranslationCache(): TranslationCache {
	if (!existsSync(CACHE_PATH)) return {};
	try {
		return JSON.parse(readFileSync(CACHE_PATH, "utf-8")) as TranslationCache;
	} catch {
		return {};
	}
}

export function saveTranslationCache(cache: TranslationCache): void {
	writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, "\t")}\n`, "utf-8");
}
