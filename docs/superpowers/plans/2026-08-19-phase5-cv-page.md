# Phase 5 — CV Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CV page's "coming soon" placeholder with a prerendered, build-time page that fetches the Notion Knowledge Base, translates it into whichever locale it isn't already in, and renders it as a quick-overview header plus four glass-styled accordion sections.

**Architecture:** `CvView.astro` (imported by three thin locale pages, each opting into `prerender = true`) fetches the Knowledge Base via a shared Notion module (extracted out of `scripts/ingest.ts`), filters/groups it into four CV sections with a pure logic module, translates untranslated fields via Gemini with a committed JSON cache, and renders each section as an independent `Accordion` React island wrapping Astro-rendered `EntryCard`s.

**Tech Stack:** Astro (server output, per-page `prerender = true`), React islands (`@astrojs/react`), `@notionhq/client`, Gemini `generateContent` (raw `fetch`, no SDK — matches `src/lib/rag/chat.ts`/`embed.ts`), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-19-phase5-cv-page-design.md`

## Global Constraints

- No downloadable PDF in this phase (deferred).
- Project entries link to `/[lang]/portfolio` (the index page), never a detail route — Phase 6 doesn't exist yet.
- The CV only refreshes on redeploy — no runtime Notion/Gemini calls, ever, for a visitor request.
- A Notion or Gemini error during a locale's build-time fetch/translate is a **hard build failure** — no silent empty-section or stale-content fallback.
- `NOTION_TOKEN` and `GOOGLE_API_KEY_LLM` must be added as Cloudflare Pages **build-time** environment variables before the site can build in production (Task 8) — Daniel has already confirmed this.
- The translation cache file (`src/lib/notion/.cv-translation-cache.json`) is a committed build artifact — never hand-edited, but tracked in git so builds are reproducible.
- Skill-type Knowledge Base entries never form their own accordion section — they only ever appear as chip pills on the entries they relate to (matched via the `Related To` relation, checked in both directions).
- Header tagline/summary text is hand-written directly in the i18n dictionaries (not sourced from Notion) — see Task 4 for the exact approved copy.

---

## Task 1: Extract shared Notion Knowledge Base module

**Files:**

- Create: `src/lib/notion/knowledgeBase.ts`
- Create: `src/lib/notion/knowledgeBase.test.ts`
- Modify: `scripts/ingest.ts` (replace its private `extractEntry`/`fetchAllEntries`/`plainText` with imports from the new module)

**Interfaces:**

- Produces: `KNOWLEDGE_BASE_DATA_SOURCE_ID: string`, `interface EntryMetadata { category?, dates?: { start?, end?, ongoing? }, location?, links?: Array<{label, url, type?}>, techStack?: string[] }`, `interface KnowledgeBaseEntry { pageId, title, summary, description, contentType, tags, priority, status, language, relatedTo, metadata: EntryMetadata }`, `parseMetadata(raw: string | undefined): EntryMetadata`, `extractEntry(page: PageObjectResponse): KnowledgeBaseEntry`, `fetchKnowledgeBaseEntries(notion: Client, dataSourceId?: string): Promise<KnowledgeBaseEntry[]>` (returns every entry regardless of Status/Content Type — callers filter).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/notion/knowledgeBase.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import {
	extractEntry,
	fetchKnowledgeBaseEntries,
	parseMetadata,
} from "./knowledgeBase";
import type { PageObjectResponse } from "@notionhq/client";

function fakePage(
	overrides: Partial<PageObjectResponse["properties"]> = {},
): PageObjectResponse {
	return {
		id: "page-1",
		properties: {
			Title: { type: "title", title: [{ plain_text: "Senior Engineer" }] },
			Summary: {
				type: "rich_text",
				rich_text: [{ plain_text: "A short summary." }],
			},
			Description: {
				type: "rich_text",
				rich_text: [{ plain_text: "A longer description." }],
			},
			"Content Type": {
				type: "select",
				select: { name: "Professional Experience" },
			},
			Tags: {
				type: "multi_select",
				multi_select: [{ name: "backend" }, { name: "ai" }],
			},
			Priority: { type: "number", number: 5 },
			Status: { type: "select", select: { name: "Published" } },
			Language: { type: "select", select: { name: "ES" } },
			"Related To": { type: "relation", relation: [{ id: "skill-1" }] },
			Metadata: {
				type: "rich_text",
				rich_text: [
					{ plain_text: '{"category":"Full-time Role","location":"Remote"}' },
				],
			},
			...overrides,
			// biome-ignore: test fixture, not a real PageObjectResponse
		} as PageObjectResponse["properties"],
	} as PageObjectResponse;
}

describe("parseMetadata", () => {
	it("parses a valid JSON metadata string", () => {
		expect(
			parseMetadata('{"category":"Web App","techStack":["Astro"]}'),
		).toEqual({
			category: "Web App",
			techStack: ["Astro"],
		});
	});

	it("returns an empty object for undefined input", () => {
		expect(parseMetadata(undefined)).toEqual({});
	});

	it("returns an empty object for malformed JSON instead of throwing", () => {
		expect(parseMetadata("{not json")).toEqual({});
	});

	it("returns an empty object if the JSON parses to a non-object", () => {
		expect(parseMetadata('"just a string"')).toEqual({});
	});
});

describe("extractEntry", () => {
	it("extracts all scalar properties", () => {
		const entry = extractEntry(fakePage());
		expect(entry).toMatchObject({
			pageId: "page-1",
			title: "Senior Engineer",
			summary: "A short summary.",
			description: "A longer description.",
			contentType: "Professional Experience",
			tags: ["backend", "ai"],
			priority: 5,
			status: "Published",
			language: "ES",
			relatedTo: ["skill-1"],
		});
	});

	it("parses the Metadata JSON property into structured fields", () => {
		const entry = extractEntry(fakePage());
		expect(entry.metadata).toEqual({
			category: "Full-time Role",
			location: "Remote",
		});
	});

	it("defaults metadata to an empty object when the Metadata property is absent", () => {
		const entry = extractEntry(fakePage({ Metadata: undefined as never }));
		expect(entry.metadata).toEqual({});
	});
});

describe("fetchKnowledgeBaseEntries", () => {
	it("pages through all results and extracts each entry", async () => {
		const query = vi
			.fn()
			.mockResolvedValueOnce({
				results: [
					fakePage({
						Title: { type: "title", title: [{ plain_text: "First" }] },
					} as never),
				],
				has_more: true,
				next_cursor: "cursor-2",
			})
			.mockResolvedValueOnce({
				results: [
					fakePage({
						Title: { type: "title", title: [{ plain_text: "Second" }] },
					} as never),
				],
				has_more: false,
				next_cursor: null,
			});
		const notion = { dataSources: { query } } as never;

		const entries = await fetchKnowledgeBaseEntries(notion, "ds-id");

		expect(entries.map((e) => e.title)).toEqual(["First", "Second"]);
		expect(query).toHaveBeenNthCalledWith(1, {
			data_source_id: "ds-id",
			start_cursor: undefined,
			page_size: 100,
		});
		expect(query).toHaveBeenNthCalledWith(2, {
			data_source_id: "ds-id",
			start_cursor: "cursor-2",
			page_size: 100,
		});
	});

	it("skips results without a properties field", async () => {
		const query = vi.fn().mockResolvedValueOnce({
			results: [{ id: "not-a-page" }],
			has_more: false,
			next_cursor: null,
		});
		const notion = { dataSources: { query } } as never;

		const entries = await fetchKnowledgeBaseEntries(notion, "ds-id");

		expect(entries).toEqual([]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/notion/knowledgeBase.test.ts`
