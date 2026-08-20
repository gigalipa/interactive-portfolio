# Phase 6 — Portfolio Page: Design

## Context

Phase 5 (CV) established the pattern this project now uses for all Notion-sourced content: a
local sync script (`pnpm cv:sync`) that fetches from the Knowledge Base, translates via Gemini,
and writes a committed static JSON file that the Astro build reads with zero external calls.
That pivot was forced by real production failures — Cloudflare Workers Builds' env-var
visibility, Gemini rate limits, a `/bundle/` filesystem sandbox with no `src/` access, and
finally an unconfigurable timeout in `@astrojs/cloudflare`'s own prerenderer (documented in the
`cloudflare-workers-builds-prerender-sandbox` memory and the Phase 5 spec's addendum).

Phase 6 adds the Portfolio page: an index grid of projects and an individual detail page per
project. Source data is the same Notion "📚 Knowledge Base" database used for the CV and RAG,
filtered to `Content Type = Project`. This spec reuses the sync-script architecture from day
one rather than rediscovering its necessity.

## Content sourcing

- **New script**: `scripts/sync-portfolio.ts`, run via `pnpm portfolio:sync`
  (`node --env-file=.env --import tsx scripts/sync-portfolio.ts`), mirroring `scripts/sync-cv.ts`.
- Fetches all Knowledge Base entries via the existing `fetchKnowledgeBaseEntries()`, filters to
  `status === "Published" && contentType === "Project"`.
- Translates each entry for `en`/`es`/`fr` via the existing `translateForLocale()`, reusing the
  same on-disk translation cache (`src/lib/notion/.cv-translation-cache.json`) — cache keys are
  already scoped by `pageId:locale:fieldHash`, so CV and Portfolio entries coexist in it safely
  even though today they're disjoint (Project entries aren't in any CV section body, only
  referenced from the CV's Projects accordion as links).
- **Slug generation**: a new `src/lib/portfolio/slug.ts` exports `slugify(title: string): string`
  (lowercase, non-alphanumeric → `-`, trimmed/collapsed). The sync script computes one slug per
  _English_ title (the stable, non-localized identifier) and reuses it across all three locales'
  content entries, so a given project has one URL path segment regardless of viewed locale
  (`/en/portfolio/<slug>`, `/es/portfolio/<slug>`, `/fr/portfolio/<slug>`). Collisions (two
  Projects producing the same slug) are detected in the sync script and hard-fail the sync with a
  clear error — resolved by editing one of the source titles in Notion, not auto-disambiguated.
- **Media download**: for each entry's `metadata.media` items, the sync script fetches the
  Notion-hosted URL and writes it to `public/portfolio/<slug>/<index>.<ext>` (extension inferred
  from the response `Content-Type`), then rewrites that media item's `url` in the output JSON to
  the local `/portfolio/<slug>/<index>.<ext>` path. A failed download (expired presigned URL,
  network error, non-2xx) is caught, logged as a warning, and that media item is **dropped** from
  the entry's output rather than failing the whole sync — matches the existing
  best-effort-write philosophy from `translationCache.ts`.
- **Output**: `src/lib/portfolio/content.json`, shaped as
  `Partial<Record<Locale, LocalizedPortfolioEntry[]>>`, committed to the repo. The build only
  ever reads this file — no Notion/Gemini/fetch calls during `pnpm build`.
- **Schema gap fix**: `EntryMetadata` in `src/lib/notion/knowledgeBase.ts` is missing a `media`
  field even though `docs/notion-metadata-schema.json` already defines one. Add it:
  ```ts
  export interface MetadataMedia {
  	type: "image" | "video";
  	url: string;
  	alt?: string;
  	caption?: string;
  	cover?: boolean;
  }
  // ...
  export interface EntryMetadata {
  	category?: string;
  	dates?: MetadataDates;
  	location?: string;
  	links?: MetadataLink[];
  	media?: MetadataMedia[];
  	techStack?: string[];
  }
  ```

## Data model

```ts
// src/lib/portfolio/content.ts (or colocated in the sync script + a shared type file)
export interface LocalizedPortfolioEntry extends LocalizedEntry {
	slug: string;
}
```

