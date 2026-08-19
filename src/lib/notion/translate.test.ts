import { describe, expect, it, vi } from "vitest";
import { cacheKey, hashFields, translateFields, translateForLocale } from "./translate";
import type { KnowledgeBaseEntry } from "./knowledgeBase";

function entry(overrides: Partial<KnowledgeBaseEntry> = {}): KnowledgeBaseEntry {
	return {
		pageId: "p1",
		title: "Ingeniero de Software",
		summary: "",
		description: "Construí sistemas de IA.",
		contentType: "Professional Experience",
		tags: [],
		priority: 0,
		status: "Published",
		language: "ES",
		relatedTo: [],
		metadata: { category: "Full-time Role", location: "Remoto" },
		...overrides,
	};
}

function fakeFetch(jsonText: string) {
	return vi.fn().mockResolvedValue({
		ok: true,
		status: 200,
		json: async () => ({ candidates: [{ content: { parts: [{ text: jsonText }] } }] }),
		text: async () => "",
	});
}

describe("hashFields / cacheKey", () => {
	it("produces the same hash for identical fields", () => {
		const fields = { title: "A", category: "B", location: "C", description: "D" };
		expect(hashFields(fields)).toBe(hashFields({ ...fields }));
	});

	it("produces a different hash when a field changes", () => {
		const fields = { title: "A", category: "B", location: "C", description: "D" };
		expect(hashFields(fields)).not.toBe(hashFields({ ...fields, description: "changed" }));
	});

	it("builds a cache key from pageId, locale, and the field hash", () => {
		const fields = { title: "A", category: "B", location: "C", description: "D" };
		expect(cacheKey("p1", "en", fields)).toBe(`p1:en:${hashFields(fields)}`);
	});
});

