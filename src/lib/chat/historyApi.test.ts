import { describe, expect, it, vi } from "vitest";
import {
	deleteAllHistory,
	deleteConversation,
	fetchConversation,
	fetchHistoryList,
} from "./historyApi";
import type { StoredConversation } from "../history/types";

function mockFetchOnce(response: {
	ok: boolean;
	status?: number;
	json?: () => Promise<unknown>;
}) {
	return vi.fn().mockResolvedValue({
		ok: response.ok,
		status: response.status ?? (response.ok ? 200 : 500),
		json: response.json ?? (async () => ({})),
	});
}

describe("fetchHistoryList", () => {
	it("returns the parsed list on success", async () => {
		const list = [
			{
				conversationId: "c-1",
				title: "Hi",
				updatedAt: "2026-08-06T00:00:00.000Z",
			},
		];
		vi.stubGlobal("fetch", mockFetchOnce({ ok: true, json: async () => list }));
		expect(await fetchHistoryList()).toEqual(list);
		vi.unstubAllGlobals();
	});

	it("returns an empty array on failure", async () => {
		vi.stubGlobal("fetch", mockFetchOnce({ ok: false }));
		expect(await fetchHistoryList()).toEqual([]);
		vi.unstubAllGlobals();
	});
});

describe("fetchConversation", () => {
	it("returns the conversation on success", async () => {
		const conversation: StoredConversation = {
			messages: [],
			updatedAt: "2026-08-06T00:00:00.000Z",
			title: "Hi",
		};
		vi.stubGlobal(
			"fetch",
			mockFetchOnce({ ok: true, json: async () => conversation }),
		);
		expect(await fetchConversation("c-1")).toEqual(conversation);
		vi.unstubAllGlobals();
	});

	it("returns null on failure (e.g. 404)", async () => {
		vi.stubGlobal("fetch", mockFetchOnce({ ok: false, status: 404 }));
		expect(await fetchConversation("missing")).toBeNull();
		vi.unstubAllGlobals();
	});
});

describe("deleteConversation", () => {
	it("returns true on success", async () => {
		const fetchImpl = mockFetchOnce({ ok: true, status: 204 });
		vi.stubGlobal("fetch", fetchImpl);
		expect(await deleteConversation("c-1")).toBe(true);
		expect(fetchImpl).toHaveBeenCalledWith("/api/history/c-1", {
			method: "DELETE",
		});
		vi.unstubAllGlobals();
	});
});

describe("deleteAllHistory", () => {
	it("returns true on success", async () => {
		const fetchImpl = mockFetchOnce({ ok: true, status: 204 });
		vi.stubGlobal("fetch", fetchImpl);
		expect(await deleteAllHistory()).toBe(true);
		expect(fetchImpl).toHaveBeenCalledWith("/api/history", {
			method: "DELETE",
		});
		vi.unstubAllGlobals();
	});
});
