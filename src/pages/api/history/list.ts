import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { handleListHistory } from "../../../lib/chat/historyHandlers";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	return handleListHistory({ request, kv: env.SESSION });
};
