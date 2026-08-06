const VISITOR_ID_COOKIE = "visitor_id";
const VISITOR_ID_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // ~1 year

// The visitor id becomes part of a KV key prefix, so only accept the UUID shape we
// issue ourselves rather than trusting an arbitrary client-supplied string.
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readVisitorId(cookieHeader: string | null): string | undefined {
	if (!cookieHeader) return undefined;

	const match = cookieHeader
		.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${VISITOR_ID_COOKIE}=`));
	if (!match) return undefined;

	const value = decodeURIComponent(match.slice(VISITOR_ID_COOKIE.length + 1));
	return UUID_PATTERN.test(value) ? value : undefined;
}

export function buildVisitorIdCookie(visitorId: string): string {
	return [
		`${VISITOR_ID_COOKIE}=${encodeURIComponent(visitorId)}`,
		`Max-Age=${VISITOR_ID_MAX_AGE_SECONDS}`,
		"Path=/",
		"HttpOnly",
		"Secure",
		"SameSite=Lax",
	].join("; ");
}

export function resolveVisitorId(cookieHeader: string | null): {
	visitorId: string;
	isNew: boolean;
} {
	const existing = readVisitorId(cookieHeader);
	if (existing) return { visitorId: existing, isNew: false };
	return { visitorId: crypto.randomUUID(), isNew: true };
}
