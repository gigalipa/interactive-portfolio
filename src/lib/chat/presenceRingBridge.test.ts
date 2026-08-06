import { afterEach, describe, expect, it } from "vitest";
import { setPresenceState } from "./presenceRingBridge";

describe("setPresenceState", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("sets data-state on the .presence-ring element", () => {
		document.body.innerHTML = '<div class="presence-ring" data-state="idle"></div>';
		setPresenceState("speaking");
		expect(document.querySelector(".presence-ring")?.getAttribute("data-state")).toBe("speaking");
	});

	it("does nothing (no throw) when the element isn't on the page", () => {
		expect(() => setPresenceState("listening")).not.toThrow();
	});
});
