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
	const ownerBySlug = new Map<string, { pageId: string; title: string }>();

	for (const entry of entries) {
		const slug = slugify(entry.title);
		if (!slug) {
			throw new Error(
				`Entry "${entry.title}" (${entry.pageId}) produces an empty slug. Give it a title containing Latin letters or digits in Notion.`,
			);
		}
		const owner = ownerBySlug.get(slug);
		if (owner && owner.pageId !== entry.pageId) {
			throw new Error(
				`Slug collision: "${entry.title}" and "${owner.title}" both produce the slug "${slug}". Rename one of the titles in Notion.`,
			);
		}
		ownerBySlug.set(slug, { pageId: entry.pageId, title: entry.title });
		slugs.set(entry.pageId, slug);
	}

	return slugs;
}
