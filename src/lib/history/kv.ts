import type { ConversationSummary, StoredConversation } from "./types";

const CONVERSATION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days, rolling from last write

export interface ConversationKV {
	get(key: string): Promise<string | null>;
	put(
		key: string,
		value: string,
		options?: { expirationTtl?: number },
	): Promise<void>;
	delete(key: string): Promise<void>;
	list(options: { prefix: string }): Promise<{ keys: { name: string }[] }>;
}

function conversationKey(visitorId: string, conversationId: string): string {
	return `conv:${visitorId}:${conversationId}`;
}

function conversationPrefix(visitorId: string): string {
	return `conv:${visitorId}:`;
}

export async function getConversation(
	kv: ConversationKV,
	visitorId: string,
	conversationId: string,
): Promise<StoredConversation | null> {
	const raw = await kv.get(conversationKey(visitorId, conversationId));
	if (!raw) return null;
	return JSON.parse(raw) as StoredConversation;
}

export async function putConversation(
	kv: ConversationKV,
	visitorId: string,
	conversationId: string,
	conversation: StoredConversation,
): Promise<void> {
	await kv.put(
		conversationKey(visitorId, conversationId),
		JSON.stringify(conversation),
		{ expirationTtl: CONVERSATION_TTL_SECONDS },
	);
}

export async function listConversations(
	kv: ConversationKV,
	visitorId: string,
): Promise<ConversationSummary[]> {
	const prefix = conversationPrefix(visitorId);
	const { keys } = await kv.list({ prefix });

	const summaries = await Promise.all(
		keys.map(async (key): Promise<ConversationSummary | null> => {
			const raw = await kv.get(key.name);
			if (!raw) return null;
			const conversation = JSON.parse(raw) as StoredConversation;
			return {
				conversationId: key.name.slice(prefix.length),
				title: conversation.title,
				updatedAt: conversation.updatedAt,
			};
		}),
	);

	return summaries
		.filter((summary): summary is ConversationSummary => summary !== null)
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteConversation(
	kv: ConversationKV,
	visitorId: string,
	conversationId: string,
): Promise<void> {
	await kv.delete(conversationKey(visitorId, conversationId));
}

export async function deleteAllConversations(
	kv: ConversationKV,
	visitorId: string,
): Promise<void> {
	const { keys } = await kv.list({ prefix: conversationPrefix(visitorId) });
	await Promise.all(keys.map((key) => kv.delete(key.name)));
}

export function buildTitle(firstUserMessage: string): string {
	const trimmed = firstUserMessage.trim();
	return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
}

// Re-exported for convenience so callers don't need a separate import.
export type {
	ChatMessage,
	StoredConversation,
	ConversationSummary,
} from "./types";
