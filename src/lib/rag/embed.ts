import { EMBEDDING_BATCH_SIZE, EMBEDDING_MODEL } from "./config";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 10_000;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Free-tier embedding quotas are low (requests/minute); retry 429s with backoff. */
async function fetchWithRetry(
	url: string,
	init: RequestInit,
): Promise<Response> {
	for (let attempt = 0; ; attempt++) {
		const response = await fetch(url, init);
		if (response.status !== 429 || attempt >= MAX_RETRIES) {
			return response;
		}
		const retryAfterHeader = Number(response.headers.get("retry-after"));
		const delayMs =
			Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
				? retryAfterHeader * 1000
				: BASE_RETRY_DELAY_MS * 2 ** attempt;
		console.warn(
			`  ! Rate limited (429), retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})…`,
		);
		await sleep(delayMs);
	}
}

/** Embeds many texts (e.g. ingestion chunks), batched. */
export async function embedTexts(
	texts: string[],
	apiKey: string,
): Promise<number[][]> {
	const embeddings: number[][] = [];

	for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
		const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
		const response = await fetchWithRetry(
			`${API_BASE}/${EMBEDDING_MODEL}:batchEmbedContents?key=${apiKey}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					requests: batch.map((text) => ({
						model: `models/${EMBEDDING_MODEL}`,
						content: { parts: [{ text }] },
					})),
				}),
			},
		);

		if (!response.ok) {
			throw new Error(
				`Embedding request failed (${response.status}): ${await response.text()}`,
			);
		}

		const body = (await response.json()) as {
			embeddings: Array<{ values: number[] }>;
		};
		embeddings.push(...body.embeddings.map((e) => e.values));
	}

	return embeddings;
}

/** Embeds a single query string (e.g. a visitor's chat message). */
export async function embedQuery(
	text: string,
	apiKey: string,
): Promise<number[]> {
	const response = await fetch(
		`${API_BASE}/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: `models/${EMBEDDING_MODEL}`,
				content: { parts: [{ text }] },
			}),
		},
	);

	if (!response.ok) {
		throw new Error(
			`Embedding request failed (${response.status}): ${await response.text()}`,
		);
	}

	const body = (await response.json()) as { embedding: { values: number[] } };
	return body.embedding.values;
}
