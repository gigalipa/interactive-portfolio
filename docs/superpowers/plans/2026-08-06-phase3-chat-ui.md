# Phase 3 Chat UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the UI half of Phase 3 text chat: a GDPR-conscious consent banner, a floating chat box with streaming replies, a `PresenceRing`-driven placeholder hero, and a history sidebar — all wired to the already-shipped `/api/chat` and `/api/history/*` backend (Phase 3 backend, merged to `main`).

**Architecture:** A single React island (`ChatWidget`, mounted `client:load` on the Main page) owns all chat state via a custom hook (`useChatSession`), which composes small, independently-testable pure modules (SSE client parser, consent/session storage wrappers, history API client) with presentational components (`ConsentBanner`, `ChatBox`, `ChatMessages`/`ChatBubble`, `HistorySidebar`/`HistoryToggleButton`). This mirrors the backend plan's pure/impure split: logic modules have zero DOM dependency and are unit-tested directly; components are presentational and driven entirely by props/callbacks.

**Tech Stack:** React 19 (via `@astrojs/react`), Astro 7 islands (`client:load`), Tailwind v4 (existing design tokens in `src/styles/global.css`), Vitest + `@testing-library/react` (already configured, jsdom environment), Playwright for e2e.

## Global Constraints

- Reuse the existing design tokens verbatim — do not invent new colors. Avatar messages: `border-electric-blue` outline, `bg-deep-blue` fill. Visitor messages: `border-signal-cyan` outline, a blue-grey fill (`bg-slate-mist`). Glass/blur panels: `border-slate-mist bg-deep-blue/40 rounded-2xl border backdrop-blur-xl` (same recipe as `GlassPanel.astro`).
- Every user-facing string goes through `src/i18n/dictionary.ts` + the three locale files (`en.ts`/`es.ts`/`fr.ts`) — no hardcoded English strings in components. This includes error messages: the backend's SSE `error` event carries an internal code (`"rate_limited"` or anything else), never a message to render directly — see Task 2.
- `visitor_id`/history persistence follows the consent model already implemented server-side: `persist: true` only after explicit accept; `persist: false` otherwise, with the running conversation kept in `sessionStorage` (tab-local, cleared on tab close) rather than lost on reload.
- The `/api/chat` and `/api/history/*` routes already exist and are unit-tested (see `src/lib/chat/handler.ts`, `src/lib/chat/historyHandlers.ts`) — do not modify them. This plan is UI-only.
- Astro's built-in CSRF protection rejects cross-origin non-GET requests; same-origin `fetch()` (what every module in this plan uses) is unaffected — no special headers needed.
- TypeScript strict mode; tabs for indentation, double quotes (repo convention). Package manager `pnpm`.
- Reference spec: `docs/superpowers/specs/2026-08-06-phase3-text-chat-design.md` (the "UI" half of its Delivery Plan). Reference the already-merged backend plan `docs/superpowers/plans/2026-08-06-phase3-chat-backend.md` for the exact wire shapes (`ChatMessage`, `StoredConversation`, `ConversationSummary` in `src/lib/history/types.ts`; `ChatSseEvent` in `src/lib/rag/sse.ts`) — reuse those types directly, do not redeclare them.

---

### Task 1: i18n strings for chat, consent, and history

**Files:**

- Modify: `src/i18n/dictionary.ts`
- Modify: `src/i18n/dictionaries/en.ts`
- Modify: `src/i18n/dictionaries/es.ts`
- Modify: `src/i18n/dictionaries/fr.ts`

**Interfaces:**

- Produces: a `chat` section on the `Dictionary` type, populated in all three locales, consumed by every later task via `getDictionary(lang).chat.*`.

- [ ] **Step 1: Add the `chat` section to the `Dictionary` interface**

In `src/i18n/dictionary.ts`, add this member to the `Dictionary` interface (alongside the existing `nav`/`meta`/`home`/`cv`/`portfolio`/`contact` members):

```typescript
chat: {
	inputPlaceholder: string;
	send: string;
	voiceComingSoon: string;
	thinking: string;
	errorGeneric: string;
	errorRateLimited: string;
	retry: string;
	newConversation: string;
	historyToggleLabel: string;
	historyTitle: string;
	deleteConversation: string;
	retentionNotice: string;
	consent: {
		message: string;
		accept: string;
		reject: string;
		infoToggle: string;
		infoBody: string;
		preferencesLink: string;
		deleteOption: string;
	}
}
```

- [ ] **Step 2: Add the English translations**

In `src/i18n/dictionaries/en.ts`, add this member to the exported object (after `contact`):

```typescript
	chat: {
		inputPlaceholder: "Ask me about my work, background, or projects...",
		send: "Send",
		voiceComingSoon: "Voice chat (coming soon)",
		thinking: "Thinking...",
		errorGeneric: "The avatar couldn't reply just now. Please try again.",
		errorRateLimited:
			"Too many messages — please slow down and try again in a moment.",
		retry: "Retry",
		newConversation: "New conversation",
		historyToggleLabel: "Conversation history",
		historyTitle: "History",
		deleteConversation: "Delete conversation",
		retentionNotice:
			"Conversations are kept for 30 days of inactivity, then deleted automatically. You can delete any of them anytime.",
		consent: {
			message:
				"This site can remember your conversation with the avatar so you can pick it up later — that needs one small cookie. Without it, chat still works, it just won't be saved.",
			accept: "Accept",
			reject: "Reject",
			infoToggle: "What's this cookie?",
			infoBody:
				"We set a single cookie, visitor_id, only if you accept. It has no personal data — it just lets us find your saved conversations when you come back. Cloudflare, our hosting provider, also sets a small number of strictly necessary security cookies that don't require consent.",
			preferencesLink: "Cookie preferences",
			deleteOption: "Also delete my saved conversations",
		},
	},
```

- [ ] **Step 3: Add the Spanish translations**

In `src/i18n/dictionaries/es.ts`, add:

```typescript
	chat: {
		inputPlaceholder: "Pregúntame sobre mi trabajo, experiencia o proyectos...",
		send: "Enviar",
		voiceComingSoon: "Chat de voz (próximamente)",
		thinking: "Pensando...",
		errorGeneric: "El avatar no pudo responder en este momento. Inténtalo de nuevo.",
		errorRateLimited:
			"Demasiados mensajes — espera un momento antes de intentarlo de nuevo.",
		retry: "Reintentar",
		newConversation: "Nueva conversación",
		historyToggleLabel: "Historial de conversaciones",
		historyTitle: "Historial",
		deleteConversation: "Eliminar conversación",
		retentionNotice:
			"Las conversaciones se conservan durante 30 días de inactividad y luego se eliminan automáticamente. Puedes eliminarlas cuando quieras.",
		consent: {
			message:
				"Este sitio puede recordar tu conversación con el avatar para que puedas continuarla más tarde — eso requiere una pequeña cookie. Sin ella, el chat sigue funcionando, solo que no se guardará.",
			accept: "Aceptar",
			reject: "Rechazar",
			infoToggle: "¿Qué es esta cookie?",
			infoBody:
				"Usamos una sola cookie, visitor_id, solo si aceptas. No contiene datos personales — solo permite encontrar tus conversaciones guardadas cuando regreses. Cloudflare, nuestro proveedor de hosting, también usa algunas cookies de seguridad estrictamente necesarias que no requieren consentimiento.",
			preferencesLink: "Preferencias de cookies",
			deleteOption: "También eliminar mis conversaciones guardadas",
		},
	},
```

- [ ] **Step 4: Add the French translations**

In `src/i18n/dictionaries/fr.ts`, add:

