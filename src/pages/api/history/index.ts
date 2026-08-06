import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { handleDeleteAllHistory } from "../../../lib/chat/historyHandlers";

export const prerender = false;

export const DELETE: APIRoute = async ({ request }) => {
	return handleDeleteAllHistory({ request, kv: env.SESSION });
};
