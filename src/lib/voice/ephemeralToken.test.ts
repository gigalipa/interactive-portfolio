import { describe, expect, it, vi } from "vitest";
import { mintEphemeralToken } from "./ephemeralToken";

describe("mintEphemeralToken", () => {
	it("returns the minted token name and the expiry it requested", async () => {
		const create = vi.fn().mockResolvedValue({ name: "live-token-abc" });
		const genAiFactory = vi.fn().mockReturnValue({ authTokens: { create } });

		const result = await mintEphemeralToken({
			apiKey: "live-key",
			systemInstructions: "You are Daniel.",
			genAiFactory,
		});

		expect(result.token).toBe("live-token-abc");
		expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
		expect(genAiFactory).toHaveBeenCalledWith("live-key");
		expect(create).toHaveBeenCalledTimes(1);
	});

	it("scopes the token to the configured Live model and passes the system instructions", async () => {
		const create = vi.fn().mockResolvedValue({ name: "t" });
		const genAiFactory = vi.fn().mockReturnValue({ authTokens: { create } });

		await mintEphemeralToken({
			apiKey: "k",
			systemInstructions: "Reply in ES.",
			genAiFactory,
		});

		const [config] = create.mock.calls[0];
		expect(JSON.stringify(config)).toContain("Reply in ES.");
	});

	it("throws if the Live API response has no token name", async () => {
		const create = vi.fn().mockResolvedValue({ name: undefined });
		const genAiFactory = vi.fn().mockReturnValue({ authTokens: { create } });

		await expect(
			mintEphemeralToken({
				apiKey: "k",
				systemInstructions: "Reply in ES.",
				genAiFactory,
			}),
		).rejects.toThrow("Live API did not return a token name");
	});
});
