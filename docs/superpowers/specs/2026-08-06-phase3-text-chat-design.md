# Phase 3 — Text Chat (Main Page, avatar-less first): Design

Status: approved (2026-08-06)

## Context

Phases 0–2 built the site scaffold, design system, and a RAG pipeline (`src/lib/rag/{config,embed,retrieve,prompt}.ts`) that embeds a query, retrieves ranked chunks from a Chroma Cloud `knowledge_base` collection, and assembles a system prompt combining a static persona/tone/boundaries block with the retrieved context. Nothing yet calls an LLM or renders a chat UI — this phase wires that RAG pipeline into an actual chat request/response loop with `gemma-4-31b-it`, and builds the UI for it, per `project-roadmap.md` Phase 3.

Per an earlier decision, the interaction layer (chat) is built before the visual 3D avatar (Phase 8) — visuals are UX polish on top of a working chat, not a prerequisite for it.

## Goals

- A visitor can hold a multi-turn text conversation with the avatar on the Main page, grounded in the RAG knowledge base.
- Returning visitors (same browser) can see and resume past conversations from a history sidebar, and delete them.
- The public chat endpoint is protected from abuse via Cloudflare's native rate limiting.
- Conversations are retained for 30 days of inactivity, then automatically expire — visitors are told this and can delete manually at any time.
- The `visitor_id` cookie (the only non-essential cookie this site sets) is never set without prior, explicit consent — GDPR/ePrivacy-compliant by default, not by afterthought.

## Non-goals (deferred)

- Voice chat (Gemini Live API) — Phase 4. The chatbox's "waves" button is present but inert in this phase.
- The real 3D avatar — Phase 8. A placeholder (`PresenceRing`) stands in for it.
- Login/account system — history is tied to an anonymous browser cookie, not a user identity.
- Cross-device history sync — a visitor_id cookie is browser-local; there is no mechanism to carry history to a different browser/device.

## Architecture overview

```
Browser                          Worker (Astro server routes)              External
--------                          ---------------------------              --------
ConsentBanner ── (localStorage only, no network call)

ChatBox ── POST /api/chat ──────▶ if persist=true: resolve visitor_id cookie
  (SSE)     { persist, ... }        load conversation from KV (SESSION)
                                  retrieveContext() ───────────────────▶ Chroma Cloud
                                  buildSystemPrompt()
                                  streamGenerateContent() ─────────────▶ Gemini API (gemma-4-31b-it)
                                  stream SSE tokens back ◀───────────────
◀── SSE tokens ───────────────────
                                  if persist=true: append + persist turn to KV (30d TTL)

HistorySidebar ── GET /api/history/list ──▶ KV prefix-list conv:{visitorId}:*
               ── GET /api/history/:id ───▶ KV get
               ── DELETE /api/history/:id ▶ KV delete
               ── DELETE /api/history ────▶ KV delete-all for visitorId
```

Two Astro server routes: `src/pages/api/chat.ts` (POST, SSE) and `src/pages/api/history/[...].ts` (list/get/delete/delete-all). Both run as Worker handlers per the existing `@astrojs/cloudflare` adapter setup.

## Cookie consent (GDPR/ePrivacy)

