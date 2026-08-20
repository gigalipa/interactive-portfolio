# Phase 4 Voice Chat UI (Soundwave Visor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the browser-side half of Phase 4 voice chat: a real Gemini Live API session (mic capture, audio playback, transcription), a Gemini-Android-style soundwave visor that replaces the chatbox during a call, and a `PresenceRing` voice-mode identity whose pulse rate tracks the avatar's own voice.

**Architecture:** `src/lib/voice/liveSession.ts` owns all Web Audio/WebSocket plumbing (mic capture → PCM → Live API, Live API audio → playback, transcription accumulation, turn-complete/speaking-state callbacks). `src/lib/voice/useVoiceSession.ts` is a React hook that drives the state machine, calls the already-shipped `/api/voice/token` and `/api/voice/turn` endpoints, and bridges output-audio level into `PresenceRing`. `src/components/chat/VoiceVisor.tsx` is a dumb, self-contained visualizer that reads the mic `AnalyserNode` directly and renders bars — it owns no session logic. `ChatWidget.tsx` swaps `ChatBox`/`VoiceVisor` based on session status.

**Tech Stack:** React (islands), `@google/genai`'s browser `Live` client (already a dependency, added in the backend plan), Web Audio API (`AudioContext`, `AnalyserNode`, `ScriptProcessorNode`), Vitest + Testing Library.

## Global Constraints

- No mute toggle in this pass (confirmed with Daniel) — visor is waveform + end-call button only.
- The end-call control is a dedicated, visually distinct button — never the same waves toggle used to start the session.
- The soundwave visor reacts only to the visitor's own mic input, never the avatar's output audio.
- `PresenceRing`'s voice-mode color applies for the whole session (connect → end), not just while the avatar speaks; its pulse rate is modulated by output audio level only while `data-state="speaking"`.
- Text input is fully unmounted (not merely disabled) while a voice session is active — `ChatBox` and `VoiceVisor` are mutually exclusive renders in the same layout slot.
- Voice turns reuse the exact same `ChatMessage`/history pipeline as text, tagged `mode: "voice"` — no new storage mechanism (already shipped server-side; this plan only needs to consume it).
- Mic-permission denial or any connection failure falls back to text chat, never leaves the visitor stuck.
- No Playwright coverage for real mic/audio/WebSocket behavior (not feasible) — this plan ends with a manual verification checklist against a live dev server, the same bar the backend plan held itself to.
- All new source files use tabs for indentation and the project's existing import style (relative paths, `type` imports for types), matching `src/lib/voice/ephemeralToken.ts`, `src/lib/chat/useChatSession.ts`, and `src/components/chat/ChatBox.tsx`.

---

### Task 1: Fix the ephemeral token to unlock audio + transcription

The already-shipped `mintEphemeralToken` sets `liveConnectConstraints` with only `systemInstruction`. Per `@google/genai`'s own documented semantics (`node_modules/@google/genai/dist/web/web.d.ts`, `Tokens.create`'s doc comment, "Case 2"): **setting `liveConnectConstraints` at all locks the entire `LiveConnectConfig`** — any field the browser's own `connect()` call tries to set afterward (like `responseModalities` or the transcription flags this plan's History integration depends on) is silently ignored by the API. This must be fixed before any client code can work.

**Files:**

- Modify: `src/lib/voice/ephemeralToken.ts`
- Test: `src/lib/voice/ephemeralToken.test.ts`

**Interfaces:**

- No signature changes — `mintEphemeralToken`'s options/return type are unchanged. Only the config passed to `ai.authTokens.create(...)` changes.

- [ ] **Step 1: Write the failing test**

Add this case to `src/lib/voice/ephemeralToken.test.ts` (alongside the existing three):

```ts
it("locks audio response modality and transcription into the token, not just system instructions", async () => {
	const create = vi.fn().mockResolvedValue({ name: "t" });
	const genAiFactory = vi.fn().mockReturnValue({ authTokens: { create } });

	await mintEphemeralToken({
		apiKey: "k",
		systemInstructions: "Reply in ES.",
		genAiFactory,
	});

	const [config] = create.mock.calls[0];
	const liveConfig = (
		config as { liveConnectConstraints: { config: Record<string, unknown> } }
	).liveConnectConstraints.config;
	expect(liveConfig.responseModalities).toEqual(["AUDIO"]);
	expect(liveConfig.inputAudioTranscription).toEqual({});
	expect(liveConfig.outputAudioTranscription).toEqual({});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/voice/ephemeralToken.test.ts`
Expected: FAIL — `liveConfig.responseModalities` is `undefined`.

- [ ] **Step 3: Fix the implementation**

In `src/lib/voice/ephemeralToken.ts`, change the import line:

```ts
import { GoogleGenAI } from "@google/genai";
```

to:

```ts
import { GoogleGenAI, Modality } from "@google/genai";
```

Then change the `ai.authTokens.create(...)` call's `liveConnectConstraints.config` from:

```ts
				liveConnectConstraints: {
					model: LIVE_MODEL,
					config: {
						systemInstruction: { parts: [{ text: systemInstructions }] },
					},
				},
```

to:

```ts
				liveConnectConstraints: {
					model: LIVE_MODEL,
					config: {
						systemInstruction: { parts: [{ text: systemInstructions }] },
						// Setting liveConnectConstraints at all locks the whole
						// LiveConnectConfig for any session opened with this token — so
						// every field the client-side session needs (audio output,
						// both transcription streams) must be set here, not just left
						// for the browser's own connect() call to add later.
						responseModalities: [Modality.AUDIO],
						inputAudioTranscription: {},
						outputAudioTranscription: {},
					},
				},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/voice/ephemeralToken.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice/ephemeralToken.ts src/lib/voice/ephemeralToken.test.ts
git commit -m "fix(voice): lock audio modality and transcription into the ephemeral token"
```

---

### Task 2: Voice-mode design tokens and PresenceRing state

**Files:**

- Modify: `src/styles/global.css`
- Modify: `src/components/ui/PresenceRing.astro`
- Modify: `src/lib/chat/presenceRingBridge.ts`
- Test: `src/lib/chat/presenceRingBridge.test.ts` (new file — none exists yet for this module)

**Interfaces:**

- Produces: `setVoiceMode(active: boolean): void`, `setVoicePulseRate(level: number): void` — exported from `presenceRingBridge.ts`, consumed by Task 7's hook.

- [ ] **Step 1: Add the design tokens**

In `src/styles/global.css`, find the existing token block (it has `--color-void`, `--color-deep-blue`, `--color-electric-blue`, `--color-electric-blue-soft`, `--color-signal-cyan`, `--color-ion`, `--color-slate-mist`, `--color-slate-mist-strong`, then `--shadow-glow-blue`, `--shadow-glow-blue-lg`, `--shadow-glow-cyan`). Add two new lines immediately after `--color-signal-cyan` and after `--shadow-glow-cyan` respectively:

```css
--color-voice-violet: #a78bfa;
```

```css
--shadow-glow-violet: 0 0 24px 2px rgb(167 139 250 / 0.35);
```

- [ ] **Step 2: Write the failing test for the bridge functions**

Create `src/lib/chat/presenceRingBridge.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import {
	setPresenceState,
	setVoiceMode,
	setVoicePulseRate,
} from "./presenceRingBridge";

function renderRing(): HTMLDivElement {
	const div = document.createElement("div");
	div.className = "presence-ring";
	div.dataset.state = "idle";
	document.body.appendChild(div);
	return div;
}

afterEach(() => {
	document.body.innerHTML = "";
});

describe("setPresenceState", () => {
	it("sets data-state on the presence ring", () => {
		const ring = renderRing();
		setPresenceState("listening");
		expect(ring.dataset.state).toBe("listening");
	});
});

describe("setVoiceMode", () => {
	it("sets data-voice to the given boolean, stringified", () => {
		const ring = renderRing();
		setVoiceMode(true);
		expect(ring.dataset.voice).toBe("true");
		setVoiceMode(false);
		expect(ring.dataset.voice).toBe("false");
	});

	it("does nothing if no ring is present", () => {
		expect(() => setVoiceMode(true)).not.toThrow();
	});
});

describe("setVoicePulseRate", () => {
	it("sets --pulse-rate faster (lower seconds) for a higher level", () => {
		const ring = renderRing();
		setVoicePulseRate(0);
		const quiet = ring.style.getPropertyValue("--pulse-rate");
		setVoicePulseRate(1);
		const loud = ring.style.getPropertyValue("--pulse-rate");
		expect(parseFloat(loud)).toBeLessThan(parseFloat(quiet));
	});

	it("never goes below the 0.5s floor", () => {
		const ring = renderRing();
		setVoicePulseRate(1);
		expect(
			parseFloat(ring.style.getPropertyValue("--pulse-rate")),
		).toBeGreaterThanOrEqual(0.5);
	});

	it("does nothing if no ring is present", () => {
		expect(() => setVoicePulseRate(0.5)).not.toThrow();
	});
});
```

- [ ] **Step 2b: Move the existing setPresenceState import sites check**

Run: `pnpm vitest run src/lib/chat/presenceRingBridge.test.ts`
Expected: The `setPresenceState` tests PASS already (function exists); the `setVoiceMode`/`setVoicePulseRate` tests FAIL — those exports don't exist yet.

- [ ] **Step 3: Add the two new bridge functions**

In `src/lib/chat/presenceRingBridge.ts`, add below the existing `setPresenceState`:

```ts
export function setVoiceMode(active: boolean): void {
	if (typeof document === "undefined") return;
	document
		.querySelector(".presence-ring")
		?.setAttribute("data-voice", String(active));
}

/** level: 0-1 output amplitude. Only meaningful while the ring is in the
 * "speaking" state — the caller is responsible for only calling this then. */
export function setVoicePulseRate(level: number): void {
	if (typeof document === "undefined") return;
	const ring = document.querySelector<HTMLElement>(".presence-ring");
	if (!ring) return;
	const seconds = 1.1 - level * 0.6;
	ring.style.setProperty("--pulse-rate", `${Math.max(seconds, 0.5)}s`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/chat/presenceRingBridge.test.ts`
Expected: PASS (all cases)

- [ ] **Step 5: Wire the CSS into `PresenceRing.astro`**

In `src/components/ui/PresenceRing.astro`, find the `.ping` rule:

```css
.ping {
	position: absolute;
	inset: 0;
	border-radius: 9999px;
	border: 1px solid var(--color-electric-blue);
	opacity: 0;
	animation: ping-out 3.2s cubic-bezier(0.2, 0.7, 0.3, 1) infinite;
}
```

Change its `animation` line to fall back to the existing fixed duration when `--pulse-rate` isn't set:

```css
animation: ping-out var(--pulse-rate, 3.2s) cubic-bezier(0.2, 0.7, 0.3, 1)
	infinite;
```

Then find the "Speaking" block:

```css
.presence-ring[data-state="speaking"] .ping {
	animation-duration: 1.1s;
}
```

