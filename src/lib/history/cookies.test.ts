import { describe, expect, it } from "vitest";
import {
	buildVisitorIdCookie,
	readVisitorId,
	resolveVisitorId,
} from "./cookies";

const VISITOR_ID = "11111111-1111-4111-8111-111111111111";

describe("readVisitorId", () => {
	it("returns undefined when there is no cookie header", () => {
		expect(readVisitorId(null)).toBeUndefined();
	});

	it("returns undefined when visitor_id is not present", () => {
		expect(readVisitorId("other=1; another=2")).toBeUndefined();
	});

	it("extracts visitor_id from a cookie header with multiple cookies", () => {
		expect(readVisitorId(`other=1; visitor_id=${VISITOR_ID}; another=2`)).toBe(
			VISITOR_ID,
		);
	});

	it("decodes URI-encoded values before validating them", () => {
		// %31 is "1": the value is only a valid UUID once decoded.
		expect(readVisitorId(`visitor_id=%31${VISITOR_ID.slice(1)}`)).toBe(
			VISITOR_ID,
		);
	});

	it("returns undefined for a value that is not UUID-shaped", () => {
		// The visitor id becomes part of a KV key prefix, so arbitrary client
		// strings (including traversal-ish values) must not be trusted.
		expect(readVisitorId("visitor_id=abc-123")).toBeUndefined();
		expect(readVisitorId("visitor_id=../../other")).toBeUndefined();
		expect(readVisitorId(`visitor_id=${VISITOR_ID}extra`)).toBeUndefined();
		expect(readVisitorId("visitor_id=")).toBeUndefined();
	});
});

describe("buildVisitorIdCookie", () => {
	it("includes HttpOnly, Secure, SameSite=Lax, and a ~1 year Max-Age", () => {
		const cookie = buildVisitorIdCookie(VISITOR_ID);
		expect(cookie).toContain(`visitor_id=${VISITOR_ID}`);
		expect(cookie).toContain("HttpOnly");
		expect(cookie).toContain("Secure");
		expect(cookie).toContain("SameSite=Lax");
		expect(cookie).toContain(`Max-Age=${60 * 60 * 24 * 365}`);
	});
});

describe("resolveVisitorId", () => {
	it("reuses an existing visitor_id and marks it as not new", () => {
		const result = resolveVisitorId(`visitor_id=${VISITOR_ID}`);
		expect(result).toEqual({ visitorId: VISITOR_ID, isNew: false });
	});

	it("mints a new visitor_id when the cookie value is not UUID-shaped", () => {
		const result = resolveVisitorId("visitor_id=not-a-uuid");
		expect(result.isNew).toBe(true);
		expect(result.visitorId).not.toBe("not-a-uuid");
	});

	it("generates a new visitor_id when none is present", () => {
		const result = resolveVisitorId(null);
		expect(result.isNew).toBe(true);
		expect(result.visitorId).toMatch(/^[0-9a-f-]{36}$/);
	});
});
