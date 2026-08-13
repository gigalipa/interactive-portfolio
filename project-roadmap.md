# Interactive Portfolio — Project Roadmap

Source of truth for scope and sequencing. Check items off as they land. Anything marked
**DECISION NEEDED** must be resolved with the user before the step it blocks is started.

---

## Phase 0 — Foundations & Tooling ✅ (mostly done)

### 0.1 Accounts & access

- [x] GitHub repo `gigalipa/interactive-portfolio` created
- [x] Cloudflare account connected (MCP)
- [x] Google AI Studio account (for `gemma-4-31b-it` + Gemini 2.5 Flash Native Audio Dialog API keys)
- [x] Chroma Cloud account + database `interactive-portfolio` created, MCP connected
- [x] Notion workspace connected (MCP)
- [x] Generate and store Google AI Studio keys as Cloudflare Worker **secrets** (never client-side) — `GOOGLE_API_KEY_EMB`, `GOOGLE_API_KEY_LLM`, `GOOGLE_API_KEY_LIVE`, plus the Chroma credentials, all confirmed present via `wrangler secret list` (2026-08-12)
- [ ] Generate and store the Notion internal integration token as a Cloudflare Worker secret — still outstanding (`wrangler secret list` confirmed no `NOTION_TOKEN` secret on 2026-08-12); only needed locally today for `pnpm ingest` (Phase 2.2, via `.env`)

### 0.2 Claude Code tooling

- [x] GitHub MCP connected
- [x] Cloudflare MCP suite connected (api, docs, bindings, builds, observability)
- [x] Notion MCP connected
- [x] Chroma Cloud MCP connected
- [x] `init`, `run`, `security-review`, `update-config` skills identified for use at the right phases

---

## Phase 1 — Project Scaffold & Design System

### 1.1 Stack

- [x] Framework: **Astro** (islands architecture — ships near-zero JS for static CV/Portfolio pages, React islands for the interactive chat + booking widgets, first-class i18n routing, deploys to Cloudflare Workers via `@astrojs/cloudflare`)
- [x] Package manager **pnpm**
- [x] Styling approach **Tailwind CSS** (glass/blur/glow design system — utility classes map cleanly to the repeated glassmorphism patterns)
- [ ] Confirm 3D/animation library for later avatar phase (leaning `TalkingHead.js` on top of Ready Player Me GLB export + Three.js — confirm in Phase 8, not now)

### 1.2 Repo scaffold

- [x] Initialize Astro project in `interactive-portfolio` (TypeScript strict via `astro/tsconfigs/strict`, React + Tailwind integrations added)
- [x] Add `@astrojs/cloudflare` adapter (`output: 'server'`) + minimal `wrangler.jsonc`
  - **Pivot (2026-08-02):** the current Astro Cloudflare adapter no longer deploys to Cloudflare Pages — it targets **Cloudflare Workers with static assets** exclusively (Cloudflare has been consolidating Pages into Workers). Functionally equivalent (one Worker serves static pages + API routes), just different deploy target/terminology. All later "Pages Function" references in this roadmap mean **Worker route/handler** now; "Cloudflare Pages GitHub App" auto-deploy becomes **Cloudflare Workers Builds** (Git-connected CI/CD for Workers).
- [x] Set up ESLint + Prettier + TypeScript strict mode (React-specific lint plugins dropped for now — incompatible with ESLint 10 at runtime; revisit later)
- [x] Set up Vitest for unit tests, Playwright for e2e/visual checks (smoke tests passing on chromium + webkit)
- [x] Configure GitHub Actions for CI: lint, format check, typecheck, unit tests, build on PR/push to main; separate e2e job (Playwright, chromium)
- [x] Connect repo to Cloudflare via **Workers Builds** (Git integration, dashboard-authorized) for auto-deploy on push to `main`. Live at https://interactive-portfolio.daniel-peraza-1990.workers.dev
- [x] `SESSION` KV namespace auto-provisioned on first deploy; `IMAGES`/`ASSETS` bindings wired by the adapter — revisit whether `SESSION`/`IMAGES` are actually needed once real features land (currently unused by app code)