Change it to respect `--pulse-rate` when set (voice mode), otherwise keep the existing fixed `1.1s`:

```css
.presence-ring[data-state="speaking"] .ping {
	animation-duration: var(--pulse-rate, 1.1s);
}
```

Finally, add a new rule at the end of the `<style>` block for the voice-mode color, layered independently of `data-state`:

```css
/* Voice mode: distinct color for the whole call, independent of idle/listening/speaking */
.presence-ring[data-voice="true"] .core {
	background: radial-gradient(
		circle at 35% 30%,
		var(--color-voice-violet),
		var(--color-deep-blue) 70%
	);
	box-shadow: var(--shadow-glow-violet);
}
```

- [ ] **Step 6: Manual visual check**

Run: `astro dev --background`, then in a browser console on the Main page run:

```js
document.querySelector(".presence-ring").dataset.voice = "true";
```

Expected: the ring's core shifts to a violet gradient/glow. Then:

```js
document.querySelector(".presence-ring").dataset.voice = "false";
```

Expected: reverts to the normal idle color. Run `astro dev stop` after.

- [ ] **Step 7: Commit**

```bash
git add src/styles/global.css src/components/ui/PresenceRing.astro src/lib/chat/presenceRingBridge.ts src/lib/chat/presenceRingBridge.test.ts
git commit -m "feat(voice): add PresenceRing voice-mode color and output-amplitude pulse rate"
```

---

### Task 3: Voice UI copy + fix the stale Phase-3 hero tagline

**Files:**

- Modify: `src/i18n/dictionary.ts`
- Modify: `src/i18n/dictionaries/en.ts`
- Modify: `src/i18n/dictionaries/es.ts`
- Modify: `src/i18n/dictionaries/fr.ts`

**Interfaces:**

- Produces: `Dictionary["chat"]["voice"]` block, consumed by Task 9's `ChatWidget`/`VoiceVisor` wiring.

- [ ] **Step 1: Extend the `Dictionary` type**

In `src/i18n/dictionary.ts`, inside the `chat` block, change:

```ts
	chat: {
		inputPlaceholder: string;
		send: string;
		voiceComingSoon: string;
		thinking: string;
```

to:

```ts
	chat: {
		inputPlaceholder: string;
		send: string;
		voiceComingSoon: string;
		voiceStart: string;
		voiceEndCall: string;
		voiceConnecting: string;
		voiceErrorGeneric: string;
		voiceMicDenied: string;
		thinking: string;
```

- [ ] **Step 2: Run typecheck to confirm the three dictionaries now fail**

Run: `pnpm typecheck`
Expected: FAIL — `en.ts`/`es.ts`/`fr.ts`'s default exports no longer satisfy `Dictionary` (missing the new `chat` fields).

- [ ] **Step 3: Fill in English**

In `src/i18n/dictionaries/en.ts`, change the `home.tagline` line:

```ts
		tagline:
			"Ask me anything about my work, background, or projects — the conversational interface lands here in Phase 3.",
```

to:

```ts
		tagline: "Ask me anything about my work, background, or projects.",
```

Then in the `chat` block, change `voiceComingSoon: "Voice chat (coming soon)",` to add the new fields right after it:

```ts
		voiceComingSoon: "Voice chat (coming soon)",
		voiceStart: "Start voice chat",
		voiceEndCall: "End call",
		voiceConnecting: "Connecting...",
		voiceErrorGeneric: "The voice session couldn't connect. Please try text chat instead.",
		voiceMicDenied: "Microphone access was denied. You can still use text chat.",
```

- [ ] **Step 4: Fill in Spanish**

In `src/i18n/dictionaries/es.ts`, change the `home.tagline` line:

```ts
		tagline:
			"Pregúntame lo que quieras sobre mi trabajo, trayectoria o proyectos — la interfaz conversacional llega en la Fase 3.",
```

to:

```ts
		tagline: "Pregúntame lo que quieras sobre mi trabajo, trayectoria o proyectos.",
```

Then in the `chat` block, after `voiceComingSoon: "Chat de voz (próximamente)",` add:

```ts
		voiceComingSoon: "Chat de voz (próximamente)",
		voiceStart: "Iniciar chat de voz",
		voiceEndCall: "Finalizar llamada",
		voiceConnecting: "Conectando...",
		voiceErrorGeneric: "No se pudo conectar la sesión de voz. Prueba con el chat de texto.",
		voiceMicDenied: "Se denegó el acceso al micrófono. Aún puedes usar el chat de texto.",
```

- [ ] **Step 5: Fill in French**

In `src/i18n/dictionaries/fr.ts`, change the `home.tagline` line:

```ts
		tagline:
			"Posez-moi vos questions sur mon travail, mon parcours ou mes projets — l'interface conversationnelle arrive en Phase 3.",
```

to:

```ts
		tagline: "Posez-moi vos questions sur mon travail, mon parcours ou mes projets.",
```

Then in the `chat` block, after `voiceComingSoon: "Chat vocal (bientôt disponible)",` add:

```ts
		voiceComingSoon: "Chat vocal (bientôt disponible)",
		voiceStart: "Démarrer le chat vocal",
		voiceEndCall: "Terminer l'appel",
		voiceConnecting: "Connexion...",
		voiceErrorGeneric: "La session vocale n'a pas pu se connecter. Essayez le chat texte.",
		voiceMicDenied: "L'accès au microphone a été refusé. Vous pouvez toujours utiliser le chat texte.",
```

- [ ] **Step 6: Run typecheck to verify it passes**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 7: Run the full suite to confirm no test hardcodes the old tagline**

