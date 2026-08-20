import { beforeEach, describe, expect, it, vi } from "vitest";
import { mintVoiceToken, persistVoiceTurn } from "./voiceApi";

const originalFetch = global.fetch;

beforeEach(() => {
	global.fetch = originalFetch;
});

describe("mintVoiceToken", () => {
	it("returns the parsed token response on success", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				token: "t",
				expiresAt: "2026-01-01T00:00:00.000Z",
				model: "m",
			}),
		}) as unknown as typeof fetch;

		const result = await mintVoiceToken("EN");

		expect(result).toEqual({
			token: "t",
			expiresAt: "2026-01-01T00:00:00.000Z",
			model: "m",
		});
		expect(global.fetch).toHaveBeenCalledWith(
			"/api/voice/token",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ language: "EN" }),
			}),
		);
	});

	it("throws on a non-ok response", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValue({ ok: false, status: 429 }) as unknown as typeof fetch;

		await expect(mintVoiceToken("EN")).rejects.toThrow();
	});

	it("throws when fetch itself rejects", async () => {
		global.fetch = vi
			.fn()
			.mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

		await expect(mintVoiceToken("EN")).rejects.toThrow();
	});
});

describe("persistVoiceTurn", () => {
	it("returns the parsed result on success", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ conversationId: "c1" }),
		}) as unknown as typeof fetch;

		const result = await persistVoiceTurn({
			persist: true,
			conversationId: "c1",
			userText: "Hi",
			modelText: "Hello",
		});

		expect(result).toEqual({ conversationId: "c1" });
	});

	it("degrades to an empty object on a non-ok response, without throwing", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;

		await expect(
			persistVoiceTurn({ persist: true, userText: "Hi", modelText: "Hello" }),
		).resolves.toEqual({});
	});

	it("degrades to an empty object when fetch itself rejects, without throwing", async () => {
		global.fetch = vi
			.fn()
			.mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

		await expect(
			persistVoiceTurn({ persist: false, userText: "Hi", modelText: "Hello" }),
		).resolves.toEqual({});
	});
});