```typescript
	chat: {
		inputPlaceholder: "Demandez-moi mon parcours, mon expérience ou mes projets...",
		send: "Envoyer",
		voiceComingSoon: "Chat vocal (bientôt disponible)",
		thinking: "Réflexion en cours...",
		errorGeneric: "L'avatar n'a pas pu répondre pour le moment. Veuillez réessayer.",
		errorRateLimited:
			"Trop de messages — merci de patienter un instant avant de réessayer.",
		retry: "Réessayer",
		newConversation: "Nouvelle conversation",
		historyToggleLabel: "Historique des conversations",
		historyTitle: "Historique",
		deleteConversation: "Supprimer la conversation",
		retentionNotice:
			"Les conversations sont conservées pendant 30 jours d'inactivité, puis supprimées automatiquement. Vous pouvez les supprimer à tout moment.",
		consent: {
			message:
				"Ce site peut mémoriser votre conversation avec l'avatar pour que vous puissiez la reprendre plus tard — cela nécessite un petit cookie. Sans lui, le chat fonctionne quand même, il ne sera simplement pas sauvegardé.",
			accept: "Accepter",
			reject: "Refuser",
			infoToggle: "Qu'est-ce que ce cookie ?",
			infoBody:
				"Nous utilisons un seul cookie, visitor_id, uniquement si vous acceptez. Il ne contient aucune donnée personnelle — il permet simplement de retrouver vos conversations enregistrées à votre retour. Cloudflare, notre hébergeur, utilise aussi quelques cookies de sécurité strictement nécessaires qui ne nécessitent pas de consentement.",
			preferencesLink: "Préférences de cookies",
			deleteOption: "Supprimer également mes conversations enregistrées",
		},
	},
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: passes — confirms all three locale files satisfy the updated `Dictionary` type (the existing `satisfies Dictionary` on each default export will fail to compile if any key is missing).

- [ ] **Step 6: Commit**

```bash
git add src/i18n/dictionary.ts src/i18n/dictionaries/en.ts src/i18n/dictionaries/es.ts src/i18n/dictionaries/fr.ts
git commit -m "Add chat/consent/history i18n strings (EN/ES/FR)"
```

---

### Task 2: Pure client-side modules (SSE parser, consent, session storage, history API, presence-ring bridge)

**Files:**

- Create: `src/lib/chat/sseClient.ts`
- Test: `src/lib/chat/sseClient.test.ts`
- Create: `src/lib/chat/consent.ts`
- Test: `src/lib/chat/consent.test.ts`
- Create: `src/lib/chat/sessionHistory.ts`
- Test: `src/lib/chat/sessionHistory.test.ts`
- Create: `src/lib/chat/historyApi.ts`
- Test: `src/lib/chat/historyApi.test.ts`
- Create: `src/lib/chat/presenceRingBridge.ts`
- Test: `src/lib/chat/presenceRingBridge.test.ts`

**Interfaces:**

- Consumes: `ChatSseEvent` (`src/lib/rag/sse.ts`), `ChatMessage`/`StoredConversation`/`ConversationSummary` (`src/lib/history/types.ts`) — all pre-existing, do not modify.
- Produces: `ChatRequestPayload`, `streamChatResponse(payload, fetchImpl?): AsyncGenerator<ChatSseEvent>` (`sseClient.ts`); `ConsentChoice`, `getConsent()`, `setConsent()` (`consent.ts`); `loadSessionMessages()`, `saveSessionMessages()`, `clearSessionMessages()` (`sessionHistory.ts`); `fetchHistoryList()`, `fetchConversation()`, `deleteConversation()`, `deleteAllHistory()` (`historyApi.ts`); `setPresenceState(state)` (`presenceRingBridge.ts`) — all consumed by Task 3's `useChatSession`.

- [ ] **Step 1: Write the failing tests for `sseClient.ts`**

`src/lib/chat/sseClient.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import {
	parseSseStream,
	streamChatResponse,
	type FetchLike,
} from "./sseClient";

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

describe("parseSseStream", () => {
	it("parses meta, delta, and done events in order", async () => {
		const body = streamFromChunks([
			'event: meta\ndata: {"conversationId":"c-1"}\n\n',
			'event: delta\ndata: {"text":"Hi"}\n\n',
			"event: done\ndata: {}\n\n",
		]);

		expect(await collect(parseSseStream(body))).toEqual([
			{ event: "meta", data: { conversationId: "c-1" } },
			{ event: "delta", data: { text: "Hi" } },
			{ event: "done", data: {} },
		]);
	});

	it("handles a frame split across two reads", async () => {
		const body = streamFromChunks([
			'event: delta\ndata: {"text":"Hel',
			'lo"}\n\n',
		]);

		expect(await collect(parseSseStream(body))).toEqual([
			{ event: "delta", data: { text: "Hello" } },
		]);
	});
});

