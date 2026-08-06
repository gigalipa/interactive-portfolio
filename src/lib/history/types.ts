export interface ChatMessage {
	role: "user" | "model";
	text: string;
	at: string; // ISO timestamp
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
