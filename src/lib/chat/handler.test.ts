import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationKV } from "../history/kv";
import type { StoredConversation } from "../history/types";

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

function createMockKV(): ConversationKV & { store: Map<string, string> } {
	const store = new Map<string, string>();
	return {
		store,
		async get(key) {
			return store.get(key) ?? null;
		},
		async put(key, value) {
			store.set(key, value);
		},
		async delete(key) {
			store.delete(key);
		},
		async list({ prefix }) {
			const keys = [...store.keys()]
				.filter((key) => key.startsWith(prefix))
				.map((name) => ({ name }));
			return { keys };
		},
	};
}

function createRequest(body: unknown, cookie?: string): Request {
	const headers = new Headers({ "Content-Type": "application/json" });
	if (cookie) headers.set("cookie", cookie);
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
				{ persist: true, conversationId: "conv-1", message: "Hi" },
				"visitor_id=v-1",
			),
			...baseOptions(kv),
		});

		const text = await readSse(response);

		expect(text).toContain('event: meta\ndata: {"conversationId":"conv-1"}');
		expect(kv.store.has("conv:v-1:conv-1")).toBe(true);
	});

	it("continues an existing conversation, preserving its title", async () => {
		const kv = createMockKV();
		kv.store.set(
			"conv:v-1:conv-1",
			JSON.stringify({
				messages: [{ role: "user", text: "First", at: "2026-08-06T00:00:00.000Z" }],
				updatedAt: "2026-08-06T00:00:00.000Z",
				title: "First",
			} satisfies StoredConversation),
		);

		const response = await handleChatRequest({
			request: createRequest(
				{ persist: true, conversationId: "conv-1", message: "Second" },
				"visitor_id=v-1",
			),
			...baseOptions(kv),
		});
		await readSse(response);

		const conversation = JSON.parse(kv.store.get("conv:v-1:conv-1")!) as StoredConversation;
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
		expect(retrieveContext).not.toHaveBeenCalled();
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

	it("emits an error event when the model call fails mid-stream", async () => {
		vi.mocked(streamChatCompletion).mockImplementationOnce(async function* () {
			yield "partial";
			throw new Error("model exploded");
		});
		const kv = createMockKV();

		const response = await handleChatRequest({
			request: createRequest({ persist: false, message: "Hi", history: [] }),
			...baseOptions(kv),
		});

		const text = await readSse(response);
		expect(text).toContain("event: delta");
		expect(text).toContain('event: error\ndata: {"message":"model exploded"}');
	});
});
