/** Deterministic, pure title -> URL-slug mapping used for Portfolio detail
 * page routes. Computed independently at every call site (the sync script,
 * the CV's cross-link) rather than looked up, so there's no shared runtime
 * state to keep in sync — same title always produces the same slug. */
export function slugify(title: string): string {
	return title
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}
