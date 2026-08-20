import { buildVisitorIdCookie, resolveVisitorId } from "../history/cookies";
import {
	buildTitle,
	getConversation,
	putConversation,
	type ConversationKV,
} from "../history/kv";
import type { ChatMessage, StoredConversation } from "../history/types";
import type { RateLimiter } from "../chat/handler";

export interface VoiceTurnRequestBody {
	persist: boolean;
	conversationId?: string;
	userText: string;
	modelText: string;
}

export interface HandleVoiceTurnRequestOptions {
	request: Request;
	kv: ConversationKV;
	rateLimiter: RateLimiter;
}

const RATE_LIMIT_IP_HEADER = "cf-connecting-ip";
const MAX_TURN_TEXT_LENGTH = 4000;
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
	const { request, kv, rateLimiter } = options;

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
	if (body.userText.length > MAX_TURN_TEXT_LENGTH) {
		return jsonError(
			400,
			`userText must be at most ${MAX_TURN_TEXT_LENGTH} characters`,
		);
	}
	if (body.modelText.length > MAX_TURN_TEXT_LENGTH) {
		return jsonError(
			400,
			`modelText must be at most ${MAX_TURN_TEXT_LENGTH} characters`,
		);
	}
	if (body.persist && body.conversationId !== undefined) {
		if (
			typeof body.conversationId !== "string" ||
			!UUID_PATTERN.test(body.conversationId)
		) {
			return jsonError(400, "conversationId must be a UUID");
		}
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
	try {
		await putConversation(kv, visitorId, conversationId, updated);
	} catch (error) {
		console.error("Failed to persist conversation", conversationId, error);
		return jsonError(502, "Failed to save the voice turn. Please try again.");
	}

	const responseHeaders = new Headers({ "Content-Type": "application/json" });
	if (resolved.isNew)
		responseHeaders.set("Set-Cookie", buildVisitorIdCookie(visitorId));

	return new Response(JSON.stringify({ conversationId }), {
		status: 200,
		headers: responseHeaders,
	});
}
