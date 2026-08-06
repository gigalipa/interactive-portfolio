import type { ConversationSummary, StoredConversation } from "../history/types";

// Every call degrades to the same value it returns for a non-ok response, so a
// network-level `fetch` rejection never escapes into the calling component.

export async function fetchHistoryList(): Promise<ConversationSummary[]> {
	try {
		const response = await fetch("/api/history/list");
		if (!response.ok) return [];
		return (await response.json()) as ConversationSummary[];
	} catch {
		return [];
	}
}

export async function fetchConversation(
	conversationId: string,
): Promise<StoredConversation | null> {
	try {
		const response = await fetch(`/api/history/${conversationId}`);
		if (!response.ok) return null;
		return (await response.json()) as StoredConversation;
	} catch {
		return null;
	}
}

export async function deleteConversation(conversationId: string): Promise<boolean> {
	try {
		const response = await fetch(`/api/history/${conversationId}`, { method: "DELETE" });
		return response.ok;
	} catch {
		return false;
	}
}

export async function deleteAllHistory(): Promise<boolean> {
	try {
		const response = await fetch("/api/history", { method: "DELETE" });
		return response.ok;
	} catch {
		return false;
	}
}
