export interface DatedEntryLike {
	metadata: { dates?: { start?: string } };
	priority?: number | null;
}

/** Sort key for "most-recent-first" ordering: entries with a parseable
 * `metadata.dates.start` sort by that timestamp; entries without one sort
 * after every dated entry, ranked among themselves by Priority (higher
 * first) — real timestamps are always far larger than this fallback range. */
export function dateSortKey(entry: DatedEntryLike): number {
	const start = entry.metadata.dates?.start;
	if (start) {
		const time = new Date(start).getTime();
		if (!Number.isNaN(time)) return time;
	}
	return (entry.priority ?? 0) - 1_000_000_000_000;
}
