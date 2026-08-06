export type ChatSseEvent =
	| { event: "meta"; data: { conversationId: string } }
	| { event: "delta"; data: { text: string } }
	| { event: "done"; data: Record<string, never> }
	| { event: "error"; data: { message: string } };

export function formatSseEvent(event: ChatSseEvent): string {
	return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}
