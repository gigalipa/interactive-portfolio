import type { ConversationSummary, StoredConversation } from "../history/types";

export async function fetchHistoryList(): Promise<ConversationSummary[]> {
	const response = await fetch("/api/history/list");
	if (!response.ok) return [];
	return (await response.json()) as ConversationSummary[];
}

export async function fetchConversation(
	conversationId: string,
): Promise<StoredConversation | null> {
	const response = await fetch(`/api/history/${conversationId}`);
	if (!response.ok) return null;
	return (await response.json()) as StoredConversation;
}

export async function deleteConversation(conversationId: string): Promise<boolean> {
	const response = await fetch(`/api/history/${conversationId}`, { method: "DELETE" });
	return response.ok;
}

export async function deleteAllHistory(): Promise<boolean> {
	const response = await fetch("/api/history", { method: "DELETE" });
	return response.ok;
}
