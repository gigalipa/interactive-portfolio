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
const MAX_MESSAGE_LENGTH = 4000;
// Deliberate caps, not arbitrary: MAX_MODEL_MESSAGES bounds per-turn Gemini token
// cost (which would otherwise grow linearly with conversation length), and
// MAX_STORED_MESSAGES bounds the KV value size so a long conversation can't grow
// past the namespace's per-value limit.
const MAX_MODEL_MESSAGES = 20;
const MAX_STORED_MESSAGES = 100;
const MAX_CLIENT_HISTORY = 50;
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Upstream (Gemini/Chroma) error text can carry quota, billing, and internal
// details, so the client only ever sees this. The real error is logged server-side.
const GENERIC_ERROR_MESSAGE =
	"The avatar couldn't reply just now. Please try again.";

function jsonError(status: number, message: string): Response {
	return new Response(JSON.stringify({ message }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function isValidHistoryEntry(entry: unknown): entry is ChatMessage {
	if (!entry || typeof entry !== "object") return false;
	const { role, text } = entry as Partial<ChatMessage>;
	return (role === "user" || role === "model") && typeof text === "string";
}

const now = (): string => new Date().toISOString();

export async function handleChatRequest(
	options: HandleChatRequestOptions,
): Promise<Response> {
	const { request, kv, rateLimiter, chroma, googleApiKeyEmb, googleApiKeyLlm } =
		options;

	let body: ChatRequestBody;
	try {
		body = (await request.json()) as ChatRequestBody;
	} catch {
		return jsonError(400, "Invalid JSON body");
	}
	if (!body.message || typeof body.message !== "string") {
		return jsonError(400, "message is required");
	}
	if (body.message.length > MAX_MESSAGE_LENGTH) {
		return jsonError(
			400,
			`message must be at most ${MAX_MESSAGE_LENGTH} characters`,
		);
	}
	// A client-supplied conversationId becomes part of a KV key, so only accept the
	// UUID shape we hand out via the meta event.
	if (body.persist && body.conversationId !== undefined) {
		if (
			typeof body.conversationId !== "string" ||
			!UUID_PATTERN.test(body.conversationId)
		) {
			return jsonError(400, "conversationId must be a UUID");
		}
	}

	// The rate-limit key is always derived from the client IP. It must never be
	// derived from a freshly-generated visitor id, or a client could evade the
	// limiter entirely by sending no cookie (or a new random one) each request.
	const rateLimitKey = request.headers.get(RATE_LIMIT_IP_HEADER) ?? "anonymous";
	const { success } = await rateLimiter.limit({ key: rateLimitKey });
	if (!success) {
		return new Response(JSON.stringify({ message: "Rate limit exceeded" }), {
			status: 429,
			headers: {
				"Content-Type": "application/json",
				// Matches the rate limiter's 60-second period.
				"Retry-After": "60",
			},
		});
	}

	let visitorId: string | undefined;
	let setCookieHeader: string | undefined;
	if (body.persist) {
		const resolved = resolveVisitorId(request.headers.get("cookie"));
		visitorId = resolved.visitorId;
		if (resolved.isNew) setCookieHeader = buildVisitorIdCookie(visitorId);
	}

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
		// Client-supplied history is untrusted: keep only the most recent entries and
		// drop anything malformed rather than letting it reach the model or crash.
		priorMessages = (Array.isArray(body.history) ? body.history : [])
			.slice(-MAX_CLIENT_HISTORY)
			.filter(isValidHistoryEntry);
	}

	const userMessage: ChatMessage = {
		role: "user",
		text: body.message,
		at: now(),
	};
	const messagesForModel: ChatMessageForModel[] = [
		...priorMessages,
		userMessage,
	]
		.slice(-MAX_MODEL_MESSAGES)
		.map(({ role, text }) => ({ role, text }));

	const responseHeaders = new Headers({
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
	});
	if (setCookieHeader) responseHeaders.set("Set-Cookie", setCookieHeader);

	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (chunk: string) => controller.enqueue(encoder.encode(chunk));

			if (body.persist && conversationId) {
				send(formatSseEvent({ event: "meta", data: { conversationId } }));
			}

			// Persists the user's message (and, if any, the assistant's reply so far)
			// for a persist:true request. Guarded the same way on both the success
			// and failure paths so a mid-stream model failure never silently drops
			// the turn the visitor just sent.
			const persistTurn = async (assistantText: string) => {
				if (!(body.persist && visitorId && conversationId)) return;
				const messages: ChatMessage[] = [...priorMessages, userMessage];
				if (assistantText) {
					messages.push({ role: "model", text: assistantText, at: now() });
				}
				const updated: StoredConversation = {
					messages: messages.slice(-MAX_STORED_MESSAGES),
					updatedAt: now(),
					title: existingTitle ?? buildTitle(body.message),
				};
				await putConversation(kv, visitorId, conversationId, updated).catch(
					(error: unknown) => {
						console.error(
							"Failed to persist conversation",
							conversationId,
							error,
						);
					},
				);
			};

			let fullReply = "";
			try {
				const chunks = await retrieveContext({
					chroma,
					googleApiKey: googleApiKeyEmb,
					query: body.message,
					language: body.language,
				}).catch(() => []);

				const systemPrompt = buildSystemPrompt({
					chunks,
					visitorLanguage: body.language,
				});

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
				await persistTurn(fullReply);
			} catch (error) {
				// Log the real error server-side only; the client gets a generic message
				// so upstream quota/billing/internal details never reach the browser.
				console.error("Chat request failed", conversationId, error);
				send(
					formatSseEvent({
						event: "error",
						data: { message: GENERIC_ERROR_MESSAGE },
					}),
				);
				// Even on a mid-stream failure, persist what was actually sent/received
				// so the visitor's message isn't silently lost from their history.
				await persistTurn(fullReply);
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, { status: 200, headers: responseHeaders });
}
