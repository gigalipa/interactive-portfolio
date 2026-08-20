import type { KnowledgeBaseEntry } from "../notion/knowledgeBase";
import type { LocalizedEntry } from "../notion/translate";
import { slugify } from "./slug";

export interface LocalizedPortfolioEntry extends LocalizedEntry {
	slug: string;
}

/** Entries eligible for the Portfolio build: Published Project-type entries. */
export function selectPortfolioEntries(entries: KnowledgeBaseEntry[]): KnowledgeBaseEntry[] {
	return entries.filter((entry) => entry.status === "Published" && entry.contentType === "Project");
}

/** Assigns one slug per entry (keyed by pageId), derived from its English
 * title via `slugify`. Throws if two different entries produce the same
 * slug — resolved by editing one of the source titles in Notion, not
 * auto-disambiguated (see the Phase 6 design spec). */
export function assignSlugs(entries: KnowledgeBaseEntry[]): Map<string, string> {
	const slugs = new Map<string, string>();
	const titleBySlug = new Map<string, string>();

	for (const entry of entries) {
		const slug = slugify(entry.title);
		const existingTitle = titleBySlug.get(slug);
		if (existingTitle && existingTitle !== entry.title) {
			throw new Error(
				`Slug collision: "${entry.title}" and "${existingTitle}" both produce the slug "${slug}". Rename one of the titles in Notion.`,
			);
		}
		titleBySlug.set(slug, entry.title);
		slugs.set(entry.pageId, slug);
	}

	return slugs;
}
