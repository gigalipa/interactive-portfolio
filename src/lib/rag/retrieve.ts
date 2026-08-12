import { CloudClient, type Where } from "chromadb";
import { CHROMA_COLLECTION_NAME, chromaCollectionOptions } from "./config";
import { embedQuery } from "./embed";

export interface ChromaCredentials {
	apiKey: string;
	tenant: string;
	database: string;
	host?: string;
}

export interface RetrieveContextOptions {
	chroma: ChromaCredentials;
	googleApiKey: string;
	/** The visitor's chat message (or a summarized version of recent turns). */
	query: string;
	/** Visitor's UI language (e.g. "EN" | "ES" | "FR"). Preferred, not required. */
	language?: string;
	/** Restrict to one Content Type, e.g. for the CV page pulling only Professional/Academic entries. */
	contentType?: string;
	/**
	 * Content Type values to exclude from results. Used so general chat doesn't
	 * surface deeply personal writing (short stories, reflections) as "context"
	 * for unrelated professional questions — it stays reachable only for callers
	 * that explicitly scope retrieval to it via `contentType`.
	 */
	excludeContentTypes?: string[];
	topK?: number;
}

export interface RetrievedChunk {
	id: string;
	document: string;
	distance: number;
	notionPageId: string;
	title: string;
	contentType: string;
	tags: string[];
	priority: number;
	language: string;
	summary: string;
}

// Kept small to stay well under the chat model's free-tier input-token quota
// (16k tokens/minute): each additional chunk adds meaningfully to prompt size.
const DEFAULT_TOP_K = 4;
// Distance is cosine distance (lower = more relevant); nudge higher-Priority
// entries ahead of near-equally-relevant lower-priority ones without letting
// priority override a genuinely better semantic match.
const PRIORITY_SCORE_WEIGHT = 0.02;
// Same idea, but for matching the visitor's UI language: a small nudge on
// near-ties, never enough to override a much better semantic match. This must
// stay a *soft* ranking signal, not a hard `where` filter — the `language`
// metadata on a chunk means "what language this entry is written in," which
// is unrelated to what the entry is *about*. A hard filter would silently
// exclude, say, an English-language-skill entry from an "ES"-language visitor's
// results even though it's exactly what "what languages does he speak?" needs.
const LANGUAGE_SCORE_WEIGHT = 0.03;
// Over-fetch beyond topK so the language-preference nudge above has enough
// candidates to actually re-rank, without ever hard-excluding anything.
const CANDIDATE_POOL_MULTIPLIER = 3;
const MIN_CANDIDATE_POOL = 8;

export function buildWhere(
	contentType: string | undefined,
	excludeContentTypes: string[] | undefined,
): Where | undefined {
	const clauses: Where[] = [];
	if (contentType) clauses.push({ content_type: contentType });
	if (excludeContentTypes?.length) {
		clauses.push({ content_type: { $nin: excludeContentTypes } });
	}

	if (clauses.length === 0) return undefined;
	if (clauses.length === 1) return clauses[0];
	return { $and: clauses };
}

function toChunks(result: {
	rows(): {
		id: string;
		document?: string | null;
		distance?: number | null;
		metadata?: Record<string, unknown> | null;
	}[][];
}): RetrievedChunk[] {
	const rows = result.rows()[0] ?? [];
	return rows
		.filter((row) => row.document)
		.map((row) => {
			const metadata = row.metadata ?? {};
			return {
				id: row.id,
				document: row.document as string,
				distance: row.distance ?? 1,
				notionPageId: String(metadata.notion_page_id ?? ""),
				title: String(metadata.title ?? ""),
				contentType: String(metadata.content_type ?? ""),
				tags: String(metadata.tags ?? "")
					.split(",")
					.filter(Boolean),
				priority: Number(metadata.priority ?? 0),
				language: String(metadata.language ?? ""),
				summary: String(metadata.summary ?? ""),
			};
		});
}

export function rankChunks(
	chunks: RetrievedChunk[],
	preferredLanguage: string | undefined,
): RetrievedChunk[] {
	const score = (chunk: RetrievedChunk): number => {
		const languageBonus =
			preferredLanguage && chunk.language === preferredLanguage
				? LANGUAGE_SCORE_WEIGHT
				: 0;
		return chunk.distance - chunk.priority * PRIORITY_SCORE_WEIGHT - languageBonus;
	};
	return [...chunks].sort((a, b) => score(a) - score(b));
}

/**
 * Retrieves the top-k most relevant Knowledge Base chunks for a query,
 * nudging results toward the visitor's UI language on near-ties without ever
 * excluding a genuinely better semantic match just because of its language tag.
 */
export async function retrieveContext(
	options: RetrieveContextOptions,
): Promise<RetrievedChunk[]> {
	const { chroma, googleApiKey, query, language, contentType, excludeContentTypes } =
		options;
	const topK = options.topK ?? DEFAULT_TOP_K;

	const client = new CloudClient({
		apiKey: chroma.apiKey,
		tenant: chroma.tenant,
		database: chroma.database,
		...chromaCollectionOptions(chroma.host),
	});
	const collection = await client.getOrCreateCollection({
		name: CHROMA_COLLECTION_NAME,
		embeddingFunction: null,
	});

	const queryEmbedding = await embedQuery(query, googleApiKey);
	const candidatePoolSize = Math.max(
		topK * CANDIDATE_POOL_MULTIPLIER,
		topK + MIN_CANDIDATE_POOL,
	);

	const result = await collection.query({
		queryEmbeddings: [queryEmbedding],
		nResults: candidatePoolSize,
		where: buildWhere(contentType, excludeContentTypes),
		include: ["documents", "metadatas", "distances"],
	});

	return rankChunks(toChunks(result), language).slice(0, topK);
}
