# Phase 4 Voice Chat — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server-side half of Phase 4 voice chat: an endpoint that mints a short-lived Gemini Live API token plus session-start RAG system instructions, and an endpoint that persists a completed voice turn into the same consent-gated history KV that text chat already uses.

**Architecture:** Two new Astro server routes under `src/pages/api/voice/`, backed by pure handler functions under `src/lib/voice/` (mirroring the existing `src/lib/chat/handler.ts` pattern: a testable handler function + a thin Astro route that wires real Cloudflare bindings/env into it). No audio ever touches the Worker — the browser will later (UI plan) connect directly to Google's Live API using the minted token. This plan ends at a live-verified token mint and turn-persistence; the browser-side WebSocket/mic code is a separate, later plan.

**Tech Stack:** Astro server routes (Cloudflare Workers runtime), `@google/genai` (official SDK, for ephemeral token minting only), existing `src/lib/rag/*` and `src/lib/history/*` modules, Vitest.

## Global Constraints

- Reuse the existing `CHAT_RATE_LIMITER` binding for both new routes — do not add a new rate-limit binding (per the approved spec, `docs/superpowers/specs/2026-08-12-phase4-voice-chat-design.md`, "Rate limiting").
- `GOOGLE_API_KEY_LIVE` must never be sent to the client — only the minted ephemeral token is.
- Voice history reuses the exact same `ConversationKV`/`StoredConversation` shape and KV key scheme as text chat (`src/lib/history/kv.ts`) — no new storage mechanism.
- `ChatMessage.mode` must default to `undefined` for all existing/text messages — no migration of already-stored conversations.
- Follow the existing repo pattern throughout: a pure, dependency-injected handler function (unit-testable without real network/KV) plus a thin Astro route (`export const POST: APIRoute`) that wires `cloudflare:workers` env bindings into it. See `src/pages/api/chat.ts` + `src/lib/chat/handler.ts` for the exact pattern to mirror.
- All new source files use tabs for indentation and the project's existing import style (relative paths, `type` imports for types), matching the files read during planning (`src/lib/chat/handler.ts`, `src/lib/rag/retrieve.ts`, `src/lib/rag/prompt.ts`).

---

### Task 1: Tag history messages with an optional voice mode

**Files:**
- Modify: `src/lib/history/types.ts`
- Test: `src/lib/history/kv.test.ts` (add one case; do not restructure existing tests)

**Interfaces:**
- Produces: `ChatMessage.mode?: "voice"` — an optional field, read by later tasks and by the (separate, later) UI plan's `ChatBubble`/`HistorySidebar` rendering.

- [ ] **Step 1: Write the failing test**

Open `src/lib/history/kv.test.ts` and add this case inside the existing `describe` block that covers `getConversation`/`putConversation` round-tripping (read the file first to match its existing style exactly — use the same `createMockKV()` helper it already imports):

```ts
it("round-trips a voice-tagged message through put/get", async () => {
	const kv = createMockKV();
	const conversation: StoredConversation = {
		messages: [
			{ role: "user", text: "Hi", at: "2026-08-12T00:00:00.000Z", mode: "voice" },
			{ role: "model", text: "Hello!", at: "2026-08-12T00:00:00.000Z", mode: "voice" },
		],
		updatedAt: "2026-08-12T00:00:00.000Z",
		title: "Hi",
	};

	await putConversation(kv, "visitor-1", "conv-1", conversation);
	const loaded = await getConversation(kv, "visitor-1", "conv-1");

	expect(loaded?.messages[0]).toEqual(
		expect.objectContaining({ mode: "voice" }),
	);
	expect(loaded?.messages[1]).toEqual(
		expect.objectContaining({ mode: "voice" }),
	);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/history/kv.test.ts`
Expected: FAIL — TypeScript error, `mode` does not exist on type `ChatMessage`.

- [ ] **Step 3: Add the field**

In `src/lib/history/types.ts`, change:

```ts
export interface ChatMessage {
	role: "user" | "model";
	text: string;
	at: string; // ISO timestamp
}
```

to:

```ts
export interface ChatMessage {
	role: "user" | "model";
	text: string;
	at: string; // ISO timestamp
	/** Set only for voice-session turns; omitted entirely for text turns (no migration needed for already-stored conversations). */
	mode?: "voice";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/history/kv.test.ts`
Expected: PASS (all cases in the file, including the new one)

- [ ] **Step 5: Commit**

```bash
git add src/lib/history/types.ts src/lib/history/kv.test.ts
git commit -m "feat(voice): add optional mode field to ChatMessage for voice-tagged turns"
```

---

### Task 2: Build the voice system prompt

**Files:**
- Modify: `src/lib/rag/prompt.ts`
- Test: `src/lib/rag/prompt.test.ts`

