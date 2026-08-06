import { beforeEach, describe, expect, it } from "vitest";
import { getConsent, setConsent } from "./consent";

describe("consent storage", () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	it("returns null when no choice has been made", () => {
		expect(getConsent()).toBeNull();
	});

	it("round-trips 'accepted'", () => {
		setConsent("accepted");
		expect(getConsent()).toBe("accepted");
	});

	it("round-trips 'rejected'", () => {
		setConsent("rejected");
		expect(getConsent()).toBe("rejected");
	});

	it("ignores unrelated/garbage localStorage values", () => {
		window.localStorage.setItem("chat_consent", "garbage");
		expect(getConsent()).toBeNull();
	});
});
