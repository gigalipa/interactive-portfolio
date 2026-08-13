# Phase 4 — Voice Chat (Gemini 2.5 Flash Native Audio Dialog): Design

Status: approved (2026-08-12)

## Context

Phase 3 shipped a working text chat: `POST /api/chat` (SSE) retrieves RAG context, calls `gemini-flash-lite-latest`, streams a reply, and optionally persists history to KV behind a consent gate. The `ChatBox` component already renders a "waves" button, but it's disabled (`voiceLabel={t.voiceComingSoon}`) — this phase makes it live, per `project-roadmap.md` Phase 4.

Per an earlier decision: a stock Gemini Live API voice (not a cloned voice) — keeps the native audio pipeline intact, free-tier friendly, no extra hosting.

## Goals

- A visitor can click the waves button and hold a live, open-mic voice conversation with the avatar, grounded in the same RAG knowledge base as text chat.
- The long-lived Google API key never reaches the browser — only a short-lived ephemeral token does.
- Voice turns are transcribed and saved into the same consent-gated history as text turns, visibly tagged as voice.
- Voice replies stay in the visitor's current site locale (EN/ES/FR), consistent with text chat.
- Graceful fallback to text mode on mic-permission denial or connection failure.

## Non-goals (deferred)

- The real 3D avatar and lip-sync — Phase 8. `PresenceRing`'s existing listening/speaking states stand in for it.
- Per-turn RAG re-retrieval via function calling mid-session — session-start context only for this pass (see below).
- Voice cloning — Phase 12, optional.
- Running text and voice simultaneously in one session — one active mode at a time.

## Architecture overview

```
Browser                              Worker (Astro server route)          External
--------                              ---------------------------          --------
ChatBox "waves" click
  → useVoiceSession.start()
      POST /api/voice/token ────────▶ check rate limit
                                      retrieveContext() (broad, topK~12) ─▶ Chroma Cloud
                                      buildVoiceSystemPrompt()
                                      mint ephemeral token ───────────────▶ Google AI (Live API auth)
      ◀── { token, expiresAt, model } ──
  → open WebSocket session ──────────────────────────────────────────────▶ Gemini Live API
      mic PCM stream ──────────────────────────────────────────────────▶
      ◀── audio + transcript deltas ──────────────────────────────────────
  → playback via Web Audio API
  → on turn complete: append transcript to session history (same pipeline as text)
  → click waves again → close WebSocket → idle
```

