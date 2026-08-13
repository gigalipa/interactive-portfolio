import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { handleVoiceTokenRequest } from "../../../lib/voice/tokenHandler";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
	return handleVoiceTokenRequest({
		request,
		rateLimiter: env.CHAT_RATE_LIMITER,
		chroma: {
			apiKey: env.CHROMA_API_KEY,
			tenant: env.CHROMA_TENANT,
			database: env.CHROMA_DATABASE,
			host: env.CHROMA_HOST || undefined,
		},
		googleApiKeyEmb: env.GOOGLE_API_KEY_EMB,
		googleApiKeyLive: env.GOOGLE_API_KEY_LIVE,
	});
};
