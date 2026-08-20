import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./sseClient", () => ({ streamChatResponse: vi.fn() }));
vi.mock("./historyApi", () => ({
	fetchHistoryList: vi.fn().mockResolvedValue([]),
	fetchConversation: vi.fn(),
	deleteConversation: vi.fn().mockResolvedValue(true),
	deleteAllHistory: vi.fn().mockResolvedValue(true),
}));

import { streamChatResponse } from "./sseClient";
import {
	deleteAllHistory,
	deleteConversation,
	fetchConversation,
	fetchHistoryList,
} from "./historyApi";
import { getConsent, setConsent } from "./consent";
import { loadSessionMessages } from "./sessionHistory";
import { useChatSession } from "./useChatSession";

async function* eventsOf(events: unknown[]) {
	for (const event of events) yield event as never;
}

const options = {
	language: "EN",
	errorGenericMessage: "generic error",
	errorRateLimitedMessage: "slow down",
};

beforeEach(() => {
	window.localStorage.clear();
	window.sessionStorage.clear();
	vi.mocked(streamChatResponse).mockReset();
	vi.mocked(fetchHistoryList).mockReset().mockResolvedValue([]);
});

afterEach(() => {
	document.body.innerHTML = "";
});

describe("useChatSession — consent", () => {
	it("starts with consent null and no history fetch when undecided", () => {
		const { result } = renderHook(() => useChatSession(options));
		expect(result.current.consent).toBeNull();
		expect(fetchHistoryList).not.toHaveBeenCalled();
	});

	it("acceptConsent persists the choice and fetches history", async () => {
		const { result } = renderHook(() => useChatSession(options));
		await act(async () => result.current.acceptConsent());
		expect(getConsent()).toBe("accepted");
		expect(result.current.consent).toBe("accepted");
		await waitFor(() => expect(fetchHistoryList).toHaveBeenCalled());
	});

	it("rejectConsent(true) deletes all history and clears the consent to rejected", async () => {
		setConsent("accepted");
		const { result } = renderHook(() => useChatSession(options));
		await act(async () => result.current.rejectConsent(true));
		expect(deleteAllHistory).toHaveBeenCalled();
		expect(getConsent()).toBe("rejected");
		expect(result.current.consent).toBe("rejected");
	});
});

