import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import {
	handleDeleteConversation,
	handleGetConversation,
} from "../../../lib/chat/historyHandlers";

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
	return handleGetConversation({
		request,
		kv: env.SESSION,
		conversationId: params.id!,
	});
};

export const DELETE: APIRoute = async ({ request, params }) => {
	return handleDeleteConversation({
		request,
		kv: env.SESSION,
		conversationId: params.id!,
	});
};
