import { createHash } from "node:crypto";
import type { Locale } from "../../i18n/locales";
import type { KnowledgeBaseEntry } from "./knowledgeBase";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TRANSLATE_MODEL = "gemini-flash-lite-latest";
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 5_000;

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

async function fetchWithRetry(
	url: string,
	init: RequestInit,
	fetchImpl: FetchLike,
): ReturnType<FetchLike> {
	for (let attempt = 0; ; attempt++) {
		const response = await fetchImpl(url, init);
		if (response.status !== 429 || attempt >= MAX_RETRIES) return response;
		await sleep(BASE_RETRY_DELAY_MS * 2 ** attempt);
	}
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

	const response = await fetchWithRetry(
		`${API_BASE}/${TRANSLATE_MODEL}:generateContent?key=${apiKey}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
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
			}),
		},
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
