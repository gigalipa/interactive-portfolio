import { useCallback, useEffect, useRef, useState } from "react";
import { streamChatResponse } from "./sseClient";
import { getConsent, setConsent, type ConsentChoice } from "./consent";
import { clearSessionMessages, loadSessionMessages, saveSessionMessages } from "./sessionHistory";
import {
	deleteAllHistory,
	deleteConversation,
	fetchConversation,
	fetchHistoryList,
} from "./historyApi";
import { setPresenceState } from "./presenceRingBridge";
import type { ChatMessage, ConversationSummary } from "../history/types";

export interface DisplayMessage {
	id: string;
	role: "user" | "model";
	text: string;
	mode?: "voice";
}

export type ChatStatus = "idle" | "sending" | "streaming" | "error";

export interface UseChatSessionOptions {
	language: string;
	errorGenericMessage: string;
	errorRateLimitedMessage: string;
}

export interface UseChatSessionResult {
	consent: ConsentChoice | null;
	acceptConsent: () => void;
	rejectConsent: (alsoDeleteHistory: boolean) => void;
	messages: DisplayMessage[];
	status: ChatStatus;
	errorMessage: string | null;
	/** The currently active conversation, whether it was started by a text or
	 * a voice turn — so a caller (ChatWidget) can hand it to a voice session
	 * that starts mid-conversation and needs to continue it, not fork a new one. */
	conversationId: string | undefined;
	sendMessage: (text: string) => void;
	retryLast: () => void;
	conversations: ConversationSummary[];
	historyOpen: boolean;
	toggleHistory: () => void;
	closeHistory: () => void;
	selectConversation: (conversationId: string) => void;
	deleteConversationById: (conversationId: string) => void;
	startNewConversation: () => void;
	appendVoiceTurn: (turn: { conversationId?: string; userText: string; modelText: string }) => void;
}

function toDisplayMessages(messages: ChatMessage[]): DisplayMessage[] {
	return messages.map((message) => ({
		id: crypto.randomUUID(),
		role: message.role,
		text: message.text,
		mode: message.mode,
	}));
}

function toWireMessages(messages: DisplayMessage[]): Array<Pick<ChatMessage, "role" | "text">> {
	return messages.map(({ role, text }) => ({ role, text }));
}