Run: `pnpm vitest run`
Expected: all existing tests still pass (the tagline isn't asserted on by any current test, but this confirms it).

- [ ] **Step 8: Commit**

```bash
git add src/i18n/dictionary.ts src/i18n/dictionaries/en.ts src/i18n/dictionaries/es.ts src/i18n/dictionaries/fr.ts
git commit -m "feat(voice): add voice UI copy, fix stale Phase-3 hero tagline in all locales"
```

---

### Task 4: Audio helper functions (PCM, base64, levels, bar heights)

Pure, dependency-free functions — the only part of the audio pipeline that's fully unit-testable without mocking Web Audio APIs.

**Files:**

- Create: `src/lib/voice/audioUtils.ts`
- Test: `src/lib/voice/audioUtils.test.ts`

**Interfaces:**

- Produces: `floatTo16BitPCM`, `int16ToBase64`, `base64ToInt16`, `int16ToFloat32`, `computeRmsLevel`, `computeBarHeights` — all consumed by Task 6 (`liveSession.ts`), Task 7 (`useVoiceSession.ts`), and Task 8 (`VoiceVisor.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/voice/audioUtils.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	base64ToInt16,
	computeBarHeights,
	computeRmsLevel,
	floatTo16BitPCM,
	int16ToBase64,
	int16ToFloat32,
} from "./audioUtils";

describe("floatTo16BitPCM", () => {
	it("converts full-scale float samples to full-scale int16", () => {
		const result = floatTo16BitPCM(new Float32Array([1, -1, 0]));
		expect(result[0]).toBe(0x7fff);
		expect(result[1]).toBe(-0x8000);
		expect(result[2]).toBe(0);
	});

	it("clamps out-of-range input", () => {
		const result = floatTo16BitPCM(new Float32Array([2, -2]));
		expect(result[0]).toBe(0x7fff);
		expect(result[1]).toBe(-0x8000);
	});
});

describe("int16ToBase64 / base64ToInt16", () => {
	it("round-trips a sample buffer", () => {
		const original = new Int16Array([0, 1, -1, 12345, -12345, 32767, -32768]);
		const roundTripped = base64ToInt16(int16ToBase64(original));
		expect(Array.from(roundTripped)).toEqual(Array.from(original));
	});
});

describe("int16ToFloat32", () => {
	it("converts full-scale int16 back to approximately full-scale float", () => {
		const result = int16ToFloat32(new Int16Array([32767, -32768, 0]));
		expect(result[0]).toBeCloseTo(1, 3);
		expect(result[1]).toBeCloseTo(-1, 3);
		expect(result[2]).toBe(0);
	});
});

describe("computeRmsLevel", () => {
	it("returns 0 for silence", () => {
		expect(computeRmsLevel(new Uint8Array(8))).toBe(0);
	});

	it("returns 1 for full-scale data", () => {
		expect(computeRmsLevel(new Uint8Array(8).fill(255))).toBe(1);
	});

	it("returns a value between 0 and 1 for partial data", () => {
		const level = computeRmsLevel(new Uint8Array(8).fill(128));
		expect(level).toBeGreaterThan(0);
		expect(level).toBeLessThan(1);
	});
});

describe("computeBarHeights", () => {
	it("returns exactly barCount heights, each 0-1", () => {
		const data = new Uint8Array(256).fill(128);
		const heights = computeBarHeights(data, 24);
		expect(heights).toHaveLength(24);
		heights.forEach((h) => {
			expect(h).toBeGreaterThanOrEqual(0);
			expect(h).toBeLessThanOrEqual(1);
		});
	});

	it("maps full-scale frequency data to full-scale bars", () => {
		const data = new Uint8Array(240).fill(255);
		const heights = computeBarHeights(data, 24);
		heights.forEach((h) => expect(h).toBe(1));
	});

	it("maps silence to zero-height bars", () => {
		const data = new Uint8Array(240).fill(0);
		const heights = computeBarHeights(data, 24);
		heights.forEach((h) => expect(h).toBe(0));
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/voice/audioUtils.test.ts`
Expected: FAIL — module `./audioUtils` does not exist.

- [ ] **Step 3: Implement it**

Create `src/lib/voice/audioUtils.ts`:

```ts
/** Converts float32 samples in [-1, 1] to 16-bit PCM, clamping out-of-range input. */
export function floatTo16BitPCM(input: Float32Array): Int16Array {
	const output = new Int16Array(input.length);
	for (let i = 0; i < input.length; i++) {
		const s = Math.max(-1, Math.min(1, input[i]));
		output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
	}
	return output;
}

/** Converts 16-bit PCM back to float32 samples in [-1, 1]. */
export function int16ToFloat32(pcm: Int16Array): Float32Array {
	const output = new Float32Array(pcm.length);
	for (let i = 0; i < pcm.length; i++) {
		output[i] = pcm[i] / (pcm[i] < 0 ? 0x8000 : 0x7fff);
	}
	return output;
}

export function int16ToBase64(pcm: Int16Array): string {
	const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
	let binary = "";
	for (let i = 0; i < bytes.length; i++)
		binary += String.fromCharCode(bytes[i]);
	return btoa(binary);
}

export function base64ToInt16(base64: string): Int16Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return new Int16Array(bytes.buffer);
}

/** Root-mean-square level of byte-frequency data (0-255 per bin), normalized to 0-1. */
export function computeRmsLevel(frequencyData: Uint8Array): number {
	if (frequencyData.length === 0) return 0;
	let sumOfSquares = 0;
	for (let i = 0; i < frequencyData.length; i++) {
		sumOfSquares += frequencyData[i] * frequencyData[i];
	}
	const rms = Math.sqrt(sumOfSquares / frequencyData.length);
	return Math.min(rms / 255, 1);
}

/** Buckets byte-frequency data into `barCount` averaged, normalized (0-1) bar heights. */
export function computeBarHeights(
	frequencyData: Uint8Array,
	barCount: number,
): number[] {
	const bucketSize = Math.max(1, Math.floor(frequencyData.length / barCount));
	const heights: number[] = [];
	for (let i = 0; i < barCount; i++) {
		const start = i * bucketSize;
		const end = Math.min(start + bucketSize, frequencyData.length);
		let sum = 0;
		for (let j = start; j < end; j++) sum += frequencyData[j];
		const average = end > start ? sum / (end - start) : 0;
		heights.push(Math.min(average / 255, 1));
	}
	return heights;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/voice/audioUtils.test.ts`
Expected: PASS (all cases)

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice/audioUtils.ts src/lib/voice/audioUtils.test.ts
git commit -m "feat(voice): add audio PCM/base64/level pure helper functions"
```

---

### Task 5: Voice API client (token mint + turn persistence fetch wrappers)

**Files:**

- Create: `src/lib/voice/voiceApi.ts`
- Test: `src/lib/voice/voiceApi.test.ts`

**Interfaces:**

- Consumes: nothing beyond global `fetch`.
- Produces:

  ```ts
  interface VoiceTokenResponse {
  	token: string;
  	expiresAt: string;
  	model: string;
  }
  function mintVoiceToken(language: string): Promise<VoiceTokenResponse>; // throws on failure
  interface PersistVoiceTurnOptions {
  	persist: boolean;
  	conversationId?: string;
  	userText: string;
  	modelText: string;
  }
  interface PersistVoiceTurnResult {
  	conversationId?: string;
  }
  function persistVoiceTurn(
  	options: PersistVoiceTurnOptions,
  ): Promise<PersistVoiceTurnResult>; // degrades to {} on failure, never throws
  ```

  Both consumed by Task 7's `useVoiceSession.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/voice/voiceApi.test.ts` (mirrors `src/lib/chat/historyApi.ts`'s degrade-on-failure style, but `mintVoiceToken` throws instead — a failed token mint must abort the connect attempt, not silently continue with no token):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mintVoiceToken, persistVoiceTurn } from "./voiceApi";

const originalFetch = global.fetch;

beforeEach(() => {
	global.fetch = originalFetch;
});

describe("mintVoiceToken", () => {
	it("returns the parsed token response on success", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				token: "t",
				expiresAt: "2026-01-01T00:00:00.000Z",
				model: "m",
			}),
		}) as unknown as typeof fetch;

		const result = await mintVoiceToken("EN");

		expect(result).toEqual({
			token: "t",
			expiresAt: "2026-01-01T00:00:00.000Z",
			model: "m",
		});
		expect(global.fetch).toHaveBeenCalledWith(
			"/api/voice/token",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ language: "EN" }),
			}),
		);
	});

	it("throws on a non-ok response", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValue({ ok: false, status: 429 }) as unknown as typeof fetch;

		await expect(mintVoiceToken("EN")).rejects.toThrow();
	});

	it("throws when fetch itself rejects", async () => {
		global.fetch = vi
			.fn()
			.mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

		await expect(mintVoiceToken("EN")).rejects.toThrow();
	});
});

describe("persistVoiceTurn", () => {
	it("returns the parsed result on success", async () => {
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ conversationId: "c1" }),
		}) as unknown as typeof fetch;

		const result = await persistVoiceTurn({
			persist: true,
			conversationId: "c1",
			userText: "Hi",
			modelText: "Hello",
		});

		expect(result).toEqual({ conversationId: "c1" });
	});

	it("degrades to an empty object on a non-ok response, without throwing", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;

		await expect(
			persistVoiceTurn({ persist: true, userText: "Hi", modelText: "Hello" }),
		).resolves.toEqual({});
	});

	it("degrades to an empty object when fetch itself rejects, without throwing", async () => {
		global.fetch = vi
			.fn()
			.mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

		await expect(
			persistVoiceTurn({ persist: false, userText: "Hi", modelText: "Hello" }),
		).resolves.toEqual({});
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/voice/voiceApi.test.ts`
Expected: FAIL — module `./voiceApi` does not exist.

- [ ] **Step 3: Implement it**

Create `src/lib/voice/voiceApi.ts`:

```ts
export interface VoiceTokenResponse {
	token: string;
	expiresAt: string;
	model: string;
}

/** Mints a Live API ephemeral token. Throws on failure — a failed mint must
 * abort the connect attempt in useVoiceSession, not silently proceed. */
export async function mintVoiceToken(
	language: string,
): Promise<VoiceTokenResponse> {
	const response = await fetch("/api/voice/token", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ language }),
	});
	if (!response.ok) {
		throw new Error(`Voice token request failed (${response.status})`);
	}
	return (await response.json()) as VoiceTokenResponse;
}

export interface PersistVoiceTurnOptions {
	persist: boolean;
	conversationId?: string;
	userText: string;
	modelText: string;
}

export interface PersistVoiceTurnResult {
	conversationId?: string;
}

/** Persists a completed voice turn. Degrades to {} on any failure — a failed
 * write shouldn't disrupt a session the visitor is still actively using. */
export async function persistVoiceTurn(
	options: PersistVoiceTurnOptions,
): Promise<PersistVoiceTurnResult> {
	try {
		const response = await fetch("/api/voice/turn", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(options),
		});
		if (!response.ok) return {};
		return (await response.json()) as PersistVoiceTurnResult;
	} catch {
		return {};
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/voice/voiceApi.test.ts`
Expected: PASS (all cases)

- [ ] **Step 5: Commit**

```bash
git add src/lib/voice/voiceApi.ts src/lib/voice/voiceApi.test.ts
git commit -m "feat(voice): add mintVoiceToken/persistVoiceTurn fetch wrappers"
```

---

### Task 6: Live API session wrapper (`liveSession.ts`)

The only file that touches the raw Web Audio API and the `@google/genai` browser `Live` client. Everything here is real, verified-against-the-installed-SDK code — see the `.d.ts` reading that grounded this plan: `ai.live.connect({ model, config, callbacks })` returns a `Session` with `sendRealtimeInput({ audio: { data, mimeType } })` and `close()`; server messages arrive via `callbacks.onmessage(message: LiveServerMessage)`, where `message.serverContent` carries `inputTranscription`/`outputTranscription` (each `{ text?: string }`), `modelTurn` (a `Content` whose `parts` carry `inlineData: { data: string /* base64 PCM */ }` for audio), and `turnComplete: boolean`.

**Files:**

- Create: `src/lib/voice/liveSession.ts`
- Test: `src/lib/voice/liveSession.test.ts`

**Interfaces:**

- Consumes: `floatTo16BitPCM`, `int16ToBase64`, `base64ToInt16`, `int16ToFloat32` from `./audioUtils` (Task 4).
- Produces:

  ```ts
  interface LiveSessionCallbacks {
  	onOpen?: () => void;
  	onClose?: (reason?: string) => void;
  	onError?: (error: unknown) => void;
  	onSpeakingChange: (speaking: boolean) => void;
  	onTurnComplete: (turn: { userText: string; modelText: string }) => void;
  }
  interface StartLiveSessionOptions {
  	token: string;
  	model: string;
  	callbacks: LiveSessionCallbacks;
  }
  interface LiveSessionDeps {
  	genAiFactory?: (apiKey: string) => {
  		live: { connect(params: unknown): Promise<LiveSessionLike> };
  	};
  	getUserMedia?: (
  		constraints: MediaStreamConstraints,
  	) => Promise<MediaStream>;
  	audioContextFactory?: (options?: { sampleRate: number }) => AudioContext;
  }
  interface LiveSession {
  	micAnalyser: AnalyserNode;
  	outputAnalyser: AnalyserNode;
  	close: () => void;
  }
  function startLiveSession(
  	options: StartLiveSessionOptions,
  	deps?: LiveSessionDeps,
  ): Promise<LiveSession>;
  ```

  Consumed by Task 7's `useVoiceSession.ts`. `micAnalyser` is consumed directly by Task 8's `VoiceVisor.tsx` (passed through the hook's return value).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/voice/liveSession.test.ts`. This test suite fakes the entire Web Audio API surface `liveSession.ts` touches — every method below is exactly what the implementation (Step 3) calls, so build the fakes first and keep them in sync as you write the real code:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startLiveSession } from "./liveSession";

function createFakeAnalyser() {
	return {
		fftSize: 0,
		frequencyBinCount: 128,
		connect: vi.fn(),
		disconnect: vi.fn(),
		getByteFrequencyData: vi.fn(),
	};
}

function createFakeAudioContext() {
	const analysers: ReturnType<typeof createFakeAnalyser>[] = [];
	const context = {
		currentTime: 0,
		destination: {},
		createMediaStreamSource: vi.fn(() => ({
			connect: vi.fn(),
			disconnect: vi.fn(),
		})),
		createAnalyser: vi.fn(() => {
			const analyser = createFakeAnalyser();
			analysers.push(analyser);
			return analyser;
		}),
		createScriptProcessor: vi.fn(() => ({
			connect: vi.fn(),
			disconnect: vi.fn(),
			onaudioprocess: null as ((event: unknown) => void) | null,
		})),
		createBuffer: vi.fn(() => ({
			duration: 0.1,
			copyToChannel: vi.fn(),
		})),
		createBufferSource: vi.fn(() => ({
			buffer: null,
			connect: vi.fn(),
			start: vi.fn(),
		})),
		close: vi.fn(),
	};
	return { context, analysers };
}

function createFakeMediaStream() {
	return {
		getTracks: vi.fn(() => [{ stop: vi.fn() }]),
	} as unknown as MediaStream;
}

describe("startLiveSession", () => {
	let liveCallbacks: {
		onopen?: () => void;
		onerror?: (e: unknown) => void;
		onclose?: (e: unknown) => void;
		onmessage?: (message: unknown) => void;
	};
	let fakeSession: {
		sendRealtimeInput: ReturnType<typeof vi.fn>;
		close: ReturnType<typeof vi.fn>;
	};
	let connect: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		liveCallbacks = {};
		fakeSession = { sendRealtimeInput: vi.fn(), close: vi.fn() };
		connect = vi.fn((params: { callbacks: typeof liveCallbacks }) => {
			liveCallbacks = params.callbacks;
			return Promise.resolve(fakeSession);
		});
	});

	function baseDeps() {
		const input = createFakeAudioContext();
		const output = createFakeAudioContext();
		const contexts = [input.context, output.context];
		return {
			genAiFactory: vi.fn(() => ({ live: { connect } })),
			getUserMedia: vi.fn().mockResolvedValue(createFakeMediaStream()),
			audioContextFactory: vi.fn(
				() => contexts.shift() as unknown as AudioContext,
			),
			input,
			output,
		};
	}

	it("connects with the given token/model and calls onOpen when the socket opens", async () => {
		const deps = baseDeps();
		const onOpen = vi.fn();

		await startLiveSession(
			{
				token: "tok",
				model: "m",
				callbacks: {
					onOpen,
					onSpeakingChange: vi.fn(),
					onTurnComplete: vi.fn(),
				},
			},
			deps,
		);

		expect(deps.genAiFactory).toHaveBeenCalledWith("tok");
		expect(connect).toHaveBeenCalledWith(
			expect.objectContaining({ model: "m" }),
		);
		liveCallbacks.onopen?.();
		expect(onOpen).toHaveBeenCalledTimes(1);
	});

	it("streams mic PCM via sendRealtimeInput on each audio-process tick", async () => {
		const deps = baseDeps();
		await startLiveSession(
			{
				token: "tok",
				model: "m",
				callbacks: { onSpeakingChange: vi.fn(), onTurnComplete: vi.fn() },
			},
			deps,
		);

		const processor = deps.input.context.createScriptProcessor.mock.results[0]
			.value as {
			onaudioprocess: (event: unknown) => void;
		};
		processor.onaudioprocess({
			inputBuffer: { getChannelData: () => new Float32Array([0.5, -0.5, 0]) },
		});

		expect(fakeSession.sendRealtimeInput).toHaveBeenCalledWith(
			expect.objectContaining({
				audio: expect.objectContaining({ mimeType: "audio/pcm;rate=16000" }),
			}),
		);
	});

	it("accumulates transcription and calls onTurnComplete once turnComplete arrives", async () => {
		const deps = baseDeps();
		const onTurnComplete = vi.fn();
		const onSpeakingChange = vi.fn();

		await startLiveSession(
			{
				token: "tok",
				model: "m",
				callbacks: { onSpeakingChange, onTurnComplete },
			},
			deps,
		);

		liveCallbacks.onmessage?.({
			serverContent: { inputTranscription: { text: "Hello " } },
		});
		liveCallbacks.onmessage?.({
			serverContent: { inputTranscription: { text: "there" } },
		});
		liveCallbacks.onmessage?.({
			serverContent: { outputTranscription: { text: "Hi!" } },
		});
		liveCallbacks.onmessage?.({
			serverContent: { turnComplete: true },
		});

		expect(onTurnComplete).toHaveBeenCalledWith({
			userText: "Hello there",
			modelText: "Hi!",
		});
	});

	it("calls onSpeakingChange(true) on the first audio chunk of a turn, then (false) at turnComplete", async () => {
		const deps = baseDeps();
		const onSpeakingChange = vi.fn();

		await startLiveSession(
			{
				token: "tok",
				model: "m",
				callbacks: { onSpeakingChange, onTurnComplete: vi.fn() },
			},
			deps,
		);

		liveCallbacks.onmessage?.({
			serverContent: {
				modelTurn: { parts: [{ inlineData: { data: "AAAA" } }] },
			},
		});
		expect(onSpeakingChange).toHaveBeenCalledWith(true);

		liveCallbacks.onmessage?.({ serverContent: { turnComplete: true } });
		expect(onSpeakingChange).toHaveBeenCalledWith(false);
	});

	it("does not call onTurnComplete when a turn has no transcript text at all", async () => {
		const deps = baseDeps();
		const onTurnComplete = vi.fn();

		await startLiveSession(
			{
				token: "tok",
				model: "m",
				callbacks: { onSpeakingChange: vi.fn(), onTurnComplete },
			},
			deps,
		);

		liveCallbacks.onmessage?.({ serverContent: { turnComplete: true } });

		expect(onTurnComplete).not.toHaveBeenCalled();
	});

	it("close() stops mic tracks, disconnects nodes, closes both contexts, and closes the session", async () => {
		const deps = baseDeps();
		const mediaStream = createFakeMediaStream();
		deps.getUserMedia.mockResolvedValue(mediaStream);

		const session = await startLiveSession(
			{
				token: "tok",
				model: "m",
				callbacks: { onSpeakingChange: vi.fn(), onTurnComplete: vi.fn() },
			},
			deps,
		);
		session.close();

		expect(
			(mediaStream.getTracks() as { stop: ReturnType<typeof vi.fn> }[])[0].stop,
		).toBeDefined();
		expect(deps.input.context.close).toHaveBeenCalledTimes(1);
		expect(deps.output.context.close).toHaveBeenCalledTimes(1);
		expect(fakeSession.close).toHaveBeenCalledTimes(1);
	});

	it("exposes micAnalyser and outputAnalyser on the returned session", async () => {
		const deps = baseDeps();

		const session = await startLiveSession(
			{
				token: "tok",
				model: "m",
				callbacks: { onSpeakingChange: vi.fn(), onTurnComplete: vi.fn() },
			},
			deps,
		);

		expect(session.micAnalyser).toBeDefined();
		expect(session.outputAnalyser).toBeDefined();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/voice/liveSession.test.ts`
Expected: FAIL — module `./liveSession` does not exist.

- [ ] **Step 3: Implement it**

Create `src/lib/voice/liveSession.ts`:

```ts
import { GoogleGenAI, Modality } from "@google/genai";
import {
	base64ToInt16,
	floatTo16BitPCM,
	int16ToBase64,
	int16ToFloat32,
} from "./audioUtils";

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
// Larger buffers reduce message-send frequency at the cost of latency; 4096
// samples at 16kHz is ~256ms per chunk, a reasonable balance for voice chat.
const CAPTURE_BUFFER_SIZE = 4096;

export interface LiveSessionCallbacks {
	onOpen?: () => void;
	onClose?: (reason?: string) => void;
	onError?: (error: unknown) => void;
	onSpeakingChange: (speaking: boolean) => void;
	onTurnComplete: (turn: { userText: string; modelText: string }) => void;
}

export interface StartLiveSessionOptions {
	token: string;
	model: string;
	callbacks: LiveSessionCallbacks;
}

interface LiveSessionLike {
	sendRealtimeInput(params: {
		audio: { data: string; mimeType: string };
	}): void;
	close(): void;
}

export interface LiveSessionDeps {
	genAiFactory?: (apiKey: string) => {
		live: { connect(params: unknown): Promise<LiveSessionLike> };
	};
	getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
	audioContextFactory?: (options?: { sampleRate: number }) => AudioContext;
}

export interface LiveSession {
	micAnalyser: AnalyserNode;
	outputAnalyser: AnalyserNode;
	close: () => void;
}

function defaultGenAiFactory(apiKey: string) {
	return new GoogleGenAI({ apiKey });
}

function defaultGetUserMedia(constraints: MediaStreamConstraints) {
	return navigator.mediaDevices.getUserMedia(constraints);
}

function defaultAudioContextFactory(options?: { sampleRate: number }) {
	return new AudioContext(options);
}

interface ServerContentPart {
	inlineData?: { data?: string };
}

interface ServerMessage {
	serverContent?: {
		inputTranscription?: { text?: string };
		outputTranscription?: { text?: string };
		modelTurn?: { parts?: ServerContentPart[] };
		turnComplete?: boolean;
	};
}

export async function startLiveSession(
	options: StartLiveSessionOptions,
	deps: LiveSessionDeps = {},
): Promise<LiveSession> {
	const {
		genAiFactory = defaultGenAiFactory,
		getUserMedia = defaultGetUserMedia,
		audioContextFactory = defaultAudioContextFactory,
	} = deps;

	const micStream = await getUserMedia({ audio: true });

	const inputContext = audioContextFactory({ sampleRate: INPUT_SAMPLE_RATE });
	const outputContext = audioContextFactory({ sampleRate: OUTPUT_SAMPLE_RATE });

	const micSource = inputContext.createMediaStreamSource(micStream);
	const micAnalyser = inputContext.createAnalyser();
	micAnalyser.fftSize = 256;
	micSource.connect(micAnalyser);

	const outputAnalyser = outputContext.createAnalyser();
	outputAnalyser.fftSize = 256;
	outputAnalyser.connect(outputContext.destination);

	let nextPlaybackTime = 0;
	let currentUserText = "";
	let currentModelText = "";
	let turnHasAudio = false;

	function playPcmChunk(base64Data: string) {
		const pcm = base64ToInt16(base64Data);
		const float32 = int16ToFloat32(pcm);
		const buffer = outputContext.createBuffer(
			1,
			float32.length,
			OUTPUT_SAMPLE_RATE,
		);
		buffer.copyToChannel(float32, 0);

		const source = outputContext.createBufferSource();
		source.buffer = buffer;
		source.connect(outputAnalyser);

		const startAt = Math.max(nextPlaybackTime, outputContext.currentTime);
		source.start(startAt);
		nextPlaybackTime = startAt + buffer.duration;
	}

	const ai = genAiFactory(options.token);
	const session = await ai.live.connect({
		model: options.model,
		config: { responseModalities: [Modality.AUDIO] },
		callbacks: {
			onopen: () => options.callbacks.onOpen?.(),
			onerror: (e: unknown) => options.callbacks.onError?.(e),
			onclose: (e: { reason?: string }) =>
				options.callbacks.onClose?.(e?.reason),
			onmessage: (message: ServerMessage) => {
				const content = message.serverContent;
				if (!content) return;

				if (content.inputTranscription?.text) {
					currentUserText += content.inputTranscription.text;
				}
				if (content.outputTranscription?.text) {
					currentModelText += content.outputTranscription.text;
				}

				const audioPart = content.modelTurn?.parts?.find(
					(part) => part.inlineData?.data,
				);
				if (audioPart?.inlineData?.data) {
					if (!turnHasAudio) {
						turnHasAudio = true;
						options.callbacks.onSpeakingChange(true);
					}
					playPcmChunk(audioPart.inlineData.data);
				}

				if (content.turnComplete) {
					const userText = currentUserText.trim();
					const modelText = currentModelText.trim();
					currentUserText = "";
					currentModelText = "";
					if (turnHasAudio) {
						turnHasAudio = false;
						options.callbacks.onSpeakingChange(false);
					}
					if (userText || modelText) {
						options.callbacks.onTurnComplete({ userText, modelText });
					}
				}
			},
		},
	});

	const processor = inputContext.createScriptProcessor(
		CAPTURE_BUFFER_SIZE,
		1,
		1,
	);
	micSource.connect(processor);
	processor.connect(inputContext.destination);
	processor.onaudioprocess = (event: AudioProcessingEvent) => {
		const input = event.inputBuffer.getChannelData(0);
		const pcm = floatTo16BitPCM(input);
		session.sendRealtimeInput({
			audio: {
				data: int16ToBase64(pcm),
				mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
			},
		});
	};

	const close = () => {
		processor.disconnect();
		micSource.disconnect();
		micStream.getTracks().forEach((track) => track.stop());
		inputContext.close();
		outputContext.close();
		session.close();
	};

	return { micAnalyser, outputAnalyser, close };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/voice/liveSession.test.ts`
Expected: PASS (all cases). If a test fails because a fake method wasn't called the way the implementation calls it (e.g. argument shape mismatch), fix the implementation to match the documented `@google/genai` API — do not weaken the test to match a wrong implementation.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors. `ScriptProcessorNode`/`AudioProcessingEvent` are standard lib.dom types; no extra type packages needed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/voice/liveSession.ts src/lib/voice/liveSession.test.ts
git commit -m "feat(voice): add Live API session wrapper (mic capture, playback, transcription)"
```

---

### Task 7: `useVoiceSession` React hook

**Files:**

- Create: `src/lib/voice/useVoiceSession.ts`
- Test: `src/lib/voice/useVoiceSession.test.ts`

**Interfaces:**

- Consumes: `startLiveSession`, `type LiveSession` from `./liveSession` (Task 6); `mintVoiceToken`, `persistVoiceTurn` from `./voiceApi` (Task 5); `computeRmsLevel` from `./audioUtils` (Task 4); `setPresenceState` (pre-existing), `setVoiceMode`, `setVoicePulseRate` from `../chat/presenceRingBridge` (Task 2).
- Produces:

  ```ts
  type VoiceStatus = "idle" | "connecting" | "listening" | "speaking" | "error";
  interface UseVoiceSessionOptions {
  	language: string;
  	persist: boolean;
  	conversationId: string | undefined;
  	onTurnPersisted: (turn: {
  		conversationId?: string;
  		userText: string;
  		modelText: string;
  	}) => void;
  	onError: (
  		messageKey: "voice_connection_failed" | "voice_mic_denied",
  	) => void;
  }
  interface UseVoiceSessionResult {
  	status: VoiceStatus;
  	micAnalyser: AnalyserNode | null;
  	start: () => void;
  	end: () => void;
  }
  function useVoiceSession(
  	options: UseVoiceSessionOptions,
  ): UseVoiceSessionResult;
  ```

  Consumed by Task 9's `ChatWidget.tsx`. `micAnalyser` is passed straight through to Task 8's `VoiceVisor`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/voice/useVoiceSession.test.ts`:

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./liveSession", () => ({
	startLiveSession: vi.fn(),
}));
vi.mock("./voiceApi", () => ({
	mintVoiceToken: vi.fn(),
	persistVoiceTurn: vi.fn(),
}));
vi.mock("../chat/presenceRingBridge", () => ({
	setPresenceState: vi.fn(),
	setVoiceMode: vi.fn(),
	setVoicePulseRate: vi.fn(),
}));

import { startLiveSession } from "./liveSession";
import { mintVoiceToken, persistVoiceTurn } from "./voiceApi";
import { setPresenceState, setVoiceMode } from "../chat/presenceRingBridge";
import { useVoiceSession } from "./useVoiceSession";

function fakeAnalyser() {
	return {
		frequencyBinCount: 8,
		getByteFrequencyData: vi.fn(),
	} as unknown as AnalyserNode;
}

function baseOptions() {
	return {
		language: "EN",
		persist: false,
		conversationId: undefined,
		onTurnPersisted: vi.fn(),
		onError: vi.fn(),
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(mintVoiceToken).mockResolvedValue({
		token: "t",
		expiresAt: "x",
		model: "m",
	});
	vi.mocked(persistVoiceTurn).mockResolvedValue({ conversationId: "c1" });
});

describe("useVoiceSession", () => {
	it("goes idle -> connecting -> listening on a successful start, and sets voice mode on", async () => {
		let capturedCallbacks:
			Parameters<typeof startLiveSession>[0]["callbacks"] | undefined;
		vi.mocked(startLiveSession).mockImplementation((opts) => {
			capturedCallbacks = opts.callbacks;
			return Promise.resolve({
				micAnalyser: fakeAnalyser(),
				outputAnalyser: fakeAnalyser(),
				close: vi.fn(),
			});
		});

		const { result } = renderHook(() => useVoiceSession(baseOptions()));
		expect(result.current.status).toBe("idle");

		act(() => result.current.start());
		await waitFor(() => expect(result.current.status).toBe("connecting"));

		act(() => capturedCallbacks?.onOpen?.());
		await waitFor(() => expect(result.current.status).toBe("listening"));

		expect(setVoiceMode).toHaveBeenCalledWith(true);
		expect(setPresenceState).toHaveBeenCalledWith("listening");
		expect(result.current.micAnalyser).not.toBeNull();
	});

	it("moves to speaking/listening as onSpeakingChange fires", async () => {
		let capturedCallbacks:
			Parameters<typeof startLiveSession>[0]["callbacks"] | undefined;
		vi.mocked(startLiveSession).mockImplementation((opts) => {
			capturedCallbacks = opts.callbacks;
			return Promise.resolve({
				micAnalyser: fakeAnalyser(),
				outputAnalyser: fakeAnalyser(),
				close: vi.fn(),
			});
		});

		const { result } = renderHook(() => useVoiceSession(baseOptions()));
		act(() => result.current.start());
		await waitFor(() => capturedCallbacks !== undefined);
		act(() => capturedCallbacks?.onOpen?.());

		act(() => capturedCallbacks?.onSpeakingChange(true));
		await waitFor(() => expect(result.current.status).toBe("speaking"));
		expect(setPresenceState).toHaveBeenCalledWith("speaking");

		act(() => capturedCallbacks?.onSpeakingChange(false));
		await waitFor(() => expect(result.current.status).toBe("listening"));
	});

	it("calls persistVoiceTurn and onTurnPersisted when a turn completes", async () => {
		let capturedCallbacks:
			Parameters<typeof startLiveSession>[0]["callbacks"] | undefined;
		vi.mocked(startLiveSession).mockImplementation((opts) => {
			capturedCallbacks = opts.callbacks;
			return Promise.resolve({
				micAnalyser: fakeAnalyser(),
				outputAnalyser: fakeAnalyser(),
				close: vi.fn(),
			});
		});
		const options = {
			...baseOptions(),
			persist: true,
			conversationId: "existing",
		};

		renderHook(() => useVoiceSession(options));
		await waitFor(() => capturedCallbacks !== undefined);

		await act(async () => {
			await capturedCallbacks?.onTurnComplete({
				userText: "Hi",
				modelText: "Hello",
			});
		});

		expect(persistVoiceTurn).toHaveBeenCalledWith({
			persist: true,
			conversationId: "existing",
			userText: "Hi",
			modelText: "Hello",
		});
		expect(options.onTurnPersisted).toHaveBeenCalledWith({
			conversationId: "c1",
			userText: "Hi",
			modelText: "Hello",
		});
	});

	it("goes to error and calls onError when the token mint fails", async () => {
		vi.mocked(mintVoiceToken).mockRejectedValue(new Error("mint failed"));
		const options = baseOptions();

		const { result } = renderHook(() => useVoiceSession(options));
		act(() => result.current.start());

		await waitFor(() => expect(result.current.status).toBe("error"));
		expect(options.onError).toHaveBeenCalledWith("voice_connection_failed");
		expect(startLiveSession).not.toHaveBeenCalled();
	});

	it("goes to error and calls onError with voice_mic_denied when startLiveSession rejects with a permission error", async () => {
		const permissionError = new DOMException(
			"Permission denied",
			"NotAllowedError",
		);
		vi.mocked(startLiveSession).mockRejectedValue(permissionError);
		const options = baseOptions();

		const { result } = renderHook(() => useVoiceSession(options));
		act(() => result.current.start());

		await waitFor(() => expect(result.current.status).toBe("error"));
		expect(options.onError).toHaveBeenCalledWith("voice_mic_denied");
	});

	it("reconnects once with a freshly minted token on an unexpected close, then falls back to error on a second failure", async () => {
		const closeA = vi.fn();
		const closeB = vi.fn();
		let callSequence: Parameters<typeof startLiveSession>[0]["callbacks"][] =
			[];
		vi.mocked(startLiveSession)
			.mockImplementationOnce((opts) => {
				callSequence.push(opts.callbacks);
				return Promise.resolve({
					micAnalyser: fakeAnalyser(),
					outputAnalyser: fakeAnalyser(),
					close: closeA,
				});
			})
			.mockImplementationOnce((opts) => {
				callSequence.push(opts.callbacks);
				return Promise.resolve({
					micAnalyser: fakeAnalyser(),
					outputAnalyser: fakeAnalyser(),
					close: closeB,
				});
			});
		const options = baseOptions();

		const { result } = renderHook(() => useVoiceSession(options));
		act(() => result.current.start());
		await waitFor(() => expect(callSequence).toHaveLength(1));
		act(() => callSequence[0].onOpen?.());
		await waitFor(() => expect(result.current.status).toBe("listening"));

		// Unexpected close (not triggered by end()) — should mint a fresh token
		// and reconnect once rather than immediately falling back to text.
		act(() => callSequence[0].onClose?.());
		await waitFor(() => expect(mintVoiceToken).toHaveBeenCalledTimes(2));
		await waitFor(() => expect(callSequence).toHaveLength(2));
		expect(closeA).toHaveBeenCalledTimes(0); // first session's own close() was never called — the server closed it
		expect(options.onError).not.toHaveBeenCalled();

		act(() => callSequence[1].onOpen?.());
		await waitFor(() => expect(result.current.status).toBe("listening"));

		// A second unexpected close after the one reconnect attempt: fall back for real.
		act(() => callSequence[1].onClose?.());
		await waitFor(() => expect(result.current.status).toBe("error"));
		expect(options.onError).toHaveBeenCalledWith("voice_connection_failed");
	});

	it("does not attempt to reconnect when the close was caused by end()", async () => {
		const close = vi.fn();
		let capturedCallbacks:
			Parameters<typeof startLiveSession>[0]["callbacks"] | undefined;
		vi.mocked(startLiveSession).mockImplementation((opts) => {
			capturedCallbacks = opts.callbacks;
			return Promise.resolve({
				micAnalyser: fakeAnalyser(),
				outputAnalyser: fakeAnalyser(),
				close,
			});
		});

		const { result } = renderHook(() => useVoiceSession(baseOptions()));
		act(() => result.current.start());
		await waitFor(() => capturedCallbacks !== undefined);
		act(() => capturedCallbacks?.onOpen?.());
		await waitFor(() => expect(result.current.status).toBe("listening"));

		act(() => result.current.end());
		// The real liveSession.close() call is what triggers the underlying
		// WebSocket's close event in production; simulate that here.
		act(() => capturedCallbacks?.onClose?.());

		expect(mintVoiceToken).toHaveBeenCalledTimes(1); // no second mint attempt
		expect(result.current.status).toBe("idle");
	});

	it("end() closes the session, clears voice mode, and returns to idle", async () => {
		const close = vi.fn();
		let capturedCallbacks:
			Parameters<typeof startLiveSession>[0]["callbacks"] | undefined;
		vi.mocked(startLiveSession).mockImplementation((opts) => {
			capturedCallbacks = opts.callbacks;
			return Promise.resolve({
				micAnalyser: fakeAnalyser(),
				outputAnalyser: fakeAnalyser(),
				close,
			});
		});

		const { result } = renderHook(() => useVoiceSession(baseOptions()));
		act(() => result.current.start());
		await waitFor(() => capturedCallbacks !== undefined);
		act(() => capturedCallbacks?.onOpen?.());
		await waitFor(() => expect(result.current.status).toBe("listening"));

		act(() => result.current.end());

		expect(close).toHaveBeenCalledTimes(1);
		expect(setVoiceMode).toHaveBeenCalledWith(false);
		expect(result.current.status).toBe("idle");
		expect(result.current.micAnalyser).toBeNull();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/voice/useVoiceSession.test.ts`
Expected: FAIL — module `./useVoiceSession` does not exist.

- [ ] **Step 3: Implement it**

Create `src/lib/voice/useVoiceSession.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { startLiveSession, type LiveSession } from "./liveSession";
import { mintVoiceToken, persistVoiceTurn } from "./voiceApi";
import { computeRmsLevel } from "./audioUtils";
import {
	setPresenceState,
	setVoiceMode,
	setVoicePulseRate,
} from "../chat/presenceRingBridge";

export type VoiceStatus =
	"idle" | "connecting" | "listening" | "speaking" | "error";

export interface UseVoiceSessionOptions {
	language: string;
	persist: boolean;
	conversationId: string | undefined;
	onTurnPersisted: (turn: {
		conversationId?: string;
		userText: string;
		modelText: string;
	}) => void;
	onError: (messageKey: "voice_connection_failed" | "voice_mic_denied") => void;
}

export interface UseVoiceSessionResult {
	status: VoiceStatus;
	micAnalyser: AnalyserNode | null;
	start: () => void;
	end: () => void;
}

// Anything below this output level is treated as silence for pulse-rate
// purposes, so the ring doesn't visibly jitter during near-silent gaps.
const OUTPUT_PULSE_THRESHOLD = 0.02;

function isPermissionError(error: unknown): boolean {
	return error instanceof DOMException && error.name === "NotAllowedError";
}

export function useVoiceSession(
	options: UseVoiceSessionOptions,
): UseVoiceSessionResult {
	const { language, onTurnPersisted, onError } = options;
	const [status, setStatus] = useState<VoiceStatus>("idle");
	const [micAnalyser, setMicAnalyser] = useState<AnalyserNode | null>(null);
	const sessionRef = useRef<LiveSession | null>(null);
	const rafRef = useRef<number | null>(null);
	const persistRef = useRef(options.persist);
	const conversationIdRef = useRef(options.conversationId);
	// Distinguishes a close the visitor asked for (end()) from an unexpected
	// server/network close, and caps reconnection to a single attempt.
	const endingRef = useRef(false);
	const reconnectedRef = useRef(false);
	persistRef.current = options.persist;
	conversationIdRef.current = options.conversationId;

	const stopMetering = useCallback(() => {
		if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
		rafRef.current = null;
	}, []);

	const startOutputMetering = useCallback((session: LiveSession) => {
		const outputData = new Uint8Array(session.outputAnalyser.frequencyBinCount);
		const tick = () => {
			session.outputAnalyser.getByteFrequencyData(outputData);
			const level = computeRmsLevel(outputData);
			if (level > OUTPUT_PULSE_THRESHOLD) setVoicePulseRate(level);
			rafRef.current = requestAnimationFrame(tick);
		};
		rafRef.current = requestAnimationFrame(tick);
	}, []);

	const endLocally = useCallback(() => {
		stopMetering();
		sessionRef.current?.close();
		sessionRef.current = null;
		setVoiceMode(false);
		setPresenceState("idle");
		setMicAnalyser(null);
		setStatus("idle");
	}, [stopMetering]);

	const handleTurnComplete = useCallback(
		async (turn: { userText: string; modelText: string }) => {
			const result = await persistVoiceTurn({
				persist: persistRef.current,
				conversationId: persistRef.current
					? conversationIdRef.current
					: undefined,
				userText: turn.userText,
				modelText: turn.modelText,
			});
			if (result.conversationId)
				conversationIdRef.current = result.conversationId;
			onTurnPersisted({
				...result,
				userText: turn.userText,
				modelText: turn.modelText,
			});
		},
		[onTurnPersisted],
	);

	// Extracted so both start() and the reconnect path in onClose can invoke
	// it without duplicating the token-mint + startLiveSession logic.
	const connect = useCallback(() => {
		setStatus("connecting");
		(async () => {
			let token: string;
			let model: string;
			try {
				const minted = await mintVoiceToken(language);
				token = minted.token;
				model = minted.model;
			} catch {
				setStatus("error");
				onError("voice_connection_failed");
				return;
			}

			try {
				const session = await startLiveSession({
					token,
					model,
					callbacks: {
						onOpen: () => {
							setStatus("listening");
							setPresenceState("listening");
						},
						onClose: () => {
							if (endingRef.current) {
								endLocally();
								return;
							}
							if (!reconnectedRef.current) {
								// One silent reconnect with a freshly minted token before
								// giving up and falling back to text — per the approved
								// spec's "WebSocket drops mid-session" handling. This is a
								// one-shot budget per start(): it does NOT reset on a
								// successful reconnect, so a session that drops twice in a
								// row always falls back on the second drop rather than
								// reconnecting indefinitely.
								reconnectedRef.current = true;
								stopMetering();
								sessionRef.current = null;
								setMicAnalyser(null);
								connect();
							} else {
								endLocally();
								onError("voice_connection_failed");
							}
						},
						onError: () => {
							endLocally();
							onError("voice_connection_failed");
						},
						onSpeakingChange: (speaking) => {
							setStatus(speaking ? "speaking" : "listening");
							setPresenceState(speaking ? "speaking" : "listening");
						},
						onTurnComplete: handleTurnComplete,
					},
				});
				sessionRef.current = session;
				setMicAnalyser(session.micAnalyser);
				setVoiceMode(true);
				startOutputMetering(session);
			} catch (error) {
				setStatus("error");
				onError(
					isPermissionError(error)
						? "voice_mic_denied"
						: "voice_connection_failed",
				);
			}
		})();
	}, [
		language,
		handleTurnComplete,
		onError,
		startOutputMetering,
		endLocally,
		stopMetering,
	]);

	const start = useCallback(() => {
		endingRef.current = false;
		reconnectedRef.current = false;
		connect();
	}, [connect]);

	const end = useCallback(() => {
		endingRef.current = true;
		endLocally();
	}, [endLocally]);

	useEffect(
		() => () => {
			endingRef.current = true;
			endLocally();
		},
		[endLocally],
	);

	return { status, micAnalyser, start, end };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/voice/useVoiceSession.test.ts`
Expected: PASS (all cases)

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/voice/useVoiceSession.ts src/lib/voice/useVoiceSession.test.ts
git commit -m "feat(voice): add useVoiceSession hook (state machine, turn persistence, ring bridge)"
```

---

### Task 8: `VoiceVisor` component

**Files:**

- Create: `src/components/chat/VoiceVisor.tsx`
- Test: `src/components/chat/VoiceVisor.test.tsx`

**Interfaces:**

- Consumes: `computeBarHeights` from `../../lib/voice/audioUtils` (Task 4).
- Produces:

  ```ts
  interface VoiceVisorProps {
  	analyser: AnalyserNode | null;
  	endCallLabel: string;
  	onEndCall: () => void;
  }
  function VoiceVisor(props: VoiceVisorProps): JSX.Element;
  ```

  Consumed by Task 9's `ChatWidget.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/chat/VoiceVisor.test.tsx`. `requestAnimationFrame` is stubbed to run its callback once synchronously (rather than looping) so tests can assert on a single rendered frame without an infinite loop or fake timers:

```ts
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceVisor } from "./VoiceVisor";

function fakeAnalyser(fill: number): AnalyserNode {
	return {
		frequencyBinCount: 32,
		getByteFrequencyData: (array: Uint8Array) => array.fill(fill),
	} as unknown as AnalyserNode;
}

let rafSpy: ReturnType<typeof vi.spyOn>;
let cafSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
		cb(0);
		return 1;
	});
	cafSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});

afterEach(() => {
	rafSpy.mockRestore();
	cafSpy.mockRestore();
});

describe("VoiceVisor", () => {
	it("renders 24 bars", () => {
		render(<VoiceVisor analyser={fakeAnalyser(0)} endCallLabel="End call" onEndCall={vi.fn()} />);
		expect(screen.getAllByTestId("voice-visor-bar")).toHaveLength(24);
	});

	it("renders bars with nonzero height when the analyser reports signal", () => {
		render(<VoiceVisor analyser={fakeAnalyser(200)} endCallLabel="End call" onEndCall={vi.fn()} />);
		const bars = screen.getAllByTestId("voice-visor-bar");
		const heights = bars.map((bar) => parseFloat((bar as HTMLElement).style.height));
		expect(heights.some((h) => h > 0)).toBe(true);
	});

	it("renders flat bars when analyser is null (no signal yet)", () => {
		render(<VoiceVisor analyser={null} endCallLabel="End call" onEndCall={vi.fn()} />);
		const bars = screen.getAllByTestId("voice-visor-bar");
		const heights = bars.map((bar) => parseFloat((bar as HTMLElement).style.height));
		expect(heights.every((h) => h === 0)).toBe(true);
	});

	it("calls onEndCall when the end-call button is clicked", () => {
		const onEndCall = vi.fn();
		render(<VoiceVisor analyser={fakeAnalyser(0)} endCallLabel="End call" onEndCall={onEndCall} />);
		fireEvent.click(screen.getByRole("button", { name: "End call" }));
		expect(onEndCall).toHaveBeenCalledTimes(1);
	});

	it("stops the animation frame loop on unmount", () => {
		const { unmount } = render(
			<VoiceVisor analyser={fakeAnalyser(0)} endCallLabel="End call" onEndCall={vi.fn()} />,
		);
		unmount();
		expect(cafSpy).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/components/chat/VoiceVisor.test.tsx`
Expected: FAIL — module `./VoiceVisor` does not exist.

- [ ] **Step 3: Implement it**

Create `src/components/chat/VoiceVisor.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { computeBarHeights } from "../../lib/voice/audioUtils";

const BAR_COUNT = 24;

export interface VoiceVisorProps {
	analyser: AnalyserNode | null;
	endCallLabel: string;
	onEndCall: () => void;
}

export function VoiceVisor({
	analyser,
	endCallLabel,
	onEndCall,
}: VoiceVisorProps) {
	const [heights, setHeights] = useState<number[]>(() =>
		new Array(BAR_COUNT).fill(0),
	);
	const rafRef = useRef<number | null>(null);

	useEffect(() => {
		if (!analyser) {
			setHeights(new Array(BAR_COUNT).fill(0));
			return;
		}

		const data = new Uint8Array(analyser.frequencyBinCount);
		const tick = () => {
			analyser.getByteFrequencyData(data);
			setHeights(computeBarHeights(data, BAR_COUNT));
			rafRef.current = requestAnimationFrame(tick);
		};
		rafRef.current = requestAnimationFrame(tick);

		return () => {
			if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
		};
	}, [analyser]);

	return (
		<div className="border-slate-mist bg-deep-blue/40 shadow-glow-blue flex items-center gap-2 rounded-full border p-2 backdrop-blur-xl">
			<div className="flex h-9 flex-1 items-center justify-center gap-[3px] px-2">
				{heights.map((height, index) => (
					<span
						key={index}
						data-testid="voice-visor-bar"
						className="bg-signal-cyan shadow-glow-cyan w-1 rounded-full transition-[height] duration-75"
						style={{ height: `${Math.max(height * 100, 8)}%` }}
					/>
				))}
			</div>
			<button
				type="button"
				onClick={onEndCall}
				aria-label={endCallLabel}
				title={endCallLabel}
				className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-red-500/60 bg-red-500/15 text-red-400 hover:bg-red-500/25"
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					className="h-4 w-4"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M4 6l16 12M20 6L4 18"
					/>
				</svg>
			</button>
		</div>
	);
}
```

Note: the bar `style.height` uses a percentage of the container, with an 8% floor so bars never fully disappear (matches the spec's "near-flat, not invisible" description for silence).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/components/chat/VoiceVisor.test.tsx`
Expected: PASS (all cases)

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/VoiceVisor.tsx src/components/chat/VoiceVisor.test.tsx
git commit -m "feat(voice): add VoiceVisor soundwave component"
```

---

### Task 9: Wire it into `ChatWidget` + voice-tag history

**Files:**

- Modify: `src/lib/chat/useChatSession.ts`
- Modify: `src/components/chat/ChatBubble.tsx`
- Modify: `src/components/chat/ChatBox.tsx`
- Modify: `src/components/chat/ChatWidget.tsx`
- Test: `src/components/chat/ChatBubble.test.tsx` (extend)
- Test: `src/components/chat/ChatBox.test.tsx` (extend)
- Test: `src/components/chat/ChatWidget.test.tsx` (new — none exists yet)

**Interfaces:**

- Consumes: `useVoiceSession` (Task 7), `VoiceVisor` (Task 8), `t.chat.voice*` dictionary keys (Task 3).
- Produces: `DisplayMessage.mode?: "voice"`; `ChatBubbleProps.mode?: "voice"`; `ChatBoxProps.onStartVoice: () => void`.
- `HistorySidebar` (`src/components/chat/HistorySidebar.tsx`) is explicitly NOT modified in this task — its `ConversationSummary` type doesn't carry per-message mode, so a mic glyph there isn't achievable without a server-side schema change; see Step 6 for why this is an intentional, documented scope cut rather than an oversight.

- [ ] **Step 1: Thread `mode` through `DisplayMessage`**

In `src/lib/chat/useChatSession.ts`, change:

```ts
export interface DisplayMessage {
	id: string;
	role: "user" | "model";
	text: string;
}
```

to:

```ts
export interface DisplayMessage {
	id: string;
	role: "user" | "model";
	text: string;
	mode?: "voice";
}
```

Then update `toDisplayMessages` to carry it through:

```ts
function toDisplayMessages(messages: ChatMessage[]): DisplayMessage[] {
	return messages.map((message) => ({
		id: crypto.randomUUID(),
		role: message.role,
		text: message.text,
		mode: message.mode,
	}));
}
```

Add a new function, exported alongside `sendMessage`/`retryLast` etc. in the hook's returned object, that appends a completed voice turn's two messages directly to `messages` state (bypassing the SSE/RAG pipeline entirely, since voice turns are already fully-formed by the time `onTurnPersisted` fires). Add this new function in the same file, and export it from the hook:

```ts
const appendVoiceTurn = useCallback(
	(turn: { conversationId?: string; userText: string; modelText: string }) => {
		if (turn.conversationId) setConversationId(turn.conversationId);
		setMessages((prev) => [
			...prev,
			{
				id: crypto.randomUUID(),
				role: "user",
				text: turn.userText,
				mode: "voice",
			},
			{
				id: crypto.randomUUID(),
				role: "model",
				text: turn.modelText,
				mode: "voice",
			},
		]);
		if (consent === "accepted") refreshHistory();
	},
	[consent, refreshHistory],
);
```

Add `appendVoiceTurn` to both the `UseChatSessionResult` interface and the hook's final returned object (alongside the existing `sendMessage`, `retryLast`, etc.).

- [ ] **Step 2: Run the existing chat-session tests to confirm nothing broke**

Run: `pnpm vitest run src/lib/chat/useChatSession.test.ts`
Expected: PASS (existing tests unaffected — `mode` is optional and `appendVoiceTurn` is new, additive).

- [ ] **Step 3: Add the failing `ChatBubble` mode test**

Add to `src/components/chat/ChatBubble.test.tsx`:

```ts
it("renders a mic indicator when mode is voice", () => {
	render(<ChatBubble role="user" text="Hi!" mode="voice" />);
	expect(screen.getByTestId("chat-bubble-voice-indicator")).toBeInTheDocument();
});

it("does not render a mic indicator for a text message", () => {
	render(<ChatBubble role="user" text="Hi!" />);
	expect(screen.queryByTestId("chat-bubble-voice-indicator")).not.toBeInTheDocument();
});
```

Run: `pnpm vitest run src/components/chat/ChatBubble.test.tsx`
Expected: FAIL — `mode` prop doesn't exist yet.

- [ ] **Step 4: Add the `mode` prop to `ChatBubble`**

In `src/components/chat/ChatBubble.tsx`, change:

```tsx
export interface ChatBubbleProps {
	role: "user" | "model";
	text: string;
}
```

to:

```tsx
export interface ChatBubbleProps {
	role: "user" | "model";
	text: string;
	mode?: "voice";
}
```

Change the function signature:

```tsx
export function ChatBubble({ role, text }: ChatBubbleProps) {
```

to:

```tsx
export function ChatBubble({ role, text, mode }: ChatBubbleProps) {
```

Then, inside the outer `<div className={`flex ${isModel ...}`}>`, add a small mic glyph rendered as a sibling before the bubble when `mode === "voice"`. Change the return statement's opening to:

```tsx
	return (
		<div className={`flex items-end gap-1 ${isModel ? "justify-start" : "justify-end flex-row-reverse"}`}>
			{mode === "voice" && (
				<span
					data-testid="chat-bubble-voice-indicator"
					title="Voice message"
					className="text-ion/40 mb-1 shrink-0 text-xs"
				>
					🎙
				</span>
			)}
			<div
```

(The rest of the `<div>` and its closing tags are unchanged — only the outer wrapper's `className` and the new sibling `<span>` are added.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/components/chat/ChatBubble.test.tsx`
Expected: PASS (all cases, including the two new ones)

- [ ] **Step 6: Skip the `HistorySidebar` mic-glyph requirement — document why**

The design spec's History section calls for `HistorySidebar` to show a mic glyph when a conversation's most recent message was voice. `ConversationSummary` (`src/lib/history/types.ts`) only carries `{ conversationId, title, updatedAt }` — no per-message `mode` — so this isn't achievable without a server-side schema change (adding a `lastMessageMode` field to `ConversationSummary` and the `/api/history/list` response). That's out of scope for this UI-only plan. Leave `HistorySidebar` unchanged in this task; this gap is a known, explicitly-deferred follow-up, not a silent omission — do not attempt a client-only workaround (e.g. fetching every conversation's full body just to check its last message) since that would multiply `/api/history/:id` calls per sidebar render.

- [ ] **Step 7: Write the failing `ChatWidget` test for the visor swap**

Create `src/components/chat/ChatWidget.test.tsx`. Mock `useChatSession` and `useVoiceSession` so the test controls status transitions directly:

```ts
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const chatSessionState = {
	consent: "rejected" as const,
	messages: [],
	status: "idle" as const,
	errorMessage: null,
	sendMessage: vi.fn(),
	retryLast: vi.fn(),
	conversations: [],
	historyOpen: false,
	toggleHistory: vi.fn(),
	closeHistory: vi.fn(),
	selectConversation: vi.fn(),
	deleteConversationById: vi.fn(),
	startNewConversation: vi.fn(),
	acceptConsent: vi.fn(),
	rejectConsent: vi.fn(),
	appendVoiceTurn: vi.fn(),
};

vi.mock("../../lib/chat/useChatSession", () => ({
	useChatSession: () => chatSessionState,
}));

const voiceSessionState = {
	status: "idle" as string,
	micAnalyser: null,
	start: vi.fn(),
	end: vi.fn(),
};

let capturedVoiceOptions:
	| { onError: (key: "voice_connection_failed" | "voice_mic_denied") => void }
	| undefined;

vi.mock("../../lib/voice/useVoiceSession", () => ({
	useVoiceSession: (opts: typeof capturedVoiceOptions) => {
		capturedVoiceOptions = opts;
		return voiceSessionState;
	},
}));

import { act } from "@testing-library/react";
import { ChatWidget } from "./ChatWidget";

describe("ChatWidget voice mode", () => {
	it("shows ChatBox (not VoiceVisor) when the voice session is idle", () => {
		voiceSessionState.status = "idle";
		render(<ChatWidget lang="en" />);
		expect(screen.getByPlaceholderText("Ask me about my work, background, or projects...")).toBeInTheDocument();
	});

	it("shows VoiceVisor (not ChatBox) once the voice session is listening", () => {
		voiceSessionState.status = "listening";
		render(<ChatWidget lang="en" />);
		expect(
			screen.queryByPlaceholderText("Ask me about my work, background, or projects..."),
		).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "End call" })).toBeInTheDocument();
	});

	it("calls voiceSession.start() when the waves button is clicked while idle", () => {
		voiceSessionState.status = "idle";
		render(<ChatWidget lang="en" />);
		fireEvent.click(screen.getByRole("button", { name: "Start voice chat" }));
		expect(voiceSessionState.start).toHaveBeenCalledTimes(1);
	});

	it("calls voiceSession.end() when the end-call button is clicked", () => {
		voiceSessionState.status = "speaking";
		render(<ChatWidget lang="en" />);
		fireEvent.click(screen.getByRole("button", { name: "End call" }));
		expect(voiceSessionState.end).toHaveBeenCalledTimes(1);
	});

	it("shows the mic-denied message and ChatBox (not VoiceVisor) after onError fires with voice_mic_denied and status is error", () => {
		voiceSessionState.status = "error";
		render(<ChatWidget lang="en" />);

		act(() => capturedVoiceOptions?.onError("voice_mic_denied"));

		expect(
			screen.getByText("Microphone access was denied. You can still use text chat."),
		).toBeInTheDocument();
		expect(screen.getByPlaceholderText("Ask me about my work, background, or projects...")).toBeInTheDocument();
	});

	it("shows the generic voice error message when onError fires with voice_connection_failed", () => {
		voiceSessionState.status = "error";
		render(<ChatWidget lang="en" />);

		act(() => capturedVoiceOptions?.onError("voice_connection_failed"));

		expect(
			screen.getByText("The voice session couldn't connect. Please try text chat instead."),
		).toBeInTheDocument();
	});

	it("does not show a voice error message when idle", () => {
		voiceSessionState.status = "idle";
		render(<ChatWidget lang="en" />);
		expect(
			screen.queryByText("The voice session couldn't connect. Please try text chat instead."),
		).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `pnpm vitest run src/components/chat/ChatWidget.test.tsx`
Expected: FAIL — `ChatBox`'s waves button is currently `disabled` with no click handler, and there's no `VoiceVisor` rendering at all yet.

- [ ] **Step 9: Wire `ChatBox`'s waves button to be clickable**

`ChatBox.tsx`'s waves button is currently hardcoded `disabled` with no `onClick`. In `src/components/chat/ChatBox.tsx`, change the `ChatBoxProps` interface:

```ts
export interface ChatBoxProps {
	inputPlaceholder: string;
	sendLabel: string;
	voiceLabel: string;
	disabled: boolean;
	onSend: (text: string) => void;
}
```

to:

```ts
export interface ChatBoxProps {
	inputPlaceholder: string;
	sendLabel: string;
	voiceLabel: string;
	disabled: boolean;
	onSend: (text: string) => void;
	onStartVoice: () => void;
}
```

Update the destructuring:

```ts
export function ChatBox({ inputPlaceholder, sendLabel, voiceLabel, disabled, onSend, onStartVoice }: ChatBoxProps) {
```

And change the waves button from:

```tsx
<button
	type="button"
	disabled
	aria-label={voiceLabel}
	title={voiceLabel}
	className="border-slate-mist-strong text-ion/40 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
>
	~
</button>
```

to:

```tsx
<button
	type="button"
	onClick={onStartVoice}
	aria-label={voiceLabel}
	title={voiceLabel}
	className="border-electric-blue/70 bg-electric-blue/15 text-ion shadow-glow-blue hover:bg-electric-blue/25 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border backdrop-blur-lg"
>
	~
</button>
```

This will break the two existing `ChatBox.test.tsx` cases that reference `voiceLabel="Voice chat (coming soon)"` and assert the button is disabled — fix those in the same commit: change `baseProps` to include `onStartVoice: vi.fn()`, change the "renders a disabled voice button" test to instead assert it's clickable:

```ts
it("calls onStartVoice when the waves button is clicked", () => {
	const onStartVoice = vi.fn();
	render(<ChatBox {...baseProps} onStartVoice={onStartVoice} />);
	fireEvent.click(screen.getByRole("button", { name: "Voice chat (coming soon)" }));
	expect(onStartVoice).toHaveBeenCalledTimes(1);
});
```

(Its `aria-label`/`title` still come from whatever `voiceLabel` the caller passes — Step 10 changes what `ChatWidget` actually passes as that label to `t.chat.voiceStart` instead of `t.chat.voiceComingSoon`, so `voiceComingSoon` becomes dead in production even though this specific unit test still exercises the prop generically. Update the test's label text to match if you want the test name to stay accurate, but it isn't required for the test to pass.)

- [ ] **Step 10: Wire `ChatWidget`**

Read the current `src/components/chat/ChatWidget.tsx` in full before editing — it renders `ChatBox` inside a flex column alongside `ChatMessages` and `ConsentBanner`. Make these changes:

1. Add imports:

   ```ts
   import { useVoiceSession } from "../../lib/voice/useVoiceSession";
   import { VoiceVisor } from "./VoiceVisor";
   ```

2. Add a `useState` import if not already present (`ChatWidget.tsx` already imports `useState` for `preferencesOpen`). Inside the `ChatWidget` function body, after the existing `const session = useChatSession({...})` call, add:

   ```ts
   const [voiceErrorKey, setVoiceErrorKey] = useState<
   	"voice_connection_failed" | "voice_mic_denied" | null
   >(null);
   const voiceSession = useVoiceSession({
   	language: lang.toUpperCase(),
   	persist: session.consent === "accepted",
   	conversationId: undefined,
   	onTurnPersisted: (turn) => session.appendVoiceTurn(turn),
   	onError: (key) => setVoiceErrorKey(key),
   });
   const voiceActive =
   	voiceSession.status !== "idle" && voiceSession.status !== "error";
   const voiceErrorMessage =
   	voiceSession.status === "error" && voiceErrorKey
   		? voiceErrorKey === "voice_mic_denied"
   			? t.voiceMicDenied
   			: t.voiceErrorGeneric
   		: null;
   ```

   (`conversationId: undefined` is deliberate for this pass — voice sessions currently always start a fresh conversation rather than continuing the text conversation in view; threading the active `conversationId` through is a reasonable follow-up but adds cross-mode state coupling not required by the approved spec. `voiceErrorKey` is intentionally never cleared explicitly — `voiceErrorMessage` only renders while `status === "error"`, and `start()` immediately moves `status` to `"connecting"`, so the old message disappears on its own the moment the visitor retries; a fresh `onError` call always overwrites the key before the message can reappear stale.)

3. Find the existing `<ChatBox ... />` usage inside the widget's render (it's the last element in the inner flex column, after `<ChatMessages ... />`). Replace it with:
   ```tsx
   {
   	voiceActive ? (
   		<VoiceVisor
   			analyser={voiceSession.micAnalyser}
   			endCallLabel={t.voiceEndCall}
   			onEndCall={voiceSession.end}
   		/>
   	) : (
   		<>
   			{voiceErrorMessage && (
   				<p className="text-ion/70 px-2 text-center text-xs" role="alert">
   					{voiceErrorMessage}
   				</p>
   			)}
   			<ChatBox
   				inputPlaceholder={t.inputPlaceholder}
   				sendLabel={t.send}
   				voiceLabel={t.voiceStart}
   				disabled={
   					session.status === "sending" || session.status === "streaming"
   				}
   				onSend={session.sendMessage}
   				onStartVoice={voiceSession.start}
   			/>
   		</>
   	);
   }
   ```

- [ ] **Step 11: Run tests to verify they pass**

Run: `pnpm vitest run src/components/chat/ChatWidget.test.tsx src/components/chat/ChatBox.test.tsx src/lib/chat/useChatSession.test.ts src/components/chat/ChatBubble.test.tsx`
Expected: PASS (all cases)

- [ ] **Step 12: Run the full suite and typecheck**

Run: `pnpm vitest run`
Expected: all tests pass (should be more than before this task, given the new/extended test files across this whole plan).

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 13: Commit**

```bash
git add src/lib/chat/useChatSession.ts src/components/chat/ChatBubble.tsx src/components/chat/ChatBubble.test.tsx src/components/chat/ChatBox.tsx src/components/chat/ChatBox.test.tsx src/components/chat/ChatWidget.tsx src/components/chat/ChatWidget.test.tsx
git commit -m "feat(voice): wire waves button to a real voice session, tag voice turns in history UI"
```

---

### Task 10: Manual verification against a live dev server

No automated coverage can exercise a real microphone, real audio playback, or a real WebSocket to Google's Live API — this closes out the plan the same way the backend plan closed on real API calls rather than only mocks.

- [ ] **Step 1: Start the dev server**

Run: `astro dev --background`, then `astro dev status` to confirm it's up and note the port.

- [ ] **Step 2: Confirm `GOOGLE_API_KEY_LIVE` is available locally**

Check `.dev.vars` has a real (non-empty) `GOOGLE_API_KEY_LIVE` value — this is what `astro dev`'s Cloudflare runtime actually reads (not `.env`), per the backend plan's Task 7 finding. If missing, populate it from `.env`'s value before continuing.

- [ ] **Step 3: Manual checklist**

Open the Main page in a real browser (not just a test runner) and, in order:

1. Click the waves button. Grant microphone permission when prompted.
2. Confirm `ChatBox` disappears and `VoiceVisor` appears in its place, with no layout jump.
3. Confirm the `PresenceRing` hero orb shifts to the violet voice-mode color.
4. Speak a sentence out loud. Confirm the visor's bars visibly react to your voice (not just ambient room noise — try alternating speaking and staying silent, and confirm the bars visibly rise and fall in response).
5. Wait for the avatar's spoken reply. Confirm you hear real audio played back.
6. While the avatar is replying, confirm the `PresenceRing`'s pulse visibly speeds up during louder moments of its speech.
7. Click the end-call button. Confirm `VoiceVisor` disappears, `ChatBox` reappears, and `PresenceRing` leaves the violet voice-mode color.
8. If history consent was accepted before this test: open the history sidebar (or reload the page) and confirm the completed voice turn appears in the transcript, tagged with the 🎙 indicator on both the user and model bubbles.
9. Start a new voice session, then deny the microphone permission prompt this time (or revoke it via the browser's site settings first). Confirm you land back in text-chat mode with no dead end — no infinite spinner, no stuck "connecting" state.

- [ ] **Step 4: Clean up**

Run: `astro dev stop`

- [ ] **Step 5: Update the roadmap**

In `project-roadmap.md`, under Phase 4, check off the remaining items now covered:

```
- [x] Implement client-side Live API session: mic capture → stream to Gemini → stream audio response back
- [x] Wire the "waves" button to toggle voice mode; visually indicate listening/speaking states
- [x] Feed the same RAG context into the voice session (system instructions + retrieved chunks) so voice answers stay consistent with text answers
```

Leave `- [ ] Handle multilingual voice (visitor speaks ES/FR/EN — confirm Live API auto language handling)` and `- [ ] Graceful fallback to text mode if mic permission denied or WebSocket fails` — the second one IS now implemented (Step 3.9 above verifies it), so check it off too:

```
- [x] Graceful fallback to text mode if mic permission denied or WebSocket fails
```

The multilingual item stays unchecked — this plan locks voice replies to the visitor's site locale rather than auto-detecting spoken language (an explicit, approved design decision, not a gap), so leave a note rather than checking it:

```
- [ ] Handle multilingual voice (visitor speaks ES/FR/EN — confirm Live API auto language handling) — **resolved differently than originally scoped**: voice replies are locked to the visitor's site locale (EN/ES/FR) rather than auto-detected from speech, per the approved UI design spec (`docs/superpowers/specs/2026-08-13-phase4-voice-chat-ui-design.md`). Not planned to be revisited unless it proves limiting in practice.
```

- [ ] **Step 6: Commit**

```bash
git add project-roadmap.md
git commit -m "docs: mark Phase 4 voice chat UI complete in roadmap"
```
