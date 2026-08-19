import { GoogleGenAI, Modality } from "@google/genai";

/** Confirmed live via Step 2 of the plan that introduced this file — re-run that
 * verification if @google/genai is upgraded, since this is a newer API surface.
 * Found by querying https://generativelanguage.googleapis.com/v1beta/models with
 * GOOGLE_API_KEY_LIVE on 2026-08-12: "models/gemini-2.5-flash-native-audio-latest"
 * (bare model id, no "models/" prefix, matching the convention used by CHAT_MODEL
 * in src/lib/rag/chat.ts and the SDK's own examples). */
export const LIVE_MODEL = "gemini-2.5-flash-native-audio-latest";

const TOKEN_TTL_MINUTES = 30;
// Per the SDK's field semantics, newSessionExpireTime is the deadline to
// *start* a session with this token — the Google-documented pattern keeps
// this short (a couple of minutes), not a wide window that would let a
// leaked token be used to start a session long after mint time.
const SESSION_TTL_MINUTES = 2;

export interface MintEphemeralTokenOptions {
	apiKey: string;
	systemInstructions: string;
	genAiFactory?: (
		apiKey: string,
	) => { authTokens: { create(args: unknown): Promise<{ name: string }> } };
}

export interface EphemeralToken {
	token: string;
	expiresAt: string; // ISO
}

function defaultFactory(apiKey: string) {
	return new GoogleGenAI({ apiKey });
}

/** Mints a short-lived Live API token the browser can use directly, so the
 * long-lived GOOGLE_API_KEY_LIVE never leaves the server. */
export async function mintEphemeralToken(
	options: MintEphemeralTokenOptions,
): Promise<EphemeralToken> {
	const { apiKey, systemInstructions, genAiFactory = defaultFactory } = options;
	const ai = genAiFactory(apiKey);

	const expireTime = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000).toISOString();
	const newSessionExpireTime = new Date(
		Date.now() + SESSION_TTL_MINUTES * 60_000,
	).toISOString();

	const result = await ai.authTokens.create({
		config: {
			uses: 1,
			expireTime,
			newSessionExpireTime,
			liveConnectConstraints: {
				model: LIVE_MODEL,
				config: {
					systemInstruction: { parts: [{ text: systemInstructions }] },
					// Setting liveConnectConstraints at all locks the whole
					// LiveConnectConfig for any session opened with this token — so
					// every field the client-side session needs (audio output,
					// both transcription streams) must be set here, not just left
					// for the browser's own connect() call to add later.
					responseModalities: [Modality.AUDIO],
					inputAudioTranscription: {},
					outputAudioTranscription: {},
				},
			},
		},
	});

	if (!result.name) {
		throw new Error("Live API did not return a token name");
	}

	return { token: result.name, expiresAt: expireTime };
}
