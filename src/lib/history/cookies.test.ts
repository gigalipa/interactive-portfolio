import { describe, expect, it } from "vitest";
import { buildVisitorIdCookie, readVisitorId, resolveVisitorId } from "./cookies";

describe("readVisitorId", () => {
	it("returns undefined when there is no cookie header", () => {
		expect(readVisitorId(null)).toBeUndefined();
	});

	it("returns undefined when visitor_id is not present", () => {
		expect(readVisitorId("other=1; another=2")).toBeUndefined();
	});

	it("extracts visitor_id from a cookie header with multiple cookies", () => {
		expect(readVisitorId("other=1; visitor_id=abc-123; another=2")).toBe("abc-123");
	});

	it("decodes URI-encoded values", () => {
		expect(readVisitorId("visitor_id=abc%2F123")).toBe("abc/123");
	});
});

describe("buildVisitorIdCookie", () => {
	it("includes HttpOnly, Secure, SameSite=Lax, and a ~1 year Max-Age", () => {
		const cookie = buildVisitorIdCookie("abc-123");
		expect(cookie).toContain("visitor_id=abc-123");
		expect(cookie).toContain("HttpOnly");
		expect(cookie).toContain("Secure");
		expect(cookie).toContain("SameSite=Lax");
		expect(cookie).toContain(`Max-Age=${60 * 60 * 24 * 365}`);
	});
});

describe("resolveVisitorId", () => {
	it("reuses an existing visitor_id and marks it as not new", () => {
		const result = resolveVisitorId("visitor_id=existing-id");
		expect(result).toEqual({ visitorId: "existing-id", isNew: false });
	});

	it("generates a new visitor_id when none is present", () => {
		const result = resolveVisitorId(null);
		expect(result.isNew).toBe(true);
		expect(result.visitorId).toMatch(/^[0-9a-f-]{36}$/);
	});
});
