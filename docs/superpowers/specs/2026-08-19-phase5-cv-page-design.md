# Phase 5 — CV Page: Design

Status: approved (2026-08-19)

## Context

The CV page (`/en|es|fr/cv`) currently renders a "coming soon" placeholder via `CvView.astro`. Per `project-roadmap.md`'s Phase 5, it needs a quick-overview header plus glass-styled accordion sections (Professional Experience, Projects, Academic Experience & Certifications, Personal Interests & Background), populated from the same Notion "📚 Knowledge Base" database that already feeds the RAG pipeline (`scripts/ingest.ts`, Phase 2.2).

Two structural facts shaped this design:
- The site's Astro config is `output: "server"` (SSR by default via the Cloudflare adapter) — pages must opt into prerendering with `export const prerender = true` to be built statically, which the CV page does, matching the "build-time over runtime" preference already recorded in the roadmap's Phase 6 notes.
- Knowledge Base entries are single-language (a `Language` select property, mostly Spanish) — there is no per-entry EN/ES/FR variant, unlike the site's static UI strings which already have hand-written dictionaries per locale.

## Goals

- CV page renders a quick-overview header (name, title/tagline, short summary — hand-written in the i18n dictionaries, no photo) followed by four accordion sections, each independently togglable (multi-open, not single-open).
- Section content is sourced from the Knowledge Base at build time, translated into whichever of EN/ES/FR the source entry isn't already in, and baked into static HTML — no Notion/Gemini calls at request time.
- Skill-type entries don't get their own section; they render as chip pills on whichever Professional Experience / Project / Academic Experience / Personal Interest entry they're related to (via the `Related To` relation).
- Project entries link out to the Portfolio index page (`/[lang]/portfolio`), not a specific detail route (Phase 6 doesn't have detail routes yet).
- Build resilience: unchanged entries reuse a committed translation cache instead of re-calling Gemini every deploy; a genuine Notion/Gemini failure fails the build loudly rather than shipping an empty or stale CV.

## Non-goals (deferred)

- Downloadable PDF version of the CV — explicitly deferred per the roadmap's own "optional" framing.
- Portfolio detail-route linking — Project entries link to the Portfolio index only, until Phase 6 exists.
- Per-request/runtime content updates — the CV only refreshes on redeploy, same tradeoff already accepted for Portfolio.
- A dedicated "Other Experience" section — folded into Personal Interests & Background (confirmed with Daniel: no current content needs it).
- Skill entries as their own visible section or list — they only ever appear as relation-derived chips on other entries.

## Content model & section mapping

`fetchCvEntries()` (new, in `src/lib/notion/knowledgeBase.ts`) queries the Knowledge Base once for `Status = Published` and `Content Type` in `[Professional Experience, Project, Academic Experience, Personal Interest, Skill]`, reusing the same property-extraction shape `scripts/ingest.ts` already has (title, summary, description, contentType, tags, priority, status, language, relatedTo) plus parsing the `Metadata` JSON property (`dates`, `location`, `links`, `category`, `techStack`) per `docs/notion-metadata-schema.json`.

Section grouping is a fixed map:

| Content Type | Section |
|---|---|
| Professional Experience | Professional Experience |
| Project | Projects |
| Academic Experience | Academic Experience & Certifications |
| Personal Interest | Personal Interests & Background |
| Skill | *(no section — relation-derived chips only)* |

Within each section, entries sort by `Metadata.dates.start` descending; entries without dates fall back to `Priority` (covers e.g. some Personal Interest entries with no meaningful date).

**Skill chips**: a Skill entry relates to another entry via the `Related To` relation. Because Notion relations are bidirectional but `ingest.ts`'s extraction only reads one side, matching checks both directions — an entry's own `relatedTo` list, and any Skill entry whose `relatedTo` includes that entry's `pageId`. Matched Skill titles render as chip pills on the entry's `EntryCard`. Project entries additionally render `Metadata.techStack` as separate chips (existing field, not conflated with Skill-relation chips).

## Translation & build resilience

`translateForLocale(entries, targetLocale)` (new, in `src/lib/notion/translate.ts`) batches each entry's translatable fields — title, `Metadata.category`, `Metadata.location`, description — into one Gemini call per entry per target locale, requesting structured JSON back (same "ask for JSON, parse defensively" pattern already used in this codebase's RAG/chat code). Non-translatable fields (dates, links, tags, techStack) pass through unchanged. An entry already in the target locale (matching its `Language` property) skips translation entirely.

Uses `GOOGLE_API_KEY_LLM` (same key tier as the existing chat model), called from Node build-time code, not from a Worker — no new Worker secret needed, but `NOTION_TOKEN`, `NOTION_KNOWLEDGE_BASE_DATA_SOURCE_ID`, and `GOOGLE_API_KEY_LLM` must be added as **Cloudflare Pages build-time environment variables** (distinct from Worker runtime secrets), confirmed with Daniel to set when implementation reaches that step.

**Caching**: translations are cached in a committed JSON file, `src/lib/notion/.cv-translation-cache.json`, keyed by `${pageId}:${targetLocale}:${contentHash}` where `contentHash` hashes the source translatable fields. Unchanged entries hit the cache on subsequent builds (no Gemini call, no Notion-content re-fetch dependency for translation); an edited entry gets a fresh translation and a new cache entry. This is a build artifact, not hand-edited, but lives in git so builds stay reproducible without requiring Gemini to succeed on every deploy.

