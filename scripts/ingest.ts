/**
 * Ingests the Notion "📚 Knowledge Base" database into the Chroma Cloud
 * `knowledge_base` collection, for RAG retrieval by the avatar chat.
 *
 * Usage: pnpm ingest
 * Required env vars: see .env.example
 */
import { Client } from "@notionhq/client";
import type {
	PageObjectResponse,
	RichTextItemResponse,
} from "@notionhq/client";
import { CloudClient } from "chromadb";
import { encode, decode } from "gpt-tokenizer";
import {
	CHROMA_COLLECTION_NAME,
	chromaCollectionOptions,
} from "../src/lib/rag/config";
import { embedTexts } from "../src/lib/rag/embed";

const KNOWLEDGE_BASE_DATA_SOURCE_ID =
	process.env.NOTION_KNOWLEDGE_BASE_DATA_SOURCE_ID ||
	"9014f42b-a380-4526-8521-a5d20f491f58";
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

interface KnowledgeBaseEntry {
	pageId: string;
	title: string;
	summary: string;
	description: string;
	contentType: string | null;
	tags: string[];
	priority: number | null;
	status: string | null;
	language: string | null;
	relatedTo: string[];
}

function plainText(richText: RichTextItemResponse[] | undefined): string {
	return (richText ?? []).map((item) => item.plain_text).join("");
}

function extractEntry(page: PageObjectResponse): KnowledgeBaseEntry {
	const props = page.properties;

	const title =
		props.Title?.type === "title" ? plainText(props.Title.title) : "";
	const summary =
		props.Summary?.type === "rich_text"
			? plainText(props.Summary.rich_text)
			: "";
	const description =
		props.Description?.type === "rich_text"
			? plainText(props.Description.rich_text)
			: "";
	const contentType =
		props["Content Type"]?.type === "select"
			? (props["Content Type"].select?.name ?? null)
			: null;
	const tags =
		props.Tags?.type === "multi_select"
			? props.Tags.multi_select.map((o) => o.name)
			: [];
	const priority =
		props.Priority?.type === "number" ? props.Priority.number : null;
	const status =
		props.Status?.type === "select"
			? (props.Status.select?.name ?? null)
			: null;
	const language =
		props.Language?.type === "select"
			? (props.Language.select?.name ?? null)
			: null;
	const relatedTo =
		props["Related To"]?.type === "relation"
			? props["Related To"].relation.map((r) => r.id)
			: [];

	return {
		pageId: page.id,
		title,
		summary,
		description,
		contentType,
		tags,
		priority,
		status,
		language,
		relatedTo,
	};
}

async function fetchAllEntries(notion: Client): Promise<KnowledgeBaseEntry[]> {
	const entries: KnowledgeBaseEntry[] = [];
	let cursor: string | undefined;

	do {
		const response = await notion.dataSources.query({
			data_source_id: KNOWLEDGE_BASE_DATA_SOURCE_ID,
			start_cursor: cursor,
			page_size: 100,
		});

		for (const result of response.results) {
			if ("properties" in result) {
				entries.push(extractEntry(result as PageObjectResponse));
			}
		}

		cursor = response.has_more
			? (response.next_cursor ?? undefined)
			: undefined;
		await sleep(NOTION_REQUEST_DELAY_MS);
	} while (cursor);

	return entries;
}

async function fetchPageBody(notion: Client, pageId: string): Promise<string> {
	const response = await notion.pages.retrieveMarkdown({ page_id: pageId });
	if (response.truncated) {
		console.warn(`  ! page ${pageId} markdown was truncated by the Notion API`);
	}
	return response.markdown.trim();
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
	const entries = await fetchAllEntries(notion);
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
