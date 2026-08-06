import { describe, expect, it } from "vitest";
import { putConversation, type ConversationKV } from "../history/kv";
import type { StoredConversation } from "../history/types";
import {
	handleDeleteAllHistory,
	handleDeleteConversation,
	handleGetConversation,
	handleListHistory,
} from "./historyHandlers";

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
		const response = await handleListHistory({ request: requestWithCookie(), kv: createMockKV() });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual([]);
	});

	it("returns the visitor's conversations", async () => {
		const kv = createMockKV();
		await putConversation(kv, "v-1", "c-1", sample);
		const response = await handleListHistory({ request: requestWithCookie("visitor_id=v-1"), kv });
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
		await putConversation(kv, "v-1", "c-1", sample);
		const response = await handleGetConversation({
			request: requestWithCookie("visitor_id=v-2"),
			kv,
			conversationId: "c-1",
		});
		expect(response.status).toBe(404);
	});

	it("returns the conversation for its owning visitor", async () => {
		const kv = createMockKV();
		await putConversation(kv, "v-1", "c-1", sample);
		const response = await handleGetConversation({
			request: requestWithCookie("visitor_id=v-1"),
			kv,
			conversationId: "c-1",
		});
		expect(await response.json()).toEqual(sample);
	});
});

describe("handleDeleteConversation", () => {
	it("deletes an owned conversation and returns 204", async () => {
		const kv = createMockKV();
		await putConversation(kv, "v-1", "c-1", sample);
		const response = await handleDeleteConversation({
			request: requestWithCookie("visitor_id=v-1"),
			kv,
			conversationId: "c-1",
		});
		expect(response.status).toBe(204);
		expect(kv.store.has("conv:v-1:c-1")).toBe(false);
	});

	it("returns 404 for a conversation that does not exist", async () => {
		const response = await handleDeleteConversation({
			request: requestWithCookie("visitor_id=v-1"),
			kv: createMockKV(),
			conversationId: "missing",
		});
		expect(response.status).toBe(404);
	});
});

describe("handleDeleteAllHistory", () => {
	it("deletes every conversation for the visitor without touching other visitors", async () => {
		const kv = createMockKV();
		await putConversation(kv, "v-1", "c-1", sample);
		await putConversation(kv, "v-1", "c-2", sample);
		await putConversation(kv, "v-2", "c-3", sample);

		const response = await handleDeleteAllHistory({ request: requestWithCookie("visitor_id=v-1"), kv });

		expect(response.status).toBe(204);
		expect(kv.store.has("conv:v-1:c-1")).toBe(false);
		expect(kv.store.has("conv:v-1:c-2")).toBe(false);
		expect(kv.store.has("conv:v-2:c-3")).toBe(true);
	});

	it("is a no-op (still 204) when there is no visitor_id cookie", async () => {
		const response = await handleDeleteAllHistory({ request: requestWithCookie(), kv: createMockKV() });
		expect(response.status).toBe(204);
	});
});
