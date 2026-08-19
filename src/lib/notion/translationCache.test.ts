import { afterEach, describe, expect, it, vi } from "vitest";

describe("saveTranslationCache", () => {
	afterEach(() => {
		vi.doUnmock("node:fs");
		vi.resetModules();
	});

	it("does not throw when the write fails (e.g. an unreachable path inside a build sandbox)", async () => {
		const writeFileSync = vi.fn(() => {
			throw new Error("ENOENT: no such file or directory, writeAll '/bundle/src/lib/notion/.cv-translation-cache.json'");
		});
		vi.doMock("node:fs", () => ({
			default: { existsSync: vi.fn().mockReturnValue(false), readFileSync: vi.fn(), writeFileSync },
			existsSync: vi.fn().mockReturnValue(false),
			readFileSync: vi.fn(),
			writeFileSync,
		}));
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const { saveTranslationCache } = await import("./translationCache");

		expect(() => saveTranslationCache({})).not.toThrow();
		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Could not persist"));

		warnSpy.mockRestore();
	});
});
