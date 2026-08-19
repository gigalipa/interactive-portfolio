import { describe, expect, it, vi } from "vitest";
import { extractEntry, fetchKnowledgeBaseEntries, parseMetadata } from "./knowledgeBase";
import type { PageObjectResponse } from "@notionhq/client";

function fakePage(overrides: Partial<PageObjectResponse["properties"]> = {}): PageObjectResponse {
	return {
		id: "page-1",
		properties: {
			Title: { type: "title", title: [{ plain_text: "Senior Engineer" }] },
			Summary: { type: "rich_text", rich_text: [{ plain_text: "A short summary." }] },
			Description: { type: "rich_text", rich_text: [{ plain_text: "A longer description." }] },
			"Content Type": { type: "select", select: { name: "Professional Experience" } },
			Tags: { type: "multi_select", multi_select: [{ name: "backend" }, { name: "ai" }] },
			Priority: { type: "number", number: 5 },
			Status: { type: "select", select: { name: "Published" } },
			Language: { type: "select", select: { name: "ES" } },
			"Related To": { type: "relation", relation: [{ id: "skill-1" }] },
			Metadata: {
				type: "rich_text",
				rich_text: [{ plain_text: '{"category":"Full-time Role","location":"Remote"}' }],
			},
			...overrides,
			// biome-ignore: test fixture, not a real PageObjectResponse
		} as any,
	} as PageObjectResponse;
}

describe("parseMetadata", () => {
	it("parses a valid JSON metadata string", () => {
		expect(parseMetadata('{"category":"Web App","techStack":["Astro"]}')).toEqual({
			category: "Web App",
			techStack: ["Astro"],
		});
	});

	it("returns an empty object for undefined input", () => {
		expect(parseMetadata(undefined)).toEqual({});
	});

	it("returns an empty object for malformed JSON instead of throwing", () => {
		expect(parseMetadata("{not json")).toEqual({});
	});

	it("returns an empty object if the JSON parses to a non-object", () => {
		expect(parseMetadata('"just a string"')).toEqual({});
	});
});

describe("extractEntry", () => {
	it("extracts all scalar properties", () => {
		const entry = extractEntry(fakePage());
		expect(entry).toMatchObject({
			pageId: "page-1",
			title: "Senior Engineer",
			summary: "A short summary.",
			description: "A longer description.",
			contentType: "Professional Experience",
			tags: ["backend", "ai"],
			priority: 5,
			status: "Published",
			language: "ES",
			relatedTo: ["skill-1"],
		});
	});

	it("parses the Metadata JSON property into structured fields", () => {
		const entry = extractEntry(fakePage());
		expect(entry.metadata).toEqual({ category: "Full-time Role", location: "Remote" });
	});

	it("defaults metadata to an empty object when the Metadata property is absent", () => {
		const entry = extractEntry(fakePage({ Metadata: undefined as never }));
		expect(entry.metadata).toEqual({});
	});
});

describe("fetchKnowledgeBaseEntries", () => {
	it("pages through all results and extracts each entry", async () => {
		const query = vi
			.fn()
			.mockResolvedValueOnce({
				results: [fakePage({ Title: { type: "title", title: [{ plain_text: "First" }] } } as never)],
				has_more: true,
				next_cursor: "cursor-2",
			})
			.mockResolvedValueOnce({
				results: [fakePage({ Title: { type: "title", title: [{ plain_text: "Second" }] } } as never)],
				has_more: false,
				next_cursor: null,
			});
		const notion = { dataSources: { query } } as never;

		const entries = await fetchKnowledgeBaseEntries(notion, "ds-id");

		expect(entries.map((e) => e.title)).toEqual(["First", "Second"]);
		expect(query).toHaveBeenNthCalledWith(1, {
			data_source_id: "ds-id",
			start_cursor: undefined,
			page_size: 100,
		});
		expect(query).toHaveBeenNthCalledWith(2, {
			data_source_id: "ds-id",
			start_cursor: "cursor-2",
			page_size: 100,
		});
	});

	it("skips results without a properties field", async () => {
		const query = vi.fn().mockResolvedValueOnce({
			results: [{ id: "not-a-page" }],
			has_more: false,
			next_cursor: null,
		});
		const notion = { dataSources: { query } } as never;

		const entries = await fetchKnowledgeBaseEntries(notion, "ds-id");

		expect(entries).toEqual([]);
	});
});
