# Phase 3 Chat Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend half of Phase 3 text chat: an SSE-streaming `/api/chat` route that calls `gemma-4-31b-it` grounded in the existing RAG pipeline, a consent-gated KV conversation history system, `/api/history/*` routes, and native Cloudflare rate limiting — all verified against a real running dev server before the UI plan starts.

**Architecture:** Astro server routes (`src/pages/api/chat.ts`, `src/pages/api/history/*.ts`) stay thin — they pull Cloudflare bindings from `cloudflare:workers`'s `env` and delegate to pure, unit-testable handler functions in `src/lib/chat/`. Those handlers compose existing RAG modules (`src/lib/rag/{retrieve,prompt}.ts`) with new modules for KV-backed conversation storage (`src/lib/history/`), visitor cookie handling, SSE formatting, and the Gemini streaming call (`src/lib/rag/{sse,chat}.ts`).

**Tech Stack:** Astro 7 (`@astrojs/cloudflare` adapter, `output: "server"`), Cloudflare Workers (KV, native Rate Limiting binding), Gemini API (`gemma-4-31b-it` via REST `streamGenerateContent?alt=sse`), Vitest.

## Global Constraints

- Chat model: `gemma-4-31b-it`, called via Google AI Studio / Gemini API REST endpoints, using the `GOOGLE_API_KEY_LLM` secret (never `GOOGLE_API_KEY_EMB`, which stays reserved for embeddings).
- `GOOGLE_API_KEY_LLM`, `GOOGLE_API_KEY_EMB`, and the Chroma credentials are server-side secrets only — never sent to the client, never logged.
- Conversation TTL is a rolling 30 days from the last message: `expirationTtl: 60 * 60 * 24 * 30` on every KV write.
- `visitor_id` cookie: `HttpOnly`, `Secure`, `SameSite=Lax`, `Max-Age=60 * 60 * 24 * 365` (~1 year) — set only when `persist: true` is requested, never otherwise.
- Rate limit: Cloudflare Workers native Rate Limiting binding, ~10 requests/60s per key (Cloudflare requires `period` to be exactly `10` or `60` seconds).
- SSE event names are exactly `meta`, `delta`, `done`, `error` (see spec).
- All new TypeScript follows the existing repo conventions: tabs for indentation, double quotes, no semicolonless style deviations — match `src/lib/rag/*.ts` formatting (Prettier will enforce this; run `pnpm format` if unsure).
- Node `>=22.12.0`, package manager `pnpm`, TypeScript strict mode (`astro/tsconfigs/strict`).
- Reference spec: `docs/superpowers/specs/2026-08-06-phase3-text-chat-design.md`. This plan implements the "Backend" half only (delivery plan item 1).

---

### Task 1: Wrangler config, KV/Rate-Limit bindings, local dev secrets

**Files:**
- Modify: `wrangler.jsonc`
- Modify: `.gitignore`
- Modify: `package.json`
- Create: `.dev.vars` (gitignored, real local secret values)
- Create: `.dev.vars.example` (committed, placeholders)
- Create: `worker-configuration.d.ts` (generated, committed)

**Interfaces:**
- Produces: a `SESSION` KV binding and a `CHAT_RATE_LIMITER` rate-limit binding available via `env` from `cloudflare:workers` in every later task, plus ambient `Env` types covering `SESSION`, `CHAT_RATE_LIMITER`, `GOOGLE_API_KEY_EMB`, `GOOGLE_API_KEY_LLM`, `CHROMA_HOST`, `CHROMA_API_KEY`, `CHROMA_TENANT`, `CHROMA_DATABASE`.

- [ ] **Step 1: Add the KV namespace and rate-limit bindings to `wrangler.jsonc`**

The project already has a real, provisioned KV namespace (`interactive-portfolio-session`, id `5d50ebf2b87d44b2b45eb962c56bae42`) that the roadmap notes was auto-provisioned but never wired up. Reuse it — don't create a second one.

Replace the contents of `wrangler.jsonc` with:

```jsonc
{
	"$schema": "./node_modules/wrangler/config-schema.json",
	"name": "interactive-portfolio",
	"kv_namespaces": [
		{
			"binding": "SESSION",
			"id": "5d50ebf2b87d44b2b45eb962c56bae42"
		}
	],
	"ratelimits": [
		{
			"name": "CHAT_RATE_LIMITER",
			"namespace_id": "1001",
			"simple": {
				"limit": 10,
				"period": 60
			}
		}
	]
}
```

- [ ] **Step 2: Create `.dev.vars` with real local secret values**

`astro dev` (via the Cloudflare Vite plugin) reads secrets for local development from a `.dev.vars` file at the project root — this is separate from `.env` (which only `scripts/ingest.ts` reads via `--env-file`). Copy the relevant values already in your local `.env` into a new `.dev.vars` file:

```
GOOGLE_API_KEY_EMB=<same value as in .env>
GOOGLE_API_KEY_LLM=<same value as in .env>
CHROMA_HOST=<same value as in .env>
CHROMA_API_KEY=<same value as in .env>
CHROMA_TENANT=<same value as in .env>
CHROMA_DATABASE=<same value as in .env>
```

- [ ] **Step 3: Create the committed `.dev.vars.example` placeholder**

```
GOOGLE_API_KEY_EMB=
GOOGLE_API_KEY_LLM=
CHROMA_HOST=
CHROMA_API_KEY=
CHROMA_TENANT=
CHROMA_DATABASE=
```

- [ ] **Step 4: Gitignore `.dev.vars`**

Add to `.gitignore`, near the existing `.env` entries:

```
# local Cloudflare Worker dev secrets (see .dev.vars.example)
.dev.vars
```

- [ ] **Step 5: Add a `cf-typegen` script and generate binding types**

Add to `package.json`'s `"scripts"`:

```json
"cf-typegen": "wrangler types"
```

Run: `pnpm cf-typegen`

Expected: creates/updates `worker-configuration.d.ts` at the project root with an ambient `Env` interface including `SESSION: KVNamespace`, `CHAT_RATE_LIMITER: RateLimit`, and (because `.dev.vars` now exists) `GOOGLE_API_KEY_EMB: string`, `GOOGLE_API_KEY_LLM: string`, `CHROMA_HOST: string`, `CHROMA_API_KEY: string`, `CHROMA_TENANT: string`, `CHROMA_DATABASE: string`.

- [ ] **Step 6: Verify typecheck picks up the generated types**

