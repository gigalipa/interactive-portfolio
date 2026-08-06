import { describe, expect, it } from "vitest";
import { buildWhere } from "./retrieve";

describe("buildWhere", () => {
	it("returns undefined when nothing is scoped", () => {
		expect(buildWhere(undefined, undefined, undefined)).toBeUndefined();
	});

	it("returns a single clause unwrapped when only one filter is set", () => {
		expect(buildWhere("Project", undefined, undefined)).toEqual({
			content_type: "Project",
		});
		expect(buildWhere(undefined, "EN", undefined)).toEqual({ language: "EN" });
		expect(buildWhere(undefined, undefined, ["Personal Interest"])).toEqual({
			content_type: { $nin: ["Personal Interest"] },
		});
	});

	it("combines multiple filters with $and", () => {
		expect(buildWhere("Project", "EN", undefined)).toEqual({
			$and: [{ content_type: "Project" }, { language: "EN" }],
		});
	});

	it("combines an exclusion with a language filter", () => {
		expect(buildWhere(undefined, "ES", ["Personal Interest"])).toEqual({
			$and: [
				{ content_type: { $nin: ["Personal Interest"] } },
				{ language: "ES" },
			],
		});
	});

	it("ignores an empty exclusion list", () => {
		expect(buildWhere("Project", undefined, [])).toEqual({
			content_type: "Project",
		});
	});
});
