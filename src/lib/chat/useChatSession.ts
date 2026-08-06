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
	sendMessage: (text: string) => void;
	retryLast: () => void;
	conversations: ConversationSummary[];
	historyOpen: boolean;
	toggleHistory: () => void;
	closeHistory: () => void;
	selectConversation: (conversationId: string) => void;
	deleteConversationById: (conversationId: string) => void;
	startNewConversation: () => void;
}

function toDisplayMessages(messages: ChatMessage[]): DisplayMessage[] {
	return messages.map((message) => ({
		id: crypto.randomUUID(),
		role: message.role,
		text: message.text,
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

	const refreshHistory = useCallback(() => {
		fetchHistoryList().then(setConversations);
	}, []);

	useEffect(() => {
		if (consent === "accepted") refreshHistory();
	}, [consent, refreshHistory]);

	const acceptConsent = useCallback(() => {
		setConsent("accepted");
		setConsentState("accepted");
	}, []);

	const rejectConsent = useCallback((alsoDeleteHistory: boolean) => {
		if (alsoDeleteHistory) deleteAllHistory();
		setConsent("rejected");
		setConsentState("rejected");
		setConversations([]);
		setHistoryOpen(false);
	}, []);

	const runStream = useCallback(
		async (text: string, persist: boolean, historyForRequest: DisplayMessage[]) => {
			setStatus("sending");
			setErrorMessage(null);
			setPresenceState("listening");

			let assistantMessageId: string | null = null;
			let sawFirstDelta = false;

			for await (const event of streamChatResponse({
				persist,
				message: text,
				conversationId: persist ? conversationId : undefined,
				history: persist ? undefined : toWireMessages(historyForRequest),
				language,
			})) {
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
					setStatus("idle");
					setPresenceState("idle");
					if (persist) {
						refreshHistory();
					} else {
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
					setStatus("error");
					setPresenceState("idle");
					setErrorMessage(
						event.data.message === "rate_limited" ? errorRateLimitedMessage : errorGenericMessage,
					);
				}
			}
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
		runStream(text, consent === "accepted", messages.slice(0, -1));
	}, [consent, messages, runStream]);

	const toggleHistory = useCallback(() => {
		setHistoryOpen((open) => {
			if (!open) refreshHistory();
			return !open;
		});
	}, [refreshHistory]);

	const closeHistory = useCallback(() => setHistoryOpen(false), []);

	const selectConversation = useCallback(async (id: string) => {
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
		setMessages([]);
		setConversationId(undefined);
		setStatus("idle");
		setErrorMessage(null);
		clearSessionMessages();
		setHistoryOpen(false);
	}, []);

	return {
		consent,
		acceptConsent,
		rejectConsent,
		messages,
		status,
		errorMessage,
		sendMessage,
		retryLast,
		conversations,
		historyOpen,
		toggleHistory,
		closeHistory,
		selectConversation,
		deleteConversationById,
		startNewConversation,
	};
}