Run: `pnpm typecheck`
Expected: passes (no new errors — nothing references `Env` yet, this just confirms the generated file is syntactically valid and included by `tsconfig.json`'s `"include": ["**/*"]`).

- [ ] **Step 7: Commit**

```bash
git add wrangler.jsonc .gitignore package.json .dev.vars.example worker-configuration.d.ts
git commit -m "Add KV and rate-limit bindings for Phase 3 chat backend"
```

(`.dev.vars` itself must NOT be committed — confirm with `git status` that only the files above are staged.)

---

### Task 2: Conversation types and KV history helpers

**Files:**
- Create: `src/lib/history/types.ts`
- Create: `src/lib/history/kv.ts`
- Test: `src/lib/history/kv.test.ts`

**Interfaces:**
- Produces: `ChatMessage { role: "user" | "model"; text: string; at: string }`, `StoredConversation { messages: ChatMessage[]; updatedAt: string; title: string }`, `ConversationSummary { conversationId: string; title: string; updatedAt: string }` (from `types.ts`); `ConversationKV` interface and `getConversation`, `putConversation`, `listConversations`, `deleteConversation`, `deleteAllConversations`, `buildTitle` (from `kv.ts`) — all consumed directly by Task 6 and Task 7.

- [ ] **Step 1: Create the shared types**

`src/lib/history/types.ts`:

```typescript
export interface ChatMessage {
	role: "user" | "model";
	text: string;
	at: string; // ISO timestamp
}

export interface StoredConversation {
	messages: ChatMessage[];
	updatedAt: string; // ISO timestamp
	title: string;
}

export interface ConversationSummary {
	conversationId: string;
	title: string;
	updatedAt: string;
}
```

- [ ] **Step 2: Write the failing tests for the KV helpers**

`src/lib/history/kv.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
	buildTitle,
	deleteAllConversations,
	deleteConversation,
	getConversation,
	listConversations,
	putConversation,
	type ConversationKV,
} from "./kv";
import type { StoredConversation } from "./types";

function createMockKV(): ConversationKV & { store: Map<string, string> } {
	const store = new Map<string, string>();
	return {
		store,
		async get(key) {
			return store.get(key) ?? null;
		},
		async put(key, value) {
			store.set(key, value);
		},
		async delete(key) {
			store.delete(key);
		},
		async list({ prefix }) {
			const keys = [...store.keys()]
				.filter((key) => key.startsWith(prefix))
				.map((name) => ({ name }));
			return { keys };
		},
	};
}

const sampleConversation: StoredConversation = {
	messages: [{ role: "user", text: "Hi", at: "2026-08-06T00:00:00.000Z" }],
	updatedAt: "2026-08-06T00:00:00.000Z",
	title: "Hi",
};

describe("conversation KV helpers", () => {
	it("round-trips a conversation through put/get", async () => {
		const kv = createMockKV();
		await putConversation(kv, "visitor-1", "conv-1", sampleConversation);
		const result = await getConversation(kv, "visitor-1", "conv-1");
		expect(result).toEqual(sampleConversation);
	});

	it("returns null for a missing conversation", async () => {
		const kv = createMockKV();
		const result = await getConversation(kv, "visitor-1", "does-not-exist");
		expect(result).toBeNull();
	});

	it("sets a 30-day expirationTtl on every write", async () => {
		const kv = createMockKV();
		let capturedOptions: { expirationTtl?: number } | undefined;
		kv.put = async (key, value, options) => {
			capturedOptions = options;
			kv.store.set(key, value);
		};
		await putConversation(kv, "visitor-1", "conv-1", sampleConversation);
		expect(capturedOptions?.expirationTtl).toBe(60 * 60 * 24 * 30);
	});

	it("lists only the requesting visitor's conversations, newest first", async () => {
		const kv = createMockKV();
		await putConversation(kv, "visitor-1", "conv-old", {
			...sampleConversation,
			updatedAt: "2026-08-01T00:00:00.000Z",
			title: "Old",
		});
		await putConversation(kv, "visitor-1", "conv-new", {
			...sampleConversation,
			updatedAt: "2026-08-05T00:00:00.000Z",
			title: "New",
		});
		await putConversation(kv, "visitor-2", "conv-other", sampleConversation);

		const result = await listConversations(kv, "visitor-1");

		expect(result).toEqual([
			{ conversationId: "conv-new", title: "New", updatedAt: "2026-08-05T00:00:00.000Z" },
			{ conversationId: "conv-old", title: "Old", updatedAt: "2026-08-01T00:00:00.000Z" },
		]);
	});

	it("deletes a single conversation", async () => {
		const kv = createMockKV();
		await putConversation(kv, "visitor-1", "conv-1", sampleConversation);
		await deleteConversation(kv, "visitor-1", "conv-1");
		expect(await getConversation(kv, "visitor-1", "conv-1")).toBeNull();
	});

	it("deletes all conversations for a visitor without touching other visitors", async () => {
		const kv = createMockKV();
		await putConversation(kv, "visitor-1", "conv-1", sampleConversation);
		await putConversation(kv, "visitor-1", "conv-2", sampleConversation);
		await putConversation(kv, "visitor-2", "conv-3", sampleConversation);

		await deleteAllConversations(kv, "visitor-1");

		expect(await listConversations(kv, "visitor-1")).toEqual([]);
		expect(await getConversation(kv, "visitor-2", "conv-3")).not.toBeNull();
	});
});

describe("buildTitle", () => {
	it("returns short messages unchanged", () => {
		expect(buildTitle("Hi there")).toBe("Hi there");
	});

	it("truncates long messages to 60 chars with an ellipsis", () => {
		const long = "a".repeat(80);
		const title = buildTitle(long);
		expect(title).toBe(`${"a".repeat(60)}…`);
	});
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test src/lib/history/kv.test.ts`
Expected: FAIL — `Cannot find module './kv'` (file doesn't exist yet).

- [ ] **Step 4: Implement the KV helpers**

`src/lib/history/kv.ts`:

```typescript
import type { ChatMessage, ConversationSummary, StoredConversation } from "./types";

const CONVERSATION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days, rolling from last write

export interface ConversationKV {
	get(key: string): Promise<string | null>;
	put(
		key: string,
		value: string,
		options?: { expirationTtl?: number },
	): Promise<void>;
	delete(key: string): Promise<void>;
	list(options: { prefix: string }): Promise<{ keys: { name: string }[] }>;
}

function conversationKey(visitorId: string, conversationId: string): string {
	return `conv:${visitorId}:${conversationId}`;
}

function conversationPrefix(visitorId: string): string {
	return `conv:${visitorId}:`;
}

export async function getConversation(
	kv: ConversationKV,
	visitorId: string,
	conversationId: string,
): Promise<StoredConversation | null> {
	const raw = await kv.get(conversationKey(visitorId, conversationId));
	if (!raw) return null;
	return JSON.parse(raw) as StoredConversation;
}

export async function putConversation(
	kv: ConversationKV,
	visitorId: string,
	conversationId: string,
	conversation: StoredConversation,
): Promise<void> {
	await kv.put(
		conversationKey(visitorId, conversationId),
		JSON.stringify(conversation),
		{ expirationTtl: CONVERSATION_TTL_SECONDS },
	);
}

export async function listConversations(
	kv: ConversationKV,
	visitorId: string,
): Promise<ConversationSummary[]> {
	const prefix = conversationPrefix(visitorId);
	const { keys } = await kv.list({ prefix });

	const summaries = await Promise.all(
		keys.map(async (key): Promise<ConversationSummary | null> => {
			const raw = await kv.get(key.name);
			if (!raw) return null;
			const conversation = JSON.parse(raw) as StoredConversation;
			return {
				conversationId: key.name.slice(prefix.length),
				title: conversation.title,
				updatedAt: conversation.updatedAt,
			};
		}),
	);

	return summaries
		.filter((summary): summary is ConversationSummary => summary !== null)
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteConversation(
	kv: ConversationKV,
	visitorId: string,
	conversationId: string,
): Promise<void> {
	await kv.delete(conversationKey(visitorId, conversationId));
}

export async function deleteAllConversations(
	kv: ConversationKV,
	visitorId: string,
): Promise<void> {
	const { keys } = await kv.list({ prefix: conversationPrefix(visitorId) });
	await Promise.all(keys.map((key) => kv.delete(key.name)));
}

export function buildTitle(firstUserMessage: string): string {
	const trimmed = firstUserMessage.trim();
	return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
}

// Re-exported for convenience so callers don't need a separate import.
export type { ChatMessage, StoredConversation, ConversationSummary } from "./types";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test src/lib/history/kv.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm typecheck`
Expected: passes.

```bash
git add src/lib/history/types.ts src/lib/history/kv.ts src/lib/history/kv.test.ts
git commit -m "Add KV-backed conversation history helpers"
```

---

### Task 3: Visitor cookie helpers

**Files:**
- Create: `src/lib/history/cookies.ts`
- Test: `src/lib/history/cookies.test.ts`

**Interfaces:**
- Produces: `readVisitorId(cookieHeader: string | null): string | undefined`, `buildVisitorIdCookie(visitorId: string): string`, `resolveVisitorId(cookieHeader: string | null): { visitorId: string; isNew: boolean }` — consumed by Task 6 (`handleChatRequest`) and Task 7 (`historyHandlers`).

- [ ] **Step 1: Write the failing tests**

`src/lib/history/cookies.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildVisitorIdCookie, readVisitorId, resolveVisitorId } from "./cookies";

describe("readVisitorId", () => {
	it("returns undefined when there is no cookie header", () => {
		expect(readVisitorId(null)).toBeUndefined();
	});

	it("returns undefined when visitor_id is not present", () => {
		expect(readVisitorId("other=1; another=2")).toBeUndefined();
	});

	it("extracts visitor_id from a cookie header with multiple cookies", () => {
		expect(readVisitorId("other=1; visitor_id=abc-123; another=2")).toBe("abc-123");
	});

	it("decodes URI-encoded values", () => {
		expect(readVisitorId("visitor_id=abc%2F123")).toBe("abc/123");
	});
});

describe("buildVisitorIdCookie", () => {
	it("includes HttpOnly, Secure, SameSite=Lax, and a ~1 year Max-Age", () => {
		const cookie = buildVisitorIdCookie("abc-123");
		expect(cookie).toContain("visitor_id=abc-123");
		expect(cookie).toContain("HttpOnly");
		expect(cookie).toContain("Secure");
		expect(cookie).toContain("SameSite=Lax");
		expect(cookie).toContain(`Max-Age=${60 * 60 * 24 * 365}`);
	});
});

describe("resolveVisitorId", () => {
	it("reuses an existing visitor_id and marks it as not new", () => {
		const result = resolveVisitorId("visitor_id=existing-id");
		expect(result).toEqual({ visitorId: "existing-id", isNew: false });
	});

	it("generates a new visitor_id when none is present", () => {
		const result = resolveVisitorId(null);
		expect(result.isNew).toBe(true);
		expect(result.visitorId).toMatch(/^[0-9a-f-]{36}$/);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/history/cookies.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the cookie helpers**

`src/lib/history/cookies.ts`:

```typescript
const VISITOR_ID_COOKIE = "visitor_id";
const VISITOR_ID_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // ~1 year

export function readVisitorId(cookieHeader: string | null): string | undefined {
	if (!cookieHeader) return undefined;

	const match = cookieHeader
		.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(`${VISITOR_ID_COOKIE}=`));
	if (!match) return undefined;

	return decodeURIComponent(match.slice(VISITOR_ID_COOKIE.length + 1));
}

export function buildVisitorIdCookie(visitorId: string): string {
	return [
		`${VISITOR_ID_COOKIE}=${encodeURIComponent(visitorId)}`,
		`Max-Age=${VISITOR_ID_MAX_AGE_SECONDS}`,
		"Path=/",
		"HttpOnly",
		"Secure",
		"SameSite=Lax",
	].join("; ");
}

export function resolveVisitorId(
	cookieHeader: string | null,
): { visitorId: string; isNew: boolean } {
	const existing = readVisitorId(cookieHeader);
	if (existing) return { visitorId: existing, isNew: false };
	return { visitorId: crypto.randomUUID(), isNew: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/history/cookies.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/history/cookies.ts src/lib/history/cookies.test.ts
git commit -m "Add visitor_id cookie helpers"
```

---

### Task 4: SSE event formatting helper

**Files:**
- Create: `src/lib/rag/sse.ts`
- Test: `src/lib/rag/sse.test.ts`

**Interfaces:**
- Produces: `ChatSseEvent` union type and `formatSseEvent(event: ChatSseEvent): string` — consumed by Task 6 (`handleChatRequest`).

- [ ] **Step 1: Write the failing tests**

`src/lib/rag/sse.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { formatSseEvent } from "./sse";

describe("formatSseEvent", () => {
	it("formats a meta event", () => {
		expect(formatSseEvent({ event: "meta", data: { conversationId: "conv-1" } })).toBe(
			'event: meta\ndata: {"conversationId":"conv-1"}\n\n',
		);
	});

	it("formats a delta event", () => {
		expect(formatSseEvent({ event: "delta", data: { text: "Hi" } })).toBe(
			'event: delta\ndata: {"text":"Hi"}\n\n',
		);
	});

	it("formats a done event with an empty data object", () => {
		expect(formatSseEvent({ event: "done", data: {} })).toBe("event: done\ndata: {}\n\n");
	});

	it("formats an error event", () => {
		expect(formatSseEvent({ event: "error", data: { message: "boom" } })).toBe(
			'event: error\ndata: {"message":"boom"}\n\n',
		);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/rag/sse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the SSE formatter**

`src/lib/rag/sse.ts`:

```typescript
export type ChatSseEvent =
	| { event: "meta"; data: { conversationId: string } }
	| { event: "delta"; data: { text: string } }
	| { event: "done"; data: Record<string, never> }
	| { event: "error"; data: { message: string } };

export function formatSseEvent(event: ChatSseEvent): string {
	return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/rag/sse.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/sse.ts src/lib/rag/sse.test.ts
git commit -m "Add SSE event formatting helper"
```

---

### Task 5: Gemini streaming chat completion

**Files:**
- Create: `src/lib/rag/chat.ts`
- Test: `src/lib/rag/chat.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (standalone module, mirrors the existing `src/lib/rag/embed.ts` pattern of calling the Gemini REST API directly via `fetch`).
- Produces: `ChatMessageForModel { role: "user" | "model"; text: string }`, `FetchLike` type, `streamChatCompletion(options): AsyncGenerator<string>`, `parseGeminiSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<string>` — consumed by Task 6 (`handleChatRequest`).

- [ ] **Step 1: Write the failing tests**

`src/lib/rag/chat.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { parseGeminiSseStream, streamChatCompletion, type FetchLike } from "./chat";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
			controller.close();
		},
	});
}

async function collect<T>(iterable: AsyncGenerator<T>): Promise<T[]> {
	const result: T[] = [];
	for await (const value of iterable) result.push(value);
	return result;
}

function fakeFetch(
	status: number,
	body: ReadableStream<Uint8Array> | null,
	text = "",
): FetchLike {
	return async () => ({
		ok: status >= 200 && status < 300,
		status,
		body,
		text: async () => text,
	});
}

describe("parseGeminiSseStream", () => {
	it("yields the text of each streamed chunk in order", async () => {
		const body = streamFromChunks([
			'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n\n',
			'data: {"candidates":[{"content":{"parts":[{"text":" there"}]}}]}\n\n',
		]);

		expect(await collect(parseGeminiSseStream(body))).toEqual(["Hello", " there"]);
	});

	it("handles a chunk split across two reads", async () => {
		const body = streamFromChunks([
			'data: {"candidates":[{"content":{"parts":[{"text":"Hel',
			'lo"}]}}]}\n\n',
		]);

		expect(await collect(parseGeminiSseStream(body))).toEqual(["Hello"]);
	});

	it("skips events with no text (e.g. a final finishReason-only chunk)", async () => {
		const body = streamFromChunks([
			'data: {"candidates":[{"content":{"parts":[{"text":"Hi"}]},"finishReason":null}]}\n\n',
			'data: {"candidates":[{"finishReason":"STOP"}]}\n\n',
		]);

		expect(await collect(parseGeminiSseStream(body))).toEqual(["Hi"]);
	});
});

describe("streamChatCompletion", () => {
	it("posts the system prompt and message history, then yields streamed text", async () => {
		const fetchImpl = vi.fn().mockImplementation(
			fakeFetch(
				200,
				streamFromChunks(['data: {"candidates":[{"content":{"parts":[{"text":"Hi!"}]}}]}\n\n']),
			),
		);

		const result = await collect(
			streamChatCompletion({
				systemPrompt: "You are Daniel's avatar.",
				messages: [{ role: "user", text: "Hello" }],
				apiKey: "test-key",
				fetchImpl,
			}),
		);

		expect(result).toEqual(["Hi!"]);
		expect(fetchImpl).toHaveBeenCalledWith(
			expect.stringContaining("gemma-4-31b-it:streamGenerateContent?alt=sse&key=test-key"),
			expect.objectContaining({ method: "POST" }),
		);
		const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.systemInstruction).toEqual({ parts: [{ text: "You are Daniel's avatar." }] });
		expect(body.contents).toEqual([{ role: "user", parts: [{ text: "Hello" }] }]);
	});

	it("throws with status and body text on a non-ok response", async () => {
		const fetchImpl = vi.fn().mockImplementation(fakeFetch(429, null, "quota exceeded"));

		await expect(
			collect(
				streamChatCompletion({
					systemPrompt: "sys",
					messages: [{ role: "user", text: "hi" }],
					apiKey: "test-key",
					fetchImpl,
				}),
			),
		).rejects.toThrow(/429/);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/rag/chat.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the Gemini streaming chat module**

`src/lib/rag/chat.ts`:

```typescript
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const CHAT_MODEL = "gemma-4-31b-it";

export interface ChatMessageForModel {
	role: "user" | "model";
	text: string;
}

/** Narrow structural subset of `fetch` — real `fetch` satisfies this. */
export interface FetchLike {
	(url: string, init: RequestInit): Promise<{
		ok: boolean;
		status: number;
		body: ReadableStream<Uint8Array> | null;
		text(): Promise<string>;
	}>;
}

export interface StreamChatCompletionOptions {
	systemPrompt: string;
	messages: ChatMessageForModel[];
	apiKey: string;
	fetchImpl?: FetchLike;
}

/** Calls Gemini's streamGenerateContent for gemma-4-31b-it and yields text deltas. */
export async function* streamChatCompletion(
	options: StreamChatCompletionOptions,
): AsyncGenerator<string> {
	const { systemPrompt, messages, apiKey, fetchImpl = fetch } = options;

	const response = await fetchImpl(
		`${API_BASE}/${CHAT_MODEL}:streamGenerateContent?alt=sse&key=${apiKey}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				systemInstruction: { parts: [{ text: systemPrompt }] },
				contents: messages.map((message) => ({
					role: message.role,
					parts: [{ text: message.text }],
				})),
			}),
		},
	);

	if (!response.ok || !response.body) {
		throw new Error(
			`Chat completion request failed (${response.status}): ${await response.text()}`,
		);
	}

	yield* parseGeminiSseStream(response.body);
}

/** Parses a Gemini `alt=sse` stream body into a sequence of text deltas. */
export async function* parseGeminiSseStream(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		const events = buffer.split("\n\n");
		buffer = events.pop() ?? "";

		for (const event of events) {
			const text = extractTextFromSseEvent(event);
			if (text) yield text;
		}
	}

	const text = extractTextFromSseEvent(buffer);
	if (text) yield text;
}

