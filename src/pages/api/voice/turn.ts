import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { handleVoiceTurnRequest } from "../../../lib/voice/turnHandler";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	return handleVoiceTurnRequest({ request, kv: env.SESSION });
};
