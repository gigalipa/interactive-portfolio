import { clearVisitorIdCookie, readVisitorId } from "../history/cookies";
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

	const conversation = await getConversation(
		options.kv,
		visitorId,
		options.conversationId,
	);
	if (!conversation) return jsonResponse(404, { message: "Not found" });

	return jsonResponse(200, conversation);
}

export async function handleDeleteConversation(
	options: HistoryRequestOptions & { conversationId: string },
): Promise<Response> {
	const visitorId = requireVisitorId(options.request);
	if (!visitorId) return new Response(null, { status: 404 });

	const existing = await getConversation(
		options.kv,
		visitorId,
		options.conversationId,
	);
	if (!existing) return new Response(null, { status: 404 });

	await deleteConversation(options.kv, visitorId, options.conversationId);
	return new Response(null, { status: 204 });
}

export async function handleDeleteAllHistory(
	options: HistoryRequestOptions,
): Promise<Response> {
	const visitorId = requireVisitorId(options.request);
	if (!visitorId) return new Response(null, { status: 204 });

	await deleteAllConversations(options.kv, visitorId);
	// Also drop the identifier itself, not just the data keyed by it.
	return new Response(null, {
		status: 204,
		headers: { "Set-Cookie": clearVisitorIdCookie() },
	});
}