function extractTextFromSseEvent(event: string): string | undefined {
	const dataLine = event.split("\n").find((line) => line.startsWith("data:"));
	if (!dataLine) return undefined;

	const jsonText = dataLine.slice("data:".length).trim();
	if (!jsonText) return undefined;

	const parsed = JSON.parse(jsonText) as {
		candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
	};
	return parsed.candidates?.[0]?.content?.parts?.[0]?.text;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/rag/chat.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rag/chat.ts src/lib/rag/chat.test.ts
git commit -m "Add Gemini streaming chat completion for gemma-4-31b-it"
```

---

### Task 6: `/api/chat` handler and route

**Files:**
- Create: `src/lib/chat/handler.ts`
- Test: `src/lib/chat/handler.test.ts`
- Create: `src/pages/api/chat.ts`

**Interfaces:**
- Consumes: `retrieveContext`/`ChromaCredentials` (`src/lib/rag/retrieve.ts`), `buildSystemPrompt` (`src/lib/rag/prompt.ts`), `streamChatCompletion`/`ChatMessageForModel` (`src/lib/rag/chat.ts`), `formatSseEvent` (`src/lib/rag/sse.ts`), `getConversation`/`putConversation`/`buildTitle`/`ConversationKV` (`src/lib/history/kv.ts`), `resolveVisitorId`/`buildVisitorIdCookie` (`src/lib/history/cookies.ts`), `ChatMessage`/`StoredConversation` (`src/lib/history/types.ts`).
- Produces: `RateLimiter` interface, `ChatRequestBody`, `HandleChatRequestOptions`, `handleChatRequest(options): Promise<Response>` — consumed by `src/pages/api/chat.ts` and, structurally, by any future route needing the same handler.

- [ ] **Step 1: Write the failing tests**

`src/lib/chat/handler.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationKV } from "../history/kv";
import type { StoredConversation } from "../history/types";

