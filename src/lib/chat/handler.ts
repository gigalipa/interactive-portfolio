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