`LocalizedEntry` (from `src/lib/notion/translate.ts`) already carries `displayTitle` /
`displayCategory` / `displayLocation` / `displayDescription` plus the full `KnowledgeBaseEntry`
fields (`metadata.links`, `metadata.media` post-fix, `metadata.techStack`, `metadata.dates`,
`tags`, `priority`). No new translation fields are needed — `category`/`location`/`title`/
`description` are already covered by the existing `TranslatableFields` shape.

## Routing & pages

- `src/pages/{en,es,fr}/portfolio.astro` — thin locale wrapper (same pattern as `cv.astro`),
  `export const prerender = true`, renders `src/views/PortfolioView.astro`.
- `src/pages/{en,es,fr}/portfolio/[slug].astro` — dynamic route, `export const prerender = true`,
  `getStaticPaths()` reads `content.json` for that locale and emits one path per entry's `slug`;
  renders `src/views/PortfolioDetailView.astro`. A `slug` with no matching entry 404s naturally
  (not statically generated).
- **CV cross-link**: the CV's existing "Projects" accordion section (`src/views/CvView.astro` /
  `EntryCard.astro`) currently just displays Project entries as cards. It gains a link to
  `/${lang}/portfolio/${slugify(entry.title)}` using the same `slugify()` — CV entries don't need
  their own `slug` field or a lookup into `portfolio/content.json`; the function is deterministic
  and pure, so both call sites reproduce the identical result independently. If a CV Project entry
  somehow isn't Portfolio-eligible (shouldn't happen since both use the same `Content Type =
Project, Status = Published` filter, but data can drift), the link 404s — acceptable, not
  worth a cross-check at render time for a low-traffic personal site.

## UI

- **`src/components/portfolio/ProjectCard.astro`** — glass-styled card (consistent with
  `GlassPanel`): cover media thumbnail (first `media` item with `cover: true`, or the first
  `media` item, or a placeholder block if none), `displayTitle`, `displayCategory`, formatted
  date range (reusing whatever date-formatting exists for the CV, or a small shared helper if not
  already factored out).
- **`src/views/PortfolioView.astro`** — groups entries by `displayCategory` (falling back to an
  "Other" bucket for entries with no category), each group sorted chronologically
  (most-recent-first, same `entrySortKey`-style logic as `groupEntries.ts` — factor the sort
  function into a shared location, e.g. `src/lib/shared/sortByDate.ts`, rather than duplicating
  it, since it's already used once and would otherwise be copy-pasted a second time).
- **`src/views/PortfolioDetailView.astro`** — full description, metadata (category, location,
  dates, tech stack chips, external links with their `type`-based icon/label), and a media
  gallery block rendering all `media` items (images as `<img>`, video as `<video controls>` or an
  embed depending on URL — local files only post-download, so always same-origin, no embed-provider
  handling needed). Renders cleanly with an empty gallery (both current Project entries have no
  media today).

## Testing

- **`src/lib/portfolio/slug.test.ts`** — `slugify()`: basic case, punctuation/unicode handling,
  collapsing repeated separators, empty/whitespace-only input.
- **`scripts/` sync logic** — factor the media-download-with-fallback and slug-collision-check
  into small exported functions (not left inline in `run()`) so they're unit-testable the same
  way `translationCache.ts`'s best-effort write is: mock `fetch`, assert a failed download logs a
  warning and omits that media item rather than throwing; assert a slug collision throws with a
  clear message.
- **Grouping/sorting** — if `entrySortKey` moves to a shared module, its existing test coverage
  in `groupEntries.test.ts` moves with it; add a small test file for the category-grouping
  function used by `PortfolioView`.
- **Manual verification** (per this project's established pattern): run `pnpm portfolio:sync`
  against the real Knowledge Base once real Project content with media exists, confirm the grid
  and at least one detail page render correctly in the dev server across all three locales.

## Non-goals (explicitly deferred, per the approved design)

- No live Notion/runtime fetching — build-time-only via the committed JSON, matching the CV.
- No enrichment from the separate Projects tracker database (status/progress %/deadline) — out
  of scope per the approved design; the tracker is an internal PM tool, not portfolio-facing.
- No automatic slug disambiguation on collision — a hard-fail with a clear message is preferred
  over silently generating `-2`/`-3` suffixes that could shift URLs on a later resync.
