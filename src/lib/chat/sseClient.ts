import type { ChatSseEvent } from "../rag/sse";
import type { ChatMessage } from "../history/types";

export interface ChatRequestPayload {
	persist: boolean;
	message: string;
	conversationId?: string;
	history?: Array<Pick<ChatMessage, "role" | "text">>;
	language?: string;
}

/** Narrow structural subset of `fetch` — real `fetch` satisfies this. */
export interface FetchLike {
	(
		url: string,
		init: RequestInit,
	): Promise<{
		ok: boolean;
		status: number;
		body: ReadableStream<Uint8Array> | null;
		text(): Promise<string>;
	}>;
}

/** Posts to /api/chat and yields the parsed SSE events. Non-ok responses
 * yield a single synthetic error event carrying an internal code
 * ("rate_limited" | "request_failed"), never raw server text — the caller
 * maps the code to a localized message. */
export async function* streamChatResponse(
	payload: ChatRequestPayload,
	fetchImpl: FetchLike = fetch,
): AsyncGenerator<ChatSseEvent> {
	let response: Awaited<ReturnType<FetchLike>>;
	try {
		response = await fetchImpl("/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
	} catch {
		// Network-level failure (offline, DNS, connection reset): surface it as an
		// error event rather than letting the rejection escape the generator.
		yield { event: "error", data: { message: "request_failed" } };
		return;
	}

	if (!response.ok || !response.body) {
		const code = response.status === 429 ? "rate_limited" : "request_failed";
		yield { event: "error", data: { message: code } };
		return;
	}

	yield* parseSseStream(response.body);
}

export async function* parseSseStream(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<ChatSseEvent> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		const frames = buffer.split("\n\n");
		buffer = frames.pop() ?? "";

		for (const frame of frames) {
			const event = parseFrame(frame);
			if (event) yield event;
		}
	}

	const event = parseFrame(buffer);
	if (event) yield event;
}

function parseFrame(frame: string): ChatSseEvent | null {
	const lines = frame.split("\n");
	const eventLine = lines.find((line) => line.startsWith("event:"));
	const dataLine = lines.find((line) => line.startsWith("data:"));
	if (!eventLine || !dataLine) return null;

	const eventName = eventLine.slice("event:".length).trim();

	// A dropped connection can leave a truncated JSON fragment in the trailing
	// buffer; treat an unparseable frame as "no event" instead of throwing.
	let data: unknown;
	try {
		data = JSON.parse(dataLine.slice("data:".length).trim());
	} catch {
		return null;
	}

	if (
		eventName === "meta" ||
		eventName === "delta" ||
		eventName === "done" ||
		eventName === "error"
	) {
		return { event: eventName, data } as ChatSseEvent;
	}
	return null;
}
