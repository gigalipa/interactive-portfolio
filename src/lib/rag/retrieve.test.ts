import { describe, expect, it } from "vitest";
import { buildWhere, rankChunks, type RetrievedChunk } from "./retrieve";

describe("buildWhere", () => {
	it("returns undefined when nothing is scoped", () => {
		expect(buildWhere(undefined, undefined)).toBeUndefined();
	});

	it("returns a single clause unwrapped when only one filter is set", () => {
		expect(buildWhere("Project", undefined)).toEqual({
			content_type: "Project",
		});
		expect(buildWhere(undefined, ["Personal Interest"])).toEqual({
			content_type: { $nin: ["Personal Interest"] },
		});
	});

	it("combines multiple filters with $and", () => {
		expect(buildWhere("Project", ["Personal Interest"])).toEqual({
			$and: [
				{ content_type: "Project" },
				{ content_type: { $nin: ["Personal Interest"] } },
			],
		});
	});

	it("ignores an empty exclusion list", () => {
		expect(buildWhere("Project", [])).toEqual({
			content_type: "Project",
		});
	});
});

function chunk(overrides: Partial<RetrievedChunk>): RetrievedChunk {
	return {
		id: "id",
		document: "doc",
		distance: 0.5,
		notionPageId: "page",
		title: "title",
		contentType: "Skill",
		tags: [],
		priority: 0,
		language: "EN",
		summary: "",
		...overrides,
	};
}

describe("rankChunks", () => {
	it("never lets a language match override a much better semantic match", () => {
		const strongOtherLanguage = chunk({
			id: "a",
			distance: 0.1,
			language: "EN",
		});
		const weakSameLanguage = chunk({ id: "b", distance: 0.9, language: "ES" });

		const ranked = rankChunks([weakSameLanguage, strongOtherLanguage], "ES");
		expect(ranked.map((c) => c.id)).toEqual(["a", "b"]);
	});

	it("nudges a same-language chunk ahead on a near-tie", () => {
		const sameLanguage = chunk({ id: "a", distance: 0.5, language: "ES" });
		const otherLanguage = chunk({ id: "b", distance: 0.49, language: "EN" });

		const ranked = rankChunks([otherLanguage, sameLanguage], "ES");
		expect(ranked.map((c) => c.id)).toEqual(["a", "b"]);
	});

	it("does not exclude or penalize anything when no preferred language is given", () => {
		const a = chunk({ id: "a", distance: 0.3, language: "EN" });
		const b = chunk({ id: "b", distance: 0.2, language: "FR" });

		const ranked = rankChunks([a, b], undefined);
		expect(ranked.map((c) => c.id)).toEqual(["b", "a"]);
	});

	it("still lets priority break a near-tie between two same-language chunks", () => {
		const lowPriority = chunk({
			id: "a",
			distance: 0.5,
			language: "ES",
			priority: 1,
		});
		const highPriority = chunk({
			id: "b",
			distance: 0.5,
			language: "ES",
			priority: 5,
		});

		const ranked = rankChunks([lowPriority, highPriority], "ES");
		expect(ranked.map((c) => c.id)).toEqual(["b", "a"]);
	});
});
