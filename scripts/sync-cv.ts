/**
 * Syncs the Notion "📚 Knowledge Base" database into a committed,
 * pre-translated JSON file (src/lib/cv/content.json) consumed by the CV
 * page. Run this locally whenever CV-relevant Notion content changes —
 * Cloudflare/CI builds only ever read the committed file, never Notion or
 * Gemini directly, so the CV page's build stays fast and has no external
 * dependency at deploy time.
 *
 * Usage: pnpm cv:sync
 * Required env vars: see .env.example
 */
import { writeFileSync } from "node:fs";
import { Client } from "@notionhq/client";
import { locales, type Locale } from "../src/i18n/locales";
import { selectCvEntries } from "../src/lib/cv/groupEntries";
import { fetchKnowledgeBaseEntries } from "../src/lib/notion/knowledgeBase";
import { translateForLocale, type LocalizedEntry } from "../src/lib/notion/translate";
import { loadTranslationCache, saveTranslationCache } from "../src/lib/notion/translationCache";

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required env var: ${name} (see .env.example)`);
	}
	return value;
}

async function run() {
	const notionToken = requireEnv("NOTION_TOKEN");
	const googleApiKey = requireEnv("GOOGLE_API_KEY_LLM");

	const notion = new Client({ auth: notionToken });

	console.log("Querying Knowledge Base for CV-eligible entries...");
	const allEntries = await fetchKnowledgeBaseEntries(notion);
	const cvEntries = selectCvEntries(allEntries);
	console.log(`Found ${cvEntries.length} CV-eligible entries (Published, relevant Content Type).`);

	if (cvEntries.length === 0) {
		throw new Error(
			"No CV-eligible entries found. Check Status=Published and Content Type values in the Knowledge Base.",
		);
	}

	const cache = loadTranslationCache();
	const content: Partial<Record<Locale, LocalizedEntry[]>> = {};

	for (const locale of locales) {
		console.log(`Translating for locale "${locale}"...`);
		content[locale] = await translateForLocale(cvEntries, locale, { apiKey: googleApiKey, cache });
	}

	saveTranslationCache(cache);

	const outPath = new URL("../src/lib/cv/content.json", import.meta.url);
	writeFileSync(outPath, `${JSON.stringify(content, null, "\t")}\n`, "utf-8");
	console.log(`\nWrote ${outPath.pathname.replace(/^\//, "")}`);
}

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
