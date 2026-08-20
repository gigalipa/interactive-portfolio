import { describe, expect, it } from "vitest";
import {
	CV_SECTIONS,
	groupBySection,
	selectCvEntries,
	skillChipsFor,
	type LocalizedEntryLike,
} from "./groupEntries";
import type { KnowledgeBaseEntry } from "../notion/knowledgeBase";

function kbEntry(
	overrides: Partial<KnowledgeBaseEntry> = {},
): KnowledgeBaseEntry {
	return {
		pageId: "p1",
		title: "Title",
		summary: "",
		description: "",
		contentType: "Professional Experience",
		tags: [],
		priority: 0,
		status: "Published",
		language: "EN",
		relatedTo: [],
		metadata: {},
		...overrides,
	};
}

function localized(
	overrides: Partial<LocalizedEntryLike> = {},
): LocalizedEntryLike {
	const base = kbEntry(overrides);
	return {
		...base,
		displayTitle: base.title,
		displayCategory: base.metadata.category ?? "",
		displayLocation: base.metadata.location ?? "",
		displayDescription: base.description,
		...overrides,
	};
}

describe("selectCvEntries", () => {
	it("keeps only Published entries with a relevant Content Type", () => {
		const entries = [
			kbEntry({
				pageId: "a",
				status: "Published",
				contentType: "Professional Experience",
			}),
			kbEntry({
				pageId: "b",
				status: "Draft",
				contentType: "Professional Experience",
			}),
			kbEntry({
				pageId: "c",
				status: "Published",
				contentType: "Some Other Type",
			}),
			kbEntry({ pageId: "d", status: "Published", contentType: "Skill" }),
		];
		expect(selectCvEntries(entries).map((e) => e.pageId)).toEqual(["a", "d"]);
	});
});

describe("groupBySection", () => {
	it("maps each Content Type to its section", () => {
		const entries = [
			localized({ pageId: "a", contentType: "Professional Experience" }),
			localized({ pageId: "b", contentType: "Project" }),
			localized({ pageId: "c", contentType: "Academic Experience" }),
			localized({ pageId: "d", contentType: "Personal Interest" }),
		];
		const grouped = groupBySection(entries);
		expect(grouped["Professional Experience"].map((e) => e.pageId)).toEqual([
			"a",
		]);
		expect(grouped.Projects.map((e) => e.pageId)).toEqual(["b"]);
		expect(
			grouped["Academic Experience & Certifications"].map((e) => e.pageId),
		).toEqual(["c"]);
		expect(
			grouped["Personal Interests & Background"].map((e) => e.pageId),
		).toEqual(["d"]);
	});

	it("excludes Skill entries from every section", () => {
		const grouped = groupBySection([
			localized({ pageId: "s", contentType: "Skill" }),
		]);
		for (const section of CV_SECTIONS) {
			expect(grouped[section]).toEqual([]);
		}
	});

	it("sorts entries by start date descending", () => {
		const entries = [
			localized({
				pageId: "old",
				metadata: { dates: { start: "2020-01-01" } },
			}),
			localized({
				pageId: "new",
				metadata: { dates: { start: "2024-01-01" } },
			}),
		];
		const grouped = groupBySection(entries);
		expect(grouped["Professional Experience"].map((e) => e.pageId)).toEqual([
			"new",
			"old",
		]);
	});

	it("falls back to Priority (higher first) for entries with no date, sorted after all dated entries", () => {
		const entries = [
			localized({
				pageId: "dated",
				metadata: { dates: { start: "2020-01-01" } },
				priority: 0,
			}),
			localized({ pageId: "low-priority", metadata: {}, priority: 1 }),
			localized({ pageId: "high-priority", metadata: {}, priority: 9 }),
		];
		const grouped = groupBySection(entries);
		expect(grouped["Professional Experience"].map((e) => e.pageId)).toEqual([
			"dated",
			"high-priority",
			"low-priority",
		]);
	});
});

describe("skillChipsFor", () => {
	it("matches a Skill entry that relates to the target entry", () => {
		const target = localized({ pageId: "job", relatedTo: [] });
		const skill = localized({
			pageId: "skill-1",
			contentType: "Skill",
			relatedTo: ["job"],
			displayTitle: "TypeScript",
		});
		expect(skillChipsFor(target, [target, skill])).toEqual(["TypeScript"]);
	});

	it("matches when the target entry itself lists the skill in relatedTo (the other relation direction)", () => {
		const skill = localized({
			pageId: "skill-1",
			contentType: "Skill",
			displayTitle: "Python",
		});
		const target = localized({ pageId: "job", relatedTo: ["skill-1"] });
		expect(skillChipsFor(target, [target, skill])).toEqual(["Python"]);
	});

	it("returns an empty array when no Skill entries relate to the target", () => {
		const target = localized({ pageId: "job" });
		const unrelatedSkill = localized({
			pageId: "skill-1",
			contentType: "Skill",
			relatedTo: ["other"],
		});
		expect(skillChipsFor(target, [target, unrelatedSkill])).toEqual([]);
	});
});