**Interfaces:**
- Consumes: `RetrievedChunk` from `./retrieve` (already imported in `prompt.ts`).
- Produces: `buildVoiceSystemPrompt(options: BuildVoiceSystemPromptOptions): string`, where `BuildVoiceSystemPromptOptions = { chunks: RetrievedChunk[]; visitorLanguage: string }`. Consumed by Task 4's token handler.

- [ ] **Step 1: Write the failing test**

Read `src/lib/rag/prompt.test.ts` first to match its existing style (it already has fixtures for `RetrievedChunk`; reuse them rather than redefining). Add:

```ts
describe("buildVoiceSystemPrompt", () => {
	it("includes persona, tone, boundaries, a spoken-style note, and a locked language instruction", () => {
		const prompt = buildVoiceSystemPrompt({
			chunks: [],
			visitorLanguage: "ES",
		});

		expect(prompt).toContain("Daniel Peraza's AI avatar");
		expect(prompt).toContain("Boundaries:");
		expect(prompt).toContain("spoken");
		expect(prompt).toContain("ES");
	});

	it("formats provided chunks the same way as buildSystemPrompt", () => {
		const chunk = makeChunk({ title: "AutoCAD", document: "Certified in AutoCAD." });

		const prompt = buildVoiceSystemPrompt({ chunks: [chunk], visitorLanguage: "EN" });

		expect(prompt).toContain("AutoCAD");
		expect(prompt).toContain("Certified in AutoCAD.");
	});
});
```