### 1.3 Design system

- [x] Define design tokens (Tailwind v4 `@theme` in `global.css`): named palette (void, deep-blue, electric-blue, signal-cyan, ion, slate-mist), glow shadow tokens, font tokens
- [x] Build reusable primitives: `GlassPanel`, `GlowButton`, `FloatingIcon`, `HamburgerMenu` (`src/components/ui/`)
- [x] Signature element: `PresenceRing` — animated glow ring encoding the AI's conversational state (idle/listening/speaking); doubles as the Phase 3.3 placeholder hero and will later wrap the real 3D avatar (Phase 8)
- [x] Import and place the top-left logo (`public/logo.png`, also used as favicon); `FloatingIcon` renders it directly with a glow (monogram fallback kept for when `src` is omitted)
- [x] Build the hamburger menu (top-right) with the 4-route nav: Main / CV / Portfolio / Contact (native `<details>`, no JS framework — active-route highlight, closes on outside click)
- [x] Typography: Space Grotesk (display) / Manrope (body) / JetBrains Mono (utility — status chips, labels), self-hosted via `@fontsource`
- [x] Base responsive layout shell verified mobile → desktop via Playwright screenshots (chrome, menu open/closed, all 4 routes)

### 1.4 Internationalization scaffold

- [x] Set up i18n routing (`/en/`, `/es/`, `/fr/`) using Astro's built-in i18n (`prefixDefaultLocale: true`, all three symmetric); page content lives in `src/views/*.astro` (parameterized by `lang`), with thin per-locale wrapper routes under `src/pages/{en,es,fr}/`
- [x] Translation file structure: `src/i18n/dictionary.ts` (shared `Dictionary` type) + `src/i18n/dictionaries/{en,es,fr}.ts` (each `satisfies Dictionary` for compile-time completeness checking)
- [x] Language switcher UI: EN/ES/FR chips inside the hamburger menu panel, below the nav links; swaps locale while preserving the current route
- [x] Default locale `en`; root `/` server-redirects (302) based on `Accept-Language`, falling back to `en` if no match

---

## Phase 2 — Content Architecture & RAG Pipeline (Notion-backed)

Source of truth for all avatar knowledge is a single Notion database, **"📚 Knowledge Base"** (under "Second Brain — Daniel Peraza"), confirmed live via the Notion MCP. No local `content/` folders — Notion is authored directly, ingestion pulls from there.

### 2.1 Knowledge Base schema (confirmed, already built in Notion)

