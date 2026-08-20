import { describe, expect, it } from "vitest";
import { formatSseEvent } from "./sse";

describe("formatSseEvent", () => {
	it("formats a meta event", () => {
		expect(
			formatSseEvent({ event: "meta", data: { conversationId: "conv-1" } }),
		).toBe('event: meta\ndata: {"conversationId":"conv-1"}\n\n');
	});

	it("formats a delta event", () => {
		expect(formatSseEvent({ event: "delta", data: { text: "Hi" } })).toBe(
			'event: delta\ndata: {"text":"Hi"}\n\n',
		);
	});

	it("formats a done event with an empty data object", () => {
		expect(formatSseEvent({ event: "done", data: {} })).toBe(
			"event: done\ndata: {}\n\n",
		);
	});

	it("formats an error event", () => {
		expect(formatSseEvent({ event: "error", data: { message: "boom" } })).toBe(
			'event: error\ndata: {"message":"boom"}\n\n',
		);
	});
});