- **What needs consent**: the `visitor_id` cookie is the only non-essential cookie this site sets — it exists purely to let a visitor resume conversations across visits, not to make the chat itself work. Under GDPR/ePrivacy, a cookie that isn't strictly necessary for the requested service requires prior opt-in consent, not just disclosure.
- **What doesn't**: Cloudflare's own edge cookies (e.g. `__cfruid`, only relevant if Cloudflare's legacy Rate Limiting Rules or bot-management features are ever enabled — the Workers Rate Limiting binding used here does not set any) are "strictly necessary" for security/traffic management and are exempt from consent, but are still disclosed in the cookie-info text for transparency. Same for the consent choice itself, stored client-side only (see below).
- **Consent-gated persistence model** — this is the key design point: persistence, not the chat itself, is gated:
  - **`persist: false` (no consent yet, or explicitly rejected)**: the client keeps the running message list in memory/`sessionStorage` for the current tab only, and sends the _entire_ history in each `POST /api/chat` body (same shape the server already needs internally). The server never reads/sets a `visitor_id` cookie and never touches KV. Chat works fully; nothing survives a reload; no history sidebar (nothing to list).
  - **`persist: true` (consent given)**: behaves exactly as described in "Identity & conversation storage" and "Chat API" below — `visitor_id` cookie, KV read/write, resumable cross-session history, sidebar.
  - The client sends its current consent state as `persist: boolean` on every `/api/chat` call, read from the consent choice in `localStorage` (not a cookie — storing the choice itself doesn't require consent, but keeping it out of any cookie sidesteps the question entirely).
- **Consent banner UI**: shown on first visit if no choice is recorded in `localStorage`. Copy: _"This site can remember your conversation with the avatar so you can pick it up later — that needs one small cookie. Without it, chat still works, it just won't be saved."_ Two buttons: **Accept** / **Reject**. A short "What's this cookie?" link expands inline text naming the single functional cookie and noting Cloudflare's own strictly-necessary security cookies. A persistent footer link ("Cookie preferences") reopens the same banner at any time to change the choice.
- **Changing the choice later**:
  - Reject → Accept: starts persisting from the next message onward; no retroactive change.
  - Accept → Reject: the banner offers to also delete all currently-stored conversations for this visitor (`DELETE /api/history`, added below) as a one-click right-to-erasure action; the visitor can decline and just stop future persistence instead.

## Identity & conversation storage (KV)

- **Visitor identity**: an anonymous `visitor_id` cookie (UUID, HttpOnly, `Secure`, `SameSite=Lax`, ~1 year expiry). Set by `/api/chat` the first time a _consenting_ (`persist: true`) visitor without one sends a message. Never tied to any personal info.
- **Conversation key**: `conv:{visitorId}:{conversationId}` in the existing `SESSION` KV namespace (already provisioned, currently unused — see roadmap 1.2). Value:
  ```ts
  interface StoredConversation {
  	messages: Array<{
  		role: "user" | "model";
  		text: string;
  		at: string; /* ISO */
  	}>;
  	updatedAt: string; // ISO
  	title: string; // first user message, truncated to ~60 chars
  }
  ```
- **Listing**: `KV.list({ prefix: "conv:{visitorId}:" })` — no separate index to keep in sync with deletes/writes. Acceptable since a single visitor's conversation count will be small (tens, not thousands).
- **TTL**: every write (`KV.put`) sets `expirationTtl: 60 * 60 * 24 * 30` (30 days), so it's a rolling window from the last message, not from conversation creation.
- **Delete**: `KV.delete("conv:{visitorId}:{conversationId}")` — immediate, no soft-delete.

## Chat API (`src/pages/api/chat.ts`)

`POST` body: `{ persist: boolean, conversationId?: string, history?: ChatMessage[], message: string, language?: string }`. `history` is required (and used verbatim) when `persist` is `false`; ignored when `persist` is `true` (the server loads history from KV instead).

1. Check the rate-limit binding (see below); on exceeded, return `429` immediately (no SSE stream opened).
2. If `persist` is `false`: skip all cookie/KV steps — use `history` from the request body as the message list, plus the incoming `message`.
3. If `persist` is `true`: resolve `visitor_id` from the request cookie, or generate one and set it on the response. Resolve `conversationId` (supplied, or a new UUID). Load the existing `StoredConversation` from KV if `conversationId` was supplied and exists; otherwise start empty. Append the incoming user message to the loaded list.
4. Call `retrieveContext({ query: message, chromaCredentials, contentType: undefined, language })` (existing `src/lib/rag/retrieve.ts`).
5. Call `buildSystemPrompt({ chunks, visitorLanguage: language })` (existing `src/lib/rag/prompt.ts`).
6. Call the Gemini API's `streamGenerateContent` endpoint for `gemma-4-31b-it` with the system prompt + full message history, using `GOOGLE_API_KEY_LLM` (server-side secret, never sent to the client).
7. Stream the response to the client as SSE:
   - First event: `event: meta` — `data: {"conversationId": "..."}` (only meaningful, and only sent, when `persist` is `true` — lets the client learn the ID for a brand-new conversation).
   - Subsequent events: `event: delta` — `data: {"text": "..."}` per token/chunk as Gemini streams them.
   - Final event: `event: done` — `data: {}`.
   - On any failure mid-stream: `event: error` — `data: {"message": "..."}`, then close.
8. After the stream completes successfully **and `persist` was `true`**: append the full assistant reply to the message list and `KV.put` the updated `StoredConversation` (refreshing the 30-day TTL). A KV write failure here is logged but does not fail the already-delivered response — history persistence degrades gracefully. When `persist` is `false`, this step is skipped entirely — the client already holds the updated history itself once the stream finishes.

## History API (`src/pages/api/history/`)

- `GET /api/history/list` → `[{ conversationId, title, updatedAt }]` for the current `visitor_id`, sorted by `updatedAt` descending. Empty array (not 404) if no cookie/no conversations — this is also what the UI uses to decide whether to show the history icon at all.
- `GET /api/history/:id` → the full `StoredConversation` (for loading into the chat view). `404` if missing/expired/not owned by this `visitor_id`.
- `DELETE /api/history/:id` → deletes the KV key; `204` on success, `404` if not found.
- `DELETE /api/history` (no id) → deletes every `conv:{visitorId}:*` key for the current `visitor_id` in one call — backs the "delete all my data" action offered when a visitor revokes consent. `204` on success (including when there was nothing to delete).

All four scope strictly to the requesting `visitor_id` cookie — no cross-visitor access. If there's no `visitor_id` cookie at all (never consented), all history routes simply behave as if the visitor has zero conversations.

## Rate limiting

Cloudflare Workers' native **Rate Limiting binding**, declared in `wrangler.jsonc` (e.g. `unsafe.bindings` / the `ratelimit` binding type) and checked at the top of `/api/chat` via `env.RATE_LIMITER.limit({ key: visitorIdOrIP })`. Chosen over a dashboard-only WAF rate-limiting rule because it's version-controlled, testable, and can key off the visitor cookie rather than just IP. A reasonable starting limit: ~10 requests/minute per key — tunable without a code change once live traffic is observed.

## Chat UI

- **ConsentBanner**: glass-styled bottom banner, shown on first visit (no choice yet in `localStorage`) or when reopened via the "Cookie preferences" footer link. Accept/Reject buttons plus the expandable cookie-info text described above. Renders before/independent of the chat state — a visitor can reject and still use the chatbox immediately.
- **ChatBox**: floating, bottom-center, glass-styled per the existing design system (dark electric-blue outline, black background, external glow). Text input, send button, and a "waves" button (Phase 4 voice toggle — rendered but disabled in this phase, so the affordance is visible ahead of time).
- **ChatBubble**: avatar messages left-aligned (dark electric-blue outline / dark-blue fill), visitor messages right-aligned (light-cyan outline / blue-grey fill). Bubbles float over the placeholder hero area.
- **Streaming rendering**: the client opens an `EventSource`/`fetch`-based SSE reader against `/api/chat`, appending each `delta` event's text to the in-progress assistant bubble as it arrives.
- **States**: idle (empty input), sending (input disabled, "thinking" indicator on the assistant bubble before the first token arrives), streaming (tokens appending), error (inline error bubble with a retry action — covers Gemini failures, Chroma failures, and `429` rate-limit responses, the last with a friendly "slow down" message rather than a generic error).
- **Placeholder hero (3.3)**: reuse the existing `PresenceRing` component (built in Phase 1.3) in the avatar's eventual position. It already encodes idle/listening/speaking visual states, which map directly onto the chat states above — a real behavioral bridge to the Phase 8 3D avatar, not just a static placeholder.

## History sidebar (UI)

- A history icon button (clock-with-counterclockwise-arrow) — only rendered if `GET /api/history/list` returns at least one conversation on page load.
- Clicking it slides in a glass-styled sidebar panel: list of conversations (title, relative timestamp like "2 days ago"), a delete icon per row, and a "New conversation" action at the top.
- A persistent, small notice in the sidebar footer: _"Conversations are kept for 30 days of inactivity, then deleted automatically. You can delete any of them anytime."_
- Selecting a conversation calls `GET /api/history/:id` and loads its messages into the main chat view (replacing the current view; sending a new message from a resumed conversation continues that same `conversationId`).
- Deleting removes it from KV and the sidebar list immediately; if the currently-open conversation is deleted, the chat view resets to a fresh, unsaved conversation.

## Error handling summary

| Failure                                                  | Behavior                                                                                                                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rate limit exceeded                                      | `429` before SSE opens; UI shows a friendly "slow down" inline message, no partial bubble created                                                                 |
| Chroma/`retrieveContext` failure                         | Chat still proceeds with `buildSystemPrompt({ chunks: [] })` (existing fallback — "no matching entries" note in the prompt) rather than failing the whole request |
| Gemini call/stream failure                               | SSE `error` event; UI shows an inline error bubble with retry (resends the same user message)                                                                     |
| KV read failure (loading history)                        | Conversation starts empty rather than failing the request; logged server-side                                                                                     |
| KV write failure (persisting a turn)                     | Response already delivered to the visitor is unaffected; logged server-side, that turn just won't survive a reload                                                |
| `visitor_id` cookie missing/blocked, or consent rejected | Chat still works for the current page load (via `persist: false` + client-held history); history sidebar simply never appears (no conversations to list)          |

## Testing

- Unit tests (Vitest) for the KV conversation helpers (get/put/list/delete key-building and TTL logic) against a mocked KV namespace — pure logic, no network.
- Unit tests for SSE event parsing/formatting helpers, both server-side (building events) and client-side (consuming them).
- A live verification script (throwaway, like the one used for Phase 2.3's `retrieveContext`/`buildSystemPrompt`) hitting the real `/api/chat` route against a running dev server, confirming an actual Gemma reply streams back end-to-end — this must pass before the backend plan is considered done.
- Playwright e2e (once the UI plan lands): send a message and see the streamed reply render; reload and confirm the history icon/sidebar shows the conversation; delete a conversation and confirm it disappears.

## Delivery plan

Two separate implementation plans, backend first:

1. **Backend**: `/api/chat` (SSE, `persist` branching, Gemma streaming call, KV read/write), `/api/history/*` (list/get/delete/delete-all), the rate-limiting binding, `wrangler.jsonc` changes, unit tests, and a live end-to-end verification of both the `persist: true` and `persist: false` paths. Reviewed/merged before UI work starts.
2. **UI**: ConsentBanner (accept/reject, cookie-info text, footer reopen link, delete-all-on-reject prompt), ChatBox, ChatBubble, SSE consumption (including sending `persist`/`history` correctly per consent state), loading/error states, `PresenceRing`-based placeholder hero, HistorySidebar (list/select/delete, retention notice), Playwright coverage (including a reject-consent path test).
