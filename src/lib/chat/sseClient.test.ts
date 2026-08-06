import { describe, expect, it, vi } from "vitest";
import { parseSseStream, streamChatResponse, type FetchLike } from "./sseClient";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
			controller.close();
		},
	});
}

async function collect<T>(iterable: AsyncGenerator<T>): Promise<T[]> {
	const result: T[] = [];
	for await (const value of iterable) result.push(value);
	return result;
}

function fakeFetch(status: number, body: ReadableStream<Uint8Array> | null, text = ""): FetchLike {
	return async () => ({
		ok: status >= 200 && status < 300,
		status,
		body,
		text: async () => text,
	});
}

describe("parseSseStream", () => {
	it("parses meta, delta, and done events in order", async () => {
		const body = streamFromChunks([
			'event: meta\ndata: {"conversationId":"c-1"}\n\n',
			'event: delta\ndata: {"text":"Hi"}\n\n',
			"event: done\ndata: {}\n\n",
		]);

		expect(await collect(parseSseStream(body))).toEqual([
			{ event: "meta", data: { conversationId: "c-1" } },
			{ event: "delta", data: { text: "Hi" } },
			{ event: "done", data: {} },
		]);
	});

	it("handles a frame split across two reads", async () => {
		const body = streamFromChunks(['event: delta\ndata: {"text":"Hel', 'lo"}\n\n']);

		expect(await collect(parseSseStream(body))).toEqual([
			{ event: "delta", data: { text: "Hello" } },
		]);
	});
});

describe("streamChatResponse", () => {
	it("posts the payload and yields parsed SSE events", async () => {
		const fetchImpl = vi.fn().mockImplementation(
			fakeFetch(200, streamFromChunks(['event: delta\ndata: {"text":"Hi"}\n\n'])),
		);

		const result = await collect(
			streamChatResponse({ persist: false, message: "Hello" }, fetchImpl),
		);

		expect(result).toEqual([{ event: "delta", data: { text: "Hi" } }]);
		expect(fetchImpl).toHaveBeenCalledWith(
			"/api/chat",
			expect.objectContaining({ method: "POST" }),
		);
		const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
		expect(JSON.parse(init.body as string)).toEqual({ persist: false, message: "Hello" });
	});

	it("yields a rate_limited error event on a 429 response", async () => {
		const fetchImpl = vi.fn().mockImplementation(fakeFetch(429, null, "Rate limit exceeded"));

		const result = await collect(
			streamChatResponse({ persist: false, message: "Hi" }, fetchImpl),
		);

		expect(result).toEqual([{ event: "error", data: { message: "rate_limited" } }]);
	});

	it("yields a request_failed error event on any other non-ok response", async () => {
		const fetchImpl = vi.fn().mockImplementation(fakeFetch(500, null, "boom"));

		const result = await collect(
			streamChatResponse({ persist: false, message: "Hi" }, fetchImpl),
		);

		expect(result).toEqual([{ event: "error", data: { message: "request_failed" } }]);
	});
});
