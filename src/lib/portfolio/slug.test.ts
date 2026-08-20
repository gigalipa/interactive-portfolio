import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
	it("lowercases and hyphenates a normal title", () => {
		expect(slugify("Language Quest AI Widget")).toBe(
			"language-quest-ai-widget",
		);
	});

	it("strips punctuation", () => {
		expect(slugify("Asset Foundry: Automated Pipelines!")).toBe(
			"asset-foundry-automated-pipelines",
		);
	});

	it("collapses repeated separators into one hyphen", () => {
		expect(slugify("A   B---C")).toBe("a-b-c");
	});

	it("trims leading and trailing hyphens", () => {
		expect(slugify("  -Leading and trailing-  ")).toBe("leading-and-trailing");
	});

	it("returns an empty string for empty or whitespace-only input", () => {
		expect(slugify("")).toBe("");
		expect(slugify("   ")).toBe("");
	});
});