describe("streamChatResponse", () => {
	it("posts the payload and yields parsed SSE events", async () => {
		const fetchImpl = vi
			.fn()
			.mockImplementation(
				fakeFetch(
					200,
					streamFromChunks(['event: delta\ndata: {"text":"Hi"}\n\n']),
				),
			);

		const result = await collect(
			streamChatResponse({ persist: false, message: "Hello" }, fetchImpl),
		);

		expect(result).toEqual([{ event: "delta", data: { text: "Hi" } }]);
		expect(fetchImpl).toHaveBeenCalledWith(
			"/api/chat",
			expect.objectContaining({ method: "POST" }),
		);
		const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
		expect(JSON.parse(init.body as string)).toEqual({
			persist: false,
			message: "Hello",
		});
	});

	it("yields a rate_limited error event on a 429 response", async () => {
		const fetchImpl = vi
			.fn()
			.mockImplementation(fakeFetch(429, null, "Rate limit exceeded"));

		const result = await collect(
			streamChatResponse({ persist: false, message: "Hi" }, fetchImpl),
		);

		expect(result).toEqual([
			{ event: "error", data: { message: "rate_limited" } },
		]);
	});

	it("yields a request_failed error event on any other non-ok response", async () => {
		const fetchImpl = vi.fn().mockImplementation(fakeFetch(500, null, "boom"));

		const result = await collect(
			streamChatResponse({ persist: false, message: "Hi" }, fetchImpl),
		);

		expect(result).toEqual([
			{ event: "error", data: { message: "request_failed" } },
		]);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/lib/chat/sseClient.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `sseClient.ts`**

```typescript
import type { ChatSseEvent } from "../rag/sse";
import type { ChatMessage } from "../history/types";

export interface ChatRequestPayload {
	persist: boolean;
	message: string;
	conversationId?: string;
	history?: Array<Pick<ChatMessage, "role" | "text">>;
	language?: string;
}

/** Narrow structural subset of `fetch` — real `fetch` satisfies this. */
export interface FetchLike {
	(
		url: string,
		init: RequestInit,
	): Promise<{
		ok: boolean;
		status: number;
		body: ReadableStream<Uint8Array> | null;
		text(): Promise<string>;
	}>;
}

/** Posts to /api/chat and yields the parsed SSE events. Non-ok responses
 * yield a single synthetic error event carrying an internal code
 * ("rate_limited" | "request_failed"), never raw server text — the caller
 * maps the code to a localized message. */
export async function* streamChatResponse(
	payload: ChatRequestPayload,
	fetchImpl: FetchLike = fetch,
): AsyncGenerator<ChatSseEvent> {
	const response = await fetchImpl("/api/chat", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});

	if (!response.ok || !response.body) {
		const code = response.status === 429 ? "rate_limited" : "request_failed";
		yield { event: "error", data: { message: code } };
		return;
	}

	yield* parseSseStream(response.body);
}

export async function* parseSseStream(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<ChatSseEvent> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		const frames = buffer.split("\n\n");
		buffer = frames.pop() ?? "";

		for (const frame of frames) {
			const event = parseFrame(frame);
			if (event) yield event;
		}
	}

	const event = parseFrame(buffer);
	if (event) yield event;
}

function parseFrame(frame: string): ChatSseEvent | null {
	const lines = frame.split("\n");
	const eventLine = lines.find((line) => line.startsWith("event:"));
	const dataLine = lines.find((line) => line.startsWith("data:"));
	if (!eventLine || !dataLine) return null;

	const eventName = eventLine.slice("event:".length).trim();
	const data = JSON.parse(dataLine.slice("data:".length).trim());

	if (
		eventName === "meta" ||
		eventName === "delta" ||
		eventName === "done" ||
		eventName === "error"
	) {
		return { event: eventName, data } as ChatSseEvent;
	}
	return null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/lib/chat/sseClient.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write, implement, and verify `consent.ts`**

`src/lib/chat/consent.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import { getConsent, setConsent } from "./consent";

describe("consent storage", () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	it("returns null when no choice has been made", () => {
		expect(getConsent()).toBeNull();
	});

	it("round-trips 'accepted'", () => {
		setConsent("accepted");
		expect(getConsent()).toBe("accepted");
	});

	it("round-trips 'rejected'", () => {
		setConsent("rejected");
		expect(getConsent()).toBe("rejected");
	});

	it("ignores unrelated/garbage localStorage values", () => {
		window.localStorage.setItem("chat_consent", "garbage");
		expect(getConsent()).toBeNull();
	});
});
```

`src/lib/chat/consent.ts`:

```typescript
export type ConsentChoice = "accepted" | "rejected";

const STORAGE_KEY = "chat_consent";

export function getConsent(): ConsentChoice | null {
	if (typeof window === "undefined") return null;
	const value = window.localStorage.getItem(STORAGE_KEY);
	return value === "accepted" || value === "rejected" ? value : null;
}

export function setConsent(choice: ConsentChoice): void {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(STORAGE_KEY, choice);
}
```

Run: `pnpm test src/lib/chat/consent.test.ts` — expect PASS (4 tests) after implementing.

- [ ] **Step 6: Write, implement, and verify `sessionHistory.ts`**

`src/lib/chat/sessionHistory.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import {
	clearSessionMessages,
	loadSessionMessages,
	saveSessionMessages,
} from "./sessionHistory";
import type { ChatMessage } from "../history/types";

const sample: ChatMessage[] = [
	{ role: "user", text: "Hi", at: "2026-08-06T00:00:00.000Z" },
];

describe("session message storage", () => {
	beforeEach(() => {
		window.sessionStorage.clear();
	});

	it("returns an empty array when nothing is stored", () => {
		expect(loadSessionMessages()).toEqual([]);
	});

	it("round-trips messages through save/load", () => {
		saveSessionMessages(sample);
		expect(loadSessionMessages()).toEqual(sample);
	});

	it("returns an empty array for corrupt stored JSON", () => {
		window.sessionStorage.setItem("chat_session_messages", "{not json");
		expect(loadSessionMessages()).toEqual([]);
	});

	it("clears stored messages", () => {
		saveSessionMessages(sample);
		clearSessionMessages();
		expect(loadSessionMessages()).toEqual([]);
	});
});
```

`src/lib/chat/sessionHistory.ts`:

```typescript
import type { ChatMessage } from "../history/types";

const STORAGE_KEY = "chat_session_messages";

export function loadSessionMessages(): ChatMessage[] {
	if (typeof window === "undefined") return [];
	const raw = window.sessionStorage.getItem(STORAGE_KEY);
	if (!raw) return [];
	try {
		return JSON.parse(raw) as ChatMessage[];
	} catch {
		return [];
	}
}

export function saveSessionMessages(messages: ChatMessage[]): void {
	if (typeof window === "undefined") return;
	window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
}

export function clearSessionMessages(): void {
	if (typeof window === "undefined") return;
	window.sessionStorage.removeItem(STORAGE_KEY);
}
```

Run: `pnpm test src/lib/chat/sessionHistory.test.ts` — expect PASS (4 tests).

- [ ] **Step 7: Write, implement, and verify `historyApi.ts`**

`src/lib/chat/historyApi.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import {
	deleteAllHistory,
	deleteConversation,
	fetchConversation,
	fetchHistoryList,
} from "./historyApi";
import type { StoredConversation } from "../history/types";

function mockFetchOnce(response: {
	ok: boolean;
	status?: number;
	json?: () => Promise<unknown>;
}) {
	return vi.fn().mockResolvedValue({
		ok: response.ok,
		status: response.status ?? (response.ok ? 200 : 500),
		json: response.json ?? (async () => ({})),
	});
}

describe("fetchHistoryList", () => {
	it("returns the parsed list on success", async () => {
		const list = [
			{
				conversationId: "c-1",
				title: "Hi",
				updatedAt: "2026-08-06T00:00:00.000Z",
			},
		];
		vi.stubGlobal("fetch", mockFetchOnce({ ok: true, json: async () => list }));
		expect(await fetchHistoryList()).toEqual(list);
		vi.unstubAllGlobals();
	});

	it("returns an empty array on failure", async () => {
		vi.stubGlobal("fetch", mockFetchOnce({ ok: false }));
		expect(await fetchHistoryList()).toEqual([]);
		vi.unstubAllGlobals();
	});
});

describe("fetchConversation", () => {
	it("returns the conversation on success", async () => {
		const conversation: StoredConversation = {
			messages: [],
			updatedAt: "2026-08-06T00:00:00.000Z",
			title: "Hi",
		};
		vi.stubGlobal(
			"fetch",
			mockFetchOnce({ ok: true, json: async () => conversation }),
		);
		expect(await fetchConversation("c-1")).toEqual(conversation);
		vi.unstubAllGlobals();
	});

	it("returns null on failure (e.g. 404)", async () => {
		vi.stubGlobal("fetch", mockFetchOnce({ ok: false, status: 404 }));
		expect(await fetchConversation("missing")).toBeNull();
		vi.unstubAllGlobals();
	});
});

describe("deleteConversation", () => {
	it("returns true on success", async () => {
		const fetchImpl = mockFetchOnce({ ok: true, status: 204 });
		vi.stubGlobal("fetch", fetchImpl);
		expect(await deleteConversation("c-1")).toBe(true);
		expect(fetchImpl).toHaveBeenCalledWith("/api/history/c-1", {
			method: "DELETE",
		});
		vi.unstubAllGlobals();
	});
});

describe("deleteAllHistory", () => {
	it("returns true on success", async () => {
		const fetchImpl = mockFetchOnce({ ok: true, status: 204 });
		vi.stubGlobal("fetch", fetchImpl);
		expect(await deleteAllHistory()).toBe(true);
		expect(fetchImpl).toHaveBeenCalledWith("/api/history", {
			method: "DELETE",
		});
		vi.unstubAllGlobals();
	});
});
```

`src/lib/chat/historyApi.ts`:

```typescript
import type { ConversationSummary, StoredConversation } from "../history/types";

export async function fetchHistoryList(): Promise<ConversationSummary[]> {
	const response = await fetch("/api/history/list");
	if (!response.ok) return [];
	return (await response.json()) as ConversationSummary[];
}

export async function fetchConversation(
	conversationId: string,
): Promise<StoredConversation | null> {
	const response = await fetch(`/api/history/${conversationId}`);
	if (!response.ok) return null;
	return (await response.json()) as StoredConversation;
}

export async function deleteConversation(
	conversationId: string,
): Promise<boolean> {
	const response = await fetch(`/api/history/${conversationId}`, {
		method: "DELETE",
	});
	return response.ok;
}

export async function deleteAllHistory(): Promise<boolean> {
	const response = await fetch("/api/history", { method: "DELETE" });
	return response.ok;
}
```

Run: `pnpm test src/lib/chat/historyApi.test.ts` — expect PASS (6 tests).

- [ ] **Step 8: Write, implement, and verify `presenceRingBridge.ts`**

`src/lib/chat/presenceRingBridge.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "vitest";
import { setPresenceState } from "./presenceRingBridge";

describe("setPresenceState", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("sets data-state on the .presence-ring element", () => {
		document.body.innerHTML =
			'<div class="presence-ring" data-state="idle"></div>';
		setPresenceState("speaking");
		expect(
			document.querySelector(".presence-ring")?.getAttribute("data-state"),
		).toBe("speaking");
	});

	it("does nothing (no throw) when the element isn't on the page", () => {
		expect(() => setPresenceState("listening")).not.toThrow();
	});
});
```

`src/lib/chat/presenceRingBridge.ts`:

```typescript
/** Imperatively updates the server-rendered PresenceRing's visual state
 * (see src/components/ui/PresenceRing.astro) from client-side chat state.
 * There is exactly one PresenceRing per page. */
export function setPresenceState(
	state: "idle" | "listening" | "speaking",
): void {
	if (typeof document === "undefined") return;
	document.querySelector(".presence-ring")?.setAttribute("data-state", state);
}
```

Run: `pnpm test src/lib/chat/presenceRingBridge.test.ts` — expect PASS (2 tests).

- [ ] **Step 9: Full-suite check and commit**

Run: `pnpm test src/lib/chat/ && pnpm typecheck`
Expected: 21 tests pass across the 5 new test files, 0 type errors.

```bash
git add src/lib/chat/sseClient.ts src/lib/chat/sseClient.test.ts src/lib/chat/consent.ts src/lib/chat/consent.test.ts src/lib/chat/sessionHistory.ts src/lib/chat/sessionHistory.test.ts src/lib/chat/historyApi.ts src/lib/chat/historyApi.test.ts src/lib/chat/presenceRingBridge.ts src/lib/chat/presenceRingBridge.test.ts
git commit -m "Add pure client-side chat modules (SSE parser, consent, session storage, history API, presence-ring bridge)"
```

---

### Task 3: `useChatSession` orchestration hook

**Files:**

- Create: `src/lib/chat/useChatSession.ts`
- Test: `src/lib/chat/useChatSession.test.ts`

**Interfaces:**

- Consumes: everything from Task 2 (`streamChatResponse`, `getConsent`/`setConsent`, `loadSessionMessages`/`saveSessionMessages`/`clearSessionMessages`, `fetchHistoryList`/`fetchConversation`/`deleteConversation`/`deleteAllHistory`, `setPresenceState`), plus `ChatMessage`/`StoredConversation`/`ConversationSummary` (`src/lib/history/types.ts`).
- Produces: `DisplayMessage { id: string; role: "user" | "model"; text: string }`, `ChatStatus = "idle" | "sending" | "streaming" | "error"`, `UseChatSessionOptions`, `UseChatSessionResult`, `useChatSession(options): UseChatSessionResult` — consumed by `ChatWidget` (Task 7).

- [ ] **Step 1: Write the failing tests**

`src/lib/chat/useChatSession.test.ts`:

```typescript
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./sseClient", () => ({ streamChatResponse: vi.fn() }));
vi.mock("./historyApi", () => ({
	fetchHistoryList: vi.fn().mockResolvedValue([]),
	fetchConversation: vi.fn(),
	deleteConversation: vi.fn().mockResolvedValue(true),
	deleteAllHistory: vi.fn().mockResolvedValue(true),
}));

import { streamChatResponse } from "./sseClient";
import {
	deleteAllHistory,
	deleteConversation,
	fetchConversation,
	fetchHistoryList,
} from "./historyApi";
import { getConsent, setConsent } from "./consent";
import { clearSessionMessages, loadSessionMessages } from "./sessionHistory";
import { useChatSession } from "./useChatSession";

async function* eventsOf(events: unknown[]) {
	for (const event of events) yield event as never;
}

const options = {
	language: "EN",
	errorGenericMessage: "generic error",
	errorRateLimitedMessage: "slow down",
};

beforeEach(() => {
	window.localStorage.clear();
	window.sessionStorage.clear();
	vi.mocked(streamChatResponse).mockReset();
	vi.mocked(fetchHistoryList).mockReset().mockResolvedValue([]);
});

afterEach(() => {
	document.body.innerHTML = "";
});

describe("useChatSession — consent", () => {
	it("starts with consent null and no history fetch when undecided", () => {
		const { result } = renderHook(() => useChatSession(options));
		expect(result.current.consent).toBeNull();
		expect(fetchHistoryList).not.toHaveBeenCalled();
	});

	it("acceptConsent persists the choice and fetches history", async () => {
		const { result } = renderHook(() => useChatSession(options));
		await act(async () => result.current.acceptConsent());
		expect(getConsent()).toBe("accepted");
		expect(result.current.consent).toBe("accepted");
		await waitFor(() => expect(fetchHistoryList).toHaveBeenCalled());
	});

	it("rejectConsent(true) deletes all history and clears the consent to rejected", async () => {
		setConsent("accepted");
		const { result } = renderHook(() => useChatSession(options));
		await act(async () => result.current.rejectConsent(true));
		expect(deleteAllHistory).toHaveBeenCalled();
		expect(getConsent()).toBe("rejected");
		expect(result.current.consent).toBe("rejected");
	});
});

describe("useChatSession — sending a message", () => {
	it("appends the user message immediately, then streams the assistant reply", async () => {
		vi.mocked(streamChatResponse).mockReturnValue(
			eventsOf([
				{ event: "delta", data: { text: "Hel" } },
				{ event: "delta", data: { text: "lo" } },
				{ event: "done", data: {} },
			]),
		);
		const { result } = renderHook(() => useChatSession(options));

		await act(async () => result.current.sendMessage("Hi"));

		expect(result.current.messages).toEqual([
			expect.objectContaining({ role: "user", text: "Hi" }),
			expect.objectContaining({ role: "model", text: "Hello" }),
		]);
		expect(result.current.status).toBe("idle");
	});

	it("saves the conversation to sessionStorage when not persisting", async () => {
		vi.mocked(streamChatResponse).mockReturnValue(
			eventsOf([
				{ event: "delta", data: { text: "Hi!" } },
				{ event: "done", data: {} },
			]),
		);
		const { result } = renderHook(() => useChatSession(options));

		await act(async () => result.current.sendMessage("Hey"));

		expect(loadSessionMessages()).toEqual([
			expect.objectContaining({ role: "user", text: "Hey" }),
			expect.objectContaining({ role: "model", text: "Hi!" }),
		]);
	});

	it("sends persist:true and the conversationId once consent is accepted", async () => {
		vi.mocked(streamChatResponse).mockReturnValue(
			eventsOf([
				{ event: "meta", data: { conversationId: "conv-1" } },
				{ event: "delta", data: { text: "Hi!" } },
				{ event: "done", data: {} },
			]),
		);
		const { result } = renderHook(() => useChatSession(options));
		await act(async () => result.current.acceptConsent());

		await act(async () => result.current.sendMessage("Hey"));

		const [payload] = vi.mocked(streamChatResponse).mock.calls[0];
		expect(payload).toEqual(
			expect.objectContaining({ persist: true, message: "Hey" }),
		);
	});

	it("shows the localized rate-limit message on a rate_limited error event", async () => {
		vi.mocked(streamChatResponse).mockReturnValue(
			eventsOf([{ event: "error", data: { message: "rate_limited" } }]),
		);
		const { result } = renderHook(() => useChatSession(options));

		await act(async () => result.current.sendMessage("Hi"));

		expect(result.current.status).toBe("error");
		expect(result.current.errorMessage).toBe("slow down");
	});

	it("shows the generic localized message on any other error event", async () => {
		vi.mocked(streamChatResponse).mockReturnValue(
			eventsOf([
				{ event: "error", data: { message: "The avatar couldn't reply..." } },
			]),
		);
		const { result } = renderHook(() => useChatSession(options));

		await act(async () => result.current.sendMessage("Hi"));

		expect(result.current.errorMessage).toBe("generic error");
	});

	it("retryLast resends the last user message", async () => {
		vi.mocked(streamChatResponse).mockReturnValueOnce(
			eventsOf([{ event: "error", data: { message: "request_failed" } }]),
		);
		const { result } = renderHook(() => useChatSession(options));
		await act(async () => result.current.sendMessage("Hi"));

		vi.mocked(streamChatResponse).mockReturnValueOnce(
			eventsOf([
				{ event: "delta", data: { text: "Now it works" } },
				{ event: "done", data: {} },
			]),
		);
		await act(async () => result.current.retryLast());

		expect(result.current.status).toBe("idle");
		expect(result.current.messages.at(-1)).toEqual(
			expect.objectContaining({ text: "Now it works" }),
		);
	});
});

describe("useChatSession — history", () => {
	it("selectConversation loads a stored conversation into messages", async () => {
		vi.mocked(fetchConversation).mockResolvedValue({
			messages: [{ role: "user", text: "Old", at: "2026-08-01T00:00:00.000Z" }],
			updatedAt: "2026-08-01T00:00:00.000Z",
			title: "Old",
		});
		const { result } = renderHook(() => useChatSession(options));

		await act(async () => result.current.selectConversation("conv-1"));

		expect(result.current.messages).toEqual([
			expect.objectContaining({ role: "user", text: "Old" }),
		]);
	});

	it("deleteConversationById removes it from the list and resets if it was the active one", async () => {
		vi.mocked(fetchConversation).mockResolvedValue({
			messages: [{ role: "user", text: "Old", at: "2026-08-01T00:00:00.000Z" }],
			updatedAt: "2026-08-01T00:00:00.000Z",
			title: "Old",
		});
		const { result } = renderHook(() => useChatSession(options));
		await act(async () => result.current.selectConversation("conv-1"));

		await act(async () => result.current.deleteConversationById("conv-1"));

		expect(deleteConversation).toHaveBeenCalledWith("conv-1");
		expect(result.current.messages).toEqual([]);
	});

	it("startNewConversation clears messages and sessionStorage", async () => {
		vi.mocked(streamChatResponse).mockReturnValue(
			eventsOf([
				{ event: "delta", data: { text: "Hi!" } },
				{ event: "done", data: {} },
			]),
		);
		const { result } = renderHook(() => useChatSession(options));
		await act(async () => result.current.sendMessage("Hey"));

		act(() => result.current.startNewConversation());

		expect(result.current.messages).toEqual([]);
		expect(loadSessionMessages()).toEqual([]);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/lib/chat/useChatSession.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `useChatSession.ts`**

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { streamChatResponse } from "./sseClient";
import { getConsent, setConsent, type ConsentChoice } from "./consent";
import {
	clearSessionMessages,
	loadSessionMessages,
	saveSessionMessages,
} from "./sessionHistory";
import {
	deleteAllHistory,
	deleteConversation,
	fetchConversation,
	fetchHistoryList,
} from "./historyApi";
import { setPresenceState } from "./presenceRingBridge";
import type { ChatMessage, ConversationSummary } from "../history/types";

export interface DisplayMessage {
	id: string;
	role: "user" | "model";
	text: string;
}

export type ChatStatus = "idle" | "sending" | "streaming" | "error";

export interface UseChatSessionOptions {
	language: string;
	errorGenericMessage: string;
	errorRateLimitedMessage: string;
}

export interface UseChatSessionResult {
	consent: ConsentChoice | null;
	acceptConsent: () => void;
	rejectConsent: (alsoDeleteHistory: boolean) => void;
	messages: DisplayMessage[];
	status: ChatStatus;
	errorMessage: string | null;
	sendMessage: (text: string) => void;
	retryLast: () => void;
	conversations: ConversationSummary[];
	historyOpen: boolean;
	toggleHistory: () => void;
	closeHistory: () => void;
	selectConversation: (conversationId: string) => void;
	deleteConversationById: (conversationId: string) => void;
	startNewConversation: () => void;
}

function toDisplayMessages(messages: ChatMessage[]): DisplayMessage[] {
	return messages.map((message) => ({
		id: crypto.randomUUID(),
		role: message.role,
		text: message.text,
	}));
}

function toWireMessages(
	messages: DisplayMessage[],
): Array<Pick<ChatMessage, "role" | "text">> {
	return messages.map(({ role, text }) => ({ role, text }));
}

export function useChatSession(
	options: UseChatSessionOptions,
): UseChatSessionResult {
	const { language, errorGenericMessage, errorRateLimitedMessage } = options;

	const [consent, setConsentState] = useState<ConsentChoice | null>(() =>
		getConsent(),
	);
	const [messages, setMessages] = useState<DisplayMessage[]>(() =>
		consent === "accepted" ? [] : toDisplayMessages(loadSessionMessages()),
	);
	const [status, setStatus] = useState<ChatStatus>("idle");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [conversationId, setConversationId] = useState<string | undefined>(
		undefined,
	);
	const [conversations, setConversations] = useState<ConversationSummary[]>([]);
	const [historyOpen, setHistoryOpen] = useState(false);
	const lastUserTextRef = useRef<string | null>(null);

	const refreshHistory = useCallback(() => {
		fetchHistoryList().then(setConversations);
	}, []);

	useEffect(() => {
		if (consent === "accepted") refreshHistory();
	}, [consent, refreshHistory]);

	const acceptConsent = useCallback(() => {
		setConsent("accepted");
		setConsentState("accepted");
	}, []);

	const rejectConsent = useCallback((alsoDeleteHistory: boolean) => {
		if (alsoDeleteHistory) deleteAllHistory();
		setConsent("rejected");
		setConsentState("rejected");
		setConversations([]);
		setHistoryOpen(false);
	}, []);

	const runStream = useCallback(
		async (
			text: string,
			persist: boolean,
			historyForRequest: DisplayMessage[],
		) => {
			setStatus("sending");
			setErrorMessage(null);
			setPresenceState("listening");

			let assistantMessageId: string | null = null;
			let sawFirstDelta = false;

			for await (const event of streamChatResponse({
				persist,
				message: text,
				conversationId: persist ? conversationId : undefined,
				history: persist ? undefined : toWireMessages(historyForRequest),
				language,
			})) {
				if (event.event === "meta") {
					setConversationId(event.data.conversationId);
				} else if (event.event === "delta") {
					if (!sawFirstDelta) {
						sawFirstDelta = true;
						setStatus("streaming");
						setPresenceState("speaking");
						assistantMessageId = crypto.randomUUID();
						const id = assistantMessageId;
						setMessages((prev) => [
							...prev,
							{ id, role: "model", text: event.data.text },
						]);
					} else {
						const id = assistantMessageId;
						setMessages((prev) =>
							prev.map((message) =>
								message.id === id
									? { ...message, text: message.text + event.data.text }
									: message,
							),
						);
					}
				} else if (event.event === "done") {
					setStatus("idle");
					setPresenceState("idle");
					if (persist) {
						refreshHistory();
					} else {
						setMessages((current) => {
							saveSessionMessages(
								current.map((message) => ({
									role: message.role,
									text: message.text,
									at: new Date().toISOString(),
								})),
							);
							return current;
						});
					}
				} else if (event.event === "error") {
					setStatus("error");
					setPresenceState("idle");
					setErrorMessage(
						event.data.message === "rate_limited"
							? errorRateLimitedMessage
							: errorGenericMessage,
					);
				}
			}
		},
		[
			conversationId,
			language,
			errorGenericMessage,
			errorRateLimitedMessage,
			refreshHistory,
		],
	);

	const sendMessage = useCallback(
		(text: string) => {
			const trimmed = text.trim();
			if (!trimmed) return;
			lastUserTextRef.current = trimmed;
			const userMessage: DisplayMessage = {
				id: crypto.randomUUID(),
				role: "user",
				text: trimmed,
			};
			const historySnapshot = messages;
			setMessages((prev) => [...prev, userMessage]);
			runStream(trimmed, consent === "accepted", historySnapshot);
		},
		[messages, consent, runStream],
	);

	const retryLast = useCallback(() => {
		const text = lastUserTextRef.current;
		if (!text) return;
		runStream(text, consent === "accepted", messages.slice(0, -1));
	}, [consent, messages, runStream]);

	const toggleHistory = useCallback(() => {
		setHistoryOpen((open) => {
			if (!open) refreshHistory();
			return !open;
		});
	}, [refreshHistory]);

	const closeHistory = useCallback(() => setHistoryOpen(false), []);

	const selectConversation = useCallback(async (id: string) => {
		const conversation = await fetchConversation(id);
		if (!conversation) return;
		setMessages(toDisplayMessages(conversation.messages));
		setConversationId(id);
		setStatus("idle");
		setErrorMessage(null);
		setHistoryOpen(false);
	}, []);

	const deleteConversationById = useCallback(
		async (id: string) => {
			await deleteConversation(id);
			setConversations((prev) =>
				prev.filter((conversation) => conversation.conversationId !== id),
			);
			if (id === conversationId) {
				setMessages([]);
				setConversationId(undefined);
			}
		},
		[conversationId],
	);

	const startNewConversation = useCallback(() => {
		setMessages([]);
		setConversationId(undefined);
		setStatus("idle");
		setErrorMessage(null);
		clearSessionMessages();
		setHistoryOpen(false);
	}, []);

	return {
		consent,
		acceptConsent,
		rejectConsent,
		messages,
		status,
		errorMessage,
		sendMessage,
		retryLast,
		conversations,
		historyOpen,
		toggleHistory,
		closeHistory,
		selectConversation,
		deleteConversationById,
		startNewConversation,
	};
}
```

Note on `retryLast`: after a failed `sendMessage`, `messages` already ends with the user message that failed to get a reply (it was appended optimistically before the stream ran). `retryLast` resends that same text as the current `message`, so it must pass `messages.slice(0, -1)` as history — everything _except_ that trailing user message — otherwise the failed message would appear twice in the model's context (once as history, once as the resent `message`).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/lib/chat/useChatSession.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck`
Expected: passes.

```bash
git add src/lib/chat/useChatSession.ts src/lib/chat/useChatSession.test.ts
git commit -m "Add useChatSession hook orchestrating consent, streaming, and history"
```

---

### Task 4: `ChatBubble` and `ChatMessages` presentational components

**Files:**

- Create: `src/components/chat/ChatBubble.tsx`
- Test: `src/components/chat/ChatBubble.test.tsx`
- Create: `src/components/chat/ChatMessages.tsx`
- Test: `src/components/chat/ChatMessages.test.tsx`

**Interfaces:**

- Consumes: `DisplayMessage`, `ChatStatus` (`src/lib/chat/useChatSession.ts`).
- Produces: `ChatBubble({ role, text })`, `ChatMessages({ messages, status, errorMessage, thinkingLabel, retryLabel, onRetry })` — consumed by `ChatWidget` (Task 7).

- [ ] **Step 1: Write the failing tests for `ChatBubble`**

`src/components/chat/ChatBubble.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatBubble } from "./ChatBubble";

describe("ChatBubble", () => {
	it("renders the message text", () => {
		render(<ChatBubble role="user" text="Hello there" />);
		expect(screen.getByText("Hello there")).toBeInTheDocument();
	});

	it("applies avatar styling for role='model'", () => {
		render(<ChatBubble role="model" text="Hi!" />);
		expect(screen.getByText("Hi!")).toHaveClass("border-electric-blue/60");
	});

	it("applies visitor styling for role='user'", () => {
		render(<ChatBubble role="user" text="Hi!" />);
		expect(screen.getByText("Hi!")).toHaveClass("border-signal-cyan/60");
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/components/chat/ChatBubble.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ChatBubble.tsx`**

```typescript
export interface ChatBubbleProps {
	role: "user" | "model";
	text: string;
}

export function ChatBubble({ role, text }: ChatBubbleProps) {
	const isModel = role === "model";
	return (
		<div className={`flex ${isModel ? "justify-start" : "justify-end"}`}>
			<p
				className={
					isModel
						? "border-electric-blue/60 bg-deep-blue/80 text-ion max-w-[80%] rounded-2xl rounded-bl-sm border px-4 py-2.5 text-sm backdrop-blur-lg"
						: "border-signal-cyan/60 bg-slate-mist text-ion max-w-[80%] rounded-2xl rounded-br-sm border px-4 py-2.5 text-sm backdrop-blur-lg"
				}
			>
				{text}
			</p>
		</div>
	);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/components/chat/ChatBubble.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing tests for `ChatMessages`**

`src/components/chat/ChatMessages.test.tsx`:

```typescript
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatMessages } from "./ChatMessages";

const baseProps = {
	messages: [],
	status: "idle" as const,
	errorMessage: null,
	thinkingLabel: "Thinking...",
	retryLabel: "Retry",
	onRetry: vi.fn(),
};

describe("ChatMessages", () => {
	it("renders each message as a bubble", () => {
		render(
			<ChatMessages
				{...baseProps}
				messages={[
					{ id: "1", role: "user", text: "Hi" },
					{ id: "2", role: "model", text: "Hello!" },
				]}
			/>,
		);
		expect(screen.getByText("Hi")).toBeInTheDocument();
		expect(screen.getByText("Hello!")).toBeInTheDocument();
	});

	it("shows the thinking indicator while status is 'sending'", () => {
		render(<ChatMessages {...baseProps} status="sending" />);
		expect(screen.getByText("Thinking...")).toBeInTheDocument();
	});

	it("does not show the thinking indicator once streaming has started", () => {
		render(<ChatMessages {...baseProps} status="streaming" />);
		expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();
	});

	it("shows an error bubble with a retry button when status is 'error'", () => {
		const onRetry = vi.fn();
		render(<ChatMessages {...baseProps} status="error" errorMessage="Something broke" onRetry={onRetry} />);
		expect(screen.getByText("Something broke")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		expect(onRetry).toHaveBeenCalled();
	});
});
```

- [ ] **Step 6: Run to verify failure**

Run: `pnpm test src/components/chat/ChatMessages.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `ChatMessages.tsx`**

```typescript
import { ChatBubble } from "./ChatBubble";
import type { ChatStatus, DisplayMessage } from "../../lib/chat/useChatSession";

export interface ChatMessagesProps {
	messages: DisplayMessage[];
	status: ChatStatus;
	errorMessage: string | null;
	thinkingLabel: string;
	retryLabel: string;
	onRetry: () => void;
}

export function ChatMessages({
	messages,
	status,
	errorMessage,
	thinkingLabel,
	retryLabel,
	onRetry,
}: ChatMessagesProps) {
	if (messages.length === 0 && status === "idle") return null;

	return (
		<div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto px-1 py-2">
			{messages.map((message) => (
				<ChatBubble key={message.id} role={message.role} text={message.text} />
			))}
			{status === "sending" && (
				<div className="flex justify-start">
					<p className="border-electric-blue/60 bg-deep-blue/80 text-ion/70 rounded-2xl rounded-bl-sm border px-4 py-2.5 text-sm backdrop-blur-lg">
						{thinkingLabel}
					</p>
				</div>
			)}
			{status === "error" && errorMessage && (
				<div className="flex justify-start">
					<div className="border-electric-blue/60 bg-deep-blue/80 text-ion flex max-w-[80%] flex-col gap-2 rounded-2xl rounded-bl-sm border px-4 py-2.5 text-sm backdrop-blur-lg">
						<p>{errorMessage}</p>
						<button
							type="button"
							onClick={onRetry}
							className="border-electric-blue/70 text-ion/90 hover:bg-electric-blue/15 self-start rounded-full border px-3 py-1 text-xs"
						>
							{retryLabel}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
```

- [ ] **Step 8: Run to verify pass**

Run: `pnpm test src/components/chat/ChatMessages.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 9: Typecheck and commit**

Run: `pnpm typecheck`
Expected: passes.

```bash
git add src/components/chat/ChatBubble.tsx src/components/chat/ChatBubble.test.tsx src/components/chat/ChatMessages.tsx src/components/chat/ChatMessages.test.tsx
git commit -m "Add ChatBubble and ChatMessages presentational components"
```

---

### Task 5: `ChatBox` and `ConsentBanner` components

**Files:**

- Create: `src/components/chat/ChatBox.tsx`
- Test: `src/components/chat/ChatBox.test.tsx`
- Create: `src/components/chat/ConsentBanner.tsx`
- Test: `src/components/chat/ConsentBanner.test.tsx`

**Interfaces:**

- Produces: `ChatBox({ inputPlaceholder, sendLabel, voiceLabel, disabled, onSend })`, `ConsentBanner({ messageText, acceptLabel, rejectLabel, infoToggleLabel, infoBodyText, showDeleteOption, deleteOptionLabel, onAccept, onReject })` — consumed by `ChatWidget` (Task 7).

- [ ] **Step 1: Write the failing tests for `ChatBox`**

`src/components/chat/ChatBox.test.tsx`:

```typescript
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatBox } from "./ChatBox";

const baseProps = {
	inputPlaceholder: "Ask me anything",
	sendLabel: "Send",
	voiceLabel: "Voice chat (coming soon)",
	disabled: false,
	onSend: vi.fn(),
};

describe("ChatBox", () => {
	it("calls onSend with the trimmed input and clears it on submit", () => {
		const onSend = vi.fn();
		render(<ChatBox {...baseProps} onSend={onSend} />);
		const input = screen.getByPlaceholderText("Ask me anything");
		fireEvent.change(input, { target: { value: "  Hello there  " } });
		fireEvent.click(screen.getByRole("button", { name: "Send" }));
		expect(onSend).toHaveBeenCalledWith("Hello there");
		expect(input).toHaveValue("");
	});

	it("does not call onSend for an empty/whitespace-only message", () => {
		const onSend = vi.fn();
		render(<ChatBox {...baseProps} onSend={onSend} />);
		fireEvent.change(screen.getByPlaceholderText("Ask me anything"), { target: { value: "   " } });
		fireEvent.click(screen.getByRole("button", { name: "Send" }));
		expect(onSend).not.toHaveBeenCalled();
	});

	it("submits on Enter key press in the input", () => {
		const onSend = vi.fn();
		render(<ChatBox {...baseProps} onSend={onSend} />);
		const input = screen.getByPlaceholderText("Ask me anything");
		fireEvent.change(input, { target: { value: "Hi" } });
		fireEvent.keyDown(input, { key: "Enter" });
		expect(onSend).toHaveBeenCalledWith("Hi");
	});

	it("disables the input and send button when disabled=true", () => {
		render(<ChatBox {...baseProps} disabled />);
		expect(screen.getByPlaceholderText("Ask me anything")).toBeDisabled();
		expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
	});

	it("renders a disabled voice button with the provided label", () => {
		render(<ChatBox {...baseProps} />);
		expect(screen.getByRole("button", { name: "Voice chat (coming soon)" })).toBeDisabled();
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/components/chat/ChatBox.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ChatBox.tsx`**

```typescript
import { useState, type KeyboardEvent } from "react";

export interface ChatBoxProps {
	inputPlaceholder: string;
	sendLabel: string;
	voiceLabel: string;
	disabled: boolean;
	onSend: (text: string) => void;
}

export function ChatBox({ inputPlaceholder, sendLabel, voiceLabel, disabled, onSend }: ChatBoxProps) {
	const [value, setValue] = useState("");

	const submit = () => {
		const trimmed = value.trim();
		if (!trimmed) return;
		onSend(trimmed);
		setValue("");
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter") submit();
	};

	return (
		<div className="border-slate-mist bg-deep-blue/40 shadow-glow-blue flex items-center gap-2 rounded-full border p-2 backdrop-blur-xl">
			<button
				type="button"
				disabled
				aria-label={voiceLabel}
				title={voiceLabel}
				className="border-slate-mist-strong text-ion/40 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
			>
				~
			</button>
			<input
				type="text"
				value={value}
				onChange={(event) => setValue(event.target.value)}
				onKeyDown={handleKeyDown}
				placeholder={inputPlaceholder}
				disabled={disabled}
				className="text-ion placeholder:text-ion/40 flex-1 bg-transparent px-2 text-sm outline-none disabled:opacity-50"
			/>
			<button
				type="button"
				onClick={submit}
				disabled={disabled}
				className="border-electric-blue/70 bg-electric-blue/15 text-ion shadow-glow-blue hover:bg-electric-blue/25 shrink-0 rounded-full border px-4 py-2 text-sm font-medium backdrop-blur-lg disabled:opacity-50"
			>
				{sendLabel}
			</button>
		</div>
	);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/components/chat/ChatBox.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the failing tests for `ConsentBanner`**

`src/components/chat/ConsentBanner.test.tsx`:

```typescript
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConsentBanner } from "./ConsentBanner";

const baseProps = {
	messageText: "We use a cookie to save your chat.",
	acceptLabel: "Accept",
	rejectLabel: "Reject",
	infoToggleLabel: "What's this cookie?",
	infoBodyText: "Details about the cookie.",
	showDeleteOption: false,
	deleteOptionLabel: "Also delete my saved conversations",
	onAccept: vi.fn(),
	onReject: vi.fn(),
};

describe("ConsentBanner", () => {
	it("renders the consent message and calls onAccept", () => {
		const onAccept = vi.fn();
		render(<ConsentBanner {...baseProps} onAccept={onAccept} />);
		expect(screen.getByText(baseProps.messageText)).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Accept" }));
		expect(onAccept).toHaveBeenCalled();
	});

	it("calls onReject(false) when rejected without the delete option shown", () => {
		const onReject = vi.fn();
		render(<ConsentBanner {...baseProps} onReject={onReject} />);
		fireEvent.click(screen.getByRole("button", { name: "Reject" }));
		expect(onReject).toHaveBeenCalledWith(false);
	});

	it("toggles the info body text on info-toggle click", () => {
		render(<ConsentBanner {...baseProps} />);
		expect(screen.queryByText("Details about the cookie.")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "What's this cookie?" }));
		expect(screen.getByText("Details about the cookie.")).toBeInTheDocument();
	});

	it("shows a delete-option checkbox and passes its value to onReject when showDeleteOption is true", () => {
		const onReject = vi.fn();
		render(<ConsentBanner {...baseProps} showDeleteOption onReject={onReject} />);
		fireEvent.click(screen.getByRole("checkbox", { name: baseProps.deleteOptionLabel }));
		fireEvent.click(screen.getByRole("button", { name: "Reject" }));
		expect(onReject).toHaveBeenCalledWith(true);
	});
});
```

- [ ] **Step 6: Run to verify failure**

Run: `pnpm test src/components/chat/ConsentBanner.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `ConsentBanner.tsx`**

```typescript
import { useState } from "react";

export interface ConsentBannerProps {
	messageText: string;
	acceptLabel: string;
	rejectLabel: string;
	infoToggleLabel: string;
	infoBodyText: string;
	showDeleteOption: boolean;
	deleteOptionLabel: string;
	onAccept: () => void;
	onReject: (alsoDeleteHistory: boolean) => void;
}

export function ConsentBanner({
	messageText,
	acceptLabel,
	rejectLabel,
	infoToggleLabel,
	infoBodyText,
	showDeleteOption,
	deleteOptionLabel,
	onAccept,
	onReject,
}: ConsentBannerProps) {
	const [infoOpen, setInfoOpen] = useState(false);
	const [alsoDelete, setAlsoDelete] = useState(false);

	return (
		<div className="border-slate-mist bg-deep-blue/60 shadow-glow-blue text-ion mx-auto flex max-w-xl flex-col gap-3 rounded-2xl border p-4 text-sm backdrop-blur-xl">
			<p>{messageText}</p>
			<button
				type="button"
				onClick={() => setInfoOpen((open) => !open)}
				className="text-signal-cyan/80 self-start text-xs underline"
			>
				{infoToggleLabel}
			</button>
			{infoOpen && <p className="text-ion/70 text-xs">{infoBodyText}</p>}
			{showDeleteOption && (
				<label className="text-ion/70 flex items-center gap-2 text-xs">
					<input
						type="checkbox"
						checked={alsoDelete}
						onChange={(event) => setAlsoDelete(event.target.checked)}
					/>
					{deleteOptionLabel}
				</label>
			)}
			<div className="flex gap-2">
				<button
					type="button"
					onClick={onAccept}
					className="border-electric-blue/70 bg-electric-blue/15 text-ion shadow-glow-blue hover:bg-electric-blue/25 rounded-full border px-4 py-2 text-sm font-medium"
				>
					{acceptLabel}
				</button>
				<button
					type="button"
					onClick={() => onReject(alsoDelete)}
					className="border-slate-mist-strong text-ion/80 hover:bg-slate-mist rounded-full border bg-transparent px-4 py-2 text-sm font-medium"
				>
					{rejectLabel}
				</button>
			</div>
		</div>
	);
}
```

- [ ] **Step 8: Run to verify pass**

Run: `pnpm test src/components/chat/ConsentBanner.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 9: Typecheck and commit**

Run: `pnpm typecheck`
Expected: passes.

```bash
git add src/components/chat/ChatBox.tsx src/components/chat/ChatBox.test.tsx src/components/chat/ConsentBanner.tsx src/components/chat/ConsentBanner.test.tsx
git commit -m "Add ChatBox and ConsentBanner components"
```

---

### Task 6: `HistorySidebar` and `HistoryToggleButton` components

**Files:**

- Create: `src/components/chat/HistorySidebar.tsx`
- Test: `src/components/chat/HistorySidebar.test.tsx`
- Create: `src/components/chat/HistoryToggleButton.tsx`
- Test: `src/components/chat/HistoryToggleButton.test.tsx`

**Interfaces:**

- Consumes: `ConversationSummary` (`src/lib/history/types.ts`).
- Produces: `HistorySidebar({ open, conversations, titleText, newConversationLabel, deleteLabel, retentionNoticeText, onClose, onSelect, onDelete, onNewConversation })`, `HistoryToggleButton({ visible, label, onClick })` — consumed by `ChatWidget` (Task 7).

- [ ] **Step 1: Write the failing tests for `HistorySidebar`**

`src/components/chat/HistorySidebar.test.tsx`:

```typescript
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistorySidebar } from "./HistorySidebar";

const conversations = [
	{ conversationId: "c-1", title: "First chat", updatedAt: "2026-08-05T00:00:00.000Z" },
	{ conversationId: "c-2", title: "Second chat", updatedAt: "2026-08-06T00:00:00.000Z" },
];

const baseProps = {
	open: true,
	conversations,
	titleText: "History",
	newConversationLabel: "New conversation",
	deleteLabel: "Delete conversation",
	retentionNoticeText: "Kept for 30 days.",
	onClose: vi.fn(),
	onSelect: vi.fn(),
	onDelete: vi.fn(),
	onNewConversation: vi.fn(),
};

describe("HistorySidebar", () => {
	it("renders nothing when open=false", () => {
		render(<HistorySidebar {...baseProps} open={false} />);
		expect(screen.queryByText("History")).not.toBeInTheDocument();
	});

	it("lists each conversation's title and the retention notice", () => {
		render(<HistorySidebar {...baseProps} />);
		expect(screen.getByText("First chat")).toBeInTheDocument();
		expect(screen.getByText("Second chat")).toBeInTheDocument();
		expect(screen.getByText("Kept for 30 days.")).toBeInTheDocument();
	});

	it("calls onSelect with the conversationId when a row is clicked", () => {
		const onSelect = vi.fn();
		render(<HistorySidebar {...baseProps} onSelect={onSelect} />);
		fireEvent.click(screen.getByText("First chat"));
		expect(onSelect).toHaveBeenCalledWith("c-1");
	});

	it("calls onDelete with the conversationId, not onSelect, when a delete button is clicked", () => {
		const onDelete = vi.fn();
		const onSelect = vi.fn();
		render(<HistorySidebar {...baseProps} onDelete={onDelete} onSelect={onSelect} />);
		fireEvent.click(screen.getAllByRole("button", { name: "Delete conversation" })[0]);
		expect(onDelete).toHaveBeenCalledWith("c-1");
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("calls onNewConversation when the new-conversation action is clicked", () => {
		const onNewConversation = vi.fn();
		render(<HistorySidebar {...baseProps} onNewConversation={onNewConversation} />);
		fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
		expect(onNewConversation).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/components/chat/HistorySidebar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `HistorySidebar.tsx`**

```typescript
import type { ConversationSummary } from "../../lib/history/types";

export interface HistorySidebarProps {
	open: boolean;
	conversations: ConversationSummary[];
	titleText: string;
	newConversationLabel: string;
	deleteLabel: string;
	retentionNoticeText: string;
	onClose: () => void;
	onSelect: (conversationId: string) => void;
	onDelete: (conversationId: string) => void;
	onNewConversation: () => void;
}

export function HistorySidebar({
	open,
	conversations,
	titleText,
	newConversationLabel,
	deleteLabel,
	retentionNoticeText,
	onClose,
	onSelect,
	onDelete,
	onNewConversation,
}: HistorySidebarProps) {
	if (!open) return null;

	return (
		<div className="border-slate-mist bg-deep-blue/70 text-ion fixed top-0 left-0 z-50 flex h-full w-72 flex-col gap-3 border-r p-4 backdrop-blur-2xl">
			<div className="flex items-center justify-between">
				<h2 className="font-display text-base font-semibold">{titleText}</h2>
				<button type="button" onClick={onClose} aria-label="Close" className="text-ion/60 hover:text-ion">
					×
				</button>
			</div>
			<button
				type="button"
				onClick={onNewConversation}
				className="border-electric-blue/70 bg-electric-blue/15 hover:bg-electric-blue/25 rounded-full border px-3 py-1.5 text-left text-sm"
			>
				{newConversationLabel}
			</button>
			<ul className="flex flex-1 flex-col gap-1 overflow-y-auto">
				{conversations.map((conversation) => (
					<li key={conversation.conversationId} className="group flex items-center gap-1">
						<button
							type="button"
							onClick={() => onSelect(conversation.conversationId)}
							className="hover:bg-slate-mist text-ion/90 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-sm"
						>
							{conversation.title}
						</button>
						<button
							type="button"
							onClick={() => onDelete(conversation.conversationId)}
							aria-label={deleteLabel}
							className="text-ion/40 hover:text-ion/80 px-1 text-xs opacity-0 group-hover:opacity-100"
						>
							×
						</button>
					</li>
				))}
			</ul>
			<p className="text-ion/50 border-slate-mist border-t pt-3 text-xs">{retentionNoticeText}</p>
		</div>
	);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/components/chat/HistorySidebar.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the failing tests for `HistoryToggleButton`**

`src/components/chat/HistoryToggleButton.test.tsx`:

```typescript
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryToggleButton } from "./HistoryToggleButton";

describe("HistoryToggleButton", () => {
	it("renders nothing when visible=false", () => {
		render(<HistoryToggleButton visible={false} label="Conversation history" onClick={vi.fn()} />);
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	it("renders and calls onClick when visible=true", () => {
		const onClick = vi.fn();
		render(<HistoryToggleButton visible label="Conversation history" onClick={onClick} />);
		fireEvent.click(screen.getByRole("button", { name: "Conversation history" }));
		expect(onClick).toHaveBeenCalled();
	});
});
```

- [ ] **Step 6: Run to verify failure**

Run: `pnpm test src/components/chat/HistoryToggleButton.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `HistoryToggleButton.tsx`**

```typescript
export interface HistoryToggleButtonProps {
	visible: boolean;
	label: string;
	onClick: () => void;
}

export function HistoryToggleButton({ visible, label, onClick }: HistoryToggleButtonProps) {
	if (!visible) return null;

	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			title={label}
			className="border-slate-mist-strong bg-deep-blue/40 text-ion/80 hover:bg-slate-mist flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-lg"
		>
			↺
		</button>
	);
}
```

- [ ] **Step 8: Run to verify pass**

Run: `pnpm test src/components/chat/HistoryToggleButton.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 9: Typecheck and commit**

Run: `pnpm typecheck`
Expected: passes.

```bash
git add src/components/chat/HistorySidebar.tsx src/components/chat/HistorySidebar.test.tsx src/components/chat/HistoryToggleButton.tsx src/components/chat/HistoryToggleButton.test.tsx
git commit -m "Add HistorySidebar and HistoryToggleButton components"
```

---

### Task 7: `ChatWidget`, page wiring, and end-to-end verification

**Files:**

- Create: `src/components/chat/ChatWidget.tsx`
- Modify: `src/views/HomeView.astro`
- Create: `tests/e2e/chat.spec.ts`

**Interfaces:**

- Consumes: `useChatSession` (Task 3), `ChatMessages`/`ChatBubble` (Task 4), `ChatBox`/`ConsentBanner` (Task 5), `HistorySidebar`/`HistoryToggleButton` (Task 6), `getDictionary`/`Locale` (`src/i18n`).
- Produces: `ChatWidget({ lang })`, mounted from `HomeView.astro`.

- [ ] **Step 1: Implement `ChatWidget.tsx`**

No new tests in this step — `ChatWidget` is pure composition of already-tested pieces (`useChatSession` plus the six components from Tasks 3–6), each fully covered by its own test file. Its correctness is verified by the Playwright e2e tests in Step 3 and live verification in Step 4, consistent with how `src/pages/api/chat.ts` (a thin composition file) had no dedicated unit test in the backend plan.

```typescript
import { useEffect, useState } from "react";
import { useChatSession } from "../../lib/chat/useChatSession";
import { ChatMessages } from "./ChatMessages";
import { ChatBox } from "./ChatBox";
import { ConsentBanner } from "./ConsentBanner";
import { HistorySidebar } from "./HistorySidebar";
import { HistoryToggleButton } from "./HistoryToggleButton";
import { getDictionary, type Locale } from "../../i18n";

export interface ChatWidgetProps {
	lang: Locale;
}

export function ChatWidget({ lang }: ChatWidgetProps) {
	const t = getDictionary(lang).chat;
	const [preferencesOpen, setPreferencesOpen] = useState(false);

	const session = useChatSession({
		language: lang.toUpperCase(),
		errorGenericMessage: t.errorGeneric,
		errorRateLimitedMessage: t.errorRateLimited,
	});

	useEffect(() => {
		if (session.consent === null) setPreferencesOpen(true);
	}, [session.consent]);

	const showConsentBanner = session.consent === null || preferencesOpen;

	return (
		<>
			<HistorySidebar
				open={session.historyOpen}
				conversations={session.conversations}
				titleText={t.historyTitle}
				newConversationLabel={t.newConversation}
				deleteLabel={t.deleteConversation}
				retentionNoticeText={t.retentionNotice}
				onClose={session.closeHistory}
				onSelect={session.selectConversation}
				onDelete={session.deleteConversationById}
				onNewConversation={session.startNewConversation}
			/>

			<div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex flex-col items-center gap-3 px-4">
				<div className="pointer-events-auto flex w-full max-w-xl flex-col gap-3">
					{showConsentBanner ? (
						<ConsentBanner
							messageText={t.consent.message}
							acceptLabel={t.consent.accept}
							rejectLabel={t.consent.reject}
							infoToggleLabel={t.consent.infoToggle}
							infoBodyText={t.consent.infoBody}
							showDeleteOption={session.consent === "accepted"}
							deleteOptionLabel={t.consent.deleteOption}
							onAccept={() => {
								session.acceptConsent();
								setPreferencesOpen(false);
							}}
							onReject={(alsoDelete) => {
								session.rejectConsent(alsoDelete);
								setPreferencesOpen(false);
							}}
						/>
					) : (
						<div className="flex items-center justify-between">
							<HistoryToggleButton
								visible={session.conversations.length > 0}
								label={t.historyToggleLabel}
								onClick={session.toggleHistory}
							/>
							<button
								type="button"
								onClick={() => setPreferencesOpen(true)}
								className="text-ion/40 hover:text-ion/70 ml-auto text-xs underline"
							>
								{t.consent.preferencesLink}
							</button>
						</div>
					)}

					<ChatMessages
						messages={session.messages}
						status={session.status}
						errorMessage={session.errorMessage}
						thinkingLabel={t.thinking}
						retryLabel={t.retry}
						onRetry={session.retryLast}
					/>

					<ChatBox
						inputPlaceholder={t.inputPlaceholder}
						sendLabel={t.send}
						voiceLabel={t.voiceComingSoon}
						disabled={session.status === "sending" || session.status === "streaming"}
						onSend={session.sendMessage}
					/>
				</div>
			</div>
		</>
	);
}
```

- [ ] **Step 2: Mount `ChatWidget` on the Main page**

In `src/views/HomeView.astro`, add the import and mount the island after the existing `<PresenceRing>`/text block, inside `<main>`:

```diff
 ---
 import Layout from "../layouts/Layout.astro";
 import PresenceRing from "../components/ui/PresenceRing.astro";
+import { ChatWidget } from "../components/chat/ChatWidget";
 import { getDictionary, type Locale } from "../i18n";
```

```diff
 			<p class="font-body text-ion/70 text-base sm:text-lg">
 				{t.home.tagline}
 			</p>
 		</div>
+		<ChatWidget lang={lang} client:load />
 	</main>
 </Layout>
```

- [ ] **Step 3: Write Playwright e2e tests**

`tests/e2e/chat.spec.ts`:

```typescript
import { expect, test } from "@playwright/test";

test("shows the consent banner on first visit and a chat box after accepting", async ({
	page,
}) => {
	await page.goto("/en/");
	await expect(
		page.getByText(/This site can remember your conversation/),
	).toBeVisible();
	await page.getByRole("button", { name: "Accept" }).click();
	await expect(
		page.getByPlaceholder("Ask me about my work, background, or projects..."),
	).toBeVisible();
});

test("rejecting consent still allows sending a message", async ({ page }) => {
	await page.goto("/en/");
	await page.getByRole("button", { name: "Reject" }).click();
	const input = page.getByPlaceholder(
		"Ask me about my work, background, or projects...",
	);
	await expect(input).toBeVisible();
	await input.fill("What's your background?");
	await page.getByRole("button", { name: "Send" }).click();
	await expect(page.getByText("What's your background?")).toBeVisible();
});

test("the history toggle is hidden until a persisted conversation exists", async ({
	page,
}) => {
	await page.goto("/en/");
	await expect(
		page.getByRole("button", { name: "Conversation history" }),
	).toHaveCount(0);
});

test("consent choice persists across a reload", async ({ page }) => {
	await page.goto("/en/");
	await page.getByRole("button", { name: "Accept" }).click();
	await page.reload();
	await expect(
		page.getByText(/This site can remember your conversation/),
	).not.toBeVisible();
	await expect(
		page.getByPlaceholder("Ask me about my work, background, or projects..."),
	).toBeVisible();
});
```

- [ ] **Step 4: Run the full test suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all unit tests pass (adds to the 91 from Tasks 1–6), 0 type errors.

- [ ] **Step 5: Live verification against a running dev server**

Run: `astro dev --background` (per this repo's `CLAUDE.md` convention).

Run: `pnpm test:e2e tests/e2e/chat.spec.ts`
Expected: all 4 new e2e tests pass against the real dev server (real `/api/chat`/`/api/history/*` calls, real Gemma replies — this is the first time the UI and the already-merged backend talk to each other for real).

Manually confirm in a browser (or via the `claude-in-chrome`/`run` tooling if available in this environment) that:

- The consent banner appears on first load, with working Accept/Reject.
- After accepting, sending a message streams a real reply and the presence ring visibly changes state (idle → listening → speaking → idle) — inspect via browser devtools if a visual check isn't practical (`document.querySelector(".presence-ring").dataset.state`).
- After accepting and sending at least one message, reloading the page shows the history toggle button, and clicking it opens the sidebar with that conversation listed.
- Deleting a conversation from the sidebar removes it immediately.

Run: `astro dev stop`

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/ChatWidget.tsx src/views/HomeView.astro tests/e2e/chat.spec.ts
git commit -m "Add ChatWidget, wire it into the Main page, and add e2e coverage"
```

---

## Self-Review Notes

- **Spec coverage**: every "UI" delivery-plan item from the design spec (ConsentBanner accept/reject/info/preferences-reopen/delete-on-reject, ChatBox with disabled voice button, ChatBubble avatar/visitor styling, SSE-driven streaming render, idle/sending/streaming/error states with retry, `PresenceRing`-based placeholder hero, HistorySidebar list/select/delete/new-conversation/retention-notice, Playwright coverage including a reject-consent path) maps to Tasks 1–7 above.
- **Placeholder scan**: no `TBD`/`TODO`/"add appropriate handling" — every step has literal code or literal shell commands.
- **Type consistency**: `DisplayMessage`, `ChatStatus`, `ConversationSummary`, `ChatSseEvent`, `ChatMessage` are each defined once (either in this plan's Task 2/3 or reused from the already-merged backend) and used with identical shapes across every task that consumes them.
- **i18n**: no hardcoded UI strings outside `getDictionary(lang).chat.*` — the SSE error code mapping in `useChatSession` (Task 3) is the one place that touches a non-localized value (the wire-level `"rate_limited"`/`"request_failed"`/arbitrary-server-text codes), and it's mapped to a localized string immediately, never rendered raw.