- [x] Single unified database, data source `collection://9014f42b-a380-4526-8521-a5d20f491f58`, one vector space across all categories
- [x] `Content Type` (select): Professional Experience / Academic Experience / Personal Interest / Project / Skill
- [x] `Status` (select): Draft / Reviewed / Published / Archived — **only `Published` rows are ingested**
- [x] `Language` (select): EN / ES / FR
- [x] `Priority` (number 1–5, 5 = highest) — persona weighting at retrieval time
- [x] `Tags` (multi-select), `Summary` (1-2 sentence retrieval blurb), `Description` (short text — renamed from `Content`, a short description of the project/experience, not the full text), `Metadata` (JSON text, schema below), `Source` (select: Notion/GitHub/Google Drive/etc.)
- [x] `Related To` (relation) → a separate **Projects** database (project-management tracker: P0–P3 priority, Active/On Hold/Completed/Cancelled, Progress %, Deadline) — useful for cross-linking status/timeline, but **not** the portfolio display schema; portfolio display fields (media, links, category) live in `Metadata` (schema defined in 2.1a below)
- [x] Per-Content-Type templates exist (`TEMPLATE: Professional Experience`, etc.) with a consistent structured markdown skeleton (Overview, Key Responsibilities, Achievements, Tech/Skills, Results, Lessons, Related Links)
- [x] **Confirmed by inspecting a template**: the long-form text lives in the **Notion page body** (the template's markdown blocks), not a property. Ingestion must treat the page body (via `notion-fetch`) as the primary embedding text; `Description`/`Summary` are supplementary metadata, not the source text.

### 2.1a `Metadata` JSON schema (structured data preservation + portfolio display fields)

Formal schema saved at [`docs/notion-metadata-schema.json`](docs/notion-metadata-schema.json) (JSON Schema draft-07). Applies to every `Content Type`; all fields optional, fill in only what's relevant to that entry.

- `category` — display grouping (e.g. `"Web App"`, `"Full-time Role"`, `"Certification"`, `"Hobby"`)
- `dates` — `{ start, end, ongoing }` (ISO `YYYY-MM-DD`, `end` omitted if `ongoing: true`)
- `location` — free text, e.g. `"Remote"` / `"Mexico City, MX"`
- `links` — array of `{ label, url, type }`, `type` one of `demo | repo | company | certificate | article | other`
- `media` — array of `{ type, url, alt, caption, cover }`, `type` one of `image | video`, `cover` marks the card thumbnail
- `techStack` — array of strings (kept separate from `Tags` since `Tags` is a fixed Notion multi-select and this can be freeform)
- `originalFile` — legacy field, path to a source doc if this entry was migrated from a file

### 2.2 Ingestion pipeline

- [x] Write `scripts/ingest.ts`:
  - Queries the Knowledge Base data source via `@notionhq/client` v5's `dataSources.query` (the `databases.query` method was removed in v5 — Notion's multi-source-database migration replaced it), paginated, no server-side status filter (see idempotency note below)
  - For each row, fetches the full page body as markdown via `pages.retrieveMarkdown` (the v5 SDK renders blocks to markdown natively — no hand-rolled block converter needed), plus `Title`, `Summary`, `Description`, `Content Type`, `Tags`, `Priority`, `Language`, `Related To`, `Status`
  - Chunks the page body: **512 tokens, 50-token overlap**, via `gpt-tokenizer` (encode → sliding window → decode); short entries under 512 tokens ship as a single chunk
  - Generates embeddings per chunk — **resolved: Google `gemini-embedding-001`** (3072-dim; `text-embedding-004` is deprecated/404s) via the Generative Language API's `batchEmbedContents` (batches of 100). Shared with retrieval (2.3) via `src/lib/rag/embed.ts` and `src/lib/rag/config.ts` to avoid model-name drift between ingestion and querying.
  - Upserts into the Chroma Cloud collection **`knowledge_base`** (inside the existing `interactive-portfolio` Chroma database) with per-chunk metadata: `notion_page_id`, `title`, `content_type`, `tags` (comma-joined — Chroma metadata values are scalar, not arrays), `priority`, `language`, `related_to` (comma-joined page IDs), `summary`