Two new pieces:
- `src/pages/api/voice/token.ts` — POST, server-side only. Rate-limited (reuses `CHAT_RATE_LIMITER`). Runs `retrieveContext` + `buildVoiceSystemPrompt`, mints an ephemeral token via `GOOGLE_API_KEY_LIVE`, returns `{ token, expiresAt, model }`. System instructions are baked into the token's `liveConnectConstraints` server-side rather than echoed back to the browser; `model` is returned because the client needs it to call `live.connect`. The key itself never leaves the server.
- `src/lib/voice/` (client-side): `liveSession.ts` (wraps the Live API WebSocket client: mic capture, audio streaming, playback) and `useVoiceSession.ts` (React hook, state machine, mirrors `useChatSession`'s shape).

The browser connects **directly** to the Gemini Live API over WebSocket using the ephemeral token — audio never round-trips through our Worker, keeping latency low.

## Session context (RAG)

Unlike text chat (fresh retrieval per message), the Live API sets system instructions once at connect time. `POST /api/voice/token` runs `retrieveContext` once per session with a wider net (`topK` ~12 vs. text's 4) to build a broad-but-relevant context slice, passed through a new `buildVoiceSystemPrompt()`. It applies the same `excludeContentTypes: ["Personal Interest"]` filter as text chat's `EXCLUDED_GENERAL_CHAT_CONTENT_TYPES` — this matters even more for voice than text, since the voice system prompt is locked in for the whole session rather than re-retrieved per message, so any personal fiction/reflections that slipped in would be stuck there unrecoverably:

- Reuses `PERSONA` / `TONE` / `BOUNDARIES` from `src/lib/rag/prompt.ts` (same source of truth as text).
- Adds a voice-specific note: replies should be spoken-conversational (short sentences, no markdown/lists/headers).
- Locks language to the visitor's current site locale (`lang` prop already threaded through `ChatWidget`), not auto-detected from speech.

If the visitor reconnects (new session), context is re-retrieved fresh. Mid-session, context does not change — a known trade-off, deferred to a future function-calling pass if it proves limiting in practice.

## UX / state machine

`useVoiceSession` states: `idle → connecting → listening ⇄ speaking → ending → idle`, plus `error`.

- **Click waves (idle)**: request mic permission → `connecting`. Fails (permission denied) → `error`, falls back to text mode immediately, no retry loop.
- **Connected**: `listening` while visitor speaks, `speaking` while the avatar's audio plays back, alternating per turn. Drives `PresenceRing`'s existing idle/listening/speaking visual states directly — no new visual component needed.
- **Click waves again**: closes the WebSocket cleanly, `ending` → `idle`.
- **Mid-session WebSocket drop**: one silent reconnect attempt using a freshly minted token; if that also fails, falls back to text with a visible inline error.
- **Text input is disabled while a voice session is active** — one active mode at a time, avoids interleaving two response streams into one message list.

## History integration

Voice turns feed into the *same* `ChatMessage`/`StoredConversation` pipeline as text (same KV store, same 30-day TTL, same consent gate — `persist: false` visitors get session-only voice history exactly like session-only text history today).

- `ChatMessage` gains an optional field: `mode?: "voice"` (undefined for existing/text messages — no migration needed, existing stored conversations remain valid).
- Transcripts come from the Live API's input/output transcription events; each completed turn (visitor utterance + avatar reply) is appended as two tagged `ChatMessage`s, same as a text turn's `{role: "user"}`/`{role: "model"}` pair.
- `ChatBubble` and `HistorySidebar` render a small mic icon next to `mode: "voice"` messages so a visitor can tell which turns were spoken.
- Persistence timing mirrors text: appended/`KV.put` after each completed turn (not batched until session end), so a dropped connection doesn't lose earlier turns in the same session.

## Error handling summary

| Failure | Behavior |
|---|---|
| `/api/voice/token` rate-limited | `429`; UI shows the same "slow down" message as text chat, waves button stays inactive |
| Ephemeral token mint fails (Google API error) | `error` state, falls back to text, inline message |
| Mic permission denied | Immediate fallback to text, no retry prompt |
| WebSocket drops mid-session | One silent reconnect with a fresh token; second failure falls back to text with a visible error |
| KV write failure (persisting a voice turn) | Same as text: response already delivered to the visitor is unaffected, logged server-side, that turn just won't survive a reload |
| Chroma/`retrieveContext` failure at session start | Session still starts with `buildVoiceSystemPrompt({ chunks: [] })` fallback, same graceful-degradation pattern as text |

## Testing

- Unit tests: `voice/token.ts` handler (auth/rate-limit/response-shape, mirrors `chat.ts` tests), `buildVoiceSystemPrompt` (mirrors `prompt.test.ts`), `ChatMessage.mode` tagging round-trip in the existing history KV tests.
- No automated e2e for actual audio (Playwright can't drive real mic/WebSocket audio reliably) — voice gets a scripted manual verification pass against a running dev server before the implementation is considered done, same standard Phase 3 held itself to for its own live SSE verification.
- Manual verification checklist: mic permission grant → live round-trip conversation → transcript appears correctly tagged in history → reconnect after a forced drop → fallback path when permission is denied.

## Delivery plan

Two separate implementation plans, backend first:

1. **Backend**: `/api/voice/token` (rate limiting, `retrieveContext`, `buildVoiceSystemPrompt`, ephemeral token minting), `ChatMessage.mode` field + history plumbing, unit tests, `GOOGLE_API_KEY_LIVE` promoted to a Cloudflare Worker secret. Live-verified (token mint + a real Live API connection) before UI work starts.
2. **UI**: `src/lib/voice/liveSession.ts` + `useVoiceSession.ts`, wiring the waves button in `ChatBox`, `PresenceRing` state mapping, mic-icon tagging in `ChatBubble`/`HistorySidebar`, text-input-disabled-during-voice behavior, error/fallback states, manual verification checklist.

## Related fix (out of scope, flagged during Phase 3 verification)

The Main page hero subtitle still reads "the conversational interface arrives in Phase 3" (in all three locales) even though text chat has shipped. This copy should be updated as part of, or immediately before, this phase's UI work — tracked here so it isn't lost, but not part of the voice-chat implementation itself.