**Failure handling**: a Notion or Gemini error during the CV's build-time fetch is a hard build failure for that locale — no silent empty-section fallback and no stale-content fallback. This mirrors the "no runtime path exists to recover on" reality of a prerendered page: better to fail the deploy visibly than ship a broken CV.

## Components

- **`src/components/cv/Accordion.tsx`** (React — needs client-side open/close state) — generic, not CV-specific: takes a list of `{ id, title, content }` sections, multi-open (each section toggles independently), glass-styled header button with a rotating chevron, matching the existing token palette (`GlassPanel`-adjacent styling, not a `GlassPanel` wrapper itself since accordion items need per-item borders/spacing `GlassPanel` doesn't provide).
- **`src/components/cv/EntryCard.astro`** — renders one KB entry: title, a category/location/date-range line (built from `Metadata`), description paragraph, a chip row (Skill relations + techStack for Projects), and — Projects only — a link to `/[lang]/portfolio`.
- **`src/views/CvView.astro`** — replaces the current placeholder body. Frontmatter calls `fetchCvEntries()` → `translateForLocale()` (skipped fields pass through) → a `groupBySection()` helper → renders the hand-written i18n header (name/title/summary, no photo) followed by four `Accordion` sections fed the grouped, translated entries.
- **`src/lib/notion/knowledgeBase.ts`** — shared Notion client + entry fetch/parse, factored out of `scripts/ingest.ts` so both it and the CV build page call the same code; `ingest.ts` is updated to import from here instead of duplicating the extraction logic.
- **`src/lib/notion/translate.ts`** — `translateForLocale()` plus the cache read/write/hash logic described above.

`src/pages/{en,es,fr}/cv.astro` each add `export const prerender = true` (or it's set on `CvView.astro` if Astro allows component-level prerender flags — confirmed during implementation) so the Notion/Gemini work happens once per `astro build` per locale, not per request.

## Testing

- **Unit (Vitest)**, no real Notion/Gemini network calls, same DI-factory pattern as `mintEphemeralToken`:
  - Section grouping (`groupBySection`) — correct Content-Type-to-section mapping, correct sort order (date desc, priority fallback).
  - Skill-relation matching — both relation directions produce the same chip set.
  - `translateForLocale` — cache hit skips the mocked Gemini call; cache miss calls it and writes a new entry; malformed JSON response is handled without throwing.
  - Cache key/hash — same source fields produce the same hash; changed fields produce a different one.
- **No Playwright** for the Notion-fetch/translation path itself — network- and build-time-dependent, not something to automate in CI. Closeout is a manual check after deploy: all three locales render, sections populate, chips show the right skills, Project links point at `/portfolio`.

## Delivery plan

One implementation plan:
- `src/lib/notion/knowledgeBase.ts` (extracted from `ingest.ts`) + unit tests; update `ingest.ts` to import from it.
- `src/lib/notion/translate.ts` (translation + cache) + unit tests.
- `src/components/cv/Accordion.tsx` + unit tests.
- `src/components/cv/EntryCard.astro`.
- `CvView.astro` rewrite (header + 4 sections wired to the fetch/translate/group pipeline) + `prerender = true` on the three locale pages.
- i18n dictionary additions: CV header title/tagline/summary (EN/ES/FR), section labels, "no entries" empty-state copy if a section is ever empty.
- Cloudflare Pages build-time env vars (`NOTION_TOKEN`, `NOTION_KNOWLEDGE_BASE_DATA_SOURCE_ID`, `GOOGLE_API_KEY_LLM`) set with Daniel's explicit go-ahead at that step.
- Manual verification checklist (above) run against a real deploy before considered done.

## Addendum (2026-08-19, post-launch): moved translation out of the build

The build-time translation design above (Notion + Gemini calls inside the
Astro prerender step) shipped, but broke production repeatedly on
Cloudflare: `CLOUDFLARE_INCLUDE_PROCESS_ENV` was needed for env var
visibility, Gemini's free-tier rate limits and transient 503s needed a
model-fallback chain, a stalled connection needed a request timeout, and
the translation cache's committed-file write always failed (Cloudflare's
prerenderer runs inside the built Worker's own sandbox — rooted at a
virtual `/bundle/`, with no access to the real `src/` checkout at all).

The terminal failure: with 145 CV-eligible Knowledge Base entries, the
full translation pass legitimately takes several minutes — long enough to
exceed Astro's own prerenderer's internal HTTP timeout to its local
render server, a ceiling with no application-level knob to tune.

**Resolution:** moved the whole fetch+translate pipeline into a new local
script, `scripts/sync-cv.ts` (`pnpm cv:sync`), mirroring `scripts/ingest.ts`'s
existing pattern. It writes a committed `src/lib/cv/content.json`
(pre-translated, per-locale). `CvView.astro` now just imports that JSON and
renders it — zero Notion/Gemini calls, zero external I/O, at build time.
The CV updates only when someone runs `pnpm cv:sync` and commits the
result, not automatically on every deploy — an accepted, deliberate
trade-off given the entry volume. All the translation/cache/fallback-chain
code from the original design is unchanged and still used, just invoked
from the sync script instead of from the page.
