import { describe, expect, it } from "vitest";
import { dateSortKey } from "./sortByDate";

describe("dateSortKey", () => {
	it("returns the parsed timestamp for a valid start date", () => {
		const key = dateSortKey({ metadata: { dates: { start: "2024-01-01" } } });
		expect(key).toBe(new Date("2024-01-01").getTime());
	});

	it("falls back to a priority-based key (below any real timestamp) when there's no start date", () => {
		const withDate = dateSortKey({ metadata: { dates: { start: "2020-01-01" } } });
		const withoutDate = dateSortKey({ metadata: {}, priority: 9 });
		expect(withoutDate).toBeLessThan(withDate);
	});

	it("ranks undated entries among themselves by priority, higher first", () => {
		const low = dateSortKey({ metadata: {}, priority: 1 });
		const high = dateSortKey({ metadata: {}, priority: 9 });
		expect(high).toBeGreaterThan(low);
	});

	it("treats an unparseable start date the same as no date", () => {
		const key = dateSortKey({ metadata: { dates: { start: "not-a-date" } }, priority: 0 });
		expect(key).toBe(-1_000_000_000_000);
	});
});