describe("useChatSession — sending a message", () => {
	it("appends the user message immediately, then streams the assistant reply", async () => {
		vi.mocked(streamChatResponse).mockReturnValue(
			eventsOf([
				{ event: "delta", data: { text: "Hel" } },
				{ event: "delta", data: { text: "lo" } },
				{ event: "done", data: {} },
			]),
		);
		const { result } = renderHook(() => useChatSession(options));

		await act(async () => result.current.sendMessage("Hi"));

		expect(result.current.messages).toEqual([
			expect.objectContaining({ role: "user", text: "Hi" }),
			expect.objectContaining({ role: "model", text: "Hello" }),
		]);
		expect(result.current.status).toBe("idle");
	});

	it("saves the conversation to sessionStorage when not persisting", async () => {
		vi.mocked(streamChatResponse).mockReturnValue(
			eventsOf([
				{ event: "delta", data: { text: "Hi!" } },
				{ event: "done", data: {} },
			]),
		);
		const { result } = renderHook(() => useChatSession(options));

		await act(async () => result.current.sendMessage("Hey"));

		expect(loadSessionMessages()).toEqual([
			expect.objectContaining({ role: "user", text: "Hey" }),
			expect.objectContaining({ role: "model", text: "Hi!" }),
		]);
	});

	it("sends persist:true and the conversationId once consent is accepted", async () => {
		vi.mocked(streamChatResponse).mockReturnValue(
			eventsOf([
				{ event: "meta", data: { conversationId: "conv-1" } },
				{ event: "delta", data: { text: "Hi!" } },
				{ event: "done", data: {} },
			]),
		);
		const { result } = renderHook(() => useChatSession(options));
		await act(async () => result.current.acceptConsent());

		await act(async () => result.current.sendMessage("Hey"));

		const [payload] = vi.mocked(streamChatResponse).mock.calls[0];
		expect(payload).toEqual(
			expect.objectContaining({ persist: true, message: "Hey" }),
		);
	});

	it("shows the localized rate-limit message on a rate_limited error event", async () => {
		vi.mocked(streamChatResponse).mockReturnValue(
			eventsOf([{ event: "error", data: { message: "rate_limited" } }]),
		);
		const { result } = renderHook(() => useChatSession(options));

		await act(async () => result.current.sendMessage("Hi"));

		expect(result.current.status).toBe("error");
		expect(result.current.errorMessage).toBe("slow down");
	});

	it("shows the generic localized message on any other error event", async () => {
		vi.mocked(streamChatResponse).mockReturnValue(
			eventsOf([
				{ event: "error", data: { message: "The avatar couldn't reply..." } },
			]),
		);
		const { result } = renderHook(() => useChatSession(options));

		await act(async () => result.current.sendMessage("Hi"));

		expect(result.current.errorMessage).toBe("generic error");
	});

	it("surfaces an error instead of hanging when the stream itself throws", async () => {
		vi.mocked(streamChatResponse).mockReturnValue(
			(async function* () {
				yield await Promise.reject<never>(new Error("network down"));
			})(),
		);
		const { result } = renderHook(() => useChatSession(options));

		await act(async () => result.current.sendMessage("Hi"));

		expect(result.current.status).toBe("error");
		expect(result.current.errorMessage).toBe("generic error");
	});

	it("retryLast resends the last user message", async () => {
		vi.mocked(streamChatResponse).mockReturnValueOnce(
			eventsOf([{ event: "error", data: { message: "request_failed" } }]),
		);
		const { result } = renderHook(() => useChatSession(options));
		await act(async () => result.current.sendMessage("Hi"));

		vi.mocked(streamChatResponse).mockReturnValueOnce(
			eventsOf([
				{ event: "delta", data: { text: "Now it works" } },
				{ event: "done", data: {} },
			]),
		);
		await act(async () => result.current.retryLast());

		expect(result.current.status).toBe("idle");
		expect(result.current.messages.at(-1)).toEqual(
			expect.objectContaining({ text: "Now it works" }),
		);
	});

	it("retryLast drops the failed attempt's partial reply and doesn't duplicate the user message", async () => {
		vi.mocked(streamChatResponse).mockReturnValueOnce(
			eventsOf([
				{ event: "delta", data: { text: "Half an ans" } },
				{ event: "error", data: { message: "request_failed" } },
			]),
		);
		const { result } = renderHook(() => useChatSession(options));
		await act(async () => result.current.sendMessage("Hi"));

		// The half-written assistant bubble is gone; only the user message remains.
		expect(result.current.messages).toEqual([
			expect.objectContaining({ role: "user", text: "Hi" }),
		]);

		vi.mocked(streamChatResponse).mockReturnValueOnce(
			eventsOf([
				{ event: "delta", data: { text: "Full answer" } },
				{ event: "done", data: {} },
			]),
		);
		await act(async () => result.current.retryLast());

		expect(result.current.messages).toEqual([
			expect.objectContaining({ role: "user", text: "Hi" }),
			expect.objectContaining({ role: "model", text: "Full answer" }),
		]);
		// The resent message must not also appear in the history payload.
		const [retryPayload] = vi.mocked(streamChatResponse).mock.calls[1];
		expect(retryPayload).toEqual(
			expect.objectContaining({ message: "Hi", history: [] }),
		);
	});
});

