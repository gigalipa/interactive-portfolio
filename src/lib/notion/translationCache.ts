import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { TranslationCache } from "./translate";

const CACHE_PATH = fileURLToPath(new URL("./.cv-translation-cache.json", import.meta.url));

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
