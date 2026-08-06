const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const CHAT_MODEL = "gemma-4-31b-it";

export interface ChatMessageForModel {
	role: "user" | "model";
	text: string;
}

/** Narrow structural subset of `fetch` — real `fetch` satisfies this. */
export interface FetchLike {
	(url: string, init: RequestInit): Promise<{
		ok: boolean;
		status: number;
		body: ReadableStream<Uint8Array> | null;
		text(): Promise<string>;
	}>;
}

export interface StreamChatCompletionOptions {
	systemPrompt: string;
	messages: ChatMessageForModel[];
	apiKey: string;
	fetchImpl?: FetchLike;
}

/** Calls Gemini's streamGenerateContent for gemma-4-31b-it and yields text deltas. */
export async function* streamChatCompletion(
	options: StreamChatCompletionOptions,
): AsyncGenerator<string> {
	const { systemPrompt, messages, apiKey, fetchImpl = fetch } = options;

	const response = await fetchImpl(
		`${API_BASE}/${CHAT_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				systemInstruction: { parts: [{ text: systemPrompt }] },
				contents: messages.map((message) => ({
					role: message.role,
					parts: [{ text: message.text }],
				})),
			}),
		},
	);

	if (!response.ok || !response.body) {
		throw new Error(
			`Chat completion request failed (${response.status}): ${await response.text()}`,
		);
	}

	yield* parseGeminiSseStream(response.body);
}

/** Parses a Gemini `alt=sse` stream body into a sequence of text deltas. */
export async function* parseGeminiSseStream(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		const events = buffer.split("\n\n");
		buffer = events.pop() ?? "";

		for (const event of events) {
			const text = extractTextFromSseEvent(event);
			if (text) yield text;
		}
	}

	const text = extractTextFromSseEvent(buffer);
	if (text) yield text;
}

function extractTextFromSseEvent(event: string): string | undefined {
	const dataLine = event.split("\n").find((line) => line.startsWith("data:"));
	if (!dataLine) return undefined;

	const jsonText = dataLine.slice("data:".length).trim();
	if (!jsonText) return undefined;

	const parsed = JSON.parse(jsonText) as {
		candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
	};
	return parsed.candidates?.[0]?.content?.parts?.[0]?.text;
}
