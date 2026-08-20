import type { Client } from "@notionhq/client";
import type { PageObjectResponse, RichTextItemResponse } from "@notionhq/client";

export const KNOWLEDGE_BASE_DATA_SOURCE_ID =
	process.env.NOTION_KNOWLEDGE_BASE_DATA_SOURCE_ID ||
	"9014f42b-a380-4526-8521-a5d20f491f58";

const NOTION_REQUEST_DELAY_MS = 350;

export interface MetadataLink {
	label: string;
	url: string;
	type?: string;
}

export interface MetadataDates {
	start?: string;
	end?: string;
	ongoing?: boolean;
}

export interface MetadataMedia {
	type: "image" | "video";
	url: string;
	alt?: string;
	caption?: string;
	cover?: boolean;
}

export interface EntryMetadata {
	category?: string;
	dates?: MetadataDates;
	location?: string;
	links?: MetadataLink[];
	media?: MetadataMedia[];
	techStack?: string[];
}

export interface KnowledgeBaseEntry {
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
	metadata: EntryMetadata;
}

export function plainText(richText: RichTextItemResponse[] | undefined): string {
	return (richText ?? []).map((item) => item.plain_text).join("");
}

/** Parses the `Metadata` JSON-text property. Never throws — malformed or missing
 * metadata degrades to `{}` rather than failing the whole entry. */
export function parseMetadata(raw: string | undefined): EntryMetadata {
	if (!raw) return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return {};
		return parsed as EntryMetadata;
	} catch {
		return {};
	}
}

export function extractEntry(page: PageObjectResponse): KnowledgeBaseEntry {
	const props = page.properties;

	const title = props.Title?.type === "title" ? plainText(props.Title.title) : "";
	const summary =
		props.Summary?.type === "rich_text" ? plainText(props.Summary.rich_text) : "";
	const description =
		props.Description?.type === "rich_text" ? plainText(props.Description.rich_text) : "";
	const contentType =
		props["Content Type"]?.type === "select"
			? (props["Content Type"].select?.name ?? null)
			: null;
	const tags =
		props.Tags?.type === "multi_select" ? props.Tags.multi_select.map((o) => o.name) : [];
	const priority = props.Priority?.type === "number" ? props.Priority.number : null;
	const status =
		props.Status?.type === "select" ? (props.Status.select?.name ?? null) : null;
	const language =
		props.Language?.type === "select" ? (props.Language.select?.name ?? null) : null;
	const relatedTo =
		props["Related To"]?.type === "relation"
			? props["Related To"].relation.map((r) => r.id)
			: [];
	const metadataRaw =
		props.Metadata?.type === "rich_text" ? plainText(props.Metadata.rich_text) : undefined;

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
		metadata: parseMetadata(metadataRaw),
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetches every entry in the Knowledge Base, regardless of Status/Content Type —
 * callers filter for their own purposes (ingest.ts wants everything, to detect
 * un-published pages; the CV build wants only Published + specific Content Types). */
export async function fetchKnowledgeBaseEntries(
	notion: Client,
	dataSourceId: string = KNOWLEDGE_BASE_DATA_SOURCE_ID,
): Promise<KnowledgeBaseEntry[]> {
	const entries: KnowledgeBaseEntry[] = [];
	let cursor: string | undefined;

	do {
		const response = await notion.dataSources.query({
			data_source_id: dataSourceId,
			start_cursor: cursor,
			page_size: 100,
		});

		for (const result of response.results) {
			if ("properties" in result) {
				entries.push(extractEntry(result as PageObjectResponse));
			}
		}

		cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
		await sleep(NOTION_REQUEST_DELAY_MS);
	} while (cursor);

	return entries;
}
