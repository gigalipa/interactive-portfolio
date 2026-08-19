import { useCallback, useEffect, useRef, useState } from "react";
import { startLiveSession, type LiveSession } from "./liveSession";
import { mintVoiceToken, persistVoiceTurn } from "./voiceApi";
import { computeRmsLevel } from "./audioUtils";
import { setPresenceState, setVoiceMode, setVoicePulseRate } from "../chat/presenceRingBridge";

export type VoiceStatus = "idle" | "connecting" | "listening" | "speaking" | "error";

export interface UseVoiceSessionOptions {
	language: string;
	persist: boolean;
	conversationId: string | undefined;
	onTurnPersisted: (turn: { conversationId?: string; userText: string; modelText: string }) => void;
	onError: (messageKey: "voice_connection_failed" | "voice_mic_denied") => void;
}

export interface UseVoiceSessionResult {
	status: VoiceStatus;
	micAnalyser: AnalyserNode | null;
	start: () => void;
	end: () => void;
}

// Anything below this output level is treated as silence for pulse-rate
// purposes, so the ring doesn't visibly jitter during near-silent gaps.
const OUTPUT_PULSE_THRESHOLD = 0.02;

function isPermissionError(error: unknown): boolean {
	return error instanceof DOMException && error.name === "NotAllowedError";
}

export function useVoiceSession(options: UseVoiceSessionOptions): UseVoiceSessionResult {
	const { language, onTurnPersisted, onError } = options;
	const [status, setStatus] = useState<VoiceStatus>("idle");
	const [micAnalyser, setMicAnalyser] = useState<AnalyserNode | null>(null);
	const sessionRef = useRef<LiveSession | null>(null);
	const rafRef = useRef<number | null>(null);
	const persistRef = useRef(options.persist);
	// The session-scoped id: seeded once per session (in start(), from
	// latestConversationIdPropRef below) and then owned internally, updated
	// only by a completed turn's response. NOT re-synced from the prop on
	// every render — doing so would clobber a turn-persisted id with the
	// caller's still-stale prop the moment onTurnPersisted's state update
	// triggers a re-render, starting a new conversation on every single turn
	// instead of one per session.
	const conversationIdRef = useRef(options.conversationId);
	// Always mirrors the latest options.conversationId (e.g. a conversation
	// already active from prior text turns). start() reads this once, at the
	// moment a session begins, to seed conversationIdRef correctly — so
	// starting voice mid-conversation continues it instead of forking a new
	// one, without reintroducing the per-render clobber the comment above
	// guards against.
	const latestConversationIdPropRef = useRef(options.conversationId);
	// Distinguishes a close the visitor asked for (end()) from an unexpected
	// server/network close, and caps reconnection to a single attempt.
	const endingRef = useRef(false);
	const reconnectedRef = useRef(false);
	persistRef.current = options.persist;
	latestConversationIdPropRef.current = options.conversationId;

	const stopMetering = useCallback(() => {
		if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
		rafRef.current = null;
	}, []);

	const startOutputMetering = useCallback((session: LiveSession) => {
		const outputData = new Uint8Array(session.outputAnalyser.frequencyBinCount);
		const tick = () => {
			session.outputAnalyser.getByteFrequencyData(outputData);
			const level = computeRmsLevel(outputData);
			if (level > OUTPUT_PULSE_THRESHOLD) setVoicePulseRate(level);
			rafRef.current = requestAnimationFrame(tick);
		};
		rafRef.current = requestAnimationFrame(tick);
	}, []);

	const endLocally = useCallback(() => {
		stopMetering();
		sessionRef.current?.close();
		sessionRef.current = null;
		setVoiceMode(false);
		setPresenceState("idle");
		setMicAnalyser(null);
		setStatus("idle");
	}, [stopMetering]);

	const handleTurnComplete = useCallback(
		async (turn: { userText: string; modelText: string }) => {
			const result = await persistVoiceTurn({
				persist: persistRef.current,
				conversationId: persistRef.current ? conversationIdRef.current : undefined,
				userText: turn.userText,
				modelText: turn.modelText,
			});
			if (result.conversationId) conversationIdRef.current = result.conversationId;
			onTurnPersisted({ ...result, userText: turn.userText, modelText: turn.modelText });
		},
		[onTurnPersisted],
	);

	// Extracted so both start() and the reconnect path in onClose can invoke
	// it without duplicating the token-mint + startLiveSession logic.
	const connect = useCallback(() => {
		setStatus("connecting");
		(async () => {
			let token: string;
			let model: string;
			try {
				const minted = await mintVoiceToken(language);
				token = minted.token;
				model = minted.model;
			} catch {
				setStatus("error");
				onError("voice_connection_failed");
				return;
			}

			try {
				const session = await startLiveSession({
					token,
					model,
					callbacks: {
						onOpen: () => {
							setStatus("listening");
							setPresenceState("listening");
						},
						onClose: () => {
							if (endingRef.current) {
								endLocally();
								return;
							}
							if (!reconnectedRef.current) {
								// One silent reconnect with a freshly minted token before
								// giving up and falling back to text — per the approved
								// spec's "WebSocket drops mid-session" handling. This is a
								// one-shot budget per start(): it does NOT reset on a
								// successful reconnect, so a session that drops twice in a
								// row always falls back on the second drop rather than
								// reconnecting indefinitely.
								reconnectedRef.current = true;
								stopMetering();
								sessionRef.current = null;
								setMicAnalyser(null);
								connect();
							} else {
								endLocally();
								setStatus("error");
								onError("voice_connection_failed");
							}
						},
						onError: () => {
							endLocally();
							setStatus("error");
							onError("voice_connection_failed");
						},
						onSpeakingChange: (speaking) => {
							setStatus(speaking ? "speaking" : "listening");
							setPresenceState(speaking ? "speaking" : "listening");
						},
						onTurnComplete: handleTurnComplete,
					},
				});
				sessionRef.current = session;
				setMicAnalyser(session.micAnalyser);
				setVoiceMode(true);
				startOutputMetering(session);
			} catch (error) {
				setStatus("error");
				onError(isPermissionError(error) ? "voice_mic_denied" : "voice_connection_failed");
			}
		})();
	}, [language, handleTurnComplete, onError, startOutputMetering, endLocally, stopMetering]);

	const start = useCallback(() => {
		endingRef.current = false;
		reconnectedRef.current = false;
		// Seed from whatever conversation is currently active (e.g. one
		// already started by prior text turns) so voice continues it rather
		// than forking a new one — read fresh here, at session start, not
		// wired as a continuous render-time sync (see conversationIdRef's
		// own comment for why that would break mid-session turn continuity).
		conversationIdRef.current = latestConversationIdPropRef.current;
		connect();
	}, [connect]);

	const end = useCallback(() => {
		endingRef.current = true;
		endLocally();
	}, [endLocally]);

	useEffect(
		() => () => {
			endingRef.current = true;
			endLocally();
		},
		[endLocally],
	);

	return { status, micAnalyser, start, end };
}
