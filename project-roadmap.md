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
- [x] Generate and store remaining API keys as Cloudflare Worker **secrets** (never client-side): Google AI Studio key, Notion internal integration token

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
- [ ] Import and place the top-left logo (PNG to be supplied) — `FloatingIcon` currently falls back to a "DP" monogram; swap in once you provide the file
- [x] Build the hamburger menu (top-right) with the 4-route nav: Main / CV / Portfolio / Contact (native `<details>`, no JS framework — active-route highlight, closes on outside click)
- [x] Typography: Space Grotesk (display) / Manrope (body) / JetBrains Mono (utility — status chips, labels), self-hosted via `@fontsource`
- [x] Base responsive layout shell verified mobile → desktop via Playwright screenshots (chrome, menu open/closed, all 4 routes)

### 1.4 Internationalization scaffold

- [ ] Set up i18n routing (`/en`, `/es`, `/fr`) using Astro's built-in i18n
- [ ] Set up translation file structure (e.g. `src/i18n/en.json`, `es.json`, `fr.json`)
- [ ] Build language switcher UI (part of hamburger menu or a floating control)
- [ ] Decide default/fallback locale and browser-locale auto-detect behavior

---

## Phase 2 — Content Architecture & RAG Pipeline

### 2.1 Content folders

- [ ] Create `content/professional/`, `content/academic/`, `content/personal/` folders (source of truth for RAG)
- [ ] Agree on file format per folder (Markdown recommended — easy to chunk, diff, and version)
- [ ] User populates folders with source material (bio, resume details, project write-ups, personal background, etc.)

### 2.2 Ingestion pipeline

- [ ] Write `scripts/ingest.ts`: reads content folders, chunks documents (sensible chunk size/overlap for chat-length answers), generates embeddings, upserts into Chroma Cloud collection
- [ ] Decide embedding model (Google's `text-embedding-004`/Gemini embeddings to stay in the same free-tier ecosystem, or Chroma's default — confirm cost/limits)
- [ ] Add metadata per chunk (source folder, doc title, language) to support filtered retrieval and multilingual answers
- [ ] Run initial ingestion once folders have content, verify via Chroma MCP (`chroma_query_documents`) that retrieval returns sensible chunks
- [ ] Document the re-ingestion workflow (how to update the KB when content changes)

### 2.3 Retrieval + prompting

- [ ] Design the RAG prompt template: system instructions (persona, tone, boundaries — what the avatar should/shouldn't answer), retrieved-context injection, conversation history handling
- [ ] Decide top-k retrieval count and any re-ranking/filtering logic
- [ ] Handle multilingual retrieval: query in visitor's language, retrieve across content (translate query or store multilingual chunks — decide during build)

---

## Phase 3 — Text Chat (Main Page, avatar-less first)

Per prior decision: build the interaction layer before the visual 3D avatar, since visuals are UX polish on top of a working chat.

### 3.1 Backend proxy

- [ ] Build an Astro server API route (`src/pages/api/chat.ts`, runs as a Worker handler) that: receives visitor message, queries Chroma for context, calls `gemma-4-31b-it` via Google AI Studio API with the RAG-augmented prompt, returns response
- [ ] Keep the Google AI Studio API key server-side only (Cloudflare secret), never exposed to the client
- [ ] Add basic rate limiting / abuse protection (Cloudflare's built-in tools) since this is a public-facing paid-API endpoint
- [ ] Add conversation history handling (session-scoped, not persisted server-side unless desired)

### 3.2 Chat UI

- [ ] Build floating bottom-center chatbox: text input + send button + waves button (voice toggle, wired up in Phase 4)
- [ ] Style per spec: dark electric-blue outline, black background, glass/blur, external glow
- [ ] Build chat bubble components: avatar messages (left, dark electric-blue outline/dark-blue fill), visitor messages (right, light-cyan outline/blue-grey fill)
- [ ] Bubbles float over the (placeholder, pre-3D-avatar) hero area
- [ ] Streaming response rendering (token-by-token) for perceived responsiveness
- [ ] Loading/thinking state, error state (API failure, rate limit hit)

### 3.3 Placeholder hero

- [ ] Static/lightly-animated placeholder in the avatar's eventual position (e.g. glowing orb or silhouette) so Phase 3 ships a complete, good-looking page without blocking on the 3D avatar work

---

## Phase 4 — Voice Chat (Gemini 2.5 Flash Native Audio Dialog)

Per prior decision: stock Gemini Live API voice, not a cloned voice — keeps latency low and avoids extra hosting.

- [ ] Build a Cloudflare Worker that mints short-lived **ephemeral tokens** for the Gemini Live API (so the browser connects directly via WebSocket without exposing the long-lived API key)
- [ ] Implement client-side Live API session: mic capture → stream to Gemini → stream audio response back
- [ ] Wire the "waves" button to toggle voice mode; visually indicate listening/speaking states
- [ ] Feed the same RAG context into the voice session (system instructions + retrieved chunks) so voice answers stay consistent with text answers
- [ ] Handle multilingual voice (visitor speaks ES/FR/EN — confirm Live API auto language handling)
- [ ] Graceful fallback to text mode if mic permission denied or WebSocket fails

---

## Phase 5 — CV Page

- [ ] Quick-overview header section
- [ ] Accordion component (glass-styled, consistent with design system)
- [ ] Sections: Professional Experience, Projects (linking into Portfolio page detail routes), Academic Experience & Certifications, Other Experience, Personal Interests & Background
- [ ] Populate content (from `content/professional`, `content/academic`, `content/personal` — reuse the same source docs as the RAG folders where it makes sense, single source of truth)
- [ ] Translate content for EN/ES/FR
- [ ] Optional: downloadable PDF version of the CV

---

## Phase 6 — Portfolio Page

### 6.1 Content sourcing

- [ ] Define project schema (title, category, date, description, media, links)
- [ ] Pull project content from Notion via Notion MCP (`notion-search`, `notion-fetch`, `notion-query-database-view`) during a build-time or on-demand sync step
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
