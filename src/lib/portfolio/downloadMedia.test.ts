import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadEntryMedia } from "./downloadMedia";

let publicDir: string;

beforeEach(() => {
	publicDir = mkdtempSync(join(tmpdir(), "portfolio-media-"));
});

afterEach(() => {
	rmSync(publicDir, { recursive: true, force: true });
});

function fakeResponse(
	overrides: Partial<{
		ok: boolean;
		status: number;
		contentType: string;
		body: string;
	}> = {},
) {
	const {
		ok = true,
		status = 200,
		contentType = "image/png",
		body = "fake-image-bytes",
	} = overrides;
	return {
		ok,
		status,
		headers: {
			get: (name: string) =>
				name.toLowerCase() === "content-type" ? contentType : null,
		},
		arrayBuffer: async () => new TextEncoder().encode(body).buffer,
	};
}

describe("downloadEntryMedia", () => {
	it("downloads each media item and rewrites its url to a local public path", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(fakeResponse());
		const result = await downloadEntryMedia(
			"my-project",
			[
				{
					type: "image",
					url: "https://notion.so/fake.png",
					alt: "Screenshot",
					cover: true,
				},
			],
			{ fetchImpl, publicDir },
		);
		expect(result).toEqual([
			{
				type: "image",
				url: "/portfolio/my-project/0.png",
				alt: "Screenshot",
				cover: true,
			},
		]);
		expect(
			existsSync(join(publicDir, "portfolio", "my-project", "0.png")),
		).toBe(true);
		expect(
			readFileSync(
				join(publicDir, "portfolio", "my-project", "0.png"),
				"utf-8",
			),
		).toBe("fake-image-bytes");
	});

	it("skips (without throwing) a media item whose download returns a non-ok response", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(fakeResponse({ ok: false, status: 404 }));
		const result = await downloadEntryMedia(
			"my-project",
			[{ type: "image", url: "https://notion.so/gone.png" }],
			{ fetchImpl, publicDir },
		);
		expect(result).toEqual([]);
	});

	it("skips (without throwing) a media item whose fetch throws", async () => {
		const fetchImpl = vi.fn().mockRejectedValue(new Error("network error"));
		const result = await downloadEntryMedia(
			"my-project",
			[{ type: "image", url: "https://notion.so/gone.png" }],
			{ fetchImpl, publicDir },
		);
		expect(result).toEqual([]);
	});

	it("skips a media item with an unrecognized content-type", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(
				fakeResponse({ contentType: "application/octet-stream" }),
			);
		const result = await downloadEntryMedia(
			"my-project",
			[{ type: "image", url: "https://notion.so/weird" }],
			{
				fetchImpl,
				publicDir,
			},
		);
		expect(result).toEqual([]);
	});

	it("indexes multiple media items sequentially in the filename", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(fakeResponse({ contentType: "image/jpeg" }));
		const result = await downloadEntryMedia(
			"my-project",
			[
				{ type: "image", url: "https://notion.so/a.jpg" },
				{ type: "image", url: "https://notion.so/b.jpg" },
			],
			{ fetchImpl, publicDir },
		);
		expect(result.map((m) => m.url)).toEqual([
			"/portfolio/my-project/0.jpg",
			"/portfolio/my-project/1.jpg",
		]);
	});
});
