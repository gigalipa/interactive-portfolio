import { describe, expect, it } from "vitest";
import { stripFileEmbeds } from "./cleanMarkdown";

describe("stripFileEmbeds", () => {
	it("removes image embeds with presigned S3 URLs", () => {
		const markdown =
			"Some real project description.\n\n" +
			"![](https://prod-files-secure.s3.us-west-2.amazonaws.com/ad6a62c4/image.png?X-Amz-Signature=abc123&X-Amz-Expires=3600)\n\n" +
			"More real description after the image.";

		const result = stripFileEmbeds(markdown);

		expect(result).not.toContain("s3.us-west-2.amazonaws.com");
		expect(result).toContain("Some real project description.");
		expect(result).toContain("More real description after the image.");
	});

	it("removes bare presigned S3 URLs left outside markdown image syntax", () => {
		const markdown =
			"See attachment: https://prod-files-secure.s3.us-west-2.amazonaws.com/abc/def.png?X-Amz-Signature=xyz here.";

		expect(stripFileEmbeds(markdown)).toBe("See attachment:  here.");
	});

	it("collapses the resulting blank-line gaps left by stripped embeds", () => {
		const markdown = "Line one.\n\n![](https://prod-files-secure.s3.example/x)\n\nLine two.";

		expect(stripFileEmbeds(markdown)).toBe("Line one.\n\nLine two.");
	});

	it("leaves ordinary markdown text untouched", () => {
		const markdown = "# Title\n\nA normal paragraph with **bold** text and a [link](https://example.com).";

		expect(stripFileEmbeds(markdown)).toBe(markdown);
	});
});
