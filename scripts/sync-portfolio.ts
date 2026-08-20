/**
 * Syncs Notion "📚 Knowledge Base" Project entries into a committed,
 * pre-translated JSON file (src/lib/portfolio/content.json) consumed by the
 * Portfolio page — same architecture as scripts/sync-cv.ts (see that file's
 * header and the Phase 6 design spec for why: Cloudflare Workers Builds
 * can't reliably do live Notion/Gemini calls at build time).
 *
 * Also downloads each entry's Notion-hosted media (images/video) into
 * public/portfolio/<slug>/ so the deployed site never depends on Notion's
 * short-lived presigned URLs.
 *
 * Usage: pnpm portfolio:sync
 * Required env vars: see .env.example (same as pnpm cv:sync)
 */
import { writeFileSync } from "node:fs";
import { Client } from "@notionhq/client";
import { locales, type Locale } from "../src/i18n/locales";
import { fetchKnowledgeBaseEntries } from "../src/lib/notion/knowledgeBase";
import { translateForLocale } from "../src/lib/notion/translate";
import {
	loadTranslationCache,
	saveTranslationCache,
} from "../src/lib/notion/translationCache";
import { downloadEntryMedia } from "../src/lib/portfolio/downloadMedia";
import {
	assignSlugs,
	selectPortfolioEntries,
	type LocalizedPortfolioEntry,
} from "../src/lib/portfolio/portfolioEntries";

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

	console.log("Querying Knowledge Base for Portfolio-eligible entries...");
	const allEntries = await fetchKnowledgeBaseEntries(notion);
	const portfolioEntries = selectPortfolioEntries(allEntries);
	console.log(
		`Found ${portfolioEntries.length} Portfolio-eligible entries (Published, Content Type = Project).`,
	);

	if (portfolioEntries.length === 0) {
		throw new Error(
			"No Portfolio-eligible entries found. Check Status=Published and Content Type=Project in the Knowledge Base.",
		);
	}

	const slugs = assignSlugs(portfolioEntries);

	console.log("Downloading media...");
	for (const entry of portfolioEntries) {
		const slug = slugs.get(entry.pageId);
		const media = entry.metadata.media ?? [];
		if (!slug || media.length === 0) continue;
		entry.metadata = {
			...entry.metadata,
			media: await downloadEntryMedia(slug, media),
		};
	}

	const cache = loadTranslationCache();
	const content: Partial<Record<Locale, LocalizedPortfolioEntry[]>> = {};

	for (const locale of locales) {
		console.log(`Translating for locale "${locale}"...`);
		const localized = await translateForLocale(portfolioEntries, locale, {
			apiKey: googleApiKey,
			cache,
		});
		content[locale] = localized.map((entry) => ({
			...entry,
			slug: slugs.get(entry.pageId) ?? "",
		}));
	}

	saveTranslationCache(cache);

	const outPath = new URL("../src/lib/portfolio/content.json", import.meta.url);
	writeFileSync(outPath, `${JSON.stringify(content, null, "\t")}\n`, "utf-8");
	console.log(`\nWrote ${outPath.pathname.replace(/^\//, "")}`);
}

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