Expected: FAIL — `./knowledgeBase` module does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/lib/notion/knowledgeBase.ts`:

```typescript
import type { Client } from "@notionhq/client";
import type {
	PageObjectResponse,
	RichTextItemResponse,
} from "@notionhq/client";

export const KNOWLEDGE_BASE_DATA_SOURCE_ID =
	process.env.NOTION_KNOWLEDGE_BASE_DATA_SOURCE_ID ||
	"9014f42b-a380-4526-8521-a5d20f491f58";

const NOTION_REQUEST_DELAY_MS = 350;

export interface MetadataLink {
	label: string;
	url: string;
	type?: string;
}

export interface MetadataDates {
	start?: string;
	end?: string;
	ongoing?: boolean;
}

export interface EntryMetadata {
	category?: string;
	dates?: MetadataDates;
	location?: string;
	links?: MetadataLink[];
	techStack?: string[];
}

export interface KnowledgeBaseEntry {
	pageId: string;
	title: string;
	summary: string;
	description: string;
	contentType: string | null;
	tags: string[];
	priority: number | null;
	status: string | null;
	language: string | null;
	relatedTo: string[];
	metadata: EntryMetadata;
}

export function plainText(
	richText: RichTextItemResponse[] | undefined,
): string {
	return (richText ?? []).map((item) => item.plain_text).join("");
}

/** Parses the `Metadata` JSON-text property. Never throws — malformed or missing
 * metadata degrades to `{}` rather than failing the whole entry. */
export function parseMetadata(raw: string | undefined): EntryMetadata {
	if (!raw) return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return {};
		return parsed as EntryMetadata;
	} catch {
		return {};
	}
}

