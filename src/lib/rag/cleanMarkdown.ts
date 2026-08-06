/**
 * Notion's markdown export embeds images/files as `![alt](url)`, where `url` is
 * a presigned S3 link hundreds of characters long. That link carries no semantic
 * meaning for embeddings, so left in place it wastes chunk budget and can dilute
 * a chunk's embedding into something that matches unrelated queries.
 */
export function stripFileEmbeds(markdown: string): string {
	return markdown
		.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
		.replace(/https:\/\/prod-files-secure\.s3\.[^\s)]+/g, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
