import { describe, expect, it } from "vitest";
import { groupByCategory } from "./groupByCategory";
import type { LocalizedPortfolioEntry } from "./portfolioEntries";

function entry(overrides: Partial<LocalizedPortfolioEntry> = {}): LocalizedPortfolioEntry {
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
		displayTitle: "Title",
		displayCategory: "",
		displayLocation: "",
		displayDescription: "",
		slug: "title",
		...overrides,
	};
}

describe("groupByCategory", () => {
	it("groups entries by displayCategory", () => {
		const groups = groupByCategory([
			entry({ pageId: "a", displayCategory: "Web App" }),
			entry({ pageId: "b", displayCategory: "AI Automation" }),
			entry({ pageId: "c", displayCategory: "Web App" }),
		]);
		expect(groups.map((g) => g.category)).toEqual(["AI Automation", "Web App"]);
		expect(groups.find((g) => g.category === "Web App")?.entries.map((e) => e.pageId)).toEqual(["a", "c"]);
	});

	it("collects entries with no category under Other, always last", () => {
		const groups = groupByCategory([
			entry({ pageId: "a", displayCategory: "Web App" }),
			entry({ pageId: "b", displayCategory: "" }),
		]);
		expect(groups.map((g) => g.category)).toEqual(["Web App", "Other"]);
		expect(groups.find((g) => g.category === "Other")?.entries.map((e) => e.pageId)).toEqual(["b"]);
	});

	it("sorts entries within a category most-recent-first", () => {
		const groups = groupByCategory([
			entry({ pageId: "old", displayCategory: "Web App", metadata: { dates: { start: "2020-01-01" } } }),
			entry({ pageId: "new", displayCategory: "Web App", metadata: { dates: { start: "2024-01-01" } } }),
		]);
		expect(groups[0].entries.map((e) => e.pageId)).toEqual(["new", "old"]);
	});

	it("returns an empty array for no entries", () => {
		expect(groupByCategory([])).toEqual([]);
	});
});
