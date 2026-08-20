import { describe, expect, it, vi } from "vitest";
import {
	parseGeminiSseStream,
	streamChatCompletion,
	type FetchLike,
} from "./chat";

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

function fakeFetch(
	status: number,
	body: ReadableStream<Uint8Array> | null,
	text = "",
): FetchLike {
	return async () => ({
		ok: status >= 200 && status < 300,
		status,
		body,
		text: async () => text,
	});
}

describe("parseGeminiSseStream", () => {
	it("yields the text of each streamed chunk in order", async () => {
		const body = streamFromChunks([
			'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n\n',
			'data: {"candidates":[{"content":{"parts":[{"text":" there"}]}}]}\n\n',
		]);

		expect(await collect(parseGeminiSseStream(body))).toEqual([
			"Hello",
			" there",
		]);
	});

	it("handles events delimited by CRLF (\\r\\n\\r\\n), as preserved by the Workers runtime's fetch", async () => {
		const body = streamFromChunks([
			'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\r\n\r\n',
			'data: {"candidates":[{"content":{"parts":[{"text":" there"}]}}]}\r\n\r\n',
		]);

		expect(await collect(parseGeminiSseStream(body))).toEqual([
			"Hello",
			" there",
		]);
	});

	it("handles a chunk split across two reads", async () => {
		const body = streamFromChunks([
			'data: {"candidates":[{"content":{"parts":[{"text":"Hel',
			'lo"}]}}]}\n\n',
		]);

		expect(await collect(parseGeminiSseStream(body))).toEqual(["Hello"]);
	});

	it("skips events with no text (e.g. a final finishReason-only chunk)", async () => {
		const body = streamFromChunks([
			'data: {"candidates":[{"content":{"parts":[{"text":"Hi"}]},"finishReason":null}]}\n\n',
			'data: {"candidates":[{"finishReason":"STOP"}]}\n\n',
		]);

		expect(await collect(parseGeminiSseStream(body))).toEqual(["Hi"]);
	});

	it("skips chain-of-thought parts (thought: true) and only yields the final answer", async () => {
		const body = streamFromChunks([
			'data: {"candidates":[{"content":{"parts":[{"text":"User asks who I am.","thought":true}]}}]}\n\n',
			'data: {"candidates":[{"content":{"parts":[{"text":"Hello! I am Daniel\'s avatar."}]}}]}\n\n',
		]);

		expect(await collect(parseGeminiSseStream(body))).toEqual([
			"Hello! I am Daniel's avatar.",
		]);
	});
});

describe("streamChatCompletion", () => {
	it("posts the system prompt and message history, then yields streamed text", async () => {
		const fetchImpl = vi
			.fn()
			.mockImplementation(
				fakeFetch(
					200,
					streamFromChunks([
						'data: {"candidates":[{"content":{"parts":[{"text":"Hi!"}]}}]}\n\n',
					]),
				),
			);

		const result = await collect(
			streamChatCompletion({
				systemPrompt: "You are Daniel's avatar.",
				messages: [{ role: "user", text: "Hello" }],
				apiKey: "test-key",
				fetchImpl,
			}),
		);

		expect(result).toEqual(["Hi!"]);
		expect(fetchImpl).toHaveBeenCalledWith(
			expect.stringContaining(
				"gemini-flash-lite-latest:streamGenerateContent?alt=sse&key=test-key",
			),
			expect.objectContaining({ method: "POST" }),
		);
		const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.systemInstruction).toEqual({
			parts: [{ text: "You are Daniel's avatar." }],
		});
		expect(body.contents).toEqual([
			{ role: "user", parts: [{ text: "Hello" }] },
		]);
	});

	it("throws with status and body text on a non-ok response", async () => {
		const fetchImpl = vi
			.fn()
			.mockImplementation(fakeFetch(429, null, "quota exceeded"));

		await expect(
			collect(
				streamChatCompletion({
					systemPrompt: "sys",
					messages: [{ role: "user", text: "hi" }],
					apiKey: "test-key",
					fetchImpl,
				}),
			),
		).rejects.toThrow(/429/);
	});
});
