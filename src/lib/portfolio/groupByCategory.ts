import { dateSortKey } from "../shared/sortByDate";
import type { LocalizedPortfolioEntry } from "./portfolioEntries";

const OTHER_CATEGORY = "Other";

export interface PortfolioCategoryGroup {
	category: string;
	entries: LocalizedPortfolioEntry[];
}

/** Groups entries by their (already-localized) display category, sorted
 * alphabetically with entries lacking a category collected under "Other"
 * (always last). Entries within each group are sorted most-recent-first. */
export function groupByCategory(
	entries: LocalizedPortfolioEntry[],
): PortfolioCategoryGroup[] {
	const groups = new Map<string, LocalizedPortfolioEntry[]>();

	for (const entry of entries) {
		const category = entry.displayCategory || OTHER_CATEGORY;
		const bucket = groups.get(category);
		if (bucket) {
			bucket.push(entry);
		} else {
			groups.set(category, [entry]);
		}
	}

	const namedCategories = [...groups.keys()]
		.filter((category) => category !== OTHER_CATEGORY)
		.sort((a, b) => a.localeCompare(b));
	const orderedCategories = groups.has(OTHER_CATEGORY)
		? [...namedCategories, OTHER_CATEGORY]
		: namedCategories;

	return orderedCategories.map((category) => ({
		category,
		entries: [...(groups.get(category) ?? [])].sort(
			(a, b) => dateSortKey(b) - dateSortKey(a),
		),
	}));
}
