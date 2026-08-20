# Phase 4 — Voice Chat UI (Soundwave Visor): Design

Status: approved (2026-08-13)

## Context

The Phase 4 backend (ephemeral Live API tokens, RAG-grounded voice system prompts, voice-tagged history persistence) is already implemented and merged — see `docs/superpowers/specs/2026-08-12-phase4-voice-chat-design.md`. `ChatBox`'s waves button currently renders disabled (`voiceLabel={t.voiceComingSoon}`). This spec covers the client-side half: the actual browser Live API session, the mic/audio wiring, and — per explicit direction from Daniel — a soundwave visualization modeled on the Google Gemini Android app's voice UI, where the input bar morphs into a waveform that reacts to the visitor's voice in real time.

## Goals

- Clicking the waves button starts a real, open-mic Live API voice session; the `ChatBox` input area morphs into a soundwave visor for the duration of the call.
- The visor's waveform reacts to genuine microphone amplitude, not a stylized/faked animation.
- `PresenceRing` (the hero orb) visually distinguishes "voice mode" for the whole session, and its pulse rate tracks the avatar's own output audio while it's speaking.
- Ending the call cleanly returns the UI to text chat.
- Voice turns are visibly distinguishable from text turns in the live transcript and in history.
- Mic-permission denial or connection failure falls back to text chat without dead-ending the visitor.

## Non-goals (deferred)

- The real 3D avatar / lip-sync — Phase 8. `PresenceRing` continues to stand in for it.
- A mute toggle — deliberately left out of this pass (confirmed with Daniel); can be added later without disrupting this design.
- Multi-turn function-calling / mid-session RAG re-retrieval — already deferred at the backend-spec level.
- Playwright coverage of real audio/mic/WebSocket behavior — not feasible; covered by a manual checklist instead (see Testing).

## Architecture overview

Three visual/audio pieces, one owning hook:

```
ChatWidget
 ├─ PresenceRing (existing hero orb)
 │    gains: data-voice="true|false" (whole-session marker)
 │            --pulse-rate (live, while data-state="speaking")
 │
 ├─ ChatBox  ──(voice session active)──▶  VoiceVisor (new, replaces ChatBox)
 │                                          waveform bars ← mic input analyser
 │                                          end-call button
 │
 └─ useVoiceSession (new hook)
      owns: getUserMedia() mic stream, Live API WebSocket (liveSession.ts),
            playback AudioContext, two AnalyserNodes (mic input, avatar output)
      exposes: status, micLevel (0-1, per rAF tick), outputLevel (0-1, per rAF
               tick while speaking), start(), end(), transcript turns
```

Both `AnalyserNode`s are non-destructive taps: one on the `MediaStream` already sent to the Live API for the visitor's mic, one on the `AudioContext` graph already used to play back the avatar's response audio. No extra permissions, no extra streams — the visualization rides on audio the app needs anyway.

`VoiceVisor` and `PresenceRing`'s pulse-rate wiring are dumb consumers of numbers `useVoiceSession` computes each frame; neither owns any Web Audio API code itself.

## `VoiceVisor` component

`src/components/chat/VoiceVisor.tsx` — renders in the exact position/shape `ChatBox` occupies (same pill-shaped glass container: `border-slate-mist bg-deep-blue/40 shadow-glow-blue ... rounded-full border p-2 backdrop-blur-xl`), so the layout doesn't jump when it swaps in.

