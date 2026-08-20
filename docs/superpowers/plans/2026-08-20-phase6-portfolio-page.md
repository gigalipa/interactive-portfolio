# Phase 6 — Portfolio Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Portfolio page — a project grid index and per-project detail pages — sourced from the Notion Knowledge Base's `Project` entries via a local sync script, matching the Phase 5 CV page's build-time-external-call-free architecture.

**Architecture:** A new `scripts/sync-portfolio.ts` fetches Published `Project` entries from the Knowledge Base, assigns each a stable title-derived slug, downloads Notion-hosted media into `public/portfolio/<slug>/` (best-effort — a failed download drops that item, never fails the sync), translates the entries for `en`/`es`/`fr` (reusing the CV's translation pipeline and cache), and writes a committed `src/lib/portfolio/content.json`. The Astro build only ever reads that file — zero Notion/Gemini calls during `pnpm build`. Two new prerendered route families read it: `/​<lang>​/portfolio` (grid, grouped by category) and `/​<lang>​/portfolio/​<slug>` (detail page). The CV's existing "Projects" section gains a working link to each project's detail page, using the same slug function independently (no cross-file lookup needed since slugs are pure functions of the English title).

**Tech Stack:** Astro (prerendered `.astro` pages/views), TypeScript, Vitest, `@notionhq/client`, Google Gemini (`@google/genai`-style REST calls already wired in `src/lib/notion/translate.ts`), Node `fs`/`fetch` for media download.

**Spec:** `docs/superpowers/specs/2026-08-20-phase6-portfolio-page-design.md`

## Global Constraints

- The Astro build (`pnpm build`, and specifically Cloudflare Workers Builds) must never call Notion or Gemini directly — all such calls happen only in `scripts/sync-portfolio.ts`, run locally, with the result committed. (Design spec, "Content sourcing"; also `cloudflare-workers-builds-prerender-sandbox` memory.)
- Media downloads are best-effort: a failed download (non-2xx, thrown error, unrecognized content-type) logs a warning and drops that one media item — it must never throw and fail the whole sync. (Design spec, "Media download".)
- Slugs are derived from each entry's **English** title via `slugify()`, computed independently wherever needed (sync script, CV cross-link) rather than looked up — no shared runtime state between the two call sites. A slug collision between two different Project entries hard-fails the sync with a clear message; it is never auto-disambiguated. (Design spec, "Content sourcing" and "Routing & pages".)
- No enrichment from the separate Projects tracker database (status/progress %/deadline) — explicitly out of scope. (Design spec, "Non-goals".)
- Follow existing repo conventions: tabs for indentation (see any existing `.ts`/`.astro` file), `interface Props` for Astro component props, `getDictionary(lang)` for i18n strings, Tailwind utility classes matching the existing glass/blue design tokens (`border-slate-mist`, `bg-deep-blue/30`, `text-ion`, `text-signal-cyan`, `font-display`, `font-body`, `font-mono`).

---

## Task 1: Add `media` to `EntryMetadata`

**Files:**
- Modify: `src/lib/notion/knowledgeBase.ts`
- Test: `src/lib/notion/knowledgeBase.test.ts`

**Interfaces:**
- Produces: `MetadataMedia` interface (`{ type: "image" | "video"; url: string; alt?: string; caption?: string; cover?: boolean }`), and `EntryMetadata.media?: MetadataMedia[]`, both exported from `src/lib/notion/knowledgeBase.ts`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/notion/knowledgeBase.test.ts`, inside the existing `describe("parseMetadata", ...)` block:

```ts
	it("parses a media array", () => {
		expect(
			parseMetadata(
				'{"media":[{"type":"image","url":"https://example.com/a.png","alt":"Screenshot","cover":true}]}',
			),
		).toEqual({
			media: [{ type: "image", url: "https://example.com/a.png", alt: "Screenshot", cover: true }],
		});
	});
```

And inside the existing `describe("extractEntry", ...)` block:

```ts
	it("includes a media array when present in Metadata", () => {
		const entry = extractEntry(
			fakePage({
				Metadata: {
					type: "rich_text",
					rich_text: [
						{
							plain_text:
								'{"category":"Web App","media":[{"type":"video","url":"https://example.com/demo.mp4"}]}',
						},
					],
				} as never,
			}),
		);
		expect(entry.metadata.media).toEqual([{ type: "video", url: "https://example.com/demo.mp4" }]);
	});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/lib/notion/knowledgeBase.test.ts`
Expected: the two new tests pass already at the JSON-parsing level (`parseMetadata` is untyped JSON parsing), but confirm the whole suite runs clean first so you have a true baseline — then proceed to Step 3 regardless, since the real goal is the TypeScript type, not new runtime behavior.

- [ ] **Step 3: Add the `media` field to `EntryMetadata`**

In `src/lib/notion/knowledgeBase.ts`, add a new interface just above `EntryMetadata` and add a `media` property to `EntryMetadata`:

```ts
export interface MetadataMedia {
	type: "image" | "video";
	url: string;
	alt?: string;
	caption?: string;
	cover?: boolean;
}

export interface EntryMetadata {
	category?: string;
	dates?: MetadataDates;
	location?: string;
	links?: MetadataLink[];
	media?: MetadataMedia[];
	techStack?: string[];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/lib/notion/knowledgeBase.test.ts`
Expected: PASS (all tests, including the two new ones)

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/notion/knowledgeBase.ts src/lib/notion/knowledgeBase.test.ts
git commit -m "feat(portfolio): add media field to EntryMetadata"
```

---

## Task 2: `slugify` utility

**Files:**
- Create: `src/lib/portfolio/slug.ts`
- Test: `src/lib/portfolio/slug.test.ts`

**Interfaces:**
- Produces: `slugify(title: string): string`, exported from `src/lib/portfolio/slug.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
	it("lowercases and hyphenates a normal title", () => {
		expect(slugify("Language Quest AI Widget")).toBe("language-quest-ai-widget");
	});

	it("strips punctuation", () => {
		expect(slugify("Asset Foundry: Automated Pipelines!")).toBe("asset-foundry-automated-pipelines");
	});

	it("collapses repeated separators into one hyphen", () => {
		expect(slugify("A   B---C")).toBe("a-b-c");
	});

	it("trims leading and trailing hyphens", () => {
		expect(slugify("  -Leading and trailing-  ")).toBe("leading-and-trailing");
	});

	it("returns an empty string for empty or whitespace-only input", () => {
		expect(slugify("")).toBe("");
		expect(slugify("   ")).toBe("");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/portfolio/slug.test.ts`
Expected: FAIL with "Cannot find module './slug'" (or similar)

- [ ] **Step 3: Implement `slugify`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/portfolio/slug.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/portfolio/slug.ts src/lib/portfolio/slug.test.ts
git commit -m "feat(portfolio): add slugify utility"
```

---

## Task 3: Extract shared `dateSortKey` and refactor `groupEntries.ts` to use it

**Files:**
- Create: `src/lib/shared/sortByDate.ts`
- Test: `src/lib/shared/sortByDate.test.ts`
- Modify: `src/lib/cv/groupEntries.ts`

**Interfaces:**
- Produces: `dateSortKey(entry: DatedEntryLike): number` and `DatedEntryLike` interface (`{ metadata: { dates?: { start?: string } }; priority?: number | null }`), exported from `src/lib/shared/sortByDate.ts`. Used by Task 6.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { dateSortKey } from "./sortByDate";

describe("dateSortKey", () => {
	it("returns the parsed timestamp for a valid start date", () => {
		const key = dateSortKey({ metadata: { dates: { start: "2024-01-01" } } });
		expect(key).toBe(new Date("2024-01-01").getTime());
	});

	it("falls back to a priority-based key (below any real timestamp) when there's no start date", () => {
		const withDate = dateSortKey({ metadata: { dates: { start: "2020-01-01" } } });
		const withoutDate = dateSortKey({ metadata: {}, priority: 9 });
		expect(withoutDate).toBeLessThan(withDate);
	});

	it("ranks undated entries among themselves by priority, higher first", () => {
		const low = dateSortKey({ metadata: {}, priority: 1 });
		const high = dateSortKey({ metadata: {}, priority: 9 });
		expect(high).toBeGreaterThan(low);
	});

	it("treats an unparseable start date the same as no date", () => {
		const key = dateSortKey({ metadata: { dates: { start: "not-a-date" } }, priority: 0 });
		expect(key).toBe(-1_000_000_000_000);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/shared/sortByDate.test.ts`
Expected: FAIL with "Cannot find module './sortByDate'"

- [ ] **Step 3: Implement `dateSortKey`**

```ts
export interface DatedEntryLike {
	metadata: { dates?: { start?: string } };
	priority?: number | null;
}

/** Sort key for "most-recent-first" ordering: entries with a parseable
 * `metadata.dates.start` sort by that timestamp; entries without one sort
 * after every dated entry, ranked among themselves by Priority (higher
 * first) — real timestamps are always far larger than this fallback range. */
export function dateSortKey(entry: DatedEntryLike): number {
	const start = entry.metadata.dates?.start;
	if (start) {
		const time = new Date(start).getTime();
		if (!Number.isNaN(time)) return time;
	}
	return (entry.priority ?? 0) - 1_000_000_000_000;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/shared/sortByDate.test.ts`
Expected: PASS

- [ ] **Step 5: Refactor `groupEntries.ts` to use the shared function**

In `src/lib/cv/groupEntries.ts`, remove the local `entrySortKey` function (lines 54-63) and its use:

```ts
function entrySortKey(entry: LocalizedEntryLike): number {
	const start = entry.metadata.dates?.start;
	if (start) {
		const time = new Date(start).getTime();
		if (!Number.isNaN(time)) return time;
	}
	// No usable date: sort after every dated entry (real timestamps are far
	// larger than this), ranked among themselves by Priority (higher first).
	return (entry.priority ?? 0) - 1_000_000_000_000;
}
```

Replace it with an import at the top of the file:

```ts
import { dateSortKey } from "../shared/sortByDate";
```

And update the one call site (in `groupBySection`):

```ts
	for (const section of CV_SECTIONS) {
		grouped[section].sort((a, b) => dateSortKey(b) - dateSortKey(a));
	}
```

- [ ] **Step 6: Run the full CV test suite to verify no regression**

Run: `pnpm test src/lib/cv/groupEntries.test.ts`
Expected: PASS (all existing tests, unchanged — this is a pure refactor)

- [ ] **Step 7: Commit**

```bash
git add src/lib/shared/sortByDate.ts src/lib/shared/sortByDate.test.ts src/lib/cv/groupEntries.ts
git commit -m "refactor: extract dateSortKey into src/lib/shared for reuse by Portfolio"
```

---

## Task 4: `downloadEntryMedia` utility

**Files:**
- Create: `src/lib/portfolio/downloadMedia.ts`
- Test: `src/lib/portfolio/downloadMedia.test.ts`

**Interfaces:**
- Consumes: `MetadataMedia` from `src/lib/notion/knowledgeBase.ts` (Task 1).
- Produces: `downloadEntryMedia(slug: string, media: MetadataMedia[], options?: { fetchImpl?: FetchLike; publicDir?: string }): Promise<MetadataMedia[]>`, exported from `src/lib/portfolio/downloadMedia.ts`. Used by Task 8's sync script.

- [ ] **Step 1: Write the failing test**

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadEntryMedia } from "./downloadMedia";

let publicDir: string;

beforeEach(() => {
	publicDir = mkdtempSync(join(tmpdir(), "portfolio-media-"));
});

afterEach(() => {
	rmSync(publicDir, { recursive: true, force: true });
});

function fakeResponse(
	overrides: Partial<{ ok: boolean; status: number; contentType: string; body: string }> = {},
) {
	const { ok = true, status = 200, contentType = "image/png", body = "fake-image-bytes" } = overrides;
	return {
		ok,
		status,
		headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? contentType : null) },
		arrayBuffer: async () => new TextEncoder().encode(body).buffer,
	};
}

