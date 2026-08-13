import { describe, expect, it, vi } from "vitest";
import { createMockKV } from "../history/testUtils";
import type { StoredConversation } from "../history/types";
import { handleVoiceTurnRequest } from "./turnHandler";

const VISITOR_A = "11111111-1111-4111-8111-111111111111";
const CONV_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function createRequest(body: unknown, cookie?: string): Request {
	const headers = new Headers({ "Content-Type": "application/json" });
	if (cookie) headers.set("cookie", cookie);
	return new Request("https://example.com/api/voice/turn", {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
}

function allowingRateLimiter() {
	return { limit: vi.fn().mockResolvedValue({ success: true }) };
}

describe("handleVoiceTurnRequest", () => {
	it("does nothing and returns 200 with no cookie when persist is false", async () => {
		const kv = createMockKV();
		const response = await handleVoiceTurnRequest({
			request: createRequest({ persist: false, userText: "Hi", modelText: "Hello" }),
			kv,
			rateLimiter: allowingRateLimiter(),
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("Set-Cookie")).toBeNull();
		expect(kv.store.size).toBe(0);
	});

	it("persists a new voice-tagged conversation and sets a visitor_id cookie when persist is true with no prior cookie", async () => {
		const kv = createMockKV();
		const response = await handleVoiceTurnRequest({
			request: createRequest({ persist: true, userText: "Hi", modelText: "Hello there" }),
			kv,
			rateLimiter: allowingRateLimiter(),
		});

		expect(response.headers.get("Set-Cookie")).toContain("visitor_id=");
		expect(kv.store.size).toBe(1);
		const [stored] = [...kv.store.values()];
		const conversation = JSON.parse(stored) as StoredConversation;
		expect(conversation.messages).toEqual([
			expect.objectContaining({ role: "user", text: "Hi", mode: "voice" }),
			expect.objectContaining({ role: "model", text: "Hello there", mode: "voice" }),
		]);
		expect(conversation.title).toBe("Hi");
	});

	it("appends to an existing conversation when a conversationId is supplied", async () => {
		const kv = createMockKV();
		kv.store.set(
			`conv:${VISITOR_A}:${CONV_A}`,
			JSON.stringify({
				messages: [{ role: "user", text: "First", at: "2026-08-12T00:00:00.000Z" }],
				updatedAt: "2026-08-12T00:00:00.000Z",
				title: "First",
			} satisfies StoredConversation),
		);

		const response = await handleVoiceTurnRequest({
			request: createRequest(
				{ persist: true, conversationId: CONV_A, userText: "Second", modelText: "Reply" },
				`visitor_id=${VISITOR_A}`,
			),
			kv,
			rateLimiter: allowingRateLimiter(),
		});
		const body = (await response.json()) as { conversationId?: string };

		expect(body.conversationId).toBe(CONV_A);
		const conversation = JSON.parse(
			kv.store.get(`conv:${VISITOR_A}:${CONV_A}`)!,
		) as StoredConversation;
		expect(conversation.messages).toHaveLength(3);
		expect(conversation.title).toBe("First");
	});

	it("returns 400 when userText or modelText is missing", async () => {
		const kv = createMockKV();
		const response = await handleVoiceTurnRequest({
			request: createRequest({ persist: true, userText: "Hi" }),
			kv,
			rateLimiter: allowingRateLimiter(),
		});

		expect(response.status).toBe(400);
		expect(kv.store.size).toBe(0);
	});

	it("returns 400 for a client-supplied conversationId that is not a UUID", async () => {
		const kv = createMockKV();
		const response = await handleVoiceTurnRequest({
			request: createRequest(
				{ persist: true, conversationId: "../../evil", userText: "Hi", modelText: "Hello" },
				`visitor_id=${VISITOR_A}`,
			),
			kv,
			rateLimiter: allowingRateLimiter(),
		});

		expect(response.status).toBe(400);
		expect(kv.store.size).toBe(0);
	});

	it("returns 429 without touching KV when rate-limited", async () => {
		const kv = createMockKV();
		const rateLimiter = { limit: vi.fn().mockResolvedValue({ success: false }) };
		const response = await handleVoiceTurnRequest({
			request: createRequest({ persist: true, userText: "Hi", modelText: "Hello" }),
			kv,
			rateLimiter,
		});

		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("60");
		expect(kv.store.size).toBe(0);
	});

	it("returns 400 when userText or modelText exceeds the max length", async () => {
		const kv = createMockKV();
		const tooLong = "a".repeat(4001);

		const userTooLong = await handleVoiceTurnRequest({
			request: createRequest({ persist: true, userText: tooLong, modelText: "Hello" }),
			kv,
			rateLimiter: allowingRateLimiter(),
		});
		expect(userTooLong.status).toBe(400);

		const modelTooLong = await handleVoiceTurnRequest({
			request: createRequest({ persist: true, userText: "Hi", modelText: tooLong }),
			kv,
			rateLimiter: allowingRateLimiter(),
		});
		expect(modelTooLong.status).toBe(400);

		expect(kv.store.size).toBe(0);
	});
});
