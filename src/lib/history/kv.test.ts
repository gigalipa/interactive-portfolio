import { describe, expect, it } from "vitest";
import {
	buildTitle,
	deleteAllConversations,
	deleteConversation,
	getConversation,
	listConversations,
	putConversation,
} from "./kv";
import type { StoredConversation } from "./types";
import { createMockKV } from "./testUtils";

const sampleConversation: StoredConversation = {
	messages: [{ role: "user", text: "Hi", at: "2026-08-06T00:00:00.000Z" }],
	updatedAt: "2026-08-06T00:00:00.000Z",
	title: "Hi",
};

describe("conversation KV helpers", () => {
	it("round-trips a conversation through put/get", async () => {
		const kv = createMockKV();
		await putConversation(kv, "visitor-1", "conv-1", sampleConversation);
		const result = await getConversation(kv, "visitor-1", "conv-1");
		expect(result).toEqual(sampleConversation);
	});

	it("round-trips a voice-tagged message through put/get", async () => {
		const kv = createMockKV();
		const conversation: StoredConversation = {
			messages: [
				{
					role: "user",
					text: "Hi",
					at: "2026-08-12T00:00:00.000Z",
					mode: "voice",
				},
				{
					role: "model",
					text: "Hello!",
					at: "2026-08-12T00:00:00.000Z",
					mode: "voice",
				},
			],
			updatedAt: "2026-08-12T00:00:00.000Z",
			title: "Hi",
		};

		await putConversation(kv, "visitor-1", "conv-1", conversation);
		const loaded = await getConversation(kv, "visitor-1", "conv-1");

		expect(loaded?.messages[0]).toEqual(
			expect.objectContaining({ mode: "voice" }),
		);
		expect(loaded?.messages[1]).toEqual(
			expect.objectContaining({ mode: "voice" }),
		);
	});

	it("returns null for a missing conversation", async () => {
		const kv = createMockKV();
		const result = await getConversation(kv, "visitor-1", "does-not-exist");
		expect(result).toBeNull();
	});

	it("sets a 30-day expirationTtl on every write", async () => {
		const kv = createMockKV();
		let capturedOptions: { expirationTtl?: number } | undefined;
		kv.put = async (key, value, options) => {
			capturedOptions = options;
			kv.store.set(key, value);
		};
		await putConversation(kv, "visitor-1", "conv-1", sampleConversation);
		expect(capturedOptions?.expirationTtl).toBe(60 * 60 * 24 * 30);
	});

	it("lists only the requesting visitor's conversations, newest first", async () => {
		const kv = createMockKV();
		await putConversation(kv, "visitor-1", "conv-old", {
			...sampleConversation,
			updatedAt: "2026-08-01T00:00:00.000Z",
			title: "Old",
		});
		await putConversation(kv, "visitor-1", "conv-new", {
			...sampleConversation,
			updatedAt: "2026-08-05T00:00:00.000Z",
			title: "New",
		});
		await putConversation(kv, "visitor-2", "conv-other", sampleConversation);

		const result = await listConversations(kv, "visitor-1");

		expect(result).toEqual([
			{
				conversationId: "conv-new",
				title: "New",
				updatedAt: "2026-08-05T00:00:00.000Z",
			},
			{
				conversationId: "conv-old",
				title: "Old",
				updatedAt: "2026-08-01T00:00:00.000Z",
			},
		]);
	});

	it("deletes a single conversation", async () => {
		const kv = createMockKV();
		await putConversation(kv, "visitor-1", "conv-1", sampleConversation);
		await deleteConversation(kv, "visitor-1", "conv-1");
		expect(await getConversation(kv, "visitor-1", "conv-1")).toBeNull();
	});

	it("deletes all conversations for a visitor without touching other visitors", async () => {
		const kv = createMockKV();
		await putConversation(kv, "visitor-1", "conv-1", sampleConversation);
		await putConversation(kv, "visitor-1", "conv-2", sampleConversation);
		await putConversation(kv, "visitor-2", "conv-3", sampleConversation);

		await deleteAllConversations(kv, "visitor-1");

		expect(await listConversations(kv, "visitor-1")).toEqual([]);
		expect(await getConversation(kv, "visitor-2", "conv-3")).not.toBeNull();
	});
});

describe("buildTitle", () => {
	it("returns short messages unchanged", () => {
		expect(buildTitle("Hi there")).toBe("Hi there");
	});

	it("truncates long messages to 60 chars with an ellipsis", () => {
		const long = "a".repeat(80);
		const title = buildTitle(long);
		expect(title).toBe(`${"a".repeat(60)}…`);
	});
});
