export interface VoiceTokenResponse {
	token: string;
	expiresAt: string;
	model: string;
}

/** Mints a Live API ephemeral token. Throws on failure — a failed mint must
 * abort the connect attempt in useVoiceSession, not silently proceed. */
export async function mintVoiceToken(language: string): Promise<VoiceTokenResponse> {
	const response = await fetch("/api/voice/token", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ language }),
	});
	if (!response.ok) {
		throw new Error(`Voice token request failed (${response.status})`);
	}
	return (await response.json()) as VoiceTokenResponse;
}

export interface PersistVoiceTurnOptions {
	persist: boolean;
	conversationId?: string;
	userText: string;
	modelText: string;
}

export interface PersistVoiceTurnResult {
	conversationId?: string;
}

/** Persists a completed voice turn. Degrades to {} on any failure — a failed
 * write shouldn't disrupt a session the visitor is still actively using. */
export async function persistVoiceTurn(
	options: PersistVoiceTurnOptions,
): Promise<PersistVoiceTurnResult> {
	try {
		const response = await fetch("/api/voice/turn", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(options),
		});
		if (!response.ok) return {};
		return (await response.json()) as PersistVoiceTurnResult;
	} catch {
		return {};
	}
}