describe("translateFields", () => {
	it("returns the parsed translated fields on a valid response", async () => {
		const fetchImpl = fakeFetch(
			JSON.stringify({
				title: "Software Engineer",
				category: "Full-time Role",
				location: "Remote",
				description: "Built AI systems.",
			}),
		);
		const result = await translateFields(
			{ title: "Ingeniero de Software", category: "Full-time Role", location: "Remoto", description: "Construí sistemas de IA." },
			"en",
			{ apiKey: "key", fetchImpl },
		);
		expect(result).toEqual({
			title: "Software Engineer",
			category: "Full-time Role",
			location: "Remote",
			description: "Built AI systems.",
		});
	});

	it("throws if the response is not ok", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue({ ok: false, status: 500, json: async () => ({}), text: async () => "server error" });
		await expect(
			translateFields({ title: "A", category: "", location: "", description: "" }, "en", {
				apiKey: "key",
				fetchImpl,
			}),
		).rejects.toThrow("Translation request failed (500)");
	});

	it("throws if the response text isn't valid TranslatableFields JSON", async () => {
		const fetchImpl = fakeFetch(JSON.stringify({ oops: "wrong shape" }));
		await expect(
			translateFields({ title: "A", category: "", location: "", description: "" }, "en", {
				apiKey: "key",
				fetchImpl,
			}),
		).rejects.toThrow("not valid TranslatableFields JSON");
	});

	it("falls through to the next model in the chain on a 429", async () => {
		const rateLimited = { ok: false, status: 429, json: async () => ({}), text: async () => "rate limited" };
		const ok = {
			ok: true,
			status: 200,
			json: async () => ({
				candidates: [
					{
						content: {
							parts: [
								{
									text: JSON.stringify({
										title: "Software Engineer",
										category: "",
										location: "",
										description: "",
									}),
								},
							],
						},
					},
				],
			}),
			text: async () => "",
		};
		const fetchImpl = vi.fn().mockResolvedValueOnce(rateLimited).mockResolvedValueOnce(ok);

		const result = await translateFields({ title: "A", category: "", location: "", description: "" }, "en", {
			apiKey: "key",
			fetchImpl,
		});

		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(fetchImpl.mock.calls[0][0]).toContain("gemini-flash-lite-latest");
		expect(fetchImpl.mock.calls[1][0]).toContain("gemini-3.1-flash-lite");
		expect(result.title).toBe("Software Engineer");
	});

	it("falls through to the next model in the chain on a 503 (model overloaded)", async () => {
		const overloaded = {
			ok: false,
			status: 503,
			json: async () => ({}),
			text: async () => "This model is currently experiencing high demand.",
		};
		const ok = {
			ok: true,
			status: 200,
			json: async () => ({
				candidates: [
					{ content: { parts: [{ text: JSON.stringify({ title: "C", category: "", location: "", description: "" }) }] } },
				],
			}),
			text: async () => "",
		};
		const fetchImpl = vi.fn().mockResolvedValueOnce(overloaded).mockResolvedValueOnce(ok);

		const result = await translateFields({ title: "A", category: "", location: "", description: "" }, "en", {
			apiKey: "key",
			fetchImpl,
		});

		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(result.title).toBe("C");
	});

	it("waits and retries the whole chain once if every model is rate-limited, then succeeds", async () => {
		vi.useFakeTimers();
		try {
			const rateLimited = { ok: false, status: 429, json: async () => ({}), text: async () => "rate limited" };
			const ok = {
				ok: true,
				status: 200,
				json: async () => ({
					candidates: [
						{ content: { parts: [{ text: JSON.stringify({ title: "B", category: "", location: "", description: "" }) }] } },
					],
				}),
				text: async () => "",
			};
			// All 3 models 429 on the first pass, then the first model succeeds on the retry pass.
			const fetchImpl = vi
				.fn()
				.mockResolvedValueOnce(rateLimited)
				.mockResolvedValueOnce(rateLimited)
				.mockResolvedValueOnce(rateLimited)
				.mockResolvedValueOnce(ok);

			const promise = translateFields({ title: "A", category: "", location: "", description: "" }, "en", {
				apiKey: "key",
				fetchImpl,
			});
			await vi.runAllTimersAsync();
			const result = await promise;

			expect(fetchImpl).toHaveBeenCalledTimes(4);
			expect(result.title).toBe("B");
		} finally {
			vi.useRealTimers();
		}
	});

	it("throws with the last 429 response if every model is rate-limited on both passes", async () => {
		vi.useFakeTimers();
		try {
			const rateLimited = {
				ok: false,
				status: 429,
				json: async () => ({}),
				text: async () => "still rate limited",
			};
			const fetchImpl = vi.fn().mockResolvedValue(rateLimited);

			const promise = translateFields({ title: "A", category: "", location: "", description: "" }, "en", {
				apiKey: "key",
				fetchImpl,
			});
			const assertion = expect(promise).rejects.toThrow("Translation request failed (429)");
			await vi.runAllTimersAsync();
			await assertion;

			expect(fetchImpl).toHaveBeenCalledTimes(6);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("translateForLocale", () => {
	it("passes an entry through unchanged when it's already in the target locale", async () => {
		const fetchImpl = vi.fn();
		const [result] = await translateForLocale([entry({ language: "ES" })], "es", {
			apiKey: "key",
			cache: {},
			fetchImpl,
		});
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(result.displayTitle).toBe("Ingeniero de Software");
		expect(result.displayDescription).toBe("Construí sistemas de IA.");
	});

	it("translates an entry not in the target locale and stores it in the cache", async () => {
		const fetchImpl = fakeFetch(
			JSON.stringify({
				title: "Software Engineer",
				category: "Full-time Role",
				location: "Remote",
				description: "Built AI systems.",
			}),
		);
		const cache: Record<string, { title: string; category: string; location: string; description: string }> = {};
		const [result] = await translateForLocale([entry({ language: "ES" })], "en", {
			apiKey: "key",
			cache,
			fetchImpl,
		});
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(result.displayTitle).toBe("Software Engineer");
		expect(Object.keys(cache)).toHaveLength(1);
	});

	it("reuses a cached translation instead of calling the API again", async () => {
		const fetchImpl = vi.fn();
		const source = entry({ language: "ES" });
		const fields = {
			title: source.title,
			category: source.metadata.category ?? "",
			location: source.metadata.location ?? "",
			description: source.description,
		};
		const key = cacheKey(source.pageId, "en", fields);
		const cache = {
			[key]: { title: "Cached Title", category: "Cached Cat", location: "Cached Loc", description: "Cached Desc" },
		};

		const [result] = await translateForLocale([source], "en", { apiKey: "key", cache, fetchImpl });

		expect(fetchImpl).not.toHaveBeenCalled();
		expect(result.displayTitle).toBe("Cached Title");
	});
});