describe("downloadEntryMedia", () => {
	it("downloads each media item and rewrites its url to a local public path", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(fakeResponse());
		const result = await downloadEntryMedia(
			"my-project",
			[{ type: "image", url: "https://notion.so/fake.png", alt: "Screenshot", cover: true }],
			{ fetchImpl, publicDir },
		);
		expect(result).toEqual([
			{ type: "image", url: "/portfolio/my-project/0.png", alt: "Screenshot", cover: true },
		]);
		expect(existsSync(join(publicDir, "portfolio", "my-project", "0.png"))).toBe(true);
		expect(readFileSync(join(publicDir, "portfolio", "my-project", "0.png"), "utf-8")).toBe(
			"fake-image-bytes",
		);
	});

	it("skips (without throwing) a media item whose download returns a non-ok response", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 404 }));
		const result = await downloadEntryMedia(
			"my-project",
			[{ type: "image", url: "https://notion.so/gone.png" }],
			{ fetchImpl, publicDir },
		);
		expect(result).toEqual([]);
	});

	it("skips (without throwing) a media item whose fetch throws", async () => {
		const fetchImpl = vi.fn().mockRejectedValue(new Error("network error"));
		const result = await downloadEntryMedia(
			"my-project",
			[{ type: "image", url: "https://notion.so/gone.png" }],
			{ fetchImpl, publicDir },
		);
		expect(result).toEqual([]);
	});

	it("skips a media item with an unrecognized content-type", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ contentType: "application/octet-stream" }));
		const result = await downloadEntryMedia("my-project", [{ type: "image", url: "https://notion.so/weird" }], {
			fetchImpl,
			publicDir,
		});
		expect(result).toEqual([]);
	});

	it("indexes multiple media items sequentially in the filename", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(fakeResponse({ contentType: "image/jpeg" }));
		const result = await downloadEntryMedia(
			"my-project",
			[
				{ type: "image", url: "https://notion.so/a.jpg" },
				{ type: "image", url: "https://notion.so/b.jpg" },
			],
			{ fetchImpl, publicDir },
		);
		expect(result.map((m) => m.url)).toEqual([
			"/portfolio/my-project/0.jpg",
			"/portfolio/my-project/1.jpg",
		]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/portfolio/downloadMedia.test.ts`
Expected: FAIL with "Cannot find module './downloadMedia'"

- [ ] **Step 3: Implement `downloadEntryMedia`**

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { MetadataMedia } from "../notion/knowledgeBase";

/** Narrow structural subset of `fetch` — real `fetch` satisfies this. */
export interface FetchLike {
	(url: string): Promise<{
		ok: boolean;
		status: number;
		headers: { get(name: string): string | null };
		arrayBuffer(): Promise<ArrayBuffer>;
	}>;
}

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/gif": "gif",
	"video/mp4": "mp4",
	"video/webm": "webm",
};

/** Downloads each of an entry's media items into `<publicDir>/portfolio/<slug>/<index>.<ext>`
 * and returns the media array with `url` rewritten to that local, same-origin path — Notion's
 * hosted media URLs are short-lived presigned links and can't be referenced directly from the
 * deployed site. A failed download (non-2xx, thrown error, unrecognized content-type) is caught,
 * logged as a warning, and that one item is dropped from the result — never throws, so one bad
 * media item can't fail the whole sync. */
export async function downloadEntryMedia(
	slug: string,
	media: MetadataMedia[],
	options: { fetchImpl?: FetchLike; publicDir?: string } = {},
): Promise<MetadataMedia[]> {
	const { fetchImpl = fetch as unknown as FetchLike, publicDir = "public" } = options;
	const results: MetadataMedia[] = [];

	for (const [index, item] of media.entries()) {
		try {
			const response = await fetchImpl(item.url);
			if (!response.ok) {
				console.warn(`Skipping media for "${slug}" (HTTP ${response.status}): ${item.url}`);
				continue;
			}
			const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
			const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
			if (!extension) {
				console.warn(`Skipping media for "${slug}" (unrecognized content-type "${contentType}"): ${item.url}`);
				continue;
			}
			const relativePath = `portfolio/${slug}/${index}.${extension}`;
			const absolutePath = resolve(publicDir, relativePath);
			mkdirSync(dirname(absolutePath), { recursive: true });
			writeFileSync(absolutePath, Buffer.from(await response.arrayBuffer()));
			results.push({ ...item, url: `/${relativePath}` });
		} catch (error) {
			console.warn(`Skipping media for "${slug}" (download failed): ${item.url} — ${String(error)}`);
		}
	}

	return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/portfolio/downloadMedia.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/portfolio/downloadMedia.ts src/lib/portfolio/downloadMedia.test.ts
git commit -m "feat(portfolio): add best-effort media download utility"
```

---

## Task 5: Portfolio entry selection, slug assignment, and `LocalizedPortfolioEntry`

**Files:**
- Create: `src/lib/portfolio/portfolioEntries.ts`
- Test: `src/lib/portfolio/portfolioEntries.test.ts`

**Interfaces:**
- Consumes: `slugify` from `src/lib/portfolio/slug.ts` (Task 2), `KnowledgeBaseEntry` from `src/lib/notion/knowledgeBase.ts`, `LocalizedEntry` from `src/lib/notion/translate.ts`.
- Produces: `LocalizedPortfolioEntry` type (`LocalizedEntry & { slug: string }`), `selectPortfolioEntries(entries: KnowledgeBaseEntry[]): KnowledgeBaseEntry[]`, `assignSlugs(entries: KnowledgeBaseEntry[]): Map<string, string>` (keyed by `pageId`), all exported from `src/lib/portfolio/portfolioEntries.ts`. Used by Task 6 and Task 8.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { assignSlugs, selectPortfolioEntries } from "./portfolioEntries";
import type { KnowledgeBaseEntry } from "../notion/knowledgeBase";

function kbEntry(overrides: Partial<KnowledgeBaseEntry> = {}): KnowledgeBaseEntry {
	return {
		pageId: "p1",
		title: "Title",
		summary: "",
		description: "",
		contentType: "Project",
		tags: [],
		priority: 0,
		status: "Published",
		language: "EN",
		relatedTo: [],
		metadata: {},
		...overrides,
	};
}

describe("selectPortfolioEntries", () => {
	it("keeps only Published entries with Content Type = Project", () => {
		const entries = [
			kbEntry({ pageId: "a", status: "Published", contentType: "Project" }),
			kbEntry({ pageId: "b", status: "Draft", contentType: "Project" }),
			kbEntry({ pageId: "c", status: "Published", contentType: "Professional Experience" }),
		];
		expect(selectPortfolioEntries(entries).map((e) => e.pageId)).toEqual(["a"]);
	});
});

describe("assignSlugs", () => {
	it("assigns a slug per entry keyed by pageId", () => {
		const entries = [kbEntry({ pageId: "a", title: "Asset Foundry" }), kbEntry({ pageId: "b", title: "Language Quest" })];
		const slugs = assignSlugs(entries);
		expect(slugs.get("a")).toBe("asset-foundry");
		expect(slugs.get("b")).toBe("language-quest");
	});

	it("throws a clear error when two different entries produce the same slug", () => {
		const entries = [
			kbEntry({ pageId: "a", title: "Asset Foundry!" }),
			kbEntry({ pageId: "b", title: "Asset Foundry?" }),
		];
		expect(() => assignSlugs(entries)).toThrow(/slug/i);
	});

	it("does not throw when the same entry (same title) appears once", () => {
		const entries = [kbEntry({ pageId: "a", title: "Solo Project" })];
		expect(() => assignSlugs(entries)).not.toThrow();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/portfolio/portfolioEntries.test.ts`
Expected: FAIL with "Cannot find module './portfolioEntries'"

- [ ] **Step 3: Implement `portfolioEntries.ts`**

```ts
import type { KnowledgeBaseEntry } from "../notion/knowledgeBase";
import type { LocalizedEntry } from "../notion/translate";
import { slugify } from "./slug";

export interface LocalizedPortfolioEntry extends LocalizedEntry {
	slug: string;
}

/** Entries eligible for the Portfolio build: Published Project-type entries. */
export function selectPortfolioEntries(entries: KnowledgeBaseEntry[]): KnowledgeBaseEntry[] {
	return entries.filter((entry) => entry.status === "Published" && entry.contentType === "Project");
}

/** Assigns one slug per entry (keyed by pageId), derived from its English
 * title via `slugify`. Throws if two different entries produce the same
 * slug — resolved by editing one of the source titles in Notion, not
 * auto-disambiguated (see the Phase 6 design spec). */
export function assignSlugs(entries: KnowledgeBaseEntry[]): Map<string, string> {
	const slugs = new Map<string, string>();
	const titleBySlug = new Map<string, string>();

	for (const entry of entries) {
		const slug = slugify(entry.title);
		const existingTitle = titleBySlug.get(slug);
		if (existingTitle && existingTitle !== entry.title) {
			throw new Error(
				`Slug collision: "${entry.title}" and "${existingTitle}" both produce the slug "${slug}". Rename one of the titles in Notion.`,
			);
		}
		titleBySlug.set(slug, entry.title);
		slugs.set(entry.pageId, slug);
	}

	return slugs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/portfolio/portfolioEntries.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/portfolio/portfolioEntries.ts src/lib/portfolio/portfolioEntries.test.ts
git commit -m "feat(portfolio): add entry selection and slug assignment"
```

---

## Task 6: `groupByCategory`

**Files:**
- Create: `src/lib/portfolio/groupByCategory.ts`
- Test: `src/lib/portfolio/groupByCategory.test.ts`

**Interfaces:**
- Consumes: `dateSortKey` from `src/lib/shared/sortByDate.ts` (Task 3), `LocalizedPortfolioEntry` from `src/lib/portfolio/portfolioEntries.ts` (Task 5).
- Produces: `PortfolioCategoryGroup` type (`{ category: string; entries: LocalizedPortfolioEntry[] }`), `groupByCategory(entries: LocalizedPortfolioEntry[]): PortfolioCategoryGroup[]`, exported from `src/lib/portfolio/groupByCategory.ts`. Used by Task 10's `PortfolioView.astro`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { groupByCategory } from "./groupByCategory";
import type { LocalizedPortfolioEntry } from "./portfolioEntries";

function entry(overrides: Partial<LocalizedPortfolioEntry> = {}): LocalizedPortfolioEntry {
	return {
		pageId: "p1",
		title: "Title",
		summary: "",
		description: "",
		contentType: "Project",
		tags: [],
		priority: 0,
		status: "Published",
		language: "EN",
		relatedTo: [],
		metadata: {},
		displayTitle: "Title",
		displayCategory: "",
		displayLocation: "",
		displayDescription: "",
		slug: "title",
		...overrides,
	};
}

describe("groupByCategory", () => {
	it("groups entries by displayCategory", () => {
		const groups = groupByCategory([
			entry({ pageId: "a", displayCategory: "Web App" }),
			entry({ pageId: "b", displayCategory: "AI Automation" }),
			entry({ pageId: "c", displayCategory: "Web App" }),
		]);
		expect(groups.map((g) => g.category)).toEqual(["AI Automation", "Web App"]);
		expect(groups.find((g) => g.category === "Web App")?.entries.map((e) => e.pageId)).toEqual(["a", "c"]);
	});

	it("collects entries with no category under Other, always last", () => {
		const groups = groupByCategory([
			entry({ pageId: "a", displayCategory: "Web App" }),
			entry({ pageId: "b", displayCategory: "" }),
		]);
		expect(groups.map((g) => g.category)).toEqual(["Web App", "Other"]);
		expect(groups.find((g) => g.category === "Other")?.entries.map((e) => e.pageId)).toEqual(["b"]);
	});

	it("sorts entries within a category most-recent-first", () => {
		const groups = groupByCategory([
			entry({ pageId: "old", displayCategory: "Web App", metadata: { dates: { start: "2020-01-01" } } }),
			entry({ pageId: "new", displayCategory: "Web App", metadata: { dates: { start: "2024-01-01" } } }),
		]);
		expect(groups[0].entries.map((e) => e.pageId)).toEqual(["new", "old"]);
	});

	it("returns an empty array for no entries", () => {
		expect(groupByCategory([])).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/portfolio/groupByCategory.test.ts`
Expected: FAIL with "Cannot find module './groupByCategory'"

- [ ] **Step 3: Implement `groupByCategory`**

```ts
import { dateSortKey } from "../shared/sortByDate";
import type { LocalizedPortfolioEntry } from "./portfolioEntries";

const OTHER_CATEGORY = "Other";

export interface PortfolioCategoryGroup {
	category: string;
	entries: LocalizedPortfolioEntry[];
}

/** Groups entries by their (already-localized) display category, sorted
 * alphabetically with entries lacking a category collected under "Other"
 * (always last). Entries within each group are sorted most-recent-first. */
export function groupByCategory(entries: LocalizedPortfolioEntry[]): PortfolioCategoryGroup[] {
	const groups = new Map<string, LocalizedPortfolioEntry[]>();

	for (const entry of entries) {
		const category = entry.displayCategory || OTHER_CATEGORY;
		const bucket = groups.get(category);
		if (bucket) {
			bucket.push(entry);
		} else {
			groups.set(category, [entry]);
		}
	}

	const namedCategories = [...groups.keys()]
		.filter((category) => category !== OTHER_CATEGORY)
		.sort((a, b) => a.localeCompare(b));
	const orderedCategories = groups.has(OTHER_CATEGORY) ? [...namedCategories, OTHER_CATEGORY] : namedCategories;

	return orderedCategories.map((category) => ({
		category,
		entries: [...(groups.get(category) ?? [])].sort((a, b) => dateSortKey(b) - dateSortKey(a)),
	}));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/portfolio/groupByCategory.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/portfolio/groupByCategory.ts src/lib/portfolio/groupByCategory.test.ts
git commit -m "feat(portfolio): add category grouping"
```

---

## Task 7: Dictionary updates (Portfolio copy + CV project-link copy)

**Files:**
- Modify: `src/i18n/dictionary.ts`
- Modify: `src/i18n/dictionaries/en.ts`
- Modify: `src/i18n/dictionaries/es.ts`
- Modify: `src/i18n/dictionaries/fr.ts`

**Interfaces:**
- Produces: new `Dictionary["portfolio"]` shape (`title`, `intro`, `emptyState`, `backToPortfolio`, `linkLabels: { demo, repo, company, certificate, article, other }`) and an updated `Dictionary["cv"]["viewProjects"]` copy string. Consumed by Task 9, 10, 11, 12.

This task is copy/type-only — no new runtime logic, so no dedicated test file. Correctness is enforced by `satisfies Dictionary` (compile-time completeness) in each dictionary file, verified by typecheck in Step 3.

- [ ] **Step 1: Update the `Dictionary` type**

In `src/i18n/dictionary.ts`, replace the `portfolio` block:

```ts
	portfolio: {
		title: string;
		intro: string;
		emptyState: string;
		backToPortfolio: string;
		linkLabels: {
			demo: string;
			repo: string;
			company: string;
			certificate: string;
			article: string;
			other: string;
		};
	};
```

(This replaces the old `{ phase: string; title: string; body: string }` shape.)

- [ ] **Step 2: Update each locale's dictionary**

In `src/i18n/dictionaries/en.ts`, change `cv.viewProjects` and replace the `portfolio` block:

```ts
		viewProjects: "View project details",
```

```ts
	portfolio: {
		title: "Portfolio",
		intro: "Projects and case studies, grouped by category.",
		emptyState: "No projects published yet — check back soon.",
		backToPortfolio: "← Back to portfolio",
		linkLabels: {
			demo: "Live demo",
			repo: "Repository",
			company: "Company",
			certificate: "Certificate",
			article: "Article",
			other: "Link",
		},
	},
```

In `src/i18n/dictionaries/es.ts`:

```ts
		viewProjects: "Ver detalles del proyecto",
```

```ts
	portfolio: {
		title: "Portafolio",
		intro: "Proyectos y casos de estudio, agrupados por categoría.",
		emptyState: "Aún no hay proyectos publicados — vuelve pronto.",
		backToPortfolio: "← Volver al portafolio",
		linkLabels: {
			demo: "Demo en vivo",
			repo: "Repositorio",
			company: "Empresa",
			certificate: "Certificado",
			article: "Artículo",
			other: "Enlace",
		},
	},
```

In `src/i18n/dictionaries/fr.ts`:

```ts
		viewProjects: "Voir les détails du projet",
```

```ts
	portfolio: {
		title: "Portfolio",
		intro: "Projets et études de cas, regroupés par catégorie.",
		emptyState: "Aucun projet publié pour l'instant — revenez bientôt.",
		backToPortfolio: "← Retour au portfolio",
		linkLabels: {
			demo: "Démo en direct",
			repo: "Dépôt",
			company: "Entreprise",
			certificate: "Certificat",
			article: "Article",
			other: "Lien",
		},
	},
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors — if any locale file is missing a key, `satisfies Dictionary` will fail to compile with a clear diff.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/dictionary.ts src/i18n/dictionaries/en.ts src/i18n/dictionaries/es.ts src/i18n/dictionaries/fr.ts
git commit -m "feat(portfolio): add Portfolio page copy, update CV project-link copy"
```

---

## Task 8: `sync-portfolio.ts` script + placeholder `content.json`

**Files:**
- Create: `scripts/sync-portfolio.ts`
- Create: `src/lib/portfolio/content.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: `fetchKnowledgeBaseEntries` (`src/lib/notion/knowledgeBase.ts`), `translateForLocale` (`src/lib/notion/translate.ts`), `loadTranslationCache`/`saveTranslationCache` (`src/lib/notion/translationCache.ts`), `selectPortfolioEntries`/`assignSlugs`/`LocalizedPortfolioEntry` (Task 5), `downloadEntryMedia` (Task 4), `locales`/`Locale` (`src/i18n/locales.ts`).
- Produces: `src/lib/portfolio/content.json` shaped as `Partial<Record<Locale, LocalizedPortfolioEntry[]>>`. Consumed by Task 10 and 11.

No dedicated unit test for this script — it requires live Notion/Gemini credentials and is verified manually, mirroring `scripts/sync-cv.ts` (which also has no unit test). Its building blocks (`selectPortfolioEntries`, `assignSlugs`, `downloadEntryMedia`, `translateForLocale`) are already unit-tested in Tasks 4, 5, and the pre-existing `translate.test.ts`.

- [ ] **Step 1: Create the placeholder `content.json`**

Create `src/lib/portfolio/content.json` with:

```json
{}
```

This lets the build succeed with an empty Portfolio (rendering the `emptyState` message from Task 7) before anyone has run the real sync with live credentials.

- [ ] **Step 2: Write `scripts/sync-portfolio.ts`**

```ts
/**
 * Syncs Notion "📚 Knowledge Base" Project entries into a committed,
 * pre-translated JSON file (src/lib/portfolio/content.json) consumed by the
 * Portfolio page — same architecture as scripts/sync-cv.ts (see that file's
 * header and the Phase 6 design spec for why: Cloudflare Workers Builds
 * can't reliably do live Notion/Gemini calls at build time).
 *
 * Also downloads each entry's Notion-hosted media (images/video) into
 * public/portfolio/<slug>/ so the deployed site never depends on Notion's
 * short-lived presigned URLs.
 *
 * Usage: pnpm portfolio:sync
 * Required env vars: see .env.example (same as pnpm cv:sync)
 */
import { writeFileSync } from "node:fs";
import { Client } from "@notionhq/client";
import { locales, type Locale } from "../src/i18n/locales";
import { fetchKnowledgeBaseEntries } from "../src/lib/notion/knowledgeBase";
import { translateForLocale } from "../src/lib/notion/translate";
import { loadTranslationCache, saveTranslationCache } from "../src/lib/notion/translationCache";
import { downloadEntryMedia } from "../src/lib/portfolio/downloadMedia";
import {
	assignSlugs,
	selectPortfolioEntries,
	type LocalizedPortfolioEntry,
} from "../src/lib/portfolio/portfolioEntries";

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required env var: ${name} (see .env.example)`);
	}
	return value;
}

async function run() {
	const notionToken = requireEnv("NOTION_TOKEN");
	const googleApiKey = requireEnv("GOOGLE_API_KEY_LLM");

	const notion = new Client({ auth: notionToken });

	console.log("Querying Knowledge Base for Portfolio-eligible entries...");
	const allEntries = await fetchKnowledgeBaseEntries(notion);
	const portfolioEntries = selectPortfolioEntries(allEntries);
	console.log(
		`Found ${portfolioEntries.length} Portfolio-eligible entries (Published, Content Type = Project).`,
	);

	if (portfolioEntries.length === 0) {
		throw new Error(
			"No Portfolio-eligible entries found. Check Status=Published and Content Type=Project in the Knowledge Base.",
		);
	}

	const slugs = assignSlugs(portfolioEntries);

	console.log("Downloading media...");
	for (const entry of portfolioEntries) {
		const slug = slugs.get(entry.pageId);
		const media = entry.metadata.media ?? [];
		if (!slug || media.length === 0) continue;
		entry.metadata = { ...entry.metadata, media: await downloadEntryMedia(slug, media) };
	}

	const cache = loadTranslationCache();
	const content: Partial<Record<Locale, LocalizedPortfolioEntry[]>> = {};

	for (const locale of locales) {
		console.log(`Translating for locale "${locale}"...`);
		const localized = await translateForLocale(portfolioEntries, locale, { apiKey: googleApiKey, cache });
		content[locale] = localized.map((entry) => ({ ...entry, slug: slugs.get(entry.pageId) ?? "" }));
	}

	saveTranslationCache(cache);

	const outPath = new URL("../src/lib/portfolio/content.json", import.meta.url);
	writeFileSync(outPath, `${JSON.stringify(content, null, "\t")}\n`, "utf-8");
	console.log(`\nWrote ${outPath.pathname.replace(/^\//, "")}`);
}

run().catch((error) => {
	console.error(error);
	process.exit(1);
});
```

- [ ] **Step 3: Add the `portfolio:sync` script to `package.json`**

In `package.json`, add a new entry to `"scripts"` right after `"cv:sync"`:

```json
		"portfolio:sync": "node --env-file=.env --import tsx scripts/sync-portfolio.ts"
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-portfolio.ts src/lib/portfolio/content.json package.json
git commit -m "feat(portfolio): add sync-portfolio.ts script and placeholder content.json"
```

---

## Task 9: `ProjectCard.astro` component

**Files:**
- Create: `src/components/portfolio/ProjectCard.astro`

**Interfaces:**
- Consumes: `LocalizedPortfolioEntry` (Task 5), `Locale` (`src/i18n/locales.ts`).
- Produces: `ProjectCard` Astro component with `Props { entry: LocalizedPortfolioEntry; lang: Locale; presentLabel: string }`. Consumed by Task 10.

This is a presentational Astro component with no standalone logic worth a unit test (date formatting mirrors the already-covered pattern in `EntryCard.astro`); it's verified visually in Task 10's manual dev-server check.

- [ ] **Step 1: Implement `ProjectCard.astro`**

```astro
---
import type { Locale } from "../../i18n/locales";
import type { LocalizedPortfolioEntry } from "../../lib/portfolio/portfolioEntries";

interface Props {
	entry: LocalizedPortfolioEntry;
	lang: Locale;
	presentLabel: string;
}

const { entry, lang, presentLabel } = Astro.props;

function formatYear(iso: string): string {
	const year = new Date(iso).getFullYear();
	return Number.isNaN(year) ? iso : String(year);
}

const dates = entry.metadata.dates;
const dateRange = dates?.start
	? `${formatYear(dates.start)} – ${dates.ongoing || !dates.end ? presentLabel : formatYear(dates.end)}`
	: null;

const cover = entry.metadata.media?.find((item) => item.cover) ?? entry.metadata.media?.[0];
const metaLine = [entry.displayCategory, dateRange].filter(Boolean).join(" · ");
---

<a
	href={`/${lang}/portfolio/${entry.slug}`}
	class="border-slate-mist bg-deep-blue/30 hover:border-signal-cyan/50 flex flex-col overflow-hidden rounded-xl border transition-colors"
>
	{
		cover && (
			<img src={cover.url} alt={cover.alt ?? entry.displayTitle} class="aspect-video w-full object-cover" />
		)
	}
	<div class="flex flex-col gap-1 p-4">
		<h3 class="font-display text-ion text-base font-semibold">{entry.displayTitle}</h3>
		{metaLine && <p class="text-signal-cyan/70 font-mono text-xs">{metaLine}</p>}
	</div>
</a>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/portfolio/ProjectCard.astro
git commit -m "feat(portfolio): add ProjectCard component"
```

---

## Task 10: `PortfolioView.astro` grid + wire up `portfolio.astro` pages

**Files:**
- Modify: `src/views/PortfolioView.astro` (currently a Phase 6 placeholder)
- Modify: `src/pages/en/portfolio.astro`
- Modify: `src/pages/es/portfolio.astro`
- Modify: `src/pages/fr/portfolio.astro`

**Interfaces:**
- Consumes: `groupByCategory` (Task 6), `ProjectCard` (Task 9), `LocalizedPortfolioEntry` (Task 5), `content.json` (Task 8), `getDictionary`/`Locale` (`src/i18n`).

- [ ] **Step 1: Rewrite `src/views/PortfolioView.astro`**

Replace the entire file:

```astro
---
import Layout from "../layouts/Layout.astro";
import ProjectCard from "../components/portfolio/ProjectCard.astro";
import { getDictionary, type Locale } from "../i18n";
import { groupByCategory } from "../lib/portfolio/groupByCategory";
import type { LocalizedPortfolioEntry } from "../lib/portfolio/portfolioEntries";
import portfolioContent from "../lib/portfolio/content.json";

interface Props {
	lang: Locale;
}

const { lang } = Astro.props;
const t = getDictionary(lang);

// Pre-fetched and pre-translated by `pnpm portfolio:sync` (scripts/sync-portfolio.ts)
// and committed — the build never calls Notion/Gemini itself. Re-run that script
// and commit the result whenever Portfolio-relevant Notion content changes.
const localizedEntries = (portfolioContent as Partial<Record<Locale, LocalizedPortfolioEntry[]>>)[lang] ?? [];
const groups = groupByCategory(localizedEntries);
---

<Layout title={`${t.portfolio.title} — Daniel Peraza`} description={t.meta.description} lang={lang}>
	<main class="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-24">
		<header class="text-center">
			<h1 class="font-display text-ion text-3xl font-semibold">{t.portfolio.title}</h1>
			<p class="font-body text-ion/70 mt-2 text-sm">{t.portfolio.intro}</p>
		</header>

		{
			groups.length === 0 ? (
				<p class="text-ion/60 text-center text-sm">{t.portfolio.emptyState}</p>
			) : (
				<div class="flex flex-col gap-10">
					{groups.map((group) => (
						<section class="flex flex-col gap-4">
							<h2 class="text-signal-cyan font-mono text-xs tracking-[0.2em] uppercase">{group.category}</h2>
							<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
								{group.entries.map((entry) => (
									<ProjectCard entry={entry} lang={lang} presentLabel={t.cv.present} />
								))}
							</div>
						</section>
					))}
				</div>
			)
		}
	</main>
</Layout>
```

- [ ] **Step 2: Add `export const prerender = true` to each locale's `portfolio.astro`**

`src/pages/en/portfolio.astro`:

```astro
---
import PortfolioView from "../../views/PortfolioView.astro";

export const prerender = true;
---

<PortfolioView lang="en" />
```

`src/pages/es/portfolio.astro` (same pattern, `lang="es"`), `src/pages/fr/portfolio.astro` (same pattern, `lang="fr"`) — apply the identical `export const prerender = true;` addition, changing only the `lang` prop to match the existing file's locale.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 4: Manual verification**

Run: `astro dev --background`, then visit `http://localhost:4321/en/portfolio` in a browser.
Expected: the page renders the header, intro copy, and the `emptyState` message (since `content.json` is still `{}` from Task 8) — no errors in the dev server logs. Stop the server with `astro dev stop` when done.

- [ ] **Step 5: Commit**

```bash
git add src/views/PortfolioView.astro src/pages/en/portfolio.astro src/pages/es/portfolio.astro src/pages/fr/portfolio.astro
git commit -m "feat(portfolio): build the Portfolio grid view"
```

---

## Task 11: `PortfolioDetailView.astro` + `[slug].astro` dynamic routes

**Files:**
- Create: `src/views/PortfolioDetailView.astro`
- Create: `src/pages/en/portfolio/[slug].astro`
- Create: `src/pages/es/portfolio/[slug].astro`
- Create: `src/pages/fr/portfolio/[slug].astro`

**Interfaces:**
- Consumes: `LocalizedPortfolioEntry` (Task 5), `content.json` (Task 8), `getDictionary`/`Locale` (`src/i18n`), `Dictionary["portfolio"]["linkLabels"]` (Task 7).

- [ ] **Step 1: Implement `src/views/PortfolioDetailView.astro`**

```astro
---
import Layout from "../layouts/Layout.astro";
import { getDictionary, type Locale } from "../i18n";
import type { LocalizedPortfolioEntry } from "../lib/portfolio/portfolioEntries";

interface Props {
	lang: Locale;
	entry: LocalizedPortfolioEntry;
}

const { lang, entry } = Astro.props;
const t = getDictionary(lang);

function formatYear(iso: string): string {
	const year = new Date(iso).getFullYear();
	return Number.isNaN(year) ? iso : String(year);
}

const dates = entry.metadata.dates;
const dateRange = dates?.start
	? `${formatYear(dates.start)} – ${dates.ongoing || !dates.end ? t.cv.present : formatYear(dates.end)}`
	: null;

const metaLine = [entry.displayCategory, entry.displayLocation, dateRange].filter(Boolean).join(" · ");

const techStack = entry.metadata.techStack ?? [];
const links = entry.metadata.links ?? [];
const media = entry.metadata.media ?? [];

const linkLabels = t.portfolio.linkLabels;
function labelForLinkType(type: string | undefined): string {
	if (type && type in linkLabels) return linkLabels[type as keyof typeof linkLabels];
	return linkLabels.other;
}
---

<Layout
	title={`${entry.displayTitle} — Daniel Peraza`}
	description={entry.displayDescription || t.meta.description}
	lang={lang}
>
	<main class="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-24">
		<a href={`/${lang}/portfolio`} class="text-signal-cyan w-fit text-sm hover:text-signal-cyan/80">
			{t.portfolio.backToPortfolio}
		</a>

		<header>
			<h1 class="font-display text-ion text-3xl font-semibold">{entry.displayTitle}</h1>
			{metaLine && <p class="text-signal-cyan/70 mt-2 font-mono text-xs">{metaLine}</p>}
		</header>

		{
			media.length > 0 && (
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					{media.map((item) =>
						item.type === "video" ? (
							<video src={item.url} controls class="border-slate-mist w-full rounded-xl border" />
						) : (
							<figure>
								<img
									src={item.url}
									alt={item.alt ?? entry.displayTitle}
									class="border-slate-mist w-full rounded-xl border"
								/>
								{item.caption && <figcaption class="text-ion/60 mt-1 text-xs">{item.caption}</figcaption>}
							</figure>
						),
					)}
				</div>
			)
		}

		{entry.displayDescription && <p class="font-body text-ion/80 text-sm">{entry.displayDescription}</p>}

		{
			techStack.length > 0 && (
				<div class="flex flex-wrap gap-1.5">
					{techStack.map((chip) => (
						<span class="border-slate-mist-strong text-ion/70 rounded-full border px-2 py-0.5 text-xs">
							{chip}
						</span>
					))}
				</div>
			)
		}

		{
			links.length > 0 && (
				<div class="flex flex-wrap gap-3">
					{links.map((link) => (
						<a
							href={link.url}
							target="_blank"
							rel="noopener noreferrer"
							class="text-signal-cyan text-sm underline hover:text-signal-cyan/80"
						>
							{link.label} ({labelForLinkType(link.type)})
						</a>
					))}
				</div>
			)
		}
	</main>
</Layout>
```

- [ ] **Step 2: Implement `src/pages/en/portfolio/[slug].astro`**

```astro
---
import PortfolioDetailView from "../../../views/PortfolioDetailView.astro";
import type { Locale } from "../../../i18n/locales";
import type { LocalizedPortfolioEntry } from "../../../lib/portfolio/portfolioEntries";
import portfolioContent from "../../../lib/portfolio/content.json";

export const prerender = true;

interface Props {
	entry: LocalizedPortfolioEntry;
}

export async function getStaticPaths() {
	const entries =
		(portfolioContent as Partial<Record<Locale, LocalizedPortfolioEntry[]>>).en ?? [];
	return entries.map((entry) => ({
		params: { slug: entry.slug },
		props: { entry },
	}));
}

const { entry } = Astro.props;
---

<PortfolioDetailView lang="en" entry={entry} />
```

- [ ] **Step 3: Implement `src/pages/es/portfolio/[slug].astro`**

Same as Step 2, with `.es` instead of `.en` in `getStaticPaths` and `lang="es"`:

```astro
---
import PortfolioDetailView from "../../../views/PortfolioDetailView.astro";
import type { Locale } from "../../../i18n/locales";
import type { LocalizedPortfolioEntry } from "../../../lib/portfolio/portfolioEntries";
import portfolioContent from "../../../lib/portfolio/content.json";

export const prerender = true;

interface Props {
	entry: LocalizedPortfolioEntry;
}

export async function getStaticPaths() {
	const entries =
		(portfolioContent as Partial<Record<Locale, LocalizedPortfolioEntry[]>>).es ?? [];
	return entries.map((entry) => ({
		params: { slug: entry.slug },
		props: { entry },
	}));
}

const { entry } = Astro.props;
---

<PortfolioDetailView lang="es" entry={entry} />
```

- [ ] **Step 4: Implement `src/pages/fr/portfolio/[slug].astro`**

Same pattern, with `.fr` and `lang="fr"`:

```astro
---
import PortfolioDetailView from "../../../views/PortfolioDetailView.astro";
import type { Locale } from "../../../i18n/locales";
import type { LocalizedPortfolioEntry } from "../../../lib/portfolio/portfolioEntries";
import portfolioContent from "../../../lib/portfolio/content.json";

export const prerender = true;

interface Props {
	entry: LocalizedPortfolioEntry;
}

export async function getStaticPaths() {
	const entries =
		(portfolioContent as Partial<Record<Locale, LocalizedPortfolioEntry[]>>).fr ?? [];
	return entries.map((entry) => ({
		params: { slug: entry.slug },
		props: { entry },
	}));
}

const { entry } = Astro.props;
---

<PortfolioDetailView lang="fr" entry={entry} />
```

- [ ] **Step 5: Typecheck and build**

Run: `pnpm typecheck && pnpm build`
Expected: both succeed with zero errors — `getStaticPaths` returns an empty array for every locale since `content.json` is still `{}`, so zero detail pages are generated, which is valid.

- [ ] **Step 6: Commit**

```bash
git add src/views/PortfolioDetailView.astro src/pages/en/portfolio src/pages/es/portfolio src/pages/fr/portfolio
git commit -m "feat(portfolio): build the Portfolio detail page and dynamic routes"
```

---

## Task 12: CV → Portfolio cross-link

**Files:**
- Modify: `src/components/cv/EntryCard.astro`

**Interfaces:**
- Consumes: `slugify` (Task 2), `Dictionary["cv"]["viewProjects"]` (already updated copy from Task 7).

- [ ] **Step 1: Update `EntryCard.astro`'s Project link**

In `src/components/cv/EntryCard.astro`, add the import at the top of the frontmatter:

```astro
import { slugify } from "../../lib/portfolio/slug";
```

Then replace the existing link `href`:

```astro
			isProject && (
				<a
					href={`/${lang}/portfolio/${slugify(entry.title)}`}
					class="text-signal-cyan mt-3 inline-block text-sm underline hover:text-signal-cyan/80"
				>
					{viewProjectsLabel}
				</a>
			)
```

(`entry.title` is the entry's original English Notion title — unchanged across locales, and the same field `assignSlugs` slugifies in `scripts/sync-portfolio.ts`, so both sides independently compute the identical slug with no shared lookup needed.)

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`
Expected: PASS (all tests across the whole repo, including every test file added in Tasks 1-6)

- [ ] **Step 3: Typecheck, lint, and build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all three succeed with zero errors

- [ ] **Step 4: Manual verification**

Run: `astro dev --background`. Visit `http://localhost:4321/en/cv`, expand the "Projects" section, and click a project's "View project details" link.
Expected: navigates to `/en/portfolio/<slug>` (e.g. `/en/portfolio/asset-foundry`) and shows a **404** — expected and correct, since `content.json` is still `{}` (no real sync has run yet with live credentials). Confirm there's no crash/500, just a clean 404. Stop the server with `astro dev stop` when done.

- [ ] **Step 5: Commit**

```bash
git add src/components/cv/EntryCard.astro
git commit -m "feat(portfolio): link CV Project entries to their Portfolio detail page"
```

---

## After this plan

Running `pnpm portfolio:sync` against live Notion/Gemini credentials (populating the real `src/lib/portfolio/content.json` and downloading real media) is a manual step outside this plan's scope, matching how Phase 5's initial `pnpm cv:sync` run was done — it requires live API keys and produces content-dependent output, not something a fresh task-scoped subagent should run unsupervised.