- [x] Idempotent re-ingestion: every run deletes existing chunks for a page (`collection.delete({ where: { notion_page_id } })`) before re-inserting, regardless of status — covers edits, re-publishes, and un-publishing in one pass. (Known gap: pages fully **deleted** from Notion won't be cleaned up automatically since they no longer appear in the query; acceptable for now given the KB is still empty, revisit if it matters later.)
- [x] Manual trigger: `pnpm ingest` (`node --env-file=.env --import tsx scripts/ingest.ts`), reads credentials from a local `.env` (see `.env.example`); scheduled Worker Cron or Notion-webhook-triggered re-ingestion deferred to Phase 12
- [x] Ran initial ingestion (2026-08-05) against 2 real `Published` entries; verified via Chroma MCP (`chroma_get_collection_count`/`chroma_peek_collection`) that the `knowledge_base` collection has correctly-chunked documents and accurate metadata. Credentials live in a local `.env` per-service (`GOOGLE_API_KEY_EMB`/`_LLM`/`_LIVE`, a dedicated `CHROMA_API_KEY` for this script) — see `.env.example`.
- [x] Authoring workflow (documented here): duplicate the right `TEMPLATE:` page → fill in the page body → set `Status = Reviewed` then `Published` when ready → run `pnpm ingest`

### 2.3 Retrieval + prompting

- [x] Built `src/lib/rag/retrieve.ts` (`retrieveContext`): embeds the query via `gemini-embedding-001`, queries the `knowledge_base` Chroma collection with metadata filters (`content_type`, `language`), top-k default 8. Results are re-ranked by a small Priority-weighted score (`distance - priority * 0.02`) so higher-`Priority` entries win close semantic ties without overriding genuinely better matches.
- [x] Multilingual fallback implemented: if a `language`-scoped query returns fewer than 3 hits, automatically re-queries across all languages (still respecting `content_type` if set).
- [x] Built `src/lib/rag/prompt.ts` (`buildSystemPrompt`): assembles persona (first-person avatar of Daniel Peraza) + tone + boundaries (no invented facts, no unrelated tasks, decline off-topic requests, always reply in the visitor's language) + a note that chat history is supplied separately + the ranked context chunks. Unit-tested in `src/lib/rag/prompt.test.ts`.
- [x] Verified live end-to-end (retrieval → prompt assembly) against the real Chroma collection with a throwaway script; sensible, correctly-ranked results.
- [ ] Wire `retrieveContext` + `buildSystemPrompt` into an actual chat request/response loop with the LLM (`gemma-4-31b-it`) and real conversation history — deferred to Phase 3, since that's where the chat endpoint itself gets built.

### 2.3a Avatar personality dataset

Source: personal files/writings the user provided in `docs/personality/` (gitignored — contains
sensitive material). Curated, reviewed, and documented in `docs/personality-dataset.md`,
including an explicit redaction decision (confirmed with Daniel, 2026-08-05): exact
salary/schedule/religious-practice/personal-struggle specifics are excluded from every dataset,
retrievable or not; only non-sensitive facts feed the avatar.

- [x] Distilled a real identity/values/voice profile (background, worldview, cognitive style, voice patterns with quotes) into `docs/personality-dataset.md`
- [x] Enriched `src/lib/rag/prompt.ts`'s static `PERSONA`/`TONE`/`BOUNDARIES` blocks with this real research (replacing the earlier generic placeholder) — always-on, not retrieved piecemeal
- [x] Prepared 7 ready-to-paste Notion "Personal Interest" entries (`docs/personality-notion-entries.md`) from the shorter personal writings (philosophical reflections, a romantic reflection, 3 short fiction pieces) — low `Priority` (2) so they surface only on genuinely relevant queries, not crowding out CV content; excludes one piece thematically adjacent to a redacted personal struggle, and the long-form `writings/utopos/*` book drafts (separate project, not persona material)
- [x] Update (2026-08-06): incorporated Daniel's own `Analisis_Integral_y_Perfil_Multidimensional-Daniel_Peraza_Blanco.md` (MBTI/16Personalities, Predictive Index, work-competency test) into `docs/personality-dataset.md` and `prompt.ts`'s static `PERSONA`/`TONE` — corrected location (Sogamoso, Boyacá, not Medellín) and age (36), added cognitive/work-style grounding (INTP-T, PI "Operator"); excluded the document's religious-community specifics and shame/self-sabotage framing per the same redaction rule
- [ ] Paste those 7 entries into Notion, set `Status = Published`, run `pnpm ingest` — pending the user doing the paste (not something to automate, since it's their personal writing going into their own Notion workspace)

---

## Phase 3 — Text Chat (Main Page, avatar-less first)

Per prior decision: build the interaction layer before the visual 3D avatar, since visuals are UX polish on top of a working chat.

### 3.1 Backend proxy

- [x] Built an Astro server API route (`src/pages/api/chat.ts`, SSE) that: receives visitor message, queries Chroma for context, calls `gemma-4-31b-it` via Google AI Studio API with the RAG-augmented prompt, streams the response back
- [x] Google AI Studio / Chroma keys stay server-side only (`.dev.vars` locally, Cloudflare secrets in prod), never exposed to the client
- [x] Rate limiting via Cloudflare Workers' native Rate Limiting binding (`CHAT_RATE_LIMITER`, 10 req/60s, `wrangler.jsonc`)
- [x] Consent-gated conversation history: `persist: false` keeps history client-side only (nothing written server-side); `persist: true` stores it in the `SESSION` KV namespace (`src/lib/history/`), 30-day rolling TTL, with `/api/history/*` list/get/delete/delete-all routes (`src/lib/chat/historyHandlers.ts`)
- [x] Verified live end-to-end against a running dev server (`astro dev`): a real `gemma-4-31b-it` reply streamed back for both `persist: true` and `persist: false`; the `persist: true` path set the `visitor_id` cookie, persisted to KV, and was listed/fetched/deleted correctly via `/api/history/*`
- [x] Fix discovered during live verification: `astro dev` (Astro 6+/`@astrojs/cloudflare` runs dev through the real `workerd` runtime, not Node) failed to load `chromadb` with `Failed to load url node:process` — the `chromadb` package needs Node builtins. Fixed by adding `"compatibility_flags": ["nodejs_compat"]` to `wrangler.jsonc`. This is a required Cloudflare Workers setting for any Node-API-dependent dependency and will be needed for the deployed Worker too, not just local dev.
- Note for the Phase 3 UI plan: a bare `curl -X DELETE`/`POST` without an `Origin` header gets `403 Cross-site ... forbidden` from Astro's built-in CSRF protection — not a bug, but worth knowing when writing manual verification scripts. A real browser `fetch()` call sends `Origin` automatically and is unaffected.
- [x] Post-launch reliability fixes (found once real chatting started): `gemma-4-31b-it`'s chain-of-thought text was leaking into replies (fixed by filtering `thought: true` parts in `src/lib/rag/chat.ts`); RAG retrieval was surfacing off-topic personal fiction and a corrupted image-embed chunk for professional questions (fixed with content-type exclusion + presigned-URL stripping in ingestion, `src/lib/rag/retrieve.ts` / `src/lib/rag/cleanMarkdown.ts`); the knowledge base still has no Professional/Academic entries — the KB only contains 2 Projects and Personal Interest writing, so `pnpm ingest` needs real career-history content added in Notion before answers about work history will be well-grounded. `gemma-4-31b-it` also proved unreliable even after those fixes and a shortened system prompt — its "thinking" mode too often exhausted its reasoning budget with zero output text. Switched the chat model to `gemini-flash-lite-latest`, which answers directly with no thinking step.

### 3.2 Chat UI

- [x] Build floating bottom-center chatbox: text input + send button + waves button (voice toggle, wired up in Phase 4)
- [x] Style per spec: dark electric-blue outline, black background, glass/blur, external glow
- [x] Build chat bubble components: avatar messages (left, dark electric-blue outline/dark-blue fill), visitor messages (right, light-cyan outline/blue-grey fill)
- [x] Bubbles float over the (placeholder, pre-3D-avatar) hero area
- [x] Streaming response rendering (token-by-token) for perceived responsiveness
- [x] Loading/thinking state, error state (API failure, rate limit hit)

### 3.3 Placeholder hero

- [x] Static/lightly-animated placeholder in the avatar's eventual position (e.g. glowing orb or silhouette) so Phase 3 ships a complete, good-looking page without blocking on the 3D avatar work — `PresenceRing` glowing orb, live and verified

---

## Phase 4 — Voice Chat (Gemini 2.5 Flash Native Audio Dialog)

Per prior decision: stock Gemini Live API voice, not a cloned voice — keeps latency low and avoids extra hosting.

- [x] Build a Cloudflare Worker that mints short-lived **ephemeral tokens** for the Gemini Live API (so the browser connects directly via WebSocket without exposing the long-lived API key)
- [x] Implement client-side Live API session: mic capture → stream to Gemini → stream audio response back — live-verified (2026-08-13) against a real Gemini Live API session: soundwave visor reacting to real mic amplitude, real audio playback, `PresenceRing` voice-mode color + output-amplitude pulse
- [x] Wire the "waves" button to toggle voice mode; visually indicate listening/speaking states
- [x] Feed the same RAG context into the voice session (system instructions + retrieved chunks) so voice answers stay consistent with text answers
- [ ] Handle multilingual voice (visitor speaks ES/FR/EN — confirm Live API auto language handling) — **resolved differently than originally scoped**: voice replies are locked to the visitor's site locale (EN/ES/FR) rather than auto-detected from speech, per the approved UI design spec (`docs/superpowers/specs/2026-08-13-phase4-voice-chat-ui-design.md`). Not planned to be revisited unless it proves limiting in practice.
- [x] Graceful fallback to text mode if mic permission denied or WebSocket fails — live-verified via denying mic permission mid-checklist, confirmed clean fallback to text with no stuck state

---

## Phase 5 — CV Page

- [ ] Quick-overview header section
- [ ] Accordion component (glass-styled, consistent with design system)
- [ ] Sections: Professional Experience, Projects (linking into Portfolio page detail routes), Academic Experience & Certifications, Other Experience, Personal Interests & Background
- [ ] Populate content by querying the Notion Knowledge Base (`Status = Published`, `Content Type` in Professional Experience / Academic Experience / Skill / Personal Interest) — same source of truth as the RAG pipeline (Phase 2.2), fetched at build time and rendered directly (not just embedded)
- [ ] Translate content for EN/ES/FR
- [ ] Optional: downloadable PDF version of the CV

---

## Phase 6 — Portfolio Page

### 6.1 Content sourcing

- [ ] Source projects from the Knowledge Base entries where `Content Type = Project` and `Status = Published` (same database as RAG, not a separate Notion database)
- [x] Portfolio-display schema resolved: `Title`/`Summary`/`Tags`/`Priority` map directly; category/date/location/links/media/tech stack come from `Metadata` (JSON Schema at `docs/notion-metadata-schema.json`, defined in Phase 2.1a)
- [ ] Optionally enrich with the linked **Projects** tracker database (via `Related To`) for status/timeline (Active/Completed/Progress %/Deadline) if that's worth surfacing publicly
- [ ] Pull via Notion MCP/API (`notion-query-data-sources` SQL mode, filtered) during a build-time or on-demand sync step
- [ ] Decide sync mechanism: build-time fetch (simplest, content updates require redeploy) vs. runtime fetch via a Worker route (fresher, adds latency/complexity) — recommend **build-time** for a portfolio site
- [ ] Store synced content as local Markdown/JSON in the repo (versioned, fast to render) rather than fetching Notion at request time
- [ ] Handle project media (images/video) — download and optimize, or reference Notion-hosted URLs (check stability/expiry of Notion file URLs)

### 6.2 UI

- [ ] Grid/list view grouped by category, ordered chronologically within each group
- [ ] Project card component (glass-styled) with thumbnail, title, category, date
- [ ] Individual project detail page/route per project: description, info, media gallery/video embed
- [ ] Cross-link from CV's "Projects" accordion entries to these detail pages

---

## Phase 7 — Contact Page

### 7.1 Contact form

- [ ] Build form (name, email, message) styled to the design system
- [ ] Backend handling via an Astro server API route (Worker handler) — send via Cloudflare Email Service or similar free-tier email relay
- [ ] Add spam protection (Cloudflare Turnstile — free, already have the skill for it)
- [ ] Display contact info (email, social/professional links)

### 7.2 Booking system (Notion-backed)

- [ ] Create the "Bookings" database in Notion (via Notion MCP) with fields: date/time, visitor name, email, status, notes
- [ ] Confirm Notion Calendar is subscribed to/fed by this database
- [ ] Build an Astro server API route acting as the booking API: reads existing bookings (to compute availability/busy slots), writes new booking rows, using a server-side Notion internal integration token (never exposed client-side)
- [ ] Build the booking UI: available-slot picker, confirmation flow
- [ ] Handle double-booking prevention and time zone conversion (visitor's local time ↔ your calendar's time zone)
- [ ] Optional: booking confirmation email (reuse the Cloudflare Email Service setup from 7.1)

---

## Phase 8 — 3D Avatar (deferred to end, per prior decision)

Text/voice interaction is the priority; this phase adds the visual layer on top of an already-working chat.

### 8.1 Avatar creation

- [ ] User supplies reference photos
- [ ] Generate a Ready Player Me (or similar free-tier) full-body/half-body GLB avatar from photos
- [ ] Confirm avatar style (realistic vs. stylized) and adjust to match your likeness

### 8.2 Animation & lip-sync

- [ ] Integrate `TalkingHead.js` (Three.js-based) for real-time lip-sync driven by TTS output
- [ ] Source idle/gesture animations (Mixamo FBX, retargeted to the RPM rig) for natural idle movement
- [ ] Wire lip-sync to the Gemini Live API audio stream (Phase 4) and to TTS-rendered text responses (Phase 3, if voice is off but avatar should still mouth-move — decide if needed)

### 8.3 Integration

- [ ] Replace the Phase 3 placeholder hero with the full-screen 3D avatar canvas
- [ ] Performance-check on mobile (3D rendering cost, fallback to a lighter/static presentation on low-end devices if needed)
- [ ] Re-verify chat bubble layering over the now-live 3D canvas

---

## Phase 9 — SEO / GEO / AEO Optimization

- [ ] Per-page metadata (title, description, OpenGraph, Twitter cards) per locale
- [ ] Structured data (JSON-LD: Person schema, ProfessionalService/Project schema for portfolio items)
- [ ] `sitemap.xml` and `robots.txt` (with locale-aware sitemap entries)
- [ ] Semantic HTML structure audit (headings hierarchy, landmarks, alt text)
- [ ] Content written to be directly answerable/quotable by AI answer engines (clear, self-contained statements about who you are, what you do, key projects) — reflects the GEO/AEO requirement
- [ ] `hreflang` tags across the three locales

---

## Phase 10 — Performance, Accessibility & QA

- [ ] Run Lighthouse / Cloudflare web-perf audits (Core Web Vitals: LCP, INP, CLS) on all 4 pages
- [ ] Image/video optimization (WebP/AVIF, lazy loading, Cloudflare Images if needed)
- [ ] Accessibility pass (contrast ratios against the dark glass theme, keyboard navigation, ARIA labels on chat/voice controls, focus states)
- [ ] Cross-browser and cross-device responsive testing (mobile/tablet/desktop, iOS Safari quirks especially for WebSocket/mic APIs)
- [ ] Full run-through of `security-review` skill: API key handling, XSS in rendered chat messages, booking endpoint abuse, Turnstile coverage
- [ ] Load-test the chat/voice endpoints against free-tier rate limits, confirm graceful degradation messaging when limits are hit

---

## Phase 11 — Launch

- [ ] Final content review across all 3 languages
- [ ] Custom domain setup on the Cloudflare Worker (if applicable)
- [ ] Production secrets audit (all keys set as Cloudflare secrets, none in repo/client bundle)
- [ ] Merge to `main`, confirm production deploy
- [ ] Post-launch smoke test: chat, voice, CV accordion, portfolio links, contact form, booking flow — all 3 languages, mobile + desktop

---

## Phase 12 — Post-Launch (ongoing)

- [ ] Voice cloning exploration (optional, revisit only if desired later — noted as added complexity/latency in earlier discussion)
- [ ] Content update workflow: adding new projects (Notion sync), updating CV, re-ingesting RAG content
- [ ] Monitor Cloudflare/Google AI Studio/Chroma Cloud free-tier usage, alert before hitting limits
- [ ] Iterate on chat persona/prompt based on real visitor interactions
