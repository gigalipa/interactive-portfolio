/**
 * Ingests the Notion "📚 Knowledge Base" database into the Chroma Cloud
 * `knowledge_base` collection, for RAG retrieval by the avatar chat.
 *
 * Usage: pnpm ingest
 * Required env vars: see .env.example
 */
import { Client } from "@notionhq/client";
import { CloudClient } from "chromadb";
import { encode, decode } from "gpt-tokenizer";
import {
	CHROMA_COLLECTION_NAME,
	chromaCollectionOptions,
} from "../src/lib/rag/config";
import { embedTexts } from "../src/lib/rag/embed";
import { stripFileEmbeds } from "../src/lib/rag/cleanMarkdown";
import { fetchKnowledgeBaseEntries } from "../src/lib/notion/knowledgeBase";

const CHUNK_SIZE_TOKENS = 512;
const CHUNK_OVERLAP_TOKENS = 50;
const NOTION_REQUEST_DELAY_MS = 350;

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required env var: ${name} (see .env.example)`);
	}
	return value;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPageBody(notion: Client, pageId: string): Promise<string> {
	const response = await notion.pages.retrieveMarkdown({ page_id: pageId });
	if (response.truncated) {
		console.warn(`  ! page ${pageId} markdown was truncated by the Notion API`);
	}
	return stripFileEmbeds(response.markdown);
}

function chunkText(text: string): string[] {
	const tokens = encode(text);
	if (tokens.length <= CHUNK_SIZE_TOKENS) {
		return [text];
	}

	const stride = CHUNK_SIZE_TOKENS - CHUNK_OVERLAP_TOKENS;
	const chunks: string[] = [];
	for (let start = 0; start < tokens.length; start += stride) {
		const window = tokens.slice(start, start + CHUNK_SIZE_TOKENS);
		chunks.push(decode(window));
		if (start + CHUNK_SIZE_TOKENS >= tokens.length) break;
	}
	return chunks;
}

async function run() {
	const notionToken = requireEnv("NOTION_TOKEN");
	const googleApiKey = requireEnv("GOOGLE_API_KEY_EMB");
	const chromaApiKey = requireEnv("CHROMA_API_KEY");
	const chromaTenant = requireEnv("CHROMA_TENANT");
	const chromaDatabase = requireEnv("CHROMA_DATABASE");
	const chromaHost = process.env.CHROMA_HOST || undefined;

	const notion = new Client({ auth: notionToken });
	const chroma = new CloudClient({
		apiKey: chromaApiKey,
		tenant: chromaTenant,
		database: chromaDatabase,
		...chromaCollectionOptions(chromaHost),
	});
	const collection = await chroma.getOrCreateCollection({
		name: CHROMA_COLLECTION_NAME,
		embeddingFunction: null,
	});

	console.log("Querying Knowledge Base…");
	const entries = await fetchKnowledgeBaseEntries(notion);
	console.log(`Found ${entries.length} entries.`);

	let ingested = 0;
	let skippedNotPublished = 0;
	let skippedEmpty = 0;

	for (const entry of entries) {
		// Idempotent: always clear this page's previous chunks first, whether or not
		// it's still Published. Covers edits, re-publishes, and un-publishing alike.
		await collection.delete({ where: { notion_page_id: entry.pageId } });

		if (entry.status !== "Published") {
			skippedNotPublished += 1;
			continue;
		}

		const body = await fetchPageBody(notion, entry.pageId);
		const text = body || entry.description || entry.summary;
		if (!text) {
			console.warn(
				`  ! skipping "${entry.title}" (${entry.pageId}) — no page body, description, or summary`,
			);
			skippedEmpty += 1;
			continue;
		}

		const chunks = chunkText(text);
		const embeddings = await embedTexts(chunks, googleApiKey);

		await collection.upsert({
			ids: chunks.map((_, i) => `${entry.pageId}-${i}`),
			embeddings,
			documents: chunks,
			metadatas: chunks.map(() => ({
				notion_page_id: entry.pageId,
				title: entry.title,
				content_type: entry.contentType ?? "",
				tags: entry.tags.join(","),
				priority: entry.priority ?? 0,
				language: entry.language ?? "",
				related_to: entry.relatedTo.join(","),
				summary: entry.summary,
			})),
		});

		console.log(`  + "${entry.title}" — ${chunks.length} chunk(s)`);
		ingested += 1;
		await sleep(NOTION_REQUEST_DELAY_MS);
	}

	console.log(
		`\nDone. Ingested ${ingested} entries. Skipped ${skippedNotPublished} not Published, ${skippedEmpty} empty.`,
	);
}

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