export function extractEntry(page: PageObjectResponse): KnowledgeBaseEntry {
	const props = page.properties;

	const title =
		props.Title?.type === "title" ? plainText(props.Title.title) : "";
	const summary =
		props.Summary?.type === "rich_text"
			? plainText(props.Summary.rich_text)
			: "";
	const description =
		props.Description?.type === "rich_text"
			? plainText(props.Description.rich_text)
			: "";
	const contentType =
		props["Content Type"]?.type === "select"
			? (props["Content Type"].select?.name ?? null)
			: null;
	const tags =
		props.Tags?.type === "multi_select"
			? props.Tags.multi_select.map((o) => o.name)
			: [];
	const priority =
		props.Priority?.type === "number" ? props.Priority.number : null;
	const status =
		props.Status?.type === "select"
			? (props.Status.select?.name ?? null)
			: null;
	const language =
		props.Language?.type === "select"
			? (props.Language.select?.name ?? null)
			: null;
	const relatedTo =
		props["Related To"]?.type === "relation"
			? props["Related To"].relation.map((r) => r.id)
			: [];
	const metadataRaw =
		props.Metadata?.type === "rich_text"
			? plainText(props.Metadata.rich_text)
			: undefined;

	return {
		pageId: page.id,
		title,
		summary,
		description,
		contentType,
		tags,
		priority,
		status,
		language,
		relatedTo,
		metadata: parseMetadata(metadataRaw),
	};
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetches every entry in the Knowledge Base, regardless of Status/Content Type —
 * callers filter for their own purposes (ingest.ts wants everything, to detect
 * un-published pages; the CV build wants only Published + specific Content Types). */
export async function fetchKnowledgeBaseEntries(
	notion: Client,
	dataSourceId: string = KNOWLEDGE_BASE_DATA_SOURCE_ID,
): Promise<KnowledgeBaseEntry[]> {
	const entries: KnowledgeBaseEntry[] = [];
	let cursor: string | undefined;

	do {
		const response = await notion.dataSources.query({
			data_source_id: dataSourceId,
			start_cursor: cursor,
			page_size: 100,
		});

		for (const result of response.results) {
			if ("properties" in result) {
				entries.push(extractEntry(result as PageObjectResponse));
			}
		}

		cursor = response.has_more
			? (response.next_cursor ?? undefined)
			: undefined;
		await sleep(NOTION_REQUEST_DELAY_MS);
	} while (cursor);

	return entries;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/notion/knowledgeBase.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Update `scripts/ingest.ts` to use the shared module**

Modify `scripts/ingest.ts`:

- Remove the local `KNOWLEDGE_BASE_DATA_SOURCE_ID` constant, `KnowledgeBaseEntry` interface, `plainText`, `extractEntry`, and `fetchAllEntries` functions (lines 22–130 of the current file).
- Add `import { fetchKnowledgeBaseEntries } from "../src/lib/notion/knowledgeBase";` near the top, alongside the other `src/lib/rag/*` imports.
- In `run()`, change `const entries = await fetchAllEntries(notion);` to `const entries = await fetchKnowledgeBaseEntries(notion);`.
- The rest of `run()` (the `for (const entry of entries)` loop using `entry.pageId`, `entry.status`, `entry.title`, etc.) is unchanged — the shape is identical, just imported now instead of defined locally.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors from `scripts/ingest.ts` or the new module.

- [ ] **Step 7: Commit**

```bash
git add src/lib/notion/knowledgeBase.ts src/lib/notion/knowledgeBase.test.ts scripts/ingest.ts
git commit -m "refactor(notion): extract shared Knowledge Base fetch/parse module

Factors extractEntry/fetchAllEntries out of scripts/ingest.ts into
src/lib/notion/knowledgeBase.ts (adding Metadata JSON parsing) so the
upcoming CV page build can reuse the same Notion parsing logic."
```

---

## Task 2: CV section grouping and skill-chip matching

**Files:**

- Create: `src/lib/cv/groupEntries.ts`
- Create: `src/lib/cv/groupEntries.test.ts`

**Interfaces:**

- Consumes: `KnowledgeBaseEntry` from Task 1 (`../notion/knowledgeBase`); `LocalizedEntry` type from Task 3 (`../notion/translate`) — see note in Step 3 below on the import-order workaround.
- Produces: `CV_CONTENT_TYPES: readonly string[]`, `selectCvEntries(entries: KnowledgeBaseEntry[]): KnowledgeBaseEntry[]`, `type CvSection`, `CV_SECTIONS: CvSection[]`, `skillChipsFor(entry: LocalizedEntry, allEntries: LocalizedEntry[]): string[]`, `groupBySection(entries: LocalizedEntry[]): Record<CvSection, LocalizedEntry[]>`.

Since `LocalizedEntry` is defined in Task 3 but this task comes first, Step 3 defines a **local, structurally-identical type alias** for `LocalizedEntry` in this file so Task 2 doesn't have to wait on Task 3. Task 3's `LocalizedEntry` (in `src/lib/notion/translate.ts`) must end up with exactly the same shape: `KnowledgeBaseEntry & { displayTitle: string; displayCategory: string; displayLocation: string; displayDescription: string }`. Task 7 imports `groupBySection`/`skillChipsFor` from this file and `LocalizedEntry` from `translate.ts` — TypeScript's structural typing means passing a real `LocalizedEntry` where this file's local alias is expected works with no changes needed.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/cv/groupEntries.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
	CV_SECTIONS,
	groupBySection,
	selectCvEntries,
	skillChipsFor,
	type LocalizedEntryLike,
} from "./groupEntries";
import type { KnowledgeBaseEntry } from "../notion/knowledgeBase";

function kbEntry(
	overrides: Partial<KnowledgeBaseEntry> = {},
): KnowledgeBaseEntry {
	return {
		pageId: "p1",
		title: "Title",
		summary: "",
		description: "",
		contentType: "Professional Experience",
		tags: [],
		priority: 0,
		status: "Published",
		language: "EN",
		relatedTo: [],
		metadata: {},
		...overrides,
	};
}

function localized(
	overrides: Partial<LocalizedEntryLike> = {},
): LocalizedEntryLike {
	const base = kbEntry(overrides);
	return {
		...base,
		displayTitle: base.title,
		displayCategory: base.metadata.category ?? "",
		displayLocation: base.metadata.location ?? "",
		displayDescription: base.description,
		...overrides,
	};
}

describe("selectCvEntries", () => {
	it("keeps only Published entries with a relevant Content Type", () => {
		const entries = [
			kbEntry({
				pageId: "a",
				status: "Published",
				contentType: "Professional Experience",
			}),
			kbEntry({
				pageId: "b",
				status: "Draft",
				contentType: "Professional Experience",
			}),
			kbEntry({
				pageId: "c",
				status: "Published",
				contentType: "Some Other Type",
			}),
			kbEntry({ pageId: "d", status: "Published", contentType: "Skill" }),
		];
		expect(selectCvEntries(entries).map((e) => e.pageId)).toEqual(["a", "d"]);
	});
});

describe("groupBySection", () => {
	it("maps each Content Type to its section", () => {
		const entries = [
			localized({ pageId: "a", contentType: "Professional Experience" }),
			localized({ pageId: "b", contentType: "Project" }),
			localized({ pageId: "c", contentType: "Academic Experience" }),
			localized({ pageId: "d", contentType: "Personal Interest" }),
		];
		const grouped = groupBySection(entries);
		expect(grouped["Professional Experience"].map((e) => e.pageId)).toEqual([
			"a",
		]);
		expect(grouped.Projects.map((e) => e.pageId)).toEqual(["b"]);
		expect(
			grouped["Academic Experience & Certifications"].map((e) => e.pageId),
		).toEqual(["c"]);
		expect(
			grouped["Personal Interests & Background"].map((e) => e.pageId),
		).toEqual(["d"]);
	});

	it("excludes Skill entries from every section", () => {
		const grouped = groupBySection([
			localized({ pageId: "s", contentType: "Skill" }),
		]);
		for (const section of CV_SECTIONS) {
			expect(grouped[section]).toEqual([]);
		}
	});

	it("sorts entries by start date descending", () => {
		const entries = [
			localized({
				pageId: "old",
				metadata: { dates: { start: "2020-01-01" } },
			}),
			localized({
				pageId: "new",
				metadata: { dates: { start: "2024-01-01" } },
			}),
		];
		const grouped = groupBySection(entries);
		expect(grouped["Professional Experience"].map((e) => e.pageId)).toEqual([
			"new",
			"old",
		]);
	});

	it("falls back to Priority (higher first) for entries with no date, sorted after all dated entries", () => {
		const entries = [
			localized({
				pageId: "dated",
				metadata: { dates: { start: "2020-01-01" } },
				priority: 0,
			}),
			localized({ pageId: "low-priority", metadata: {}, priority: 1 }),
			localized({ pageId: "high-priority", metadata: {}, priority: 9 }),
		];
		const grouped = groupBySection(entries);
		expect(grouped["Professional Experience"].map((e) => e.pageId)).toEqual([
			"dated",
			"high-priority",
			"low-priority",
		]);
	});
});

describe("skillChipsFor", () => {
	it("matches a Skill entry that relates to the target entry", () => {
		const target = localized({ pageId: "job", relatedTo: [] });
		const skill = localized({
			pageId: "skill-1",
			contentType: "Skill",
			relatedTo: ["job"],
			displayTitle: "TypeScript",
		});
		expect(skillChipsFor(target, [target, skill])).toEqual(["TypeScript"]);
	});

	it("matches when the target entry itself lists the skill in relatedTo (the other relation direction)", () => {
		const skill = localized({
			pageId: "skill-1",
			contentType: "Skill",
			displayTitle: "Python",
		});
		const target = localized({ pageId: "job", relatedTo: ["skill-1"] });
		expect(skillChipsFor(target, [target, skill])).toEqual(["Python"]);
	});

	it("returns an empty array when no Skill entries relate to the target", () => {
		const target = localized({ pageId: "job" });
		const unrelatedSkill = localized({
			pageId: "skill-1",
			contentType: "Skill",
			relatedTo: ["other"],
		});
		expect(skillChipsFor(target, [target, unrelatedSkill])).toEqual([]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/cv/groupEntries.test.ts`
Expected: FAIL — `./groupEntries` module does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/lib/cv/groupEntries.ts`:

```typescript
import type { KnowledgeBaseEntry } from "../notion/knowledgeBase";

/** Structurally identical to `LocalizedEntry` from `../notion/translate` (Task 3) —
 * kept as a local alias here so this module has no runtime or type-only
 * dependency on Task 3's file, avoiding an import-order coupling between the
 * two. Task 7 passes real `LocalizedEntry` values in; TypeScript's structural
 * typing accepts them here with no changes needed. */
export type LocalizedEntryLike = KnowledgeBaseEntry & {
	displayTitle: string;
	displayCategory: string;
	displayLocation: string;
	displayDescription: string;
};

export const CV_CONTENT_TYPES = [
	"Professional Experience",
	"Project",
	"Academic Experience",
	"Personal Interest",
	"Skill",
] as const;

export type CvSection =
	| "Professional Experience"
	| "Projects"
	| "Academic Experience & Certifications"
	| "Personal Interests & Background";

export const CV_SECTIONS: CvSection[] = [
	"Professional Experience",
	"Projects",
	"Academic Experience & Certifications",
	"Personal Interests & Background",
];

const SECTION_BY_CONTENT_TYPE: Record<string, CvSection> = {
	"Professional Experience": "Professional Experience",
	Project: "Projects",
	"Academic Experience": "Academic Experience & Certifications",
	"Personal Interest": "Personal Interests & Background",
};

/** Entries eligible for the CV build: Published, one of the five relevant
 * Content Types (Skill included — needed for chip matching, not its own section). */
export function selectCvEntries(
	entries: KnowledgeBaseEntry[],
): KnowledgeBaseEntry[] {
	return entries.filter(
		(entry) =>
			entry.status === "Published" &&
			entry.contentType !== null &&
			(CV_CONTENT_TYPES as readonly string[]).includes(entry.contentType),
	);
}

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

/** Bidirectional match: a Skill's own `relatedTo` list, or any Skill entry whose
 * `relatedTo` includes this entry's pageId — Notion relations are bidirectional
 * but a single page's properties only ever show one side of the link. */
export function skillChipsFor(
	entry: LocalizedEntryLike,
	allEntries: LocalizedEntryLike[],
): string[] {
	const skills = allEntries.filter(
		(candidate) => candidate.contentType === "Skill",
	);
	const matched = skills.filter(
		(skill) =>
			entry.relatedTo.includes(skill.pageId) ||
			skill.relatedTo.includes(entry.pageId),
	);
	return matched.map((skill) => skill.displayTitle);
}

/** Groups entries into the four CV sections, sorted most-recent-first within
 * each. Skill entries never appear in the output — see skillChipsFor. */
export function groupBySection(
	entries: LocalizedEntryLike[],
): Record<CvSection, LocalizedEntryLike[]> {
	const grouped: Record<CvSection, LocalizedEntryLike[]> = {
		"Professional Experience": [],
		Projects: [],
		"Academic Experience & Certifications": [],
		"Personal Interests & Background": [],
	};

	for (const entry of entries) {
		if (!entry.contentType) continue;
		const section = SECTION_BY_CONTENT_TYPE[entry.contentType];
		if (!section) continue; // Skill entries (and anything unmapped) are chip-only
		grouped[section].push(entry);
	}

	for (const section of CV_SECTIONS) {
		grouped[section].sort((a, b) => entrySortKey(b) - entrySortKey(a));
	}

	return grouped;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/cv/groupEntries.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/cv/groupEntries.ts src/lib/cv/groupEntries.test.ts
git commit -m "feat(cv): add section grouping and skill-chip matching logic"
```

---

## Task 3: Translation with a committed cache

**Files:**

- Create: `src/lib/notion/translate.ts`
- Create: `src/lib/notion/translate.test.ts`
- Create: `src/lib/notion/translationCache.ts`
- Create: `src/lib/notion/.cv-translation-cache.json` (initial content: `{}`)

**Interfaces:**

- Consumes: `KnowledgeBaseEntry` from Task 1 (`./knowledgeBase`); `Locale`, `localeLabels` from `../../i18n/locales`.
- Produces: `interface TranslatableFields { title, category, location, description }`, `type TranslationCache = Record<string, TranslatableFields>`, `interface LocalizedEntry extends KnowledgeBaseEntry { displayTitle, displayCategory, displayLocation, displayDescription }`, `hashFields(fields: TranslatableFields): string`, `cacheKey(pageId: string, targetLocale: Locale, fields: TranslatableFields): string`, `translateFields(fields, targetLocale, options: { apiKey, fetchImpl? }): Promise<TranslatableFields>`, `translateForLocale(entries: KnowledgeBaseEntry[], targetLocale: Locale, options: { apiKey, cache: TranslationCache, fetchImpl? }): Promise<LocalizedEntry[]>`; separately, `loadTranslationCache(): TranslationCache` / `saveTranslationCache(cache: TranslationCache): void` from `./translationCache`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/notion/translate.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import {
	cacheKey,
	hashFields,
	translateFields,
	translateForLocale,
} from "./translate";
import type { KnowledgeBaseEntry } from "./knowledgeBase";

function entry(
	overrides: Partial<KnowledgeBaseEntry> = {},
): KnowledgeBaseEntry {
	return {
		pageId: "p1",
		title: "Ingeniero de Software",
		summary: "",
		description: "Construí sistemas de IA.",
		contentType: "Professional Experience",
		tags: [],
		priority: 0,
		status: "Published",
		language: "ES",
		relatedTo: [],
		metadata: { category: "Full-time Role", location: "Remoto" },
		...overrides,
	};
}

function fakeFetch(jsonText: string) {
	return vi.fn().mockResolvedValue({
		ok: true,
		status: 200,
		json: async () => ({
			candidates: [{ content: { parts: [{ text: jsonText }] } }],
		}),
		text: async () => "",
	});
}

describe("hashFields / cacheKey", () => {
	it("produces the same hash for identical fields", () => {
		const fields = {
			title: "A",
			category: "B",
			location: "C",
			description: "D",
		};
		expect(hashFields(fields)).toBe(hashFields({ ...fields }));
	});

	it("produces a different hash when a field changes", () => {
		const fields = {
			title: "A",
			category: "B",
			location: "C",
			description: "D",
		};
		expect(hashFields(fields)).not.toBe(
			hashFields({ ...fields, description: "changed" }),
		);
	});

	it("builds a cache key from pageId, locale, and the field hash", () => {
		const fields = {
			title: "A",
			category: "B",
			location: "C",
			description: "D",
		};
		expect(cacheKey("p1", "en", fields)).toBe(`p1:en:${hashFields(fields)}`);
	});
});

describe("translateFields", () => {
	it("returns the parsed translated fields on a valid response", async () => {
		const fetchImpl = fakeFetch(
			JSON.stringify({
				title: "Software Engineer",
				category: "Full-time Role",
				location: "Remote",
				description: "Built AI systems.",
			}),
		);
		const result = await translateFields(
			{
				title: "Ingeniero de Software",
				category: "Full-time Role",
				location: "Remoto",
				description: "Construí sistemas de IA.",
			},
			"en",
			{ apiKey: "key", fetchImpl },
		);
		expect(result).toEqual({
			title: "Software Engineer",
			category: "Full-time Role",
			location: "Remote",
			description: "Built AI systems.",
		});
	});

	it("throws if the response is not ok", async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			json: async () => ({}),
			text: async () => "server error",
		});
		await expect(
			translateFields(
				{ title: "A", category: "", location: "", description: "" },
				"en",
				{
					apiKey: "key",
					fetchImpl,
				},
			),
		).rejects.toThrow("Translation request failed (500)");
	});

	it("throws if the response text isn't valid TranslatableFields JSON", async () => {
		const fetchImpl = fakeFetch(JSON.stringify({ oops: "wrong shape" }));
		await expect(
			translateFields(
				{ title: "A", category: "", location: "", description: "" },
				"en",
				{
					apiKey: "key",
					fetchImpl,
				},
			),
		).rejects.toThrow("not valid TranslatableFields JSON");
	});
});

describe("translateForLocale", () => {
	it("passes an entry through unchanged when it's already in the target locale", async () => {
		const fetchImpl = vi.fn();
		const [result] = await translateForLocale(
			[entry({ language: "ES" })],
			"es",
			{
				apiKey: "key",
				cache: {},
				fetchImpl,
			},
		);
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(result.displayTitle).toBe("Ingeniero de Software");
		expect(result.displayDescription).toBe("Construí sistemas de IA.");
	});

	it("translates an entry not in the target locale and stores it in the cache", async () => {
		const fetchImpl = fakeFetch(
			JSON.stringify({
				title: "Software Engineer",
				category: "Full-time Role",
				location: "Remote",
				description: "Built AI systems.",
			}),
		);
		const cache: Record<
			string,
			{ title: string; category: string; location: string; description: string }
		> = {};
		const [result] = await translateForLocale(
			[entry({ language: "ES" })],
			"en",
			{
				apiKey: "key",
				cache,
				fetchImpl,
			},
		);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(result.displayTitle).toBe("Software Engineer");
		expect(Object.keys(cache)).toHaveLength(1);
	});

	it("reuses a cached translation instead of calling the API again", async () => {
		const fetchImpl = vi.fn();
		const source = entry({ language: "ES" });
		const fields = {
			title: source.title,
			category: source.metadata.category ?? "",
			location: source.metadata.location ?? "",
			description: source.description,
		};
		const key = cacheKey(source.pageId, "en", fields);
		const cache = {
			[key]: {
				title: "Cached Title",
				category: "Cached Cat",
				location: "Cached Loc",
				description: "Cached Desc",
			},
		};

		const [result] = await translateForLocale([source], "en", {
			apiKey: "key",
			cache,
			fetchImpl,
		});

		expect(fetchImpl).not.toHaveBeenCalled();
		expect(result.displayTitle).toBe("Cached Title");
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/notion/translate.test.ts`
Expected: FAIL — `./translate` module does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/lib/notion/translate.ts`:

```typescript
import { createHash } from "node:crypto";
import { localeLabels, type Locale } from "../../i18n/locales";
import type { KnowledgeBaseEntry } from "./knowledgeBase";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TRANSLATE_MODEL = "gemini-flash-lite-latest";
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 5_000;

const TARGET_LANGUAGE_NAME: Record<Locale, string> = {
	en: "English",
	es: "Spanish",
	fr: "French",
};

export interface TranslatableFields {
	title: string;
	category: string;
	location: string;
	description: string;
}

export type TranslationCache = Record<string, TranslatableFields>;

export interface LocalizedEntry extends KnowledgeBaseEntry {
	displayTitle: string;
	displayCategory: string;
	displayLocation: string;
	displayDescription: string;
}

/** Narrow structural subset of `fetch` — real `fetch` satisfies this. */
export interface FetchLike {
	(
		url: string,
		init: RequestInit,
	): Promise<{
		ok: boolean;
		status: number;
		json(): Promise<unknown>;
		text(): Promise<string>;
	}>;
}

function extractTranslatable(entry: KnowledgeBaseEntry): TranslatableFields {
	return {
		title: entry.title,
		category: entry.metadata.category ?? "",
		location: entry.metadata.location ?? "",
		description: entry.description,
	};
}

/** Deterministic content hash so an unchanged entry reuses its cached translation. */
export function hashFields(fields: TranslatableFields): string {
	return createHash("sha256")
		.update(JSON.stringify(fields))
		.digest("hex")
		.slice(0, 16);
}

export function cacheKey(
	pageId: string,
	targetLocale: Locale,
	fields: TranslatableFields,
): string {
	return `${pageId}:${targetLocale}:${hashFields(fields)}`;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
	url: string,
	init: RequestInit,
	fetchImpl: FetchLike,
): ReturnType<FetchLike> {
	for (let attempt = 0; ; attempt++) {
		const response = await fetchImpl(url, init);
		if (response.status !== 429 || attempt >= MAX_RETRIES) return response;
		await sleep(BASE_RETRY_DELAY_MS * 2 ** attempt);
	}
}

function isTranslatableFields(value: unknown): value is TranslatableFields {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Partial<TranslatableFields>;
	return (
		typeof candidate.title === "string" &&
		typeof candidate.category === "string" &&
		typeof candidate.location === "string" &&
		typeof candidate.description === "string"
	);
}

/** Calls Gemini to translate one entry's fields into the target locale. Throws on
 * a non-OK response or a response that isn't valid TranslatableFields JSON — a
 * hard build failure is the desired behavior (see the design spec). */
export async function translateFields(
	fields: TranslatableFields,
	targetLocale: Locale,
	options: { apiKey: string; fetchImpl?: FetchLike },
): Promise<TranslatableFields> {
	const { apiKey, fetchImpl = fetch as unknown as FetchLike } = options;

	const response = await fetchWithRetry(
		`${API_BASE}/${TRANSLATE_MODEL}:generateContent?key=${apiKey}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				contents: [
					{
						role: "user",
						parts: [
							{
								text: `Translate the following JSON object's string values into ${TARGET_LANGUAGE_NAME[targetLocale]}. Keep the same keys. Preserve a professional CV tone. Return ONLY the translated JSON object, no other text.\n\n${JSON.stringify(fields)}`,
							},
						],
					},
				],
				generationConfig: { responseMimeType: "application/json" },
			}),
		},
		fetchImpl,
	);

	if (!response.ok) {
		throw new Error(
			`Translation request failed (${response.status}): ${await response.text()}`,
		);
	}

	const body = (await response.json()) as {
		candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
	};
	const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
	if (!text) throw new Error("Translation response had no text content");

	const parsed: unknown = JSON.parse(text);
	if (!isTranslatableFields(parsed)) {
		throw new Error(
			`Translation response was not valid TranslatableFields JSON: ${text}`,
		);
	}

	return parsed;
}

/** Translates (or passes through, if already in the target language) every
 * entry, reading from and writing to `cache` in place. Caller persists `cache`
 * to disk afterward (see translationCache.ts). */
export async function translateForLocale(
	entries: KnowledgeBaseEntry[],
	targetLocale: Locale,
	options: { apiKey: string; cache: TranslationCache; fetchImpl?: FetchLike },
): Promise<LocalizedEntry[]> {
	const { apiKey, cache, fetchImpl } = options;
	const targetLanguageCode = localeLabels[targetLocale];

	const results: LocalizedEntry[] = [];
	for (const entry of entries) {
		const source = extractTranslatable(entry);
		let localized = source;

		if (entry.language?.toUpperCase() !== targetLanguageCode) {
			const key = cacheKey(entry.pageId, targetLocale, source);
			const cached = cache[key];
			if (cached) {
				localized = cached;
			} else {
				localized = await translateFields(source, targetLocale, {
					apiKey,
					fetchImpl,
				});
				cache[key] = localized;
			}
		}

		results.push({
			...entry,
			displayTitle: localized.title,
			displayCategory: localized.category,
			displayLocation: localized.location,
			displayDescription: localized.description,
		});
	}

	return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/notion/translate.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Add the cache file and its I/O wrapper**

Create `src/lib/notion/.cv-translation-cache.json`:

```json
{}
```

Create `src/lib/notion/translationCache.ts`:

```typescript
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { TranslationCache } from "./translate";

const CACHE_PATH = fileURLToPath(
	new URL("./.cv-translation-cache.json", import.meta.url),
);

/** Loads the committed translation cache. Never throws — a missing or
 * corrupted cache file just means every entry gets re-translated this build. */
export function loadTranslationCache(): TranslationCache {
	if (!existsSync(CACHE_PATH)) return {};
	try {
		return JSON.parse(readFileSync(CACHE_PATH, "utf-8")) as TranslationCache;
	} catch {
		return {};
	}
}

export function saveTranslationCache(cache: TranslationCache): void {
	writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, "\t")}\n`, "utf-8");
}
```

This file has no dedicated unit test — it's a two-function fs passthrough with no branching logic worth mocking `node:fs` for, consistent with how this codebase doesn't test other thin I/O wrappers (e.g. `defaultFactory` in `ephemeralToken.ts`).

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/notion/translate.ts src/lib/notion/translate.test.ts src/lib/notion/translationCache.ts "src/lib/notion/.cv-translation-cache.json"
git commit -m "feat(cv): add Gemini translation with a committed build cache"
```

---

## Task 4: i18n dictionary additions

**Files:**

- Modify: `src/i18n/dictionary.ts`
- Modify: `src/i18n/dictionaries/en.ts`
- Modify: `src/i18n/dictionaries/es.ts`
- Modify: `src/i18n/dictionaries/fr.ts`

**Interfaces:**

- Produces: the new `Dictionary["cv"]` shape every later `.astro` task reads from (`t.cv.title`, `t.cv.tagline`, `t.cv.summary`, `t.cv.sections.*`, `t.cv.viewProjects`, `t.cv.present`, `t.cv.emptySection`).

This task has no test file — dictionary content is exercised indirectly by `astro check` (compile-time `satisfies Dictionary` completeness checking) and by Task 7's manual verification checklist, matching how every other dictionary entry in this codebase is validated.

- [ ] **Step 1: Update the shared type**

In `src/i18n/dictionary.ts`, replace the existing `cv` block:

```typescript
cv: {
	phase: string;
	title: string;
	body: string;
}
```

with:

```typescript
cv: {
	title: string;
	tagline: string;
	summary: string;
	sections: {
		professionalExperience: string;
		projects: string;
		academicExperience: string;
		personalInterests: string;
	}
	viewProjects: string;
	present: string;
	emptySection: string;
}
```

- [ ] **Step 2: Update `en.ts`**

In `src/i18n/dictionaries/en.ts`, replace the existing `cv: { ... }` block with:

```typescript
	cv: {
		title: "CV",
		tagline: "AI & Automation Engineer | Project Manager | Specialized in LLM Pipelines (n8n), NLP & Machine Learning",
		summary:
			"Junior AI & ML Engineer with a strong engineering foundation and hands-on experience architecting generative AI solutions, multi-model AI agents, and automated business workflows. Proficient in Python, custom REST APIs, LLM routing (Claude, Gemini, Llama, Hugging Face, EvoLink API), orchestration platforms (n8n, Docker), vector databases (pgvector, ChromaDB), and predictive ML dashboards. Proven track record of turning complex technical concepts into clear business solutions, delivering rapid proofs of concept, and managing automated productivity workflows via CLI tools and MCPs.",
		sections: {
			professionalExperience: "Professional Experience",
			projects: "Projects",
			academicExperience: "Academic Experience & Certifications",
			personalInterests: "Personal Interests & Background",
		},
		viewProjects: "View my projects",
		present: "Present",
		emptySection: "Nothing published here yet.",
	},
```

- [ ] **Step 3: Update `es.ts`**

In `src/i18n/dictionaries/es.ts`, replace the existing `cv: { ... }` block with:

```typescript
	cv: {
		title: "CV",
		tagline:
			"Ingeniero de IA y Automatización | Project Manager | Especializado en Pipelines de LLM (n8n), PLN y Machine Learning",
		summary:
			"Ingeniero Junior de IA y Machine Learning con una sólida base en ingeniería y experiencia práctica diseñando soluciones de IA generativa, agentes de IA multi-modelo y flujos de trabajo empresariales automatizados. Dominio de Python, APIs REST personalizadas, enrutamiento de LLMs (Claude, Gemini, Llama, Hugging Face, EvoLink API), plataformas de orquestación (n8n, Docker), bases de datos vectoriales (pgvector, ChromaDB) y paneles predictivos de ML. Historial comprobado de traducir conceptos técnicos complejos en soluciones de negocio claras, entregar pruebas de concepto (PoC) rápidas y gestionar flujos de productividad automatizados mediante herramientas de línea de comandos y MCPs.",
		sections: {
			professionalExperience: "Experiencia Profesional",
			projects: "Proyectos",
			academicExperience: "Formación Académica y Certificaciones",
			personalInterests: "Intereses Personales y Trayectoria",
		},
		viewProjects: "Ver mis proyectos",
		present: "Presente",
		emptySection: "Aún no hay contenido publicado aquí.",
	},
```

- [ ] **Step 4: Update `fr.ts`**

In `src/i18n/dictionaries/fr.ts`, replace the existing `cv: { ... }` block with:

```typescript
	cv: {
		title: "CV",
		tagline:
			"Ingénieur IA & Automatisation | Chef de projet | Spécialisé en pipelines LLM (n8n), NLP et Machine Learning",
		summary:
			"Ingénieur IA & ML junior doté d'une solide formation en ingénierie et d'une expérience concrète dans la conception de solutions d'IA générative, d'agents IA multi-modèles et de flux de travail métier automatisés. Maîtrise de Python, des API REST personnalisées, du routage de LLM (Claude, Gemini, Llama, Hugging Face, EvoLink API), des plateformes d'orchestration (n8n, Docker), des bases de données vectorielles (pgvector, ChromaDB) et des tableaux de bord prédictifs en ML. Expérience avérée dans la traduction de concepts techniques complexes en solutions métier claires, la livraison rapide de preuves de concept (PoC) et la gestion de flux de productivité automatisés via des outils en ligne de commande et des MCP.",
		sections: {
			professionalExperience: "Expérience Professionnelle",
			projects: "Projets",
			academicExperience: "Formation Académique et Certifications",
			personalInterests: "Centres d'Intérêt et Parcours Personnel",
		},
		viewProjects: "Voir mes projets",
		present: "Présent",
		emptySection: "Rien n'a encore été publié ici.",
	},
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors — all three dictionaries still satisfy `Dictionary`. (This will fail until Task 7 rewrites `CvView.astro`'s references to `t.cv.phase`/`t.cv.body`; if run in isolation before Task 7, expect exactly those two errors in `src/views/CvView.astro` and no others.)

- [ ] **Step 6: Commit**

```bash
git add src/i18n/dictionary.ts src/i18n/dictionaries/en.ts src/i18n/dictionaries/es.ts src/i18n/dictionaries/fr.ts
git commit -m "feat(cv): add CV header and section-label copy to i18n dictionaries"
```

---

## Task 5: `Accordion` component

**Files:**

- Create: `src/components/cv/Accordion.tsx`
- Create: `src/components/cv/Accordion.test.tsx`

**Interfaces:**

- Produces: `interface AccordionProps { title: string; children: ReactNode }`, `function Accordion(props: AccordionProps): JSX.Element`.

Note: rather than one component owning an array of sections' worth of state (which would require passing pre-rendered Astro markup into a single React island's props — not supported for named slots in Astro), each section becomes its own independent `Accordion` instance mounted with `client:load` in `CvView.astro` (Task 7), receiving its entries as the default slot (`children`). This still satisfies the spec's "multi-open" requirement — each instance's open/closed state is already independent since each is a separate component instance, with no shared state needed at all.

- [ ] **Step 1: Write the failing tests**

Create `src/components/cv/Accordion.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Accordion } from "./Accordion";

