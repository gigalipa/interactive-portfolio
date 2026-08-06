import { describe, expect, it } from "vitest";
import { putConversation } from "../history/kv";
import type { StoredConversation } from "../history/types";
import { createMockKV } from "../history/testUtils";
import {
	handleDeleteAllHistory,
	handleDeleteConversation,
	handleGetConversation,
	handleListHistory,
} from "./historyHandlers";

// visitor_id cookies must be UUID-shaped to be accepted by readVisitorId.
const VISITOR_A = "11111111-1111-4111-8111-111111111111";
const VISITOR_B = "22222222-2222-4222-8222-222222222222";

function requestWithCookie(cookie?: string): Request {
	const headers = new Headers();
	if (cookie) headers.set("cookie", cookie);
	return new Request("https://example.com/api/history/list", { headers });
}

const sample: StoredConversation = {
	messages: [{ role: "user", text: "Hi", at: "2026-08-06T00:00:00.000Z" }],
	updatedAt: "2026-08-06T00:00:00.000Z",
	title: "Hi",
};

describe("handleListHistory", () => {
	it("returns an empty array when there is no visitor_id cookie", async () => {
		const response = await handleListHistory({
			request: requestWithCookie(),
			kv: createMockKV(),
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual([]);
	});

	it("returns the visitor's conversations", async () => {
		const kv = createMockKV();
		await putConversation(kv, VISITOR_A, "c-1", sample);
		const response = await handleListHistory({
			request: requestWithCookie(`visitor_id=${VISITOR_A}`),
			kv,
		});
		expect(await response.json()).toEqual([
			{ conversationId: "c-1", title: "Hi", updatedAt: sample.updatedAt },
		]);
	});
});

describe("handleGetConversation", () => {
	it("returns 404 when there is no visitor_id cookie", async () => {
		const response = await handleGetConversation({
			request: requestWithCookie(),
			kv: createMockKV(),
			conversationId: "c-1",
		});
		expect(response.status).toBe(404);
	});

	it("returns 404 for another visitor's conversation", async () => {
		const kv = createMockKV();
		await putConversation(kv, VISITOR_A, "c-1", sample);
		const response = await handleGetConversation({
			request: requestWithCookie(`visitor_id=${VISITOR_B}`),
			kv,
			conversationId: "c-1",
		});
		expect(response.status).toBe(404);
	});

	it("returns the conversation for its owning visitor", async () => {
		const kv = createMockKV();
		await putConversation(kv, VISITOR_A, "c-1", sample);
		const response = await handleGetConversation({
			request: requestWithCookie(`visitor_id=${VISITOR_A}`),
			kv,
			conversationId: "c-1",
		});
		expect(await response.json()).toEqual(sample);
	});
});

describe("handleDeleteConversation", () => {
	it("deletes an owned conversation and returns 204", async () => {
		const kv = createMockKV();
		await putConversation(kv, VISITOR_A, "c-1", sample);
		const response = await handleDeleteConversation({
			request: requestWithCookie(`visitor_id=${VISITOR_A}`),
			kv,
			conversationId: "c-1",
		});
		expect(response.status).toBe(204);
		expect(kv.store.has(`conv:${VISITOR_A}:c-1`)).toBe(false);
	});

	it("returns 404 for a conversation that does not exist", async () => {
		const response = await handleDeleteConversation({
			request: requestWithCookie(`visitor_id=${VISITOR_A}`),
			kv: createMockKV(),
			conversationId: "missing",
		});
		expect(response.status).toBe(404);
	});
});

describe("handleDeleteAllHistory", () => {
	it("deletes every conversation for the visitor without touching other visitors", async () => {
		const kv = createMockKV();
		await putConversation(kv, VISITOR_A, "c-1", sample);
		await putConversation(kv, VISITOR_A, "c-2", sample);
		await putConversation(kv, VISITOR_B, "c-3", sample);

		const response = await handleDeleteAllHistory({
			request: requestWithCookie(`visitor_id=${VISITOR_A}`),
			kv,
		});

		expect(response.status).toBe(204);
		expect(kv.store.has(`conv:${VISITOR_A}:c-1`)).toBe(false);
		expect(kv.store.has(`conv:${VISITOR_A}:c-2`)).toBe(false);
		expect(kv.store.has(`conv:${VISITOR_B}:c-3`)).toBe(true);
	});

	it("is a no-op (still 204) when there is no visitor_id cookie", async () => {
		const response = await handleDeleteAllHistory({
			request: requestWithCookie(),
			kv: createMockKV(),
		});
		expect(response.status).toBe(204);
	});
});
