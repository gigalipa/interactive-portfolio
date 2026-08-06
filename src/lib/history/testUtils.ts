import type { ConversationKV } from "./kv";

/**
 * In-memory ConversationKV double for tests. The backing `store` Map is exposed
 * so tests can seed state directly and assert on what was written.
 */
export function createMockKV(): ConversationKV & {
	store: Map<string, string>;
} {
	const store = new Map<string, string>();
	return {
		store,
		async get(key) {
			return store.get(key) ?? null;
		},
		async put(key, value) {
			store.set(key, value);
		},
		async delete(key) {
			store.delete(key);
		},
		async list({ prefix }) {
			const keys = [...store.keys()]
				.filter((key) => key.startsWith(prefix))
				.map((name) => ({ name }));
			return { keys };
		},
	};
}
