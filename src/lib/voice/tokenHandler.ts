import { EXCLUDED_GENERAL_CHAT_CONTENT_TYPES, type RateLimiter } from "../chat/handler";
import { retrieveContext, type ChromaCredentials } from "../rag/retrieve";
import { buildVoiceSystemPrompt } from "../rag/prompt";
import { mintEphemeralToken, LIVE_MODEL } from "./ephemeralToken";

export interface VoiceTokenRequestBody {
	language: string;
}

export interface HandleVoiceTokenRequestOptions {
	request: Request;
	rateLimiter: RateLimiter;
	chroma: ChromaCredentials;
	googleApiKeyEmb: string;
	googleApiKeyLive: string;
}

const RATE_LIMIT_IP_HEADER = "cf-connecting-ip";
// body.language is interpolated directly into the voice system prompt, which
// gets baked into an ephemeral token the client holds — so it must be
// restricted to the site's actual locales rather than accepted freeform,
// or a visitor could smuggle instruction-injection text into a token minted
// on the site owner's API key/quota.
const ALLOWED_VOICE_LANGUAGES = ["EN", "ES", "FR"];
// Wider than text chat's default (4): the Live API sets system instructions once
// at session start rather than re-retrieving per turn, so this needs to cover a
// broader slice of the knowledge base up front.
const VOICE_CONTEXT_TOP_K = 12;
const GENERIC_ERROR_MESSAGE =
	"Couldn't start a voice session just now. Please try again or use text chat.";

function jsonError(status: number, message: string): Response {
	return new Response(JSON.stringify({ message }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

export async function handleVoiceTokenRequest(
	options: HandleVoiceTokenRequestOptions,
): Promise<Response> {
	const { request, rateLimiter, chroma, googleApiKeyEmb, googleApiKeyLive } = options;

	let body: VoiceTokenRequestBody;
	try {
		body = (await request.json()) as VoiceTokenRequestBody;
	} catch {
		return jsonError(400, "Invalid JSON body");
	}
	if (!body.language || typeof body.language !== "string") {
		return jsonError(400, "language is required");
	}
	if (!ALLOWED_VOICE_LANGUAGES.includes(body.language)) {
		return jsonError(
			400,
			`language must be one of: ${ALLOWED_VOICE_LANGUAGES.join(", ")}`,
		);
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

	try {
		const chunks = await retrieveContext({
			chroma,
			googleApiKey: googleApiKeyEmb,
			query: "Daniel Peraza background, skills, and experience overview",
			language: body.language,
			topK: VOICE_CONTEXT_TOP_K,
			excludeContentTypes: EXCLUDED_GENERAL_CHAT_CONTENT_TYPES,
		}).catch(() => []);

		const systemInstructions = buildVoiceSystemPrompt({
			chunks,
			visitorLanguage: body.language,
		});

		const { token, expiresAt } = await mintEphemeralToken({
			apiKey: googleApiKeyLive,
			systemInstructions,
		});

		return new Response(JSON.stringify({ token, expiresAt, model: LIVE_MODEL }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		console.error("Voice token mint failed", error);
		return jsonError(502, GENERIC_ERROR_MESSAGE);
	}
}