- A row of ~24 vertical bar `<div>`s, each a thin rounded rect styled with the existing electric-blue/signal-cyan glow tokens. Heights are set via inline `style` from a `requestAnimationFrame` loop reading `AnalyserNode.getByteFrequencyData()` on the mic stream — plain DOM/CSS, matching `PresenceRing`'s existing no-canvas/no-SVG convention, not a new rendering dependency.
- To the right: a single end-call button, visually distinct (red-tinted) from every other control in the app, with a phone-hangup icon — a dedicated, hard-to-trigger-by-accident affordance (per Daniel's explicit preference over reusing the waves toggle).
- No mute control in this pass.
- Bars sit near-flat whenever the visitor isn't speaking — including the entire time the avatar is talking, since the visor only ever reads the mic stream. This is correct, real behavior, not a state that needs separate handling: native-audio Live models support barge-in, so the mic stays live and gets naturally quiet rather than needing to be paused.

## `PresenceRing` voice-mode state

The design-token palette (`src/styles/global.css`) currently has two hues (electric-blue for idle/speaking, signal-cyan for listening) — no third exists for a distinct "voice mode" identity, so this spec adds one:

```css
--color-voice-violet: #a78bfa; /* to be tuned visually against the existing palette */
--shadow-glow-violet: 0 0 24px 2px rgb(167 139 250 / 0.35);
```

`PresenceRing.astro` gains a new `data-voice` attribute (`"true"` from session connect to session end, independent of and layered on top of its existing `data-state` idle/listening/speaking logic — not a replacement for it):

```css
.presence-ring[data-voice="true"] .core {
	background: radial-gradient(
		circle at 35% 30%,
		var(--color-voice-violet),
		var(--color-deep-blue) 70%
	);
	box-shadow: var(--shadow-glow-violet);
}
```

This applies for the whole call (per Daniel's explicit choice), so it's unambiguous at a glance that voice mode is active regardless of who's currently talking.

**Output-amplitude pulse**: while `data-state="speaking"`, a `--pulse-rate` CSS custom property (defaulting to the existing fixed `1.1s` `.ping` animation-duration) is updated each frame from the avatar's output audio level — louder moments pulse faster, quiet moments settle back toward the default. `src/lib/chat/presenceRingBridge.ts` gains a sibling export:

```ts
export function setVoiceMode(active: boolean): void {
	if (typeof document === "undefined") return;
	document
		.querySelector(".presence-ring")
		?.setAttribute("data-voice", String(active));
}

export function setVoicePulseRate(level: number): void {
	// level: 0-1 output amplitude, only meaningful while speaking
	if (typeof document === "undefined") return;
	const ring = document.querySelector<HTMLElement>(".presence-ring");
	if (!ring) return;
	const seconds = 1.1 - level * 0.6; // louder → faster, floor around 0.5s
	ring.style.setProperty("--pulse-rate", `${Math.max(seconds, 0.5)}s`);
}
```

`.ping`'s `animation-duration` becomes `var(--pulse-rate, 1.1s)` so it falls back to today's fixed value whenever voice mode isn't driving it.

## Session lifecycle (`useVoiceSession` + `liveSession.ts`)

Carries forward the state machine already approved at the backend-design level, now given concrete client wiring:

- **`idle`** — `ChatBox` shown normally, waves button active.
- **Click waves → `connecting`**: `getUserMedia({ audio: true })` (mic permission prompt) → on grant, `POST /api/voice/token` → open the Live API WebSocket (`@google/genai`'s browser Live client, `ai.live.connect({ model, ... })`) using the returned token/model. `ChatBox` unmounts, `VoiceVisor` mounts, `setVoiceMode(true)`.
  - Mic permission denied → `error` → immediate, silent-to-the-session fallback to text (`VoiceVisor` never mounts, or unmounts if it already did), no retry prompt, an inline error message shown once.
- **`listening` ⇄ `speaking`**: mic streams continuously to Gemini (no pause on barge-in). `listening` while the visitor is the more recent speaker, `speaking` while the avatar's audio is playing — same signal `PresenceRing`'s `data-state` already consumes today, unchanged in meaning. Transcription events (input and output) accumulate into the current turn.
- **Turn complete** (both a user transcript and a model transcript are available for the turn): `POST /api/voice/turn` (already shipped) persists it tagged `mode: "voice"`; the live transcript view appends both messages via `ChatBubble` with `mode="voice"`.
- **Click end-call → `ending` → `idle`**: close the WebSocket, stop the mic `MediaStream`'s tracks, tear down both `AnalyserNode`s/the playback `AudioContext`, `setVoiceMode(false)`, `VoiceVisor` unmounts, `ChatBox` returns.
- **WebSocket drops mid-session**: one silent reconnect attempt using a freshly minted token (a fresh `POST /api/voice/token` call, since the prior token is single-use/short-lived); a second failure falls back to text with a visible inline error, reusing the existing chat error-bubble pattern.
- **Text input is fully unmounted (not merely disabled) while voice is active** — `ChatBox` and `VoiceVisor` are mutually exclusive renders in the same layout slot, not an overlay.

## History integration

- `ChatMessage.mode` (already shipped server-side) flows through to the client: `DisplayMessage` (in `useChatSession.ts` / the shared display-message shape) gains the same optional `mode?: "voice"` field.
- `ChatBubble` gains an optional `mode?: "voice"` prop — when set, renders a small mic glyph adjacent to the bubble (no other layout change).
- `HistorySidebar`'s conversation-summary rows show the same glyph when a conversation's most recent message was a voice turn, so a visitor can tell at a glance which past conversations were spoken.

## Error handling summary

| Failure                                                 | Behavior                                                                                                                |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Mic permission denied                                   | Immediate fallback to text, single inline error, no retry loop                                                          |
| `/api/voice/token` fails (rate-limited, mint error)     | Same generic error surfaced as the text-chat error-bubble pattern; stays in/falls back to text                          |
| Live API WebSocket fails to open                        | Same as above                                                                                                           |
| WebSocket drops mid-session                             | One silent reconnect with a fresh token; second failure falls back to text with a visible error                         |
| `AnalyserNode`/Web Audio unsupported (very old browser) | Voice entry point (waves button) is hidden entirely via a feature check at mount, rather than offered and failing later |

## Testing

- **Unit (Vitest)**: `useVoiceSession`'s state machine (mocked Live API client + mocked `MediaStream`/`AnalyserNode`, same DI-seam pattern as the backend's `mintEphemeralToken({ genAiFactory })`) — covers connect/end/reconnect/fallback transitions without real audio. `VoiceVisor`'s bar-height mapping function (pure: frequency-data array → bar heights) tested in isolation from the rAF loop.
- **No Playwright coverage** for real mic/audio/WebSocket behavior — infeasible to automate reliably. Closed out instead with a manual verification checklist before this is considered done, mirroring how the backend plan closed on real Google API calls rather than just mocks:
  1. Click waves, grant mic permission, confirm `VoiceVisor` replaces `ChatBox` and `PresenceRing` shifts to the voice-mode color.
  2. Speak and confirm the visor's bars visibly react to actual voice (not just ambient noise floor).
  3. Confirm `PresenceRing`'s pulse visibly speeds up during louder moments of the avatar's reply.
  4. End the call via the end-call button; confirm `ChatBox` returns and `PresenceRing` leaves voice-mode color.
  5. Reload/open history and confirm the completed turn appears, mic-tagged, in both the live view and the history sidebar.
  6. Deny mic permission on a fresh session attempt; confirm immediate, clear fallback to text with no dead end.

## Delivery plan

One implementation plan (smaller scope than the backend plan, and more tightly coupled — visor, ring, and hook all depend on the same audio wiring going in together):

- New design tokens (`--color-voice-violet`, `--shadow-glow-violet`) in `global.css`.
- `PresenceRing.astro` `data-voice` styling; `presenceRingBridge.ts` gains `setVoiceMode`/`setVoicePulseRate`.
- `src/lib/voice/liveSession.ts` (client-side Live API WebSocket wrapper, mic capture, playback, both analysers).
- `src/lib/voice/useVoiceSession.ts` (state machine, exposes levels + transcript turns).
- `src/components/chat/VoiceVisor.tsx` + unit tests.
- `ChatWidget.tsx` wiring: swap `ChatBox`/`VoiceVisor` based on session status, wire the waves button to `useVoiceSession.start()`.
- `ChatBubble`/`HistorySidebar`/`DisplayMessage` `mode` threading.
- Manual verification checklist (above) run against a live dev server with a real Google Live API key before considered done.
