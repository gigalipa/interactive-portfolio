export const CHROMA_COLLECTION_NAME = "knowledge_base";
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_BATCH_SIZE = 100;

export function chromaCollectionOptions(host?: string) {
	return host ? { host } : {};
}
