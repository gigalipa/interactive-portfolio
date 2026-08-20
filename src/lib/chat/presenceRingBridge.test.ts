import { afterEach, describe, expect, it } from "vitest";
import {
	setPresenceState,
	setVoiceMode,
	setVoicePulseRate,
} from "./presenceRingBridge";

function renderRing(): HTMLDivElement {
	const div = document.createElement("div");
	div.className = "presence-ring";
	div.dataset.state = "idle";
	document.body.appendChild(div);
	return div;
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("setPresenceState", () => {
	it("sets data-state on the presence ring", () => {
		const ring = renderRing();
		setPresenceState("listening");
		expect(ring.dataset.state).toBe("listening");
	});

	it("does nothing if no ring is present", () => {
		expect(() => setPresenceState("listening")).not.toThrow();
	});
});

describe("setVoiceMode", () => {
	it("sets data-voice to the given boolean, stringified", () => {
		const ring = renderRing();
		setVoiceMode(true);
		expect(ring.dataset.voice).toBe("true");
		setVoiceMode(false);
		expect(ring.dataset.voice).toBe("false");
	});

	it("does nothing if no ring is present", () => {
		expect(() => setVoiceMode(true)).not.toThrow();
	});
});

describe("setVoicePulseRate", () => {
	it("sets --pulse-rate faster (lower seconds) for a higher level", () => {
		const ring = renderRing();
		setVoicePulseRate(0);
		const quiet = ring.style.getPropertyValue("--pulse-rate");
		setVoicePulseRate(1);
		const loud = ring.style.getPropertyValue("--pulse-rate");
		expect(parseFloat(loud)).toBeLessThan(parseFloat(quiet));
	});

	it("never goes below the 0.5s floor", () => {
		const ring = renderRing();
		setVoicePulseRate(1);
		expect(
			parseFloat(ring.style.getPropertyValue("--pulse-rate")),
		).toBeGreaterThanOrEqual(0.5);
	});

	it("does nothing if no ring is present", () => {
		expect(() => setVoicePulseRate(0.5)).not.toThrow();
	});
});
