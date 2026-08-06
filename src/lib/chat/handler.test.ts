import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationKV } from "../history/kv";
import type { ChatMessage, StoredConversation } from "../history/types";
import { createMockKV } from "../history/testUtils";

vi.mock("../rag/retrieve", () => ({
	retrieveContext: vi.fn().mockResolvedValue([]),
}));
vi.mock("../rag/chat", () => ({
	streamChatCompletion: vi.fn(async function* () {
		yield "Hello";
		yield " there";
	}),
}));

import { retrieveContext } from "../rag/retrieve";
import { streamChatCompletion } from "../rag/chat";
import { handleChatRequest } from "./handler";

// visitor_id cookies and client-supplied conversationIds must be UUID-shaped.
const VISITOR_A = "11111111-1111-4111-8111-111111111111";
const CONV_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function createRequest(body: unknown, cookie?: string, ip?: string): Request {
	const headers = new Headers({ "Content-Type": "application/json" });
	if (cookie) headers.set("cookie", cookie);
	if (ip) headers.set("cf-connecting-ip", ip);
	return new Request("https://example.com/api/chat", {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
}

async function readSse(response: Response): Promise<string> {
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	let text = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		text += decoder.decode(value);
	}
	return text;
}

function baseOptions(kv: ConversationKV) {
	return {
		kv,
		rateLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
		chroma: { apiKey: "k", tenant: "t", database: "d" },
		googleApiKeyEmb: "emb-key",
		googleApiKeyLlm: "llm-key",
	};
}

beforeEach(() => {
	vi.mocked(retrieveContext).mockClear();
	vi.mocked(retrieveContext).mockResolvedValue([]);
	vi.mocked(streamChatCompletion).mockClear();
	vi.mocked(streamChatCompletion).mockImplementation(async function* () {
		yield "Hello";
		yield " there";
	});
});

describe("handleChatRequest", () => {
	it("streams delta events and a done event for a persist:false request", async () => {
		const kv = createMockKV();
		const response = await handleChatRequest({
			request: createRequest({ persist: false, message: "Hi", history: [] }),
			...baseOptions(kv),
		});

		const text = await readSse(response);

		expect(text).toContain('event: delta\ndata: {"text":"Hello"}');
		expect(text).toContain('event: delta\ndata: {"text":" there"}');
		expect(text).toContain("event: done");
		expect(text).not.toContain("event: meta");
		expect(response.headers.get("Set-Cookie")).toBeNull();
		expect(kv.store.size).toBe(0);
	});

	it("sets a visitor_id cookie and persists the conversation when persist:true with no prior cookie", async () => {
		const kv = createMockKV();
		const response = await handleChatRequest({
			request: createRequest({ persist: true, message: "Hi" }),
			...baseOptions(kv),
		});

		await readSse(response);

		expect(response.headers.get("Set-Cookie")).toContain("visitor_id=");
		expect(kv.store.size).toBe(1);
		const [stored] = [...kv.store.values()];
		const conversation = JSON.parse(stored) as StoredConversation;
		expect(conversation.messages).toEqual([
			expect.objectContaining({ role: "user", text: "Hi" }),
			expect.objectContaining({ role: "model", text: "Hello there" }),
		]);
		expect(conversation.title).toBe("Hi");
	});

	it("sends a meta event with the conversationId for a persist:true request", async () => {
		const kv = createMockKV();
		const response = await handleChatRequest({
			request: createRequest(
				{ persist: true, conversationId: CONV_A, message: "Hi" },
				`visitor_id=${VISITOR_A}`,
			),
			...baseOptions(kv),
		});

		const text = await readSse(response);

		expect(text).toContain(`event: meta\ndata: {"conversationId":"${CONV_A}"}`);
		expect(kv.store.has(`conv:${VISITOR_A}:${CONV_A}`)).toBe(true);
	});

	it("continues an existing conversation, preserving its title", async () => {
		const kv = createMockKV();
		kv.store.set(
			`conv:${VISITOR_A}:${CONV_A}`,
			JSON.stringify({
				messages: [
					{ role: "user", text: "First", at: "2026-08-06T00:00:00.000Z" },
				],
				updatedAt: "2026-08-06T00:00:00.000Z",
				title: "First",
			} satisfies StoredConversation),
		);

		const response = await handleChatRequest({
			request: createRequest(
				{ persist: true, conversationId: CONV_A, message: "Second" },
				`visitor_id=${VISITOR_A}`,
			),
			...baseOptions(kv),
		});
		await readSse(response);

		const conversation = JSON.parse(
			kv.store.get(`conv:${VISITOR_A}:${CONV_A}`)!,
		) as StoredConversation;
		expect(conversation.title).toBe("First");
		expect(conversation.messages).toHaveLength(3);
	});

	it("returns 429 without calling retrieveContext when the rate limit is exceeded", async () => {
		const kv = createMockKV();
		const options = baseOptions(kv);
		options.rateLimiter.limit = vi.fn().mockResolvedValue({ success: false });

		const response = await handleChatRequest({
			request: createRequest({ persist: false, message: "Hi", history: [] }),
			...options,
		});

		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("60");
		expect(retrieveContext).not.toHaveBeenCalled();
	});

	it("rate-limits on the client IP, not on a freshly generated visitor id", async () => {
		const kv = createMockKV();
		const options = baseOptions(kv);

		// Two persist:true requests from the same IP with NO cookie: resolveVisitorId
		// mints a fresh UUID for each, so if the key were derived from it the limiter
		// would see two distinct clients and could never throttle anyone.
		for (let i = 0; i < 2; i += 1) {
			const response = await handleChatRequest({
				request: createRequest(
					{ persist: true, message: "Hi" },
					undefined,
					"203.0.113.7",
				),
				...options,
			});
			await readSse(response);
		}

		const keys = options.rateLimiter.limit.mock.calls.map(
			(call) => (call[0] as { key: string }).key,
		);
		expect(keys).toHaveLength(2);
		expect(keys[0]).toBe(keys[1]);
		expect(keys[0]).toBe("203.0.113.7");
	});

	it("falls back to 'anonymous' as the rate-limit key when there is no client IP", async () => {
		const kv = createMockKV();
		const options = baseOptions(kv);

		const response = await handleChatRequest({
			request: createRequest({ persist: true, message: "Hi" }),
			...options,
		});
		await readSse(response);

		expect(options.rateLimiter.limit).toHaveBeenCalledWith({
			key: "anonymous",
		});
	});

	it("returns 400 for a message longer than 4000 characters", async () => {
		const kv = createMockKV();
		const response = await handleChatRequest({
			request: createRequest({
				persist: false,
				message: "x".repeat(4001),
				history: [],
			}),
			...baseOptions(kv),
		});

		expect(response.status).toBe(400);
		expect(retrieveContext).not.toHaveBeenCalled();
	});

	it("returns 400 for a client-supplied conversationId that is not a UUID", async () => {
		const kv = createMockKV();
		const response = await handleChatRequest({
			request: createRequest(
				{ persist: true, conversationId: "../../evil", message: "Hi" },
				`visitor_id=${VISITOR_A}`,
			),
			...baseOptions(kv),
		});

		expect(response.status).toBe(400);
		expect(kv.store.size).toBe(0);
	});

	it("filters out malformed history entries instead of crashing", async () => {
		const kv = createMockKV();
		const response = await handleChatRequest({
			request: createRequest({
				persist: false,
				message: "Hi",
				history: [
					{ role: "user", text: "Good", at: "2026-08-06T00:00:00.000Z" },
					null,
					{ role: "system", text: "Bad role" },
					{ role: "model" },
					{ text: "No role" },
					"not an object",
				],
			}),
			...baseOptions(kv),
		});

		const text = await readSse(response);
		expect(text).toContain("event: done");
		expect(text).not.toContain("event: error");

		const [call] = vi.mocked(streamChatCompletion).mock.calls;
		expect(call[0].messages).toEqual([
			{ role: "user", text: "Good" },
			{ role: "user", text: "Hi" },
		]);
	});

	it("sends at most the last 20 messages to the model", async () => {
		const kv = createMockKV();
		const history: ChatMessage[] = Array.from({ length: 25 }, (_, i) => ({
			role: i % 2 === 0 ? "user" : "model",
			text: `msg-${i}`,
			at: "2026-08-06T00:00:00.000Z",
		}));

		const response = await handleChatRequest({
			request: createRequest({ persist: false, message: "Latest", history }),
			...baseOptions(kv),
		});
		await readSse(response);

		const [call] = vi.mocked(streamChatCompletion).mock.calls;
		expect(call[0].messages).toHaveLength(20);
		// The cap keeps the most recent turns, ending with the message just sent.
		expect(call[0].messages.at(-1)).toEqual({ role: "user", text: "Latest" });
		expect(call[0].messages[0]).toEqual({ role: "user", text: "msg-6" });
	});

	it("caps the conversation stored in KV at 100 messages", async () => {
		const kv = createMockKV();
		const messages: ChatMessage[] = Array.from({ length: 120 }, (_, i) => ({
			role: i % 2 === 0 ? "user" : "model",
			text: `msg-${i}`,
			at: "2026-08-06T00:00:00.000Z",
		}));
		kv.store.set(
			`conv:${VISITOR_A}:${CONV_A}`,
			JSON.stringify({
				messages,
				updatedAt: "2026-08-06T00:00:00.000Z",
				title: "Long",
			} satisfies StoredConversation),
		);

		const response = await handleChatRequest({
			request: createRequest(
				{ persist: true, conversationId: CONV_A, message: "Newest" },
				`visitor_id=${VISITOR_A}`,
			),
			...baseOptions(kv),
		});
		await readSse(response);

		const stored = JSON.parse(
			kv.store.get(`conv:${VISITOR_A}:${CONV_A}`)!,
		) as StoredConversation;
		expect(stored.messages).toHaveLength(100);
		expect(stored.messages.at(-1)).toEqual(
			expect.objectContaining({ role: "model", text: "Hello there" }),
		);
	});

	it("completes the KV write before the SSE stream closes", async () => {
		const kv = createMockKV();
		const events: string[] = [];
		const originalPut = kv.put.bind(kv);
		// A genuinely slow put: the KV write only settles on a later macrotask. That
		// makes the ordering observable — if persistTurn were moved after
		// controller.close(), the reader would see the stream end first and
		// "stream:closed" would be recorded before "kv:put-done".
		kv.put = async (key, value, options) => {
			await new Promise((resolve) => setTimeout(resolve, 5));
			await originalPut(key, value, options);
			events.push("kv:put-done");
		};

		const response = await handleChatRequest({
			request: createRequest(
				{ persist: true, conversationId: CONV_A, message: "Hi" },
				`visitor_id=${VISITOR_A}`,
			),
			...baseOptions(kv),
		});

		const reader = response.body!.getReader();
		while (true) {
			const { done } = await reader.read();
			if (done) break;
		}
		events.push("stream:closed");

		expect(events).toEqual(["kv:put-done", "stream:closed"]);
		expect(kv.store.has(`conv:${VISITOR_A}:${CONV_A}`)).toBe(true);
	});

	it("returns 400 for a missing message", async () => {
		const kv = createMockKV();
		const response = await handleChatRequest({
			request: createRequest({ persist: false, history: [] }),
			...baseOptions(kv),
		});

		expect(response.status).toBe(400);
	});

	it("proceeds with empty context when retrieveContext fails", async () => {
		vi.mocked(retrieveContext).mockRejectedValueOnce(new Error("chroma down"));
		const kv = createMockKV();

		const response = await handleChatRequest({
			request: createRequest({ persist: false, message: "Hi", history: [] }),
			...baseOptions(kv),
		});

		const text = await readSse(response);
		expect(text).toContain("event: delta");
		expect(text).not.toContain("event: error");
	});

	it("emits a generic error event, not the upstream message, when the model call fails mid-stream", async () => {
		vi.mocked(streamChatCompletion).mockImplementationOnce(async function* () {
			yield "partial";
			throw new Error("model exploded");
		});
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const kv = createMockKV();

		const response = await handleChatRequest({
			request: createRequest({ persist: false, message: "Hi", history: [] }),
			...baseOptions(kv),
		});

		const text = await readSse(response);
		expect(text).toContain("event: delta");
		expect(text).toContain(
			'event: error\ndata: {"message":"The avatar couldn\'t reply just now. Please try again."}',
		);
		expect(text).not.toContain("model exploded");
		// The real error still reaches the server-side log.
		expect(consoleError).toHaveBeenCalled();
		consoleError.mockRestore();
	});

	it("persists the user's message and partial reply when the model call fails mid-stream for a persist:true request", async () => {
		vi.mocked(streamChatCompletion).mockImplementationOnce(async function* () {
			yield "partial";
			throw new Error("model exploded");
		});
		const kv = createMockKV();

		const response = await handleChatRequest({
			request: createRequest(
				{ persist: true, conversationId: CONV_A, message: "Hi" },
				`visitor_id=${VISITOR_A}`,
			),
			...baseOptions(kv),
		});
		await readSse(response);

		expect(kv.store.has(`conv:${VISITOR_A}:${CONV_A}`)).toBe(true);
		const conversation = JSON.parse(
			kv.store.get(`conv:${VISITOR_A}:${CONV_A}`)!,
		) as StoredConversation;
		expect(conversation.messages).toEqual([
			expect.objectContaining({ role: "user", text: "Hi" }),
			expect.objectContaining({ role: "model", text: "partial" }),
		]);
	});
});
