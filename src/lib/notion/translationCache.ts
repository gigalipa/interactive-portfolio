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
const CACHE_PATH = resolve(
	process.cwd(),
	"src/lib/notion/.cv-translation-cache.json",
);

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

/** Best-effort: never throws. Persisting the cache only works when `astro
 * build` runs directly in Node against a real checkout (e.g. locally) — the
 * committed result is what CI/Cloudflare Pages builds read. On Cloudflare
 * Workers Builds specifically, prerendering runs inside the built Worker's
 * own sandbox (rooted at a virtual `/bundle/`, not the actual repo checkout),
 * which has no `src/` tree to write back to at all — CACHE_PATH is
 * unreachable there by construction, not just empty. Swallowing that failure
 * here keeps it a build-speed optimization instead of a build-breaking one. */
export function saveTranslationCache(cache: TranslationCache): void {
	try {
		writeFileSync(
			CACHE_PATH,
			`${JSON.stringify(cache, null, "\t")}\n`,
			"utf-8",
		);
	} catch (error) {
		console.warn(
			`Could not persist the CV translation cache (non-fatal): ${String(error)}`,
		);
	}
}