describe("useChatSession — history", () => {
	it("selectConversation loads a stored conversation into messages", async () => {
		vi.mocked(fetchConversation).mockResolvedValue({
			messages: [{ role: "user", text: "Old", at: "2026-08-01T00:00:00.000Z" }],
			updatedAt: "2026-08-01T00:00:00.000Z",
			title: "Old",
		});
		const { result } = renderHook(() => useChatSession(options));

		await act(async () => result.current.selectConversation("conv-1"));

		expect(result.current.messages).toEqual([
			expect.objectContaining({ role: "user", text: "Old" }),
		]);
	});

	it("deleteConversationById removes it from the list and resets if it was the active one", async () => {
		vi.mocked(fetchConversation).mockResolvedValue({
			messages: [{ role: "user", text: "Old", at: "2026-08-01T00:00:00.000Z" }],
			updatedAt: "2026-08-01T00:00:00.000Z",
			title: "Old",
		});
		const { result } = renderHook(() => useChatSession(options));
		await act(async () => result.current.selectConversation("conv-1"));

		await act(async () => result.current.deleteConversationById("conv-1"));

		expect(deleteConversation).toHaveBeenCalledWith("conv-1");
		expect(result.current.messages).toEqual([]);
	});

	it("selectConversation mid-stream discards the abandoned stream's later events", async () => {
		let releaseStream!: () => void;
		const gate = new Promise<void>((resolve) => {
			releaseStream = resolve;
		});
		vi.mocked(streamChatResponse).mockReturnValue(
			(async function* () {
				yield {
					event: "meta",
					data: { conversationId: "stale-conv" },
				} as never;
				await gate;
				yield { event: "delta", data: { text: "garbage" } } as never;
				yield { event: "done", data: {} } as never;
			})(),
		);
		vi.mocked(fetchConversation).mockResolvedValue({
			messages: [
				{ role: "user", text: "Stored", at: "2026-08-01T00:00:00.000Z" },
			],
			updatedAt: "2026-08-01T00:00:00.000Z",
			title: "Stored",
		});
		const { result } = renderHook(() => useChatSession(options));

		act(() => result.current.sendMessage("Hi"));
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		await act(async () => result.current.selectConversation("conv-1"));
		await act(async () => {
			releaseStream();
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		expect(result.current.messages).toEqual([
			expect.objectContaining({ role: "user", text: "Stored" }),
		]);
	});

	it("refreshes the conversation list only after the stream has fully closed", async () => {
		let closeStream!: () => void;
		// Stands in for the backend awaiting its KV write after emitting `done`.
		const kvWrite = new Promise<void>((resolve) => {
			closeStream = resolve;
		});
		vi.mocked(streamChatResponse).mockReturnValue(
			(async function* () {
				yield { event: "delta", data: { text: "Hi!" } } as never;
				yield { event: "done", data: {} } as never;
				await kvWrite;
			})(),
		);
		const { result } = renderHook(() => useChatSession(options));
		await act(async () => result.current.acceptConsent());
		await waitFor(() => expect(fetchHistoryList).toHaveBeenCalled());
		const callsBefore = vi.mocked(fetchHistoryList).mock.calls.length;

		act(() => result.current.sendMessage("Hey"));
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		// `done` has been read, but the stream is still open: refreshing now would
		// race the backend's pending write.
		expect(vi.mocked(fetchHistoryList).mock.calls.length).toBe(callsBefore);

		await act(async () => {
			closeStream();
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		expect(vi.mocked(fetchHistoryList).mock.calls.length).toBe(callsBefore + 1);
	});

	it("startNewConversation clears messages and sessionStorage", async () => {
		vi.mocked(streamChatResponse).mockReturnValue(
			eventsOf([
				{ event: "delta", data: { text: "Hi!" } },
				{ event: "done", data: {} },
			]),
		);
		const { result } = renderHook(() => useChatSession(options));
		await act(async () => result.current.sendMessage("Hey"));

		act(() => result.current.startNewConversation());

		expect(result.current.messages).toEqual([]);
		expect(loadSessionMessages()).toEqual([]);
	});
});