(If `prompt.test.ts` does not already export a `makeChunk`/equivalent fixture helper, use whatever helper name it already defines for building a `RetrievedChunk` in the existing `buildSystemPrompt` tests — copy that helper's exact name and shape rather than inventing a new one.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/rag/prompt.test.ts`
Expected: FAIL — `buildVoiceSystemPrompt is not a function` / not exported.

- [ ] **Step 3: Implement it in `prompt.ts`**

Add this below the existing `buildSystemPrompt` function in `src/lib/rag/prompt.ts` (it reuses the file's existing private `PERSONA`, `TONE`, `BOUNDARIES`, `formatChunk` — do not duplicate them):

```ts
const VOICE_STYLE_NOTE = `Voice mode: this reply will be spoken aloud, not read. Keep sentences short and natural for speech. Never use markdown, bullet lists, headers, or written-only formatting — say things the way you'd say them out loud in conversation.`;

export interface BuildVoiceSystemPromptOptions {
	chunks: RetrievedChunk[];
	/** Voice replies are locked to the visitor's current site locale, not auto-detected from speech. */
	visitorLanguage: string;
}

/**
 * Assembles the system prompt for a Live API voice session. Unlike
 * buildSystemPrompt (re-run per text message), this is built once at voice
 * session start with a broader context slice (see retrieveContext's topK for
 * the voice token handler) since the Live API doesn't support re-injecting
 * context per turn in this phase.
 */
export function buildVoiceSystemPrompt(options: BuildVoiceSystemPromptOptions): string {
	const { chunks, visitorLanguage } = options;

	const context = chunks.length
		? chunks.map(formatChunk).join("\n\n")
		: "(No matching Knowledge Base entries were found for this session.)";

	return [
		PERSONA,
		TONE,
		BOUNDARIES,
		VOICE_STYLE_NOTE,
		`Always reply in ${visitorLanguage}, regardless of the source context's language.`,
		`Context (ordered by relevance):\n${context}`,
	].join("\n\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/rag/prompt.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/prompt.ts src/lib/rag/prompt.test.ts
git commit -m "feat(voice): add buildVoiceSystemPrompt for Live API session instructions"
```

---

### Task 3: Mint Gemini Live API ephemeral tokens

**Files:**
- Create: `src/lib/voice/ephemeralToken.ts`
- Test: `src/lib/voice/ephemeralToken.test.ts`
- Modify: `package.json` (new dependency)

**Interfaces:**
- Produces: `mintEphemeralToken(options: MintEphemeralTokenOptions): Promise<EphemeralToken>`, `LIVE_MODEL: string`, where:
  ```ts
  interface MintEphemeralTokenOptions {
  	apiKey: string;
  	systemInstructions: string;
  	genAiFactory?: (apiKey: string) => { authTokens: { create(args: unknown): Promise<{ name: string }> } };
  }
  interface EphemeralToken {
  	token: string;
  	expiresAt: string; // ISO
  }
  ```
  Consumed by Task 4's token handler. `genAiFactory` is the test seam (same dependency-injection pattern as `FetchLike` in `src/lib/rag/chat.ts`) — production code omits it and falls back to constructing a real `GoogleGenAI` client.

- [ ] **Step 1: Install the SDK**

Run: `pnpm add @google/genai`

- [ ] **Step 2: Verify the ephemeral-token API shape against the installed SDK**

The Live API's ephemeral-token feature is newer than this plan's author's training data, so before writing the implementation, confirm the exact method signature rather than trusting memory:

Run: `grep -rn "authTokens" node_modules/@google/genai/dist/**/*.d.ts`

Read the matched `.d.ts` file(s) and confirm:
1. The client method name (expected: `ai.authTokens.create(...)`).
2. The config field names for: how many times the token can be used, when the token itself expires, when a session started with it must begin by, and how to scope it to a specific model + Live session config (expected fields, based on Google's published Live API ephemeral-tokens guide: `uses`, `expireTime`, `newSessionExpireTime`, `liveConnectConstraints: { model, config }`).
3. The shape of the returned object (expected: `{ name: string, ... }`, where `name` is the token string a client passes as its API key to open a Live session).

If any field name differs from what's listed above, use the actual name found in the `.d.ts` file when writing Step 3 below — the field names in this plan are a best-effort draft, not guaranteed final.

Also confirm the current native-audio Live model ID for this account by running:

Run: `curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$GOOGLE_API_KEY_LIVE" | grep -i "live\|native-audio"`

(reads `GOOGLE_API_KEY_LIVE` from your local `.env` — run `set -a; source .env; set +a` first if it's not already exported in your shell). Use the returned model ID (it will contain `live` and/or `native-audio` in its name) as `LIVE_MODEL` in Step 3 — do not guess it.

- [ ] **Step 3: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { mintEphemeralToken } from "./ephemeralToken";

describe("mintEphemeralToken", () => {
	it("returns the minted token name and the expiry it requested", async () => {
		const create = vi.fn().mockResolvedValue({ name: "live-token-abc" });
		const genAiFactory = vi.fn().mockReturnValue({ authTokens: { create } });

		const result = await mintEphemeralToken({
			apiKey: "live-key",
			systemInstructions: "You are Daniel.",
			genAiFactory,
		});

		expect(result.token).toBe("live-token-abc");
		expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
		expect(genAiFactory).toHaveBeenCalledWith("live-key");
		expect(create).toHaveBeenCalledTimes(1);
	});

	it("scopes the token to the configured Live model and passes the system instructions", async () => {
		const create = vi.fn().mockResolvedValue({ name: "t" });
		const genAiFactory = vi.fn().mockReturnValue({ authTokens: { create } });

		await mintEphemeralToken({
			apiKey: "k",
			systemInstructions: "Reply in ES.",
			genAiFactory,
		});

		const [config] = create.mock.calls[0];
		expect(JSON.stringify(config)).toContain("Reply in ES.");
	});
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm vitest run src/lib/voice/ephemeralToken.test.ts`
Expected: FAIL — module `./ephemeralToken` does not exist.

- [ ] **Step 5: Implement it**

Write `src/lib/voice/ephemeralToken.ts` using the exact field names confirmed in Step 2 (the block below uses the expected/documented names — adjust only if Step 2 found them different):

```ts
import { GoogleGenAI } from "@google/genai";

/** Confirmed live via Step 2 of the plan that introduced this file — re-run that
 * verification if @google/genai is upgraded, since this is a newer API surface. */
export const LIVE_MODEL = "REPLACE_WITH_MODEL_ID_FOUND_IN_STEP_2";

const TOKEN_TTL_MINUTES = 30;
const SESSION_TTL_MINUTES = 60;

export interface MintEphemeralTokenOptions {
	apiKey: string;
	systemInstructions: string;
	genAiFactory?: (
		apiKey: string,
	) => { authTokens: { create(args: unknown): Promise<{ name: string }> } };
}

export interface EphemeralToken {
	token: string;
	expiresAt: string; // ISO
}

function defaultFactory(apiKey: string) {
	return new GoogleGenAI({ apiKey });
}

/** Mints a short-lived Live API token the browser can use directly, so the
 * long-lived GOOGLE_API_KEY_LIVE never leaves the server. */
export async function mintEphemeralToken(
	options: MintEphemeralTokenOptions,
): Promise<EphemeralToken> {
	const { apiKey, systemInstructions, genAiFactory = defaultFactory } = options;
	const ai = genAiFactory(apiKey);

	const expireTime = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000).toISOString();
	const newSessionExpireTime = new Date(
		Date.now() + SESSION_TTL_MINUTES * 60_000,
	).toISOString();

	const result = await ai.authTokens.create({
		config: {
			uses: 1,
			expireTime,
			newSessionExpireTime,
			liveConnectConstraints: {
				model: LIVE_MODEL,
				config: {
					systemInstruction: { parts: [{ text: systemInstructions }] },
				},
			},
		},
	});

	return { token: result.name, expiresAt: expireTime };
}
```

Replace `REPLACE_WITH_MODEL_ID_FOUND_IN_STEP_2` with the actual model ID string found in Step 2 before running the tests — this is real, required data from Step 2's `curl` output, not a deferred decision.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run src/lib/voice/ephemeralToken.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/voice/ephemeralToken.ts src/lib/voice/ephemeralToken.test.ts
git commit -m "feat(voice): mint Gemini Live API ephemeral tokens via @google/genai"
```

---

### Task 4: Voice token endpoint (`/api/voice/token`)

**Files:**
- Create: `src/lib/voice/tokenHandler.ts`
- Create: `src/pages/api/voice/token.ts`
- Test: `src/lib/voice/tokenHandler.test.ts`

**Interfaces:**
- Consumes: `RateLimiter` (import the interface from `../chat/handler`, do not redefine it), `retrieveContext`/`ChromaCredentials` from `../rag/retrieve`, `buildVoiceSystemPrompt` from `../rag/prompt` (Task 2), `mintEphemeralToken`/`LIVE_MODEL` from `./ephemeralToken` (Task 3).
- Produces: `handleVoiceTokenRequest(options: HandleVoiceTokenRequestOptions): Promise<Response>`, where:
  ```ts
  interface VoiceTokenRequestBody {
  	language: string;
  }
  interface HandleVoiceTokenRequestOptions {
  	request: Request;
  	rateLimiter: RateLimiter;
  	chroma: ChromaCredentials;
  	googleApiKeyEmb: string;
  	googleApiKeyLive: string;
  }
  ```
  Success response body: `{ token: string; expiresAt: string; model: string }`. Consumed by the (separate, later) UI plan's `useVoiceSession` hook.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/voice/tokenHandler.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../rag/retrieve", () => ({
	retrieveContext: vi.fn().mockResolvedValue([]),
}));
vi.mock("./ephemeralToken", () => ({
	mintEphemeralToken: vi.fn().mockResolvedValue({
		token: "live-token-abc",
		expiresAt: "2026-08-12T01:00:00.000Z",
	}),
	LIVE_MODEL: "test-live-model",
}));

import { retrieveContext } from "../rag/retrieve";
import { mintEphemeralToken } from "./ephemeralToken";
import { handleVoiceTokenRequest } from "./tokenHandler";

function createRequest(body: unknown, ip?: string): Request {
	const headers = new Headers({ "Content-Type": "application/json" });
	if (ip) headers.set("cf-connecting-ip", ip);
	return new Request("https://example.com/api/voice/token", {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
}

function baseOptions() {
	return {
		rateLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
		chroma: { apiKey: "k", tenant: "t", database: "d" },
		googleApiKeyEmb: "emb-key",
		googleApiKeyLive: "live-key",
	};
}

beforeEach(() => {
	vi.mocked(retrieveContext).mockClear();
	vi.mocked(retrieveContext).mockResolvedValue([]);
	vi.mocked(mintEphemeralToken).mockClear();
	vi.mocked(mintEphemeralToken).mockResolvedValue({
		token: "live-token-abc",
		expiresAt: "2026-08-12T01:00:00.000Z",
	});
});

describe("handleVoiceTokenRequest", () => {
	it("returns a token, expiry, and model on success", async () => {
		const response = await handleVoiceTokenRequest({
			request: createRequest({ language: "EN" }),
			...baseOptions(),
		});

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			token: string;
			expiresAt: string;
			model: string;
		};
		expect(body).toEqual({
			token: "live-token-abc",
			expiresAt: "2026-08-12T01:00:00.000Z",
			model: "test-live-model",
		});
	});

	it("retrieves a wider context pool than text chat's default topK", async () => {
		await handleVoiceTokenRequest({
			request: createRequest({ language: "EN" }),
			...baseOptions(),
		});

		expect(retrieveContext).toHaveBeenCalledWith(
			expect.objectContaining({ topK: 12, language: "EN" }),
		);
	});

	it("passes the retrieved chunks and language into the minted token's system instructions", async () => {
		vi.mocked(retrieveContext).mockResolvedValue([
			{
				id: "1",
				document: "Fluent in French.",
				distance: 0.1,
				notionPageId: "p1",
				title: "French Language",
				contentType: "Skill",
				tags: [],
				priority: 3,
				language: "EN",
				summary: "",
			},
		]);

		await handleVoiceTokenRequest({
			request: createRequest({ language: "EN" }),
			...baseOptions(),
		});

		const [call] = vi.mocked(mintEphemeralToken).mock.calls;
		expect(call[0].systemInstructions).toContain("Fluent in French.");
		expect(call[0].apiKey).toBe("live-key");
	});

	it("returns 429 without calling retrieveContext or minting a token when rate-limited", async () => {
		const options = baseOptions();
		options.rateLimiter.limit = vi.fn().mockResolvedValue({ success: false });

		const response = await handleVoiceTokenRequest({
			request: createRequest({ language: "EN" }),
			...options,
		});

		expect(response.status).toBe(429);
		expect(retrieveContext).not.toHaveBeenCalled();
		expect(mintEphemeralToken).not.toHaveBeenCalled();
	});

	it("returns 400 when language is missing", async () => {
		const response = await handleVoiceTokenRequest({
			request: createRequest({}),
			...baseOptions(),
		});

		expect(response.status).toBe(400);
	});

	it("returns a generic error and does not leak the upstream message when minting fails", async () => {
		vi.mocked(mintEphemeralToken).mockRejectedValueOnce(new Error("quota exceeded, key xyz"));
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

		const response = await handleVoiceTokenRequest({
			request: createRequest({ language: "EN" }),
			...baseOptions(),
		});

		expect(response.status).toBe(502);
		const body = (await response.json()) as { message: string };
		expect(body.message).not.toContain("quota exceeded");
		expect(consoleError).toHaveBeenCalled();
		consoleError.mockRestore();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/voice/tokenHandler.test.ts`
Expected: FAIL — module `./tokenHandler` does not exist.

- [ ] **Step 3: Implement the handler**

Create `src/lib/voice/tokenHandler.ts`:

```ts
import type { RateLimiter } from "../chat/handler";
import { retrieveContext, type ChromaCredentials } from "../rag/retrieve";
import { buildVoiceSystemPrompt } from "../rag/prompt";
import { mintEphemeralToken, LIVE_MODEL } from "./ephemeralToken";

export interface VoiceTokenRequestBody {
	language: string;
}

export interface HandleVoiceTokenRequestOptions {
	request: Request;
	rateLimiter: RateLimiter;
	chroma: ChromaCredentials;
	googleApiKeyEmb: string;
	googleApiKeyLive: string;
}

const RATE_LIMIT_IP_HEADER = "cf-connecting-ip";
// Wider than text chat's default (4): the Live API sets system instructions once
// at session start rather than re-retrieving per turn, so this needs to cover a
// broader slice of the knowledge base up front.
const VOICE_CONTEXT_TOP_K = 12;
const GENERIC_ERROR_MESSAGE =
	"Couldn't start a voice session just now. Please try again or use text chat.";

function jsonError(status: number, message: string): Response {
	return new Response(JSON.stringify({ message }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

export async function handleVoiceTokenRequest(
	options: HandleVoiceTokenRequestOptions,
): Promise<Response> {
	const { request, rateLimiter, chroma, googleApiKeyEmb, googleApiKeyLive } = options;

	let body: VoiceTokenRequestBody;
	try {
		body = (await request.json()) as VoiceTokenRequestBody;
	} catch {
		return jsonError(400, "Invalid JSON body");
	}
	if (!body.language || typeof body.language !== "string") {
		return jsonError(400, "language is required");
	}

	const rateLimitKey = request.headers.get(RATE_LIMIT_IP_HEADER) ?? "anonymous";
	const { success } = await rateLimiter.limit({ key: rateLimitKey });
	if (!success) {
		return new Response(JSON.stringify({ message: "Rate limit exceeded" }), {
			status: 429,
			headers: {
				"Content-Type": "application/json",
				"Retry-After": "60",
			},
		});
	}

	try {
		const chunks = await retrieveContext({
			chroma,
			googleApiKey: googleApiKeyEmb,
			query: "Daniel Peraza background, skills, and experience overview",
			language: body.language,
			topK: VOICE_CONTEXT_TOP_K,
		}).catch(() => []);

		const systemInstructions = buildVoiceSystemPrompt({
			chunks,
			visitorLanguage: body.language,
		});

		const { token, expiresAt } = await mintEphemeralToken({
			apiKey: googleApiKeyLive,
			systemInstructions,
		});

		return new Response(JSON.stringify({ token, expiresAt, model: LIVE_MODEL }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		console.error("Voice token mint failed", error);
		return jsonError(502, GENERIC_ERROR_MESSAGE);
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/voice/tokenHandler.test.ts`
Expected: PASS

- [ ] **Step 5: Wire the Astro route**

Create `src/pages/api/voice/token.ts`:

```ts
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { handleVoiceTokenRequest } from "../../../lib/voice/tokenHandler";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	return handleVoiceTokenRequest({
		request,
		rateLimiter: env.CHAT_RATE_LIMITER,
		chroma: {
			apiKey: env.CHROMA_API_KEY,
			tenant: env.CHROMA_TENANT,
			database: env.CHROMA_DATABASE,
			host: env.CHROMA_HOST || undefined,
		},
		googleApiKeyEmb: env.GOOGLE_API_KEY_EMB,
		googleApiKeyLive: env.GOOGLE_API_KEY_LIVE,
	});
};
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors. If `env.GOOGLE_API_KEY_LIVE` is not yet a recognized property on the Cloudflare env type, run `pnpm cf-typegen` first (regenerates types from `wrangler.jsonc`/secrets), then re-run typecheck.

- [ ] **Step 7: Commit**

```bash
git add src/lib/voice/tokenHandler.ts src/lib/voice/tokenHandler.test.ts src/pages/api/voice/token.ts
git commit -m "feat(voice): add POST /api/voice/token endpoint"
```

---

### Task 5: Voice turn persistence endpoint (`/api/voice/turn`)

Voice audio goes directly from the browser to Google — our Worker never sees it — so once a turn (visitor utterance + avatar reply) completes, the browser must explicitly report the transcribed text back to the Worker for it to be saved into history, tagged `mode: "voice"`, the same way a text turn is saved today.

**Files:**
- Create: `src/lib/voice/turnHandler.ts`
- Create: `src/pages/api/voice/turn.ts`
- Test: `src/lib/voice/turnHandler.test.ts`

**Interfaces:**
- Consumes: `resolveVisitorId`, `buildVisitorIdCookie` from `../history/cookies`; `getConversation`, `putConversation`, `buildTitle`, `type ConversationKV` from `../history/kv`; `type ChatMessage`, `type StoredConversation` from `../history/types`.
- Produces: `handleVoiceTurnRequest(options: HandleVoiceTurnRequestOptions): Promise<Response>`, where:
  ```ts
  interface VoiceTurnRequestBody {
  	persist: boolean;
  	conversationId?: string;
  	userText: string;
  	modelText: string;
  }
  interface HandleVoiceTurnRequestOptions {
  	request: Request;
  	kv: ConversationKV;
  }
  ```
  Success response: `{ conversationId?: string }` (present only when `persist: true`, so the client learns the ID for a brand-new voice conversation — same contract shape as the `meta` SSE event in text chat). No rate limiting here: this endpoint never calls Chroma or an LLM, and is already gated behind a successful `/api/voice/token` mint plus a real Live API session, so it carries negligible abuse risk on its own.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/voice/turnHandler.test.ts` (mirror the request-building and KV-assertion style already used in `src/lib/chat/handler.test.ts`, reusing `createMockKV` from `../history/testUtils`):

```ts
import { describe, expect, it } from "vitest";
import { createMockKV } from "../history/testUtils";
import type { StoredConversation } from "../history/types";
import { handleVoiceTurnRequest } from "./turnHandler";

const VISITOR_A = "11111111-1111-4111-8111-111111111111";
const CONV_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function createRequest(body: unknown, cookie?: string): Request {
	const headers = new Headers({ "Content-Type": "application/json" });
	if (cookie) headers.set("cookie", cookie);
	return new Request("https://example.com/api/voice/turn", {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
}

describe("handleVoiceTurnRequest", () => {
	it("does nothing and returns 200 with no cookie when persist is false", async () => {
		const kv = createMockKV();
		const response = await handleVoiceTurnRequest({
			request: createRequest({ persist: false, userText: "Hi", modelText: "Hello" }),
			kv,
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("Set-Cookie")).toBeNull();
		expect(kv.store.size).toBe(0);
	});

	it("persists a new voice-tagged conversation and sets a visitor_id cookie when persist is true with no prior cookie", async () => {
		const kv = createMockKV();
		const response = await handleVoiceTurnRequest({
			request: createRequest({ persist: true, userText: "Hi", modelText: "Hello there" }),
			kv,
		});

		expect(response.headers.get("Set-Cookie")).toContain("visitor_id=");
		expect(kv.store.size).toBe(1);
		const [stored] = [...kv.store.values()];
		const conversation = JSON.parse(stored) as StoredConversation;
		expect(conversation.messages).toEqual([
			expect.objectContaining({ role: "user", text: "Hi", mode: "voice" }),
			expect.objectContaining({ role: "model", text: "Hello there", mode: "voice" }),
		]);
		expect(conversation.title).toBe("Hi");
	});

	it("appends to an existing conversation when a conversationId is supplied", async () => {
		const kv = createMockKV();
		kv.store.set(
			`conv:${VISITOR_A}:${CONV_A}`,
			JSON.stringify({
				messages: [{ role: "user", text: "First", at: "2026-08-12T00:00:00.000Z" }],
				updatedAt: "2026-08-12T00:00:00.000Z",
				title: "First",
			} satisfies StoredConversation),
		);

		const response = await handleVoiceTurnRequest({
			request: createRequest(
				{ persist: true, conversationId: CONV_A, userText: "Second", modelText: "Reply" },
				`visitor_id=${VISITOR_A}`,
			),
			kv,
		});
		const body = (await response.json()) as { conversationId?: string };

		expect(body.conversationId).toBe(CONV_A);
		const conversation = JSON.parse(
			kv.store.get(`conv:${VISITOR_A}:${CONV_A}`)!,
		) as StoredConversation;
		expect(conversation.messages).toHaveLength(3);
		expect(conversation.title).toBe("First");
	});

	it("returns 400 when userText or modelText is missing", async () => {
		const kv = createMockKV();
		const response = await handleVoiceTurnRequest({
			request: createRequest({ persist: true, userText: "Hi" }),
			kv,
		});

		expect(response.status).toBe(400);
		expect(kv.store.size).toBe(0);
	});

	it("returns 400 for a client-supplied conversationId that is not a UUID", async () => {
		const kv = createMockKV();
		const response = await handleVoiceTurnRequest({
			request: createRequest(
				{ persist: true, conversationId: "../../evil", userText: "Hi", modelText: "Hello" },
				`visitor_id=${VISITOR_A}`,
			),
			kv,
		});

		expect(response.status).toBe(400);
		expect(kv.store.size).toBe(0);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/voice/turnHandler.test.ts`
Expected: FAIL — module `./turnHandler` does not exist.

- [ ] **Step 3: Implement the handler**

Create `src/lib/voice/turnHandler.ts`:

```ts
import { buildVisitorIdCookie, resolveVisitorId } from "../history/cookies";
import { buildTitle, getConversation, putConversation, type ConversationKV } from "../history/kv";
import type { ChatMessage, StoredConversation } from "../history/types";

export interface VoiceTurnRequestBody {
	persist: boolean;
	conversationId?: string;
	userText: string;
	modelText: string;
}

export interface HandleVoiceTurnRequestOptions {
	request: Request;
	kv: ConversationKV;
}

const MAX_STORED_MESSAGES = 100;
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonError(status: number, message: string): Response {
	return new Response(JSON.stringify({ message }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

const now = (): string => new Date().toISOString();

export async function handleVoiceTurnRequest(
	options: HandleVoiceTurnRequestOptions,
): Promise<Response> {
	const { request, kv } = options;

	let body: VoiceTurnRequestBody;
	try {
		body = (await request.json()) as VoiceTurnRequestBody;
	} catch {
		return jsonError(400, "Invalid JSON body");
	}
	if (!body.userText || typeof body.userText !== "string") {
		return jsonError(400, "userText is required");
	}
	if (!body.modelText || typeof body.modelText !== "string") {
		return jsonError(400, "modelText is required");
	}
	if (body.persist && body.conversationId !== undefined) {
		if (typeof body.conversationId !== "string" || !UUID_PATTERN.test(body.conversationId)) {
			return jsonError(400, "conversationId must be a UUID");
		}
	}

	if (!body.persist) {
		return new Response(JSON.stringify({}), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}

	const resolved = resolveVisitorId(request.headers.get("cookie"));
	const visitorId = resolved.visitorId;
	const conversationId = body.conversationId ?? crypto.randomUUID();

	const existing = await getConversation(kv, visitorId, conversationId);
	const priorMessages: ChatMessage[] = existing?.messages ?? [];

	const turn: ChatMessage[] = [
		{ role: "user", text: body.userText, at: now(), mode: "voice" },
		{ role: "model", text: body.modelText, at: now(), mode: "voice" },
	];

	const updated: StoredConversation = {
		messages: [...priorMessages, ...turn].slice(-MAX_STORED_MESSAGES),
		updatedAt: now(),
		title: existing?.title ?? buildTitle(body.userText),
	};
	await putConversation(kv, visitorId, conversationId, updated);

	const responseHeaders = new Headers({ "Content-Type": "application/json" });
	if (resolved.isNew) responseHeaders.set("Set-Cookie", buildVisitorIdCookie(visitorId));

	return new Response(JSON.stringify({ conversationId }), {
		status: 200,
		headers: responseHeaders,
	});
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/voice/turnHandler.test.ts`
Expected: PASS

- [ ] **Step 5: Wire the Astro route**

Create `src/pages/api/voice/turn.ts`:

```ts
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { handleVoiceTurnRequest } from "../../../lib/voice/turnHandler";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	return handleVoiceTurnRequest({ request, kv: env.SESSION });
};
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/voice/turnHandler.ts src/lib/voice/turnHandler.test.ts src/pages/api/voice/turn.ts
git commit -m "feat(voice): add POST /api/voice/turn endpoint to persist voice-tagged history"
```

---

### Task 6: Promote `GOOGLE_API_KEY_LIVE` to a Cloudflare Worker secret

This is an operational step, not a code change — `project-roadmap.md`'s Phase 0.1 already flags this key as needed before Phase 3/4 can call it from the deployed app.

**Files:** none (secret store only; `.env.example` already documents `GOOGLE_API_KEY_LIVE` from earlier phases).

- [ ] **Step 1: Confirm the key is not already set**

Run: `wrangler secret list`
Expected: `GOOGLE_API_KEY_LIVE` is absent (or present with an outdated value you intend to replace).

- [ ] **Step 2: Set the secret**

Run: `wrangler secret put GOOGLE_API_KEY_LIVE`
When prompted, paste the same value from your local `.env`'s `GOOGLE_API_KEY_LIVE`.

- [ ] **Step 3: Verify**

Run: `wrangler secret list`
Expected: `GOOGLE_API_KEY_LIVE` now appears in the list (value itself is never shown, only the name).

- [ ] **Step 4: No commit needed**

Nothing in the repo changes for this task — skip the commit step.

---

### Task 7: Live end-to-end verification

Confirms the backend actually works against real Google/Chroma APIs before the (separate, later) UI plan builds the browser-side WebSocket session on top of it. Mirrors how Phase 3's `/api/chat` was live-verified against a running dev server before being trusted (see `docs/superpowers/specs/2026-08-06-phase3-text-chat-design.md`, Testing section).

- [ ] **Step 1: Start the dev server in the background**

Run: `astro dev --background` (per this repo's `CLAUDE.md` convention)

- [ ] **Step 2: Verify the dev server is up**

Run: `astro dev status`
Expected: running, listening on its configured port (check the command's own output for the exact port).

- [ ] **Step 3: Call the token endpoint against the real backend**

Run (replace `<port>` with the port from Step 2):

```bash
curl -s -X POST "http://localhost:<port>/api/voice/token" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:<port>" \
  -d '{"language":"EN"}' | tee /tmp/voice-token-response.json
```

Expected: HTTP 200, a JSON body with non-empty `token`, `expiresAt` (a near-future ISO timestamp), and `model` fields. If this fails, run `astro dev logs` and fix the root cause (a wrong Chroma/Google credential in `.env`, a wrong field name from Task 3's SDK verification, etc.) before continuing — do not proceed to Step 4 on a failing mint.

- [ ] **Step 4: Confirm the minted token actually opens a real Live API session**

Write a throwaway script (delete it after this step) at the project root, `_tmp_verify_live_session.mjs`:

```js
import { GoogleGenAI, Modality } from "@google/genai";

const { token } = JSON.parse(
	await (await import("node:fs/promises")).readFile("/tmp/voice-token-response.json", "utf8"),
);

const ai = new GoogleGenAI({ apiKey: token });
const session = await ai.live.connect({
	model: process.argv[2], // pass the same model id /api/voice/token returned
	config: { responseModalities: [Modality.AUDIO] },
	callbacks: {
		onopen: () => console.log("OPEN"),
		onerror: (e) => console.error("ERROR", e),
		onclose: (e) => console.log("CLOSE", e?.reason),
	},
});

await new Promise((resolve) => setTimeout(resolve, 3000));
session.close();
```

Run: `node _tmp_verify_live_session.mjs "$(node -pe "require('/tmp/voice-token-response.json').model" 2>/dev/null || jq -r .model /tmp/voice-token-response.json)"`

Expected: `OPEN` printed, then `CLOSE` after ~3 seconds, with no `ERROR` line. If `ai.live.connect` has a different method name/shape in the installed SDK version, check `node_modules/@google/genai/dist/**/*.d.ts` (same technique as Task 3, Step 2) and adjust the script accordingly — the goal is any successful connect/close round-trip using the minted token, proving the token is valid and correctly scoped.

- [ ] **Step 5: Verify the turn-persistence endpoint**

```bash
curl -s -X POST "http://localhost:<port>/api/voice/turn" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:<port>" \
  -d '{"persist":true,"userText":"Does Daniel speak French?","modelText":"Yes, I studied French and hold a diploma from Alison."}'
```

Expected: HTTP 200, JSON body with a `conversationId`. Then confirm it was actually written by listing history for that visitor (a `Set-Cookie` header will have been returned on this response — re-send the request with that cookie to `/api/history/list` if you want to visually confirm it, or simply trust the unit tests from Task 5 plus this 200 response as sufficient proof of the write path, since `/api/history/*` itself was already verified in the Phase 3 plan).

- [ ] **Step 6: Clean up**

```bash
rm _tmp_verify_live_session.mjs
rm -f /tmp/voice-token-response.json
astro dev stop
```

- [ ] **Step 7: Update the roadmap**

In `project-roadmap.md`, under Phase 0.1, mark the `GOOGLE_API_KEY_LIVE` Worker-secret line as done (it was the last unchecked item in that section — check whether the Notion token part of that same line is also already done before checking the whole line). Under Phase 4, check off:
```
- [x] Build a Cloudflare Worker that mints short-lived **ephemeral tokens** for the Gemini Live API (so the browser connects directly via WebSocket without exposing the long-lived API key)
```
Leave the remaining Phase 4 checkboxes (client-side session, waves button wiring, multilingual voice, mic-permission fallback) unchecked — those belong to the separate, later UI plan.

- [ ] **Step 8: Commit**

```bash
git add project-roadmap.md
git commit -m "docs: mark voice token backend + Live secret as done in roadmap"
```
