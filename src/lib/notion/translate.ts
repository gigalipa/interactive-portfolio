import { createHash } from "node:crypto";
import type { Locale } from "../../i18n/locales";
import type { KnowledgeBaseEntry } from "./knowledgeBase";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TRANSLATE_MODEL = "gemini-flash-lite-latest";
// The Gemini free tier's per-model RPM/TPM quota is shared per project, not
// per call site — a modest Knowledge Base can still trip it during a single
// build's worth of translation calls. Each model in this chain draws from a
// separate quota bucket, so falling through it spreads the same work across
// three independent limits before we ever need to wait one out.
const MODEL_FALLBACK_CHAIN = [TRANSLATE_MODEL, "gemini-3.1-flash-lite", "gemini-3.5-flash-lite"];
// If every model in the chain is rate-limited in the same pass, the whole
// project's free-tier quota is exhausted, not just one model's — waiting
// lets the per-minute window reset. One retry (two attempts total) after
// that wait, then hard-fail per the module's existing no-silent-fallback rule.
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const MAX_CHAIN_ATTEMPTS = 2;

const TARGET_LANGUAGE_NAME: Record<Locale, string> = {
	en: "English",
	es: "Spanish",
	fr: "French",
};

/** Notion's `Language` select property values, keyed by our locale codes.
 * Deliberately separate from `localeLabels` (the site's language-switcher UI
 * labels) even though the values currently coincide — they serve different
 * concerns and shouldn't be coupled by accident. */
const NOTION_LANGUAGE_CODE: Record<Locale, string> = { en: "EN", es: "ES", fr: "FR" };

export interface TranslatableFields {
	title: string;
	category: string;
	location: string;
	description: string;
}

export type TranslationCache = Record<string, TranslatableFields>;

export interface LocalizedEntry extends KnowledgeBaseEntry {
	displayTitle: string;
	displayCategory: string;
	displayLocation: string;
	displayDescription: string;
}

/** Narrow structural subset of `fetch` — real `fetch` satisfies this. */
export interface FetchLike {
	(url: string, init: RequestInit): Promise<{
		ok: boolean;
		status: number;
		json(): Promise<unknown>;
		text(): Promise<string>;
	}>;
}

function extractTranslatable(entry: KnowledgeBaseEntry): TranslatableFields {
	return {
		title: entry.title,
		category: entry.metadata.category ?? "",
		location: entry.metadata.location ?? "",
		description: entry.description,
	};
}

/** Deterministic content hash so an unchanged entry reuses its cached translation. */
export function hashFields(fields: TranslatableFields): string {
	return createHash("sha256").update(JSON.stringify(fields)).digest("hex").slice(0, 16);
}

export function cacheKey(pageId: string, targetLocale: Locale, fields: TranslatableFields): string {
	return `${pageId}:${targetLocale}:${hashFields(fields)}`;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// 429 = rate limit (quota exhausted); 503 = Gemini's "model is currently
// experiencing high demand" transient overload. Both are worth falling
// through the chain for — neither means the request itself was bad.
const RETRYABLE_STATUSES = new Set([429, 503]);

/** Tries each model in MODEL_FALLBACK_CHAIN in order, moving to the next only
 * on a retryable status (429/503) — any other failure returns immediately so
 * the caller's existing error handling applies. If every model in the chain
 * is still retryable in the same pass, waits RATE_LIMIT_COOLDOWN_MS and runs
 * the whole chain again once more before giving up (returning the last
 * response, which the caller turns into a hard failure). */
async function callWithModelFallback(
	requestBody: unknown,
	apiKey: string,
	fetchImpl: FetchLike,
): ReturnType<FetchLike> {
	let lastResponse: Awaited<ReturnType<FetchLike>> | undefined;

	for (let attempt = 0; attempt < MAX_CHAIN_ATTEMPTS; attempt++) {
		for (const model of MODEL_FALLBACK_CHAIN) {
			const response = await fetchImpl(`${API_BASE}/${model}:generateContent?key=${apiKey}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(requestBody),
			});
			if (!RETRYABLE_STATUSES.has(response.status)) return response;
			lastResponse = response;
		}
		if (attempt < MAX_CHAIN_ATTEMPTS - 1) {
			await sleep(RATE_LIMIT_COOLDOWN_MS);
		}
	}

	// TypeScript can't see the loop always assigns lastResponse at least once
	// (MODEL_FALLBACK_CHAIN and MAX_CHAIN_ATTEMPTS are both non-empty).
	return lastResponse as Awaited<ReturnType<FetchLike>>;
}

function isTranslatableFields(value: unknown): value is TranslatableFields {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Partial<TranslatableFields>;
	return (
		typeof candidate.title === "string" &&
		typeof candidate.category === "string" &&
		typeof candidate.location === "string" &&
		typeof candidate.description === "string"
	);
}

/** Calls Gemini to translate one entry's fields into the target locale. Throws on
 * a non-OK response or a response that isn't valid TranslatableFields JSON — a
 * hard build failure is the desired behavior (see the design spec). */
export async function translateFields(
	fields: TranslatableFields,
	targetLocale: Locale,
	options: { apiKey: string; fetchImpl?: FetchLike },
): Promise<TranslatableFields> {
	const { apiKey, fetchImpl = fetch as unknown as FetchLike } = options;

	const response = await callWithModelFallback(
		{
			contents: [
				{
					role: "user",
					parts: [
						{
							text: `Translate the following JSON object's string values into ${TARGET_LANGUAGE_NAME[targetLocale]}. Keep the same keys. Preserve a professional CV tone. Return ONLY the translated JSON object, no other text.\n\n${JSON.stringify(fields)}`,
						},
					],
				},
			],
			generationConfig: { responseMimeType: "application/json" },
		},
		apiKey,
		fetchImpl,
	);

	if (!response.ok) {
		throw new Error(`Translation request failed (${response.status}): ${await response.text()}`);
	}

	const body = (await response.json()) as {
		candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
	};
	const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
	if (!text) throw new Error("Translation response had no text content");

	const parsed: unknown = JSON.parse(text);
	if (!isTranslatableFields(parsed)) {
		throw new Error(`Translation response was not valid TranslatableFields JSON: ${text}`);
	}

	return parsed;
}

/** Translates (or passes through, if already in the target language) every
 * entry, reading from and writing to `cache` in place. Caller persists `cache`
 * to disk afterward (see translationCache.ts). */
export async function translateForLocale(
	entries: KnowledgeBaseEntry[],
	targetLocale: Locale,
	options: { apiKey: string; cache: TranslationCache; fetchImpl?: FetchLike },
): Promise<LocalizedEntry[]> {
	const { apiKey, cache, fetchImpl } = options;
	const targetLanguageCode = NOTION_LANGUAGE_CODE[targetLocale];

	const results: LocalizedEntry[] = [];
	for (const entry of entries) {
		const source = extractTranslatable(entry);
		let localized = source;

		if (entry.language?.toUpperCase() !== targetLanguageCode) {
			const key = cacheKey(entry.pageId, targetLocale, source);
			const cached = cache[key];
			if (cached) {
				localized = cached;
			} else {
				localized = await translateFields(source, targetLocale, { apiKey, fetchImpl });
				cache[key] = localized;
			}
		}

		results.push({
			...entry,
			displayTitle: localized.title,
			displayCategory: localized.category,
			displayLocation: localized.location,
			displayDescription: localized.description,
		});
	}

	return results;
}
