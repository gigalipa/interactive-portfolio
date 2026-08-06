import type { ChatMessage } from "../history/types";

const STORAGE_KEY = "chat_session_messages";

export function loadSessionMessages(): ChatMessage[] {
	if (typeof window === "undefined") return [];
	const raw = window.sessionStorage.getItem(STORAGE_KEY);
	if (!raw) return [];
	try {
		return JSON.parse(raw) as ChatMessage[];
	} catch {
		return [];
	}
}

export function saveSessionMessages(messages: ChatMessage[]): void {
	if (typeof window === "undefined") return;
	window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
}

export function clearSessionMessages(): void {
	if (typeof window === "undefined") return;
	window.sessionStorage.removeItem(STORAGE_KEY);
}