describe("Accordion", () => {
	it("renders the title, collapsed by default (content not in the DOM)", () => {
		render(
			<Accordion title="Professional Experience">
				<p>Some entry content</p>
			</Accordion>,
		);
		expect(screen.getByText("Professional Experience")).toBeInTheDocument();
		expect(screen.queryByText("Some entry content")).not.toBeInTheDocument();
	});

	it("expands its content when the header is clicked", () => {
		render(
			<Accordion title="Projects">
				<p>Project list</p>
			</Accordion>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Projects" }));
		expect(screen.getByText("Project list")).toBeInTheDocument();
	});

	it("collapses again when the open header is clicked a second time", () => {
		render(
			<Accordion title="Projects">
				<p>Project list</p>
			</Accordion>,
		);
		const header = screen.getByRole("button", { name: "Projects" });
		fireEvent.click(header);
		fireEvent.click(header);
		expect(screen.queryByText("Project list")).not.toBeInTheDocument();
	});

	it("reflects open state via aria-expanded", () => {
		render(
			<Accordion title="Projects">
				<p>Project list</p>
			</Accordion>,
		);
		const header = screen.getByRole("button", { name: "Projects" });
		expect(header).toHaveAttribute("aria-expanded", "false");
		fireEvent.click(header);
		expect(header).toHaveAttribute("aria-expanded", "true");
	});

	it("keeps two independent Accordion instances open/closed independently", () => {
		render(
			<>
				<Accordion title="A">
					<p>Content A</p>
				</Accordion>
				<Accordion title="B">
					<p>Content B</p>
				</Accordion>
			</>,
		);
		fireEvent.click(screen.getByRole("button", { name: "A" }));
		expect(screen.getByText("Content A")).toBeInTheDocument();
		expect(screen.queryByText("Content B")).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/components/cv/Accordion.test.tsx`
Expected: FAIL — `./Accordion` module does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/components/cv/Accordion.tsx`:

```tsx
import { useState, type ReactNode } from "react";

export interface AccordionProps {
	title: string;
	children: ReactNode;
}

export function Accordion({ title, children }: AccordionProps) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<div className="border-slate-mist bg-deep-blue/40 rounded-2xl border backdrop-blur-xl">
			<button
				type="button"
				onClick={() => setIsOpen((open) => !open)}
				aria-expanded={isOpen}
				className="text-ion flex w-full items-center justify-between px-5 py-4 text-left"
			>
				<span className="font-display text-base font-semibold">{title}</span>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
				>
					<path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
				</svg>
			</button>
			{isOpen && (
				<div className="flex flex-col gap-3 px-5 pb-5">{children}</div>
			)}
		</div>
	);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/components/cv/Accordion.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/cv/Accordion.tsx src/components/cv/Accordion.test.tsx
git commit -m "feat(cv): add Accordion component (one instance per CV section)"
```

---

## Task 6: `EntryCard` component

**Files:**

- Create: `src/components/cv/EntryCard.astro`

**Interfaces:**

- Consumes: `LocalizedEntry` from Task 3 (`../../lib/notion/translate`).
- Produces: an Astro component rendering one entry's title, meta line, description, chips, and (Projects only) a link to the Portfolio index.

No unit test — this codebase doesn't unit-test `.astro` components (only `.tsx` islands have `*.test.tsx` files; see `GlassPanel.astro`/`PresenceRing.astro`, neither of which has a test). It's covered by Task 7's build and the manual verification checklist.

- [ ] **Step 1: Write the component**

Create `src/components/cv/EntryCard.astro`:

```astro
---
import type { LocalizedEntry } from "../../lib/notion/translate";

interface Props {
	entry: LocalizedEntry;
	chips: string[];
	presentLabel: string;
	viewProjectsLabel: string;
	lang: string;
}

const { entry, chips, presentLabel, viewProjectsLabel, lang } = Astro.props;

const dates = entry.metadata.dates;
function formatYear(iso: string): string {
	const year = new Date(iso).getFullYear();
	return Number.isNaN(year) ? iso : String(year);
}

const dateRange = dates?.start
	? `${formatYear(dates.start)} – ${dates.ongoing || !dates.end ? presentLabel : formatYear(dates.end)}`
	: null;

const metaLine = [entry.displayCategory, entry.displayLocation, dateRange]
	.filter(Boolean)
	.join(" · ");

const techStack = entry.metadata.techStack ?? [];
const allChips = [...chips, ...techStack];

const isProject = entry.contentType === "Project";
---

<div class="border-slate-mist bg-deep-blue/30 rounded-xl border p-4">
	<h3 class="font-display text-ion text-base font-semibold">
		{entry.displayTitle}
	</h3>
	{
		metaLine && (
			<p class="text-signal-cyan/70 mt-1 font-mono text-xs">{metaLine}</p>
		)
	}
	{
		entry.displayDescription && (
			<p class="font-body text-ion/80 mt-2 text-sm">
				{entry.displayDescription}
			</p>
		)
	}
	{
		allChips.length > 0 && (
			<div class="mt-3 flex flex-wrap gap-1.5">
				{allChips.map((chip) => (
					<span class="border-slate-mist-strong text-ion/70 rounded-full border px-2 py-0.5 text-xs">
						{chip}
					</span>
				))}
			</div>
		)
	}
	{
		isProject && (
			<a
				href={`/${lang}/portfolio`}
				class="text-signal-cyan hover:text-signal-cyan/80 mt-3 inline-block text-sm underline"
			>
				{viewProjectsLabel}
			</a>
		)
	}
</div>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors (there will still be the two expected `t.cv.phase`/`t.cv.body` errors in `CvView.astro` from Task 4's step 5, resolved in Task 7).

- [ ] **Step 3: Commit**

```bash
git add src/components/cv/EntryCard.astro
git commit -m "feat(cv): add EntryCard component"
```

---

## Task 7: Rewrite `CvView.astro` and wire up prerendering

**Files:**

- Modify: `src/views/CvView.astro` (full rewrite)
- Modify: `src/pages/en/cv.astro`
- Modify: `src/pages/es/cv.astro`
- Modify: `src/pages/fr/cv.astro`
- Create: `src/env.d.ts`

**Interfaces:**

- Consumes: `fetchKnowledgeBaseEntries` (Task 1), `selectCvEntries`/`groupBySection`/`skillChipsFor`/`CV_SECTIONS`/`CvSection` (Task 2), `translateForLocale`/`LocalizedEntry` (Task 3), the new `Dictionary["cv"]` shape (Task 4), `Accordion` (Task 5), `EntryCard` (Task 6).

- [ ] **Step 1: Add build-time env var types**

Create `src/env.d.ts`:

```typescript
/// <reference types="astro/client" />

interface ImportMetaEnv {
	readonly NOTION_TOKEN: string;
	readonly GOOGLE_API_KEY_LLM: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
```

- [ ] **Step 2: Rewrite `CvView.astro`**

Replace the full contents of `src/views/CvView.astro`:

```astro
---
import { Client } from "@notionhq/client";
import Layout from "../layouts/Layout.astro";
import { Accordion } from "../components/cv/Accordion";
import EntryCard from "../components/cv/EntryCard.astro";
import { getDictionary, type Locale } from "../i18n";
import { fetchKnowledgeBaseEntries } from "../lib/notion/knowledgeBase";
import { translateForLocale } from "../lib/notion/translate";
import {
	loadTranslationCache,
	saveTranslationCache,
} from "../lib/notion/translationCache";
import {
	CV_SECTIONS,
	groupBySection,
	selectCvEntries,
	skillChipsFor,
	type CvSection,
} from "../lib/cv/groupEntries";

interface Props {
	lang: Locale;
}

const { lang } = Astro.props;
const t = getDictionary(lang);

const notion = new Client({ auth: import.meta.env.NOTION_TOKEN });
const allEntries = await fetchKnowledgeBaseEntries(notion);
const cvEntries = selectCvEntries(allEntries);

const cache = loadTranslationCache();
const localizedEntries = await translateForLocale(cvEntries, lang, {
	apiKey: import.meta.env.GOOGLE_API_KEY_LLM,
	cache,
});
saveTranslationCache(cache);

const sections = groupBySection(localizedEntries);

const sectionLabel: Record<CvSection, string> = {
	"Professional Experience": t.cv.sections.professionalExperience,
	Projects: t.cv.sections.projects,
	"Academic Experience & Certifications": t.cv.sections.academicExperience,
	"Personal Interests & Background": t.cv.sections.personalInterests,
};
---

<Layout
	title={`${t.cv.title} — Daniel Peraza`}
	description={t.meta.description}
	lang={lang}
>
	<main class="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-24">
		<header class="text-center">
			<h1 class="font-display text-ion text-3xl font-semibold">
				Daniel Peraza
			</h1>
			<p class="text-signal-cyan mt-2 text-sm">{t.cv.tagline}</p>
			<p class="font-body text-ion/70 mx-auto mt-4 max-w-xl text-sm">
				{t.cv.summary}
			</p>
		</header>

		<div class="flex flex-col gap-3">
			{
				CV_SECTIONS.map((section) => (
					<Accordion title={sectionLabel[section]} client:load>
						{sections[section].length > 0 ? (
							sections[section].map((entry) => (
								<EntryCard
									entry={entry}
									chips={skillChipsFor(entry, localizedEntries)}
									presentLabel={t.cv.present}
									viewProjectsLabel={t.cv.viewProjects}
									lang={lang}
								/>
							))
						) : (
							<p class="text-ion/60 text-sm">{t.cv.emptySection}</p>
						)}
					</Accordion>
				))
			}
		</div>
	</main>
</Layout>
```

- [ ] **Step 3: Opt each locale page into prerendering**

Modify `src/pages/en/cv.astro` to:

```astro
---
import CvView from "../../views/CvView.astro";

export const prerender = true;
---

<CvView lang="en" />
```

Modify `src/pages/es/cv.astro` to:

```astro
---
import CvView from "../../views/CvView.astro";

export const prerender = true;
---

<CvView lang="es" />
```

Modify `src/pages/fr/cv.astro` to:

```astro
---
import CvView from "../../views/CvView.astro";

export const prerender = true;
---

<CvView lang="fr" />
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass (no regressions in unrelated suites).

- [ ] **Step 6: Commit**

```bash
git add src/views/CvView.astro src/pages/en/cv.astro src/pages/es/cv.astro src/pages/fr/cv.astro src/env.d.ts
git commit -m "feat(cv): render the CV page from the Knowledge Base at build time

Replaces the placeholder with a prerendered page: fetches the Notion
Knowledge Base, translates untranslated fields via Gemini (cached),
groups into four accordion sections, and renders skill-relation chips
on each entry."
```

---

## Task 8: Build-time secrets and live verification

**Files:** none (infrastructure + manual verification only)

**Interfaces:** none — this task consumes the finished page from Task 7.

- [ ] **Step 1: Confirm with Daniel, then set the Cloudflare Pages build environment variables**

Using the Cloudflare dashboard (Pages project → Settings → Environment variables → Production, and Preview if used) or `wrangler pages secret put` for the Pages project, add:

- `NOTION_TOKEN` — same value as the local `.env` (Notion internal integration token).
- `GOOGLE_API_KEY_LLM` — same value as the local `.env`.

(`NOTION_KNOWLEDGE_BASE_DATA_SOURCE_ID` already has a working fallback default baked into `src/lib/notion/knowledgeBase.ts`, so it only needs to be set if Daniel wants to override it.)

Per the Global Constraints, get Daniel's explicit go-ahead immediately before actually setting these — this is production credential handling.

- [ ] **Step 2: Trigger a production build and deploy**

Push the merged branch (or trigger a redeploy) so Cloudflare Pages runs `astro build` with the new env vars available. Watch the build log for the CV page's prerender step — a Notion/Gemini failure here fails the whole build (by design; see Global Constraints).

- [ ] **Step 3: Manual verification checklist**

Against the live deployed site:

1. Visit `/en/cv`, `/es/cv`, `/fr/cv` — confirm the header (name, tagline, summary) and all four section headers render.
2. Click each section header — confirm it expands independently (multiple sections can be open at once) and the chevron rotates.
3. Confirm entries within a section are sorted most-recent-first.
4. Confirm at least one entry with related Skill entries shows chip pills with the skill names, translated per locale.
5. Confirm a Project entry's "View my projects" link goes to `/[lang]/portfolio`.
6. Confirm an entry whose Notion `Language` matches the page's locale renders identically to Notion (not run through translation, so no translation drift on native-language content).
7. Confirm an entry whose `Language` differs from the page's locale renders sensible translated text (not the raw source language, not an error).
8. Check `src/lib/notion/.cv-translation-cache.json` was updated with new keys after the build (proves the cache path executed).
9. If any section has zero eligible entries, confirm the "Nothing published here yet." (translated) empty state renders instead of a blank gap.

- [ ] **Step 4: Update the roadmap**

In `project-roadmap.md`, mark the Phase 5 checklist items complete (all except the PDF line, which stays unchecked with a note that it's deferred, matching how the voice-chat phase documented its own deferred/resolved-differently items).

```bash
git add project-roadmap.md
git commit -m "docs: mark Phase 5 CV page complete in roadmap"
```
