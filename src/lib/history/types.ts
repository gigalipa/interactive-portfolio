export interface ChatMessage {
	role: "user" | "model";
	text: string;
	at: string; // ISO timestamp
	/** Set only for voice-session turns; omitted entirely for text turns (no migration needed for already-stored conversations). */
	mode?: "voice";
}

export interface StoredConversation {
	messages: ChatMessage[];
	updatedAt: string; // ISO timestamp
	title: string;
}

export interface ConversationSummary {
	conversationId: string;
	title: string;
	updatedAt: string;
}