vi.mock("../rag/retrieve", () => ({
	retrieveContext: vi.fn().mockResolvedValue([]),
}));
vi.mock("../rag/chat", () => ({
	streamChatCompletion: vi.fn(async function* () {
		yield "Hello";
		yield " there";
	}),
}));

import { retrieveContext } from "../rag/retrieve";
import { streamChatCompletion } from "../rag/chat";
import { handleChatRequest } from "./handler";

function createMockKV(): ConversationKV & { store: Map<string, string> } {
	const store = new Map<string, string>();
	return {
		store,
		async get(key) {
			return store.get(key) ?? null;
		},
		async put(key, value) {
			store.set(key, value);
		},
		async delete(key) {
			store.delete(key);
		},
		async list({ prefix }) {
			const keys = [...store.keys()]
				.filter((key) => key.startsWith(prefix))
				.map((name) => ({ name }));
			return { keys };
		},
	};
}

function createRequest(body: unknown, cookie?: string): Request {
	const headers = new Headers({ "Content-Type": "application/json" });
	if (cookie) headers.set("cookie", cookie);
	return new Request("https://example.com/api/chat", {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
}

async function readSse(response: Response): Promise<string> {
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	let text = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		text += decoder.decode(value);
	}
	return text;
}

function baseOptions(kv: ConversationKV) {
	return {
		kv,
		rateLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
		chroma: { apiKey: "k", tenant: "t", database: "d" },
		googleApiKeyEmb: "emb-key",
		googleApiKeyLlm: "llm-key",
	};
}

beforeEach(() => {
	vi.mocked(retrieveContext).mockClear();
	vi.mocked(retrieveContext).mockResolvedValue([]);
	vi.mocked(streamChatCompletion).mockClear();
	vi.mocked(streamChatCompletion).mockImplementation(async function* () {
		yield "Hello";
		yield " there";
	});
});

describe("handleChatRequest", () => {
	it("streams delta events and a done event for a persist:false request", async () => {
		const kv = createMockKV();
		const response = await handleChatRequest({
			request: createRequest({ persist: false, message: "Hi", history: [] }),
			...baseOptions(kv),
		});

		const text = await readSse(response);

		expect(text).toContain('event: delta\ndata: {"text":"Hello"}');
		expect(text).toContain('event: delta\ndata: {"text":" there"}');
		expect(text).toContain("event: done");
		expect(text).not.toContain("event: meta");
		expect(response.headers.get("Set-Cookie")).toBeNull();
		expect(kv.store.size).toBe(0);
	});

	it("sets a visitor_id cookie and persists the conversation when persist:true with no prior cookie", async () => {
		const kv = createMockKV();
		const response = await handleChatRequest({
			request: createRequest({ persist: true, message: "Hi" }),
			...baseOptions(kv),
		});

		await readSse(response);

		expect(response.headers.get("Set-Cookie")).toContain("visitor_id=");
		expect(kv.store.size).toBe(1);
		const [stored] = [...kv.store.values()];
		const conversation = JSON.parse(stored) as StoredConversation;
		expect(conversation.messages).toEqual([
			expect.objectContaining({ role: "user", text: "Hi" }),
			expect.objectContaining({ role: "model", text: "Hello there" }),
		]);
		expect(conversation.title).toBe("Hi");
	});

	it("sends a meta event with the conversationId for a persist:true request", async () => {
		const kv = createMockKV();
		const response = await handleChatRequest({
			request: createRequest(
				{ persist: true, conversationId: "conv-1", message: "Hi" },
				"visitor_id=v-1",
			),
			...baseOptions(kv),
		});

		const text = await readSse(response);

		expect(text).toContain('event: meta\ndata: {"conversationId":"conv-1"}');
		expect(kv.store.has("conv:v-1:conv-1")).toBe(true);
	});

	it("continues an existing conversation, preserving its title", async () => {
		const kv = createMockKV();
		kv.store.set(
			"conv:v-1:conv-1",
			JSON.stringify({
				messages: [{ role: "user", text: "First", at: "2026-08-06T00:00:00.000Z" }],
				updatedAt: "2026-08-06T00:00:00.000Z",
				title: "First",
			} satisfies StoredConversation),
		);

		const response = await handleChatRequest({
			request: createRequest(
				{ persist: true, conversationId: "conv-1", message: "Second" },
				"visitor_id=v-1",
			),
			...baseOptions(kv),
		});
		await readSse(response);

		const conversation = JSON.parse(kv.store.get("conv:v-1:conv-1")!) as StoredConversation;
		expect(conversation.title).toBe("First");
		expect(conversation.messages).toHaveLength(3);
	});

	it("returns 429 without calling retrieveContext when the rate limit is exceeded", async () => {
		const kv = createMockKV();
		const options = baseOptions(kv);
		options.rateLimiter.limit = vi.fn().mockResolvedValue({ success: false });

		const response = await handleChatRequest({
			request: createRequest({ persist: false, message: "Hi", history: [] }),
			...options,
		});

		expect(response.status).toBe(429);
		expect(retrieveContext).not.toHaveBeenCalled();
	});

	it("returns 400 for a missing message", async () => {
		const kv = createMockKV();
		const response = await handleChatRequest({
			request: createRequest({ persist: false, history: [] }),
			...baseOptions(kv),
		});

		expect(response.status).toBe(400);
	});

	it("proceeds with empty context when retrieveContext fails", async () => {
		vi.mocked(retrieveContext).mockRejectedValueOnce(new Error("chroma down"));
		const kv = createMockKV();

		const response = await handleChatRequest({
			request: createRequest({ persist: false, message: "Hi", history: [] }),
			...baseOptions(kv),
		});

		const text = await readSse(response);
		expect(text).toContain("event: delta");
		expect(text).not.toContain("event: error");
	});

	it("emits an error event when the model call fails mid-stream", async () => {
		vi.mocked(streamChatCompletion).mockImplementationOnce(async function* () {
			yield "partial";
			throw new Error("model exploded");
		});
		const kv = createMockKV();

		const response = await handleChatRequest({
			request: createRequest({ persist: false, message: "Hi", history: [] }),
			...baseOptions(kv),
		});

		const text = await readSse(response);
		expect(text).toContain("event: delta");
		expect(text).toContain('event: error\ndata: {"message":"model exploded"}');
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/chat/handler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the handler**

`src/lib/chat/handler.ts`:

```typescript
import { buildSystemPrompt } from "../rag/prompt";
import { streamChatCompletion, type ChatMessageForModel } from "../rag/chat";
import { formatSseEvent } from "../rag/sse";
import { retrieveContext, type ChromaCredentials } from "../rag/retrieve";
import { buildVisitorIdCookie, resolveVisitorId } from "../history/cookies";
import {
	buildTitle,
	getConversation,
	putConversation,
	type ConversationKV,
} from "../history/kv";
import type { ChatMessage, StoredConversation } from "../history/types";

export interface RateLimiter {
	limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface ChatRequestBody {
	persist: boolean;
	conversationId?: string;
	history?: ChatMessage[];
	message: string;
	language?: string;
}

export interface HandleChatRequestOptions {
	request: Request;
	kv: ConversationKV;
	rateLimiter: RateLimiter;
	chroma: ChromaCredentials;
	googleApiKeyEmb: string;
	googleApiKeyLlm: string;
}

const RATE_LIMIT_IP_HEADER = "cf-connecting-ip";

function jsonError(status: number, message: string): Response {
	return new Response(JSON.stringify({ message }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

const now = (): string => new Date().toISOString();

export async function handleChatRequest(
	options: HandleChatRequestOptions,
): Promise<Response> {
	const { request, kv, rateLimiter, chroma, googleApiKeyEmb, googleApiKeyLlm } = options;

	let body: ChatRequestBody;
	try {
		body = (await request.json()) as ChatRequestBody;
	} catch {
		return jsonError(400, "Invalid JSON body");
	}
	if (!body.message || typeof body.message !== "string") {
		return jsonError(400, "message is required");
	}

	let visitorId: string | undefined;
	let setCookieHeader: string | undefined;
	if (body.persist) {
		const resolved = resolveVisitorId(request.headers.get("cookie"));
		visitorId = resolved.visitorId;
		if (resolved.isNew) setCookieHeader = buildVisitorIdCookie(visitorId);
	}

	const rateLimitKey =
		visitorId ?? request.headers.get(RATE_LIMIT_IP_HEADER) ?? "anonymous";
	const { success } = await rateLimiter.limit({ key: rateLimitKey });
	if (!success) return jsonError(429, "Rate limit exceeded");

	const conversationId = body.persist
		? (body.conversationId ?? crypto.randomUUID())
		: undefined;

	let priorMessages: ChatMessage[] = [];
	let existingTitle: string | undefined;
	if (body.persist && visitorId && conversationId) {
		const existing = await getConversation(kv, visitorId, conversationId);
		priorMessages = existing?.messages ?? [];
		existingTitle = existing?.title;
	} else if (!body.persist) {
		priorMessages = body.history ?? [];
	}

	const userMessage: ChatMessage = { role: "user", text: body.message, at: now() };
	const messagesForModel: ChatMessageForModel[] = [...priorMessages, userMessage].map(
		({ role, text }) => ({ role, text }),
	);

	const responseHeaders = new Headers({
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
	});
	if (setCookieHeader) responseHeaders.set("Set-Cookie", setCookieHeader);

	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (chunk: string) => controller.enqueue(encoder.encode(chunk));

			if (body.persist && conversationId) {
				send(formatSseEvent({ event: "meta", data: { conversationId } }));
			}

			let fullReply = "";
			try {
				const chunks = await retrieveContext({
					chroma,
					googleApiKey: googleApiKeyEmb,
					query: body.message,
					language: body.language,
				}).catch(() => []);

				const systemPrompt = buildSystemPrompt({ chunks, visitorLanguage: body.language });

				for await (const delta of streamChatCompletion({
					systemPrompt,
					messages: messagesForModel,
					apiKey: googleApiKeyLlm,
				})) {
					fullReply += delta;
					send(formatSseEvent({ event: "delta", data: { text: delta } }));
				}

				send(formatSseEvent({ event: "done", data: {} }));

				// Persist BEFORE closing: Cloudflare Workers may not guarantee code
				// scheduled after controller.close() runs to completion.
				if (body.persist && visitorId && conversationId && fullReply) {
					const assistantMessage: ChatMessage = {
						role: "model",
						text: fullReply,
						at: now(),
					};
					const updated: StoredConversation = {
						messages: [...priorMessages, userMessage, assistantMessage],
						updatedAt: now(),
						title: existingTitle ?? buildTitle(body.message),
					};
					await putConversation(kv, visitorId, conversationId, updated).catch(
						(error: unknown) => {
							console.error("Failed to persist conversation", conversationId, error);
						},
					);
				}
			} catch (error) {
				send(
					formatSseEvent({
						event: "error",
						data: { message: error instanceof Error ? error.message : "Unknown error" },
					}),
				);
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, { status: 200, headers: responseHeaders });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/chat/handler.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Create the thin Astro route**

`src/pages/api/chat.ts`:

```typescript
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { handleChatRequest } from "../../lib/chat/handler";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	return handleChatRequest({
		request,
		kv: env.SESSION,
		rateLimiter: env.CHAT_RATE_LIMITER,
		chroma: {
			apiKey: env.CHROMA_API_KEY,
			tenant: env.CHROMA_TENANT,
			database: env.CHROMA_DATABASE,
			host: env.CHROMA_HOST || undefined,
		},
		googleApiKeyEmb: env.GOOGLE_API_KEY_EMB,
		googleApiKeyLlm: env.GOOGLE_API_KEY_LLM,
	});
};
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: passes — confirms `env.SESSION`/`env.CHAT_RATE_LIMITER`/the secret strings from `worker-configuration.d.ts` (Task 1) structurally satisfy `handleChatRequest`'s parameter types.

- [ ] **Step 7: Commit**

```bash
git add src/lib/chat/handler.ts src/lib/chat/handler.test.ts src/pages/api/chat.ts
git commit -m "Add /api/chat SSE endpoint with consent-gated history persistence"
```

---

### Task 7: `/api/history/*` routes

**Files:**
- Create: `src/lib/chat/historyHandlers.ts`
- Test: `src/lib/chat/historyHandlers.test.ts`
- Create: `src/pages/api/history/list.ts`
- Create: `src/pages/api/history/[id].ts`
- Create: `src/pages/api/history/index.ts`

**Interfaces:**
- Consumes: `readVisitorId` (`src/lib/history/cookies.ts`), `deleteAllConversations`/`deleteConversation`/`getConversation`/`listConversations`/`ConversationKV` (`src/lib/history/kv.ts`).
- Produces: `handleListHistory`, `handleGetConversation`, `handleDeleteConversation`, `handleDeleteAllHistory` — each `(options: { request: Request; kv: ConversationKV } [+ conversationId]) => Promise<Response>` — consumed by the three route files.

- [ ] **Step 1: Write the failing tests**

`src/lib/chat/historyHandlers.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { putConversation, type ConversationKV } from "../history/kv";
import type { StoredConversation } from "../history/types";
import {
	handleDeleteAllHistory,
	handleDeleteConversation,
	handleGetConversation,
	handleListHistory,
} from "./historyHandlers";

function createMockKV(): ConversationKV & { store: Map<string, string> } {
	const store = new Map<string, string>();
	return {
		store,
		async get(key) {
			return store.get(key) ?? null;
		},
		async put(key, value) {
			store.set(key, value);
		},
		async delete(key) {
			store.delete(key);
		},
		async list({ prefix }) {
			const keys = [...store.keys()]
				.filter((key) => key.startsWith(prefix))
				.map((name) => ({ name }));
			return { keys };
		},
	};
}

function requestWithCookie(cookie?: string): Request {
	const headers = new Headers();
	if (cookie) headers.set("cookie", cookie);
	return new Request("https://example.com/api/history/list", { headers });
}

const sample: StoredConversation = {
	messages: [{ role: "user", text: "Hi", at: "2026-08-06T00:00:00.000Z" }],
	updatedAt: "2026-08-06T00:00:00.000Z",
	title: "Hi",
};

describe("handleListHistory", () => {
	it("returns an empty array when there is no visitor_id cookie", async () => {
		const response = await handleListHistory({ request: requestWithCookie(), kv: createMockKV() });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual([]);
	});

	it("returns the visitor's conversations", async () => {
		const kv = createMockKV();
		await putConversation(kv, "v-1", "c-1", sample);
		const response = await handleListHistory({ request: requestWithCookie("visitor_id=v-1"), kv });
		expect(await response.json()).toEqual([
			{ conversationId: "c-1", title: "Hi", updatedAt: sample.updatedAt },
		]);
	});
});

describe("handleGetConversation", () => {
	it("returns 404 when there is no visitor_id cookie", async () => {
		const response = await handleGetConversation({
			request: requestWithCookie(),
			kv: createMockKV(),
			conversationId: "c-1",
		});
		expect(response.status).toBe(404);
	});

	it("returns 404 for another visitor's conversation", async () => {
		const kv = createMockKV();
		await putConversation(kv, "v-1", "c-1", sample);
		const response = await handleGetConversation({
			request: requestWithCookie("visitor_id=v-2"),
			kv,
			conversationId: "c-1",
		});
		expect(response.status).toBe(404);
	});

	it("returns the conversation for its owning visitor", async () => {
		const kv = createMockKV();
		await putConversation(kv, "v-1", "c-1", sample);
		const response = await handleGetConversation({
			request: requestWithCookie("visitor_id=v-1"),
			kv,
			conversationId: "c-1",
		});
		expect(await response.json()).toEqual(sample);
	});
});

describe("handleDeleteConversation", () => {
	it("deletes an owned conversation and returns 204", async () => {
		const kv = createMockKV();
		await putConversation(kv, "v-1", "c-1", sample);
		const response = await handleDeleteConversation({
			request: requestWithCookie("visitor_id=v-1"),
			kv,
			conversationId: "c-1",
		});
		expect(response.status).toBe(204);
		expect(kv.store.has("conv:v-1:c-1")).toBe(false);
	});

	it("returns 404 for a conversation that does not exist", async () => {
		const response = await handleDeleteConversation({
			request: requestWithCookie("visitor_id=v-1"),
			kv: createMockKV(),
			conversationId: "missing",
		});
		expect(response.status).toBe(404);
	});
});

describe("handleDeleteAllHistory", () => {
	it("deletes every conversation for the visitor without touching other visitors", async () => {
		const kv = createMockKV();
		await putConversation(kv, "v-1", "c-1", sample);
		await putConversation(kv, "v-1", "c-2", sample);
		await putConversation(kv, "v-2", "c-3", sample);

		const response = await handleDeleteAllHistory({ request: requestWithCookie("visitor_id=v-1"), kv });

		expect(response.status).toBe(204);
		expect(kv.store.has("conv:v-1:c-1")).toBe(false);
		expect(kv.store.has("conv:v-1:c-2")).toBe(false);
		expect(kv.store.has("conv:v-2:c-3")).toBe(true);
	});

	it("is a no-op (still 204) when there is no visitor_id cookie", async () => {
		const response = await handleDeleteAllHistory({ request: requestWithCookie(), kv: createMockKV() });
		expect(response.status).toBe(204);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/chat/historyHandlers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the history handlers**

`src/lib/chat/historyHandlers.ts`:

```typescript
import { readVisitorId } from "../history/cookies";
import {
	deleteAllConversations,
	deleteConversation,
	getConversation,
	listConversations,
	type ConversationKV,
} from "../history/kv";

interface HistoryRequestOptions {
	request: Request;
	kv: ConversationKV;
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function requireVisitorId(request: Request): string | undefined {
	return readVisitorId(request.headers.get("cookie"));
}

export async function handleListHistory(
	options: HistoryRequestOptions,
): Promise<Response> {
	const visitorId = requireVisitorId(options.request);
	if (!visitorId) return jsonResponse(200, []);

	const conversations = await listConversations(options.kv, visitorId);
	return jsonResponse(200, conversations);
}

export async function handleGetConversation(
	options: HistoryRequestOptions & { conversationId: string },
): Promise<Response> {
	const visitorId = requireVisitorId(options.request);
	if (!visitorId) return jsonResponse(404, { message: "Not found" });

	const conversation = await getConversation(options.kv, visitorId, options.conversationId);
	if (!conversation) return jsonResponse(404, { message: "Not found" });

	return jsonResponse(200, conversation);
}

export async function handleDeleteConversation(
	options: HistoryRequestOptions & { conversationId: string },
): Promise<Response> {
	const visitorId = requireVisitorId(options.request);
	if (!visitorId) return new Response(null, { status: 404 });

	const existing = await getConversation(options.kv, visitorId, options.conversationId);
	if (!existing) return new Response(null, { status: 404 });

	await deleteConversation(options.kv, visitorId, options.conversationId);
	return new Response(null, { status: 204 });
}

export async function handleDeleteAllHistory(
	options: HistoryRequestOptions,
): Promise<Response> {
	const visitorId = requireVisitorId(options.request);
	if (visitorId) await deleteAllConversations(options.kv, visitorId);
	return new Response(null, { status: 204 });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/chat/historyHandlers.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Create the three thin Astro routes**

`src/pages/api/history/list.ts`:

```typescript
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { handleListHistory } from "../../../lib/chat/historyHandlers";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	return handleListHistory({ request, kv: env.SESSION });
};
```

`src/pages/api/history/[id].ts`:

```typescript
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { handleDeleteConversation, handleGetConversation } from "../../../lib/chat/historyHandlers";

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
	return handleGetConversation({ request, kv: env.SESSION, conversationId: params.id! });
};

export const DELETE: APIRoute = async ({ request, params }) => {
	return handleDeleteConversation({ request, kv: env.SESSION, conversationId: params.id! });
};
```

`src/pages/api/history/index.ts`:

```typescript
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { handleDeleteAllHistory } from "../../../lib/chat/historyHandlers";

export const prerender = false;

export const DELETE: APIRoute = async ({ request }) => {
	return handleDeleteAllHistory({ request, kv: env.SESSION });
};
```

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm typecheck`
Expected: passes.

```bash
git add src/lib/chat/historyHandlers.ts src/lib/chat/historyHandlers.test.ts src/pages/api/history
git commit -m "Add /api/history list/get/delete/delete-all routes"
```

---

### Task 8: Live end-to-end verification

**Files:** none (verification only — no code changes expected unless a bug surfaces, in which case fix it in the relevant file from Tasks 1–7 and note it in the commit).

**Interfaces:** none — this task exercises the real running server, not individual modules.

- [ ] **Step 1: Run the full unit test suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all tests pass, no type errors.

- [ ] **Step 2: Start the dev server in the background**

Run: `astro dev --background` (per this repo's `CLAUDE.md` convention).

- [ ] **Step 3: Verify a `persist: false` chat request streams a real reply**

Run:
```bash
curl -N -s -X POST http://localhost:4321/api/chat \
  -H "Content-Type: application/json" \
  -d '{"persist": false, "message": "What machine learning experience do you have?", "history": []}'
```
Expected: a stream of `event: delta` lines containing readable text, followed by `event: done`. No `event: meta` (persist is false).

- [ ] **Step 4: Verify a `persist: true` chat request sets a cookie and creates a KV entry**

Run:
```bash
curl -N -s -i -X POST http://localhost:4321/api/chat \
  -c /tmp/portfolio-cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"persist": true, "message": "Tell me about the Asset Foundry project."}'
```
Expected: response headers include `Set-Cookie: visitor_id=...`; body includes an `event: meta` line with a `conversationId`, then `event: delta` lines, then `event: done`.

- [ ] **Step 5: Verify the conversation shows up in the history list**

Run:
```bash
curl -s http://localhost:4321/api/history/list -b /tmp/portfolio-cookies.txt
```
Expected: a JSON array with one entry whose `title` is a truncated version of the message sent in Step 4.

- [ ] **Step 6: Verify fetching and deleting that conversation works**

Run:
```bash
CONV_ID=$(curl -s http://localhost:4321/api/history/list -b /tmp/portfolio-cookies.txt | node -e "process.stdin.once('data', d => console.log(JSON.parse(d)[0].conversationId))")
curl -s http://localhost:4321/api/history/$CONV_ID -b /tmp/portfolio-cookies.txt
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE http://localhost:4321/api/history/$CONV_ID -b /tmp/portfolio-cookies.txt
curl -s http://localhost:4321/api/history/list -b /tmp/portfolio-cookies.txt
```
Expected: the `GET` returns the full stored conversation; the `DELETE` returns `204`; the final `list` call returns `[]`.

- [ ] **Step 7: Stop the dev server and clean up**

Run: `astro dev stop`
Run: `rm -f /tmp/portfolio-cookies.txt`

- [ ] **Step 8: Commit the verification note in the roadmap**

Update `project-roadmap.md`'s Phase 3 section: check off the "Build an Astro server API route..." and "Add conversation history handling..." items under 3.1, adding a short note that backend verification passed live against `gemma-4-31b-it` and the KV history routes.

```bash
git add project-roadmap.md
git commit -m "Mark Phase 3 chat backend complete after live verification"
```

---

## Self-Review Notes

- **Spec coverage**: every "Backend" delivery-plan item from the spec (`/api/chat` SSE + `persist` branching + Gemma streaming + KV read/write, `/api/history/*` list/get/delete/delete-all, the rate-limiting binding, `wrangler.jsonc` changes, unit tests, live end-to-end verification of both `persist` paths) maps to Tasks 1–8 above.
- **Placeholder scan**: no `TBD`/`TODO`/"add appropriate handling" — every step has literal code or literal shell commands.
- **Type consistency**: `ConversationKV`, `ChatMessage`, `StoredConversation`, `RateLimiter`, `ChromaCredentials`, `FetchLike`, `ChatMessageForModel` are each defined once and reused with identical shapes across every task that consumes them.
