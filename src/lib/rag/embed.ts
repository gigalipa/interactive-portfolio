import { EMBEDDING_BATCH_SIZE, EMBEDDING_MODEL } from "./config";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Embeds many texts (e.g. ingestion chunks), batched. */
export async function embedTexts(
	texts: string[],
	apiKey: string,
): Promise<number[][]> {
	const embeddings: number[][] = [];

	for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
		const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
		const response = await fetch(
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
