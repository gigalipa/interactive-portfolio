import { describe, expect, it } from "vitest";
import { assignSlugs, selectPortfolioEntries } from "./portfolioEntries";
import type { KnowledgeBaseEntry } from "../notion/knowledgeBase";

function kbEntry(overrides: Partial<KnowledgeBaseEntry> = {}): KnowledgeBaseEntry {
	return {
		pageId: "p1",
		title: "Title",
		summary: "",
		description: "",
		contentType: "Project",
		tags: [],
		priority: 0,
		status: "Published",
		language: "EN",
		relatedTo: [],
		metadata: {},
		...overrides,
	};
}

describe("selectPortfolioEntries", () => {
	it("keeps only Published entries with Content Type = Project", () => {
		const entries = [
			kbEntry({ pageId: "a", status: "Published", contentType: "Project" }),
			kbEntry({ pageId: "b", status: "Draft", contentType: "Project" }),
			kbEntry({ pageId: "c", status: "Published", contentType: "Professional Experience" }),
		];
		expect(selectPortfolioEntries(entries).map((e) => e.pageId)).toEqual(["a"]);
	});
});

describe("assignSlugs", () => {
	it("assigns a slug per entry keyed by pageId", () => {
		const entries = [kbEntry({ pageId: "a", title: "Asset Foundry" }), kbEntry({ pageId: "b", title: "Language Quest" })];
		const slugs = assignSlugs(entries);
		expect(slugs.get("a")).toBe("asset-foundry");
		expect(slugs.get("b")).toBe("language-quest");
	});

	it("throws a clear error when two different entries produce the same slug", () => {
		const entries = [
			kbEntry({ pageId: "a", title: "Asset Foundry!" }),
			kbEntry({ pageId: "b", title: "Asset Foundry?" }),
		];
		expect(() => assignSlugs(entries)).toThrow(/slug/i);
	});

	it("does not throw when the same entry (same title) appears once", () => {
		const entries = [kbEntry({ pageId: "a", title: "Solo Project" })];
		expect(() => assignSlugs(entries)).not.toThrow();
	});

	it("throws when two different entries share the exact same title", () => {
		const entries = [
			kbEntry({ pageId: "a", title: "Portfolio Site" }),
			kbEntry({ pageId: "b", title: "Portfolio Site" }),
		];
		expect(() => assignSlugs(entries)).toThrow(/slug/i);
	});

	it("throws when a title produces an empty slug", () => {
		const entries = [kbEntry({ pageId: "a", title: "!!!" })];
		expect(() => assignSlugs(entries)).toThrow(/empty slug/i);
	});
});