export function useChatSession(options: UseChatSessionOptions): UseChatSessionResult {
	const { language, errorGenericMessage, errorRateLimitedMessage } = options;

	const [consent, setConsentState] = useState<ConsentChoice | null>(() => getConsent());
	const [messages, setMessages] = useState<DisplayMessage[]>(() =>
		consent === "accepted" ? [] : toDisplayMessages(loadSessionMessages()),
	);
	const [status, setStatus] = useState<ChatStatus>("idle");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [conversationId, setConversationId] = useState<string | undefined>(undefined);
	const [conversations, setConversations] = useState<ConversationSummary[]>([]);
	const [historyOpen, setHistoryOpen] = useState(false);
	const lastUserTextRef = useRef<string | null>(null);
	// Monotonic id for the in-flight stream. Sidebar actions (select/new/delete)
	// bump it so a stream that is still iterating stops writing to state.
	const runIdRef = useRef(0);

	const refreshHistory = useCallback(() => {
		// Best-effort background refresh; a failure here doesn't block the chat itself.
		fetchHistoryList().then(setConversations).catch(() => {});
	}, []);

	useEffect(() => {
		if (consent === "accepted") refreshHistory();
	}, [consent, refreshHistory]);

	const acceptConsent = useCallback(() => {
		setConsent("accepted");
		setConsentState("accepted");
	}, []);

	const rejectConsent = useCallback((alsoDeleteHistory: boolean) => {
		// Best-effort background cleanup; a failure here doesn't block the chat itself.
		if (alsoDeleteHistory) deleteAllHistory().catch(() => {});
		setConsent("rejected");
		setConsentState("rejected");
		setConversations([]);
		setHistoryOpen(false);
	}, []);

	const runStream = useCallback(
		async (text: string, persist: boolean, historyForRequest: DisplayMessage[]) => {
			const runId = ++runIdRef.current;
			const isCurrent = () => runId === runIdRef.current;

			setStatus("sending");
			setErrorMessage(null);
			setPresenceState("listening");

			let assistantMessageId: string | null = null;
			let sawFirstDelta = false;
			let sawDone = false;

			/** Drops the partial assistant bubble of a failed attempt so `retryLast`
			 * doesn't leave a stray half-written reply in the transcript. */
			const dropPartialAssistantMessage = () => {
				const id = assistantMessageId;
				if (!id) return;
				assistantMessageId = null;
				sawFirstDelta = false;
				setMessages((prev) => prev.filter((message) => message.id !== id));
			};

			const failWith = (message: string) => {
				dropPartialAssistantMessage();
				setStatus("error");
				setPresenceState("idle");
				setErrorMessage(message);
			};

			try {
				for await (const event of streamChatResponse({
					persist,
					message: text,
					conversationId: persist ? conversationId : undefined,
					history: persist ? undefined : toWireMessages(historyForRequest),
					language,
				})) {
					// A sidebar action superseded this stream: stop touching state.
					if (!isCurrent()) return;

					if (event.event === "meta") {
						setConversationId(event.data.conversationId);
					} else if (event.event === "delta") {
						if (!sawFirstDelta) {
							sawFirstDelta = true;
							setStatus("streaming");
							setPresenceState("speaking");
							assistantMessageId = crypto.randomUUID();
							const id = assistantMessageId;
							setMessages((prev) => [...prev, { id, role: "model", text: event.data.text }]);
						} else {
							const id = assistantMessageId;
							setMessages((prev) =>
								prev.map((message) =>
									message.id === id ? { ...message, text: message.text + event.data.text } : message,
								),
							);
						}
					} else if (event.event === "done") {
						sawDone = true;
						setStatus("idle");
						setPresenceState("idle");
						if (!persist) {
							setMessages((current) => {
								saveSessionMessages(
									current.map((message) => ({
										role: message.role,
										text: message.text,
										at: new Date().toISOString(),
									})),
								);
								return current;
							});
						}
					} else if (event.event === "error") {
						failWith(
							event.data.message === "rate_limited" ? errorRateLimitedMessage : errorGenericMessage,
						);
					}
				}
			} catch {
				// Any escape hatch the stream didn't convert into an error event —
				// without this the status would stay stuck at "sending"/"streaming".
				if (!isCurrent()) return;
				failWith(errorGenericMessage);
				return;
			}

			if (!isCurrent()) return;
			// The backend sends `done` and only then awaits its KV write before
			// closing the stream, so the list is only guaranteed fresh once the
			// whole stream has drained — not at the moment `done` was read.
			if (persist && sawDone) refreshHistory();
		},
		[conversationId, language, errorGenericMessage, errorRateLimitedMessage, refreshHistory],
	);

	const sendMessage = useCallback(
		(text: string) => {
			const trimmed = text.trim();
			if (!trimmed) return;
			lastUserTextRef.current = trimmed;
			const userMessage: DisplayMessage = { id: crypto.randomUUID(), role: "user", text: trimmed };
			const historySnapshot = messages;
			setMessages((prev) => [...prev, userMessage]);
			runStream(trimmed, consent === "accepted", historySnapshot);
		},
		[messages, consent, runStream],
	);

	const retryLast = useCallback(() => {
		const text = lastUserTextRef.current;
		if (!text) return;
		// The failed attempt's partial assistant bubble was already dropped, but
		// locate the user message explicitly rather than assuming it's last:
		// resending it as both `history` and `message` would duplicate it.
		const lastUserIndex = messages.map((message) => message.role).lastIndexOf("user");
		const historyForRequest =
			lastUserIndex === -1 ? messages : messages.filter((_, index) => index !== lastUserIndex);
		runStream(text, consent === "accepted", historyForRequest);
	}, [consent, messages, runStream]);

	const toggleHistory = useCallback(() => {
		setHistoryOpen((open) => {
			if (!open) refreshHistory();
			return !open;
		});
	}, [refreshHistory]);

	const closeHistory = useCallback(() => setHistoryOpen(false), []);

	const selectConversation = useCallback(async (id: string) => {
		// Supersede any in-flight stream so its late events can't bleed into the
		// conversation we're about to open.
		runIdRef.current++;
		const conversation = await fetchConversation(id);
		if (!conversation) return;
		setMessages(toDisplayMessages(conversation.messages));
		setConversationId(id);
		setStatus("idle");
		setErrorMessage(null);
		setHistoryOpen(false);
	}, []);

	const deleteConversationById = useCallback(
		async (id: string) => {
			runIdRef.current++;
			await deleteConversation(id);
			setConversations((prev) => prev.filter((conversation) => conversation.conversationId !== id));
			if (id === conversationId) {
				setMessages([]);
				setConversationId(undefined);
			}
		},
		[conversationId],
	);

	const startNewConversation = useCallback(() => {
		runIdRef.current++;
		setMessages([]);
		setConversationId(undefined);
		setStatus("idle");
		setErrorMessage(null);
		clearSessionMessages();
		setHistoryOpen(false);
	}, []);

	const appendVoiceTurn = useCallback(
		(turn: { conversationId?: string; userText: string; modelText: string }) => {
			if (turn.conversationId) setConversationId(turn.conversationId);
			setMessages((prev) => [
				...prev,
				{ id: crypto.randomUUID(), role: "user", text: turn.userText, mode: "voice" },
				{ id: crypto.randomUUID(), role: "model", text: turn.modelText, mode: "voice" },
			]);
			if (consent === "accepted") refreshHistory();
		},
		[consent, refreshHistory],
	);

	return {
		consent,
		acceptConsent,
		rejectConsent,
		messages,
		status,
		errorMessage,
		conversationId,
		sendMessage,
		retryLast,
		conversations,
		historyOpen,
		toggleHistory,
		closeHistory,
		selectConversation,
		deleteConversationById,
		startNewConversation,
		appendVoiceTurn,
	};
}
