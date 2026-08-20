import type { KnowledgeBaseEntry } from "../notion/knowledgeBase";
import { dateSortKey } from "../shared/sortByDate";

/** Structurally identical to `LocalizedEntry` from `../notion/translate` (Task 3) —
 * kept as a local alias here so this module has no runtime or type-only
 * dependency on Task 3's file, avoiding an import-order coupling between the
 * two. Task 7 passes real `LocalizedEntry` values in; TypeScript's structural
 * typing accepts them here with no changes needed. */
export type LocalizedEntryLike = KnowledgeBaseEntry & {
	displayTitle: string;
	displayCategory: string;
	displayLocation: string;
	displayDescription: string;
};

export const CV_CONTENT_TYPES = [
	"Professional Experience",
	"Project",
	"Academic Experience",
	"Personal Interest",
	"Skill",
] as const;

export type CvSection =
	| "Professional Experience"
	| "Projects"
	| "Academic Experience & Certifications"
	| "Personal Interests & Background";

export const CV_SECTIONS: CvSection[] = [
	"Professional Experience",
	"Projects",
	"Academic Experience & Certifications",
	"Personal Interests & Background",
];

const SECTION_BY_CONTENT_TYPE: Record<string, CvSection> = {
	"Professional Experience": "Professional Experience",
	Project: "Projects",
	"Academic Experience": "Academic Experience & Certifications",
	"Personal Interest": "Personal Interests & Background",
};

/** Entries eligible for the CV build: Published, one of the five relevant
 * Content Types (Skill included — needed for chip matching, not its own section). */
export function selectCvEntries(entries: KnowledgeBaseEntry[]): KnowledgeBaseEntry[] {
	return entries.filter(
		(entry) =>
			entry.status === "Published" &&
			entry.contentType !== null &&
			(CV_CONTENT_TYPES as readonly string[]).includes(entry.contentType),
	);
}

/** Bidirectional match: a Skill's own `relatedTo` list, or any Skill entry whose
 * `relatedTo` includes this entry's pageId — Notion relations are bidirectional
 * but a single page's properties only ever show one side of the link. */
export function skillChipsFor(
	entry: LocalizedEntryLike,
	allEntries: LocalizedEntryLike[],
): string[] {
	const skills = allEntries.filter((candidate) => candidate.contentType === "Skill");
	const matched = skills.filter(
		(skill) => entry.relatedTo.includes(skill.pageId) || skill.relatedTo.includes(entry.pageId),
	);
	return matched.map((skill) => skill.displayTitle);
}

/** Groups entries into the four CV sections, sorted most-recent-first within
 * each. Skill entries never appear in the output — see skillChipsFor. */
export function groupBySection(
	entries: LocalizedEntryLike[],
): Record<CvSection, LocalizedEntryLike[]> {
	const grouped: Record<CvSection, LocalizedEntryLike[]> = {
		"Professional Experience": [],
		Projects: [],
		"Academic Experience & Certifications": [],
		"Personal Interests & Background": [],
	};

	for (const entry of entries) {
		if (!entry.contentType) continue;
		const section = SECTION_BY_CONTENT_TYPE[entry.contentType];
		if (!section) continue; // Skill entries (and anything unmapped) are chip-only
		grouped[section].push(entry);
	}

	for (const section of CV_SECTIONS) {
		grouped[section].sort((a, b) => dateSortKey(b) - dateSortKey(a));
	}

	return grouped;
}
