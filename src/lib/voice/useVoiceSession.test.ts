import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./liveSession", () => ({
	startLiveSession: vi.fn(),
}));
vi.mock("./voiceApi", () => ({
	mintVoiceToken: vi.fn(),
	persistVoiceTurn: vi.fn(),
}));
vi.mock("../chat/presenceRingBridge", () => ({
	setPresenceState: vi.fn(),
	setVoiceMode: vi.fn(),
	setVoicePulseRate: vi.fn(),
}));

import { startLiveSession } from "./liveSession";
import { mintVoiceToken, persistVoiceTurn } from "./voiceApi";
import { setPresenceState, setVoiceMode } from "../chat/presenceRingBridge";
import { useVoiceSession } from "./useVoiceSession";

function fakeAnalyser() {
	return { frequencyBinCount: 8, getByteFrequencyData: vi.fn() } as unknown as AnalyserNode;
}

function baseOptions() {
	return {
		language: "EN",
		persist: false,
		conversationId: undefined,
		onTurnPersisted: vi.fn(),
		onError: vi.fn(),
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(mintVoiceToken).mockResolvedValue({ token: "t", expiresAt: "x", model: "m" });
	vi.mocked(persistVoiceTurn).mockResolvedValue({ conversationId: "c1" });
});

describe("useVoiceSession", () => {
	it("goes idle -> connecting -> listening on a successful start, and sets voice mode on", async () => {
		let capturedCallbacks: Parameters<typeof startLiveSession>[0]["callbacks"] | undefined;
		vi.mocked(startLiveSession).mockImplementation((opts) => {
			capturedCallbacks = opts.callbacks;
			return Promise.resolve({
				micAnalyser: fakeAnalyser(),
				outputAnalyser: fakeAnalyser(),
				close: vi.fn(),
			});
		});

		const { result } = renderHook(() => useVoiceSession(baseOptions()));
		expect(result.current.status).toBe("idle");

		act(() => result.current.start());
		await waitFor(() => expect(result.current.status).toBe("connecting"));

		act(() => capturedCallbacks?.onOpen?.());
		await waitFor(() => expect(result.current.status).toBe("listening"));

		expect(setVoiceMode).toHaveBeenCalledWith(true);
		expect(setPresenceState).toHaveBeenCalledWith("listening");
		expect(result.current.micAnalyser).not.toBeNull();
	});

	it("moves to speaking/listening as onSpeakingChange fires", async () => {
		let capturedCallbacks: Parameters<typeof startLiveSession>[0]["callbacks"] | undefined;
		vi.mocked(startLiveSession).mockImplementation((opts) => {
			capturedCallbacks = opts.callbacks;
			return Promise.resolve({
				micAnalyser: fakeAnalyser(),
				outputAnalyser: fakeAnalyser(),
				close: vi.fn(),
			});
		});

		const { result } = renderHook(() => useVoiceSession(baseOptions()));
		act(() => result.current.start());
		await waitFor(() => capturedCallbacks !== undefined);
		act(() => capturedCallbacks?.onOpen?.());

		act(() => capturedCallbacks?.onSpeakingChange(true));
		await waitFor(() => expect(result.current.status).toBe("speaking"));
		expect(setPresenceState).toHaveBeenCalledWith("speaking");

		act(() => capturedCallbacks?.onSpeakingChange(false));
		await waitFor(() => expect(result.current.status).toBe("listening"));
	});

	it("calls persistVoiceTurn and onTurnPersisted when a turn completes", async () => {
		let capturedCallbacks: Parameters<typeof startLiveSession>[0]["callbacks"] | undefined;
		vi.mocked(startLiveSession).mockImplementation((opts) => {
			capturedCallbacks = opts.callbacks;
			return Promise.resolve({
				micAnalyser: fakeAnalyser(),
				outputAnalyser: fakeAnalyser(),
				close: vi.fn(),
			});
		});
		const options = { ...baseOptions(), persist: true, conversationId: "existing" };

		const { result } = renderHook(() => useVoiceSession(options));
		act(() => result.current.start());
		await waitFor(() => expect(capturedCallbacks).not.toBeUndefined());

		await act(async () => {
			await capturedCallbacks?.onTurnComplete({ userText: "Hi", modelText: "Hello" });
		});

		expect(persistVoiceTurn).toHaveBeenCalledWith({
			persist: true,
			conversationId: "existing",
			userText: "Hi",
			modelText: "Hello",
		});
		expect(options.onTurnPersisted).toHaveBeenCalledWith({
			conversationId: "c1",
			userText: "Hi",
			modelText: "Hello",
		});
	});

	it("goes to error and calls onError when the token mint fails", async () => {
		vi.mocked(mintVoiceToken).mockRejectedValue(new Error("mint failed"));
		const options = baseOptions();

		const { result } = renderHook(() => useVoiceSession(options));
		act(() => result.current.start());

		await waitFor(() => expect(result.current.status).toBe("error"));
		expect(options.onError).toHaveBeenCalledWith("voice_connection_failed");
		expect(startLiveSession).not.toHaveBeenCalled();
	});

	it("goes to error and calls onError with voice_mic_denied when startLiveSession rejects with a permission error", async () => {
		const permissionError = new DOMException("Permission denied", "NotAllowedError");
		vi.mocked(startLiveSession).mockRejectedValue(permissionError);
		const options = baseOptions();

		const { result } = renderHook(() => useVoiceSession(options));
		act(() => result.current.start());

		await waitFor(() => expect(result.current.status).toBe("error"));
		expect(options.onError).toHaveBeenCalledWith("voice_mic_denied");
	});

	it("reconnects once with a freshly minted token on an unexpected close, then falls back to error on a second failure", async () => {
		const closeA = vi.fn();
		const closeB = vi.fn();
		let callSequence: Parameters<typeof startLiveSession>[0]["callbacks"][] = [];
		vi.mocked(startLiveSession)
			.mockImplementationOnce((opts) => {
				callSequence.push(opts.callbacks);
				return Promise.resolve({ micAnalyser: fakeAnalyser(), outputAnalyser: fakeAnalyser(), close: closeA });
			})
			.mockImplementationOnce((opts) => {
				callSequence.push(opts.callbacks);
				return Promise.resolve({ micAnalyser: fakeAnalyser(), outputAnalyser: fakeAnalyser(), close: closeB });
			});
		const options = baseOptions();

		const { result } = renderHook(() => useVoiceSession(options));
		act(() => result.current.start());
		await waitFor(() => expect(callSequence).toHaveLength(1));
		act(() => callSequence[0].onOpen?.());
		await waitFor(() => expect(result.current.status).toBe("listening"));

		// Unexpected close (not triggered by end()) — should mint a fresh token
		// and reconnect once rather than immediately falling back to text.
		act(() => callSequence[0].onClose?.());
		await waitFor(() => expect(mintVoiceToken).toHaveBeenCalledTimes(2));
		await waitFor(() => expect(callSequence).toHaveLength(2));
		expect(closeA).toHaveBeenCalledTimes(0); // first session's own close() was never called — the server closed it
		expect(options.onError).not.toHaveBeenCalled();

		act(() => callSequence[1].onOpen?.());
		await waitFor(() => expect(result.current.status).toBe("listening"));

		// A second unexpected close after the one reconnect attempt: fall back for real.
		act(() => callSequence[1].onClose?.());
		await waitFor(() => expect(result.current.status).toBe("error"));
		expect(options.onError).toHaveBeenCalledWith("voice_connection_failed");
	});

	it("does not attempt to reconnect when the close was caused by end()", async () => {
		const close = vi.fn();
		let capturedCallbacks: Parameters<typeof startLiveSession>[0]["callbacks"] | undefined;
		vi.mocked(startLiveSession).mockImplementation((opts) => {
			capturedCallbacks = opts.callbacks;
			return Promise.resolve({ micAnalyser: fakeAnalyser(), outputAnalyser: fakeAnalyser(), close });
		});

		const { result } = renderHook(() => useVoiceSession(baseOptions()));
		act(() => result.current.start());
		await waitFor(() => capturedCallbacks !== undefined);
		act(() => capturedCallbacks?.onOpen?.());
		await waitFor(() => expect(result.current.status).toBe("listening"));

		act(() => result.current.end());
		// The real liveSession.close() call is what triggers the underlying
		// WebSocket's close event in production; simulate that here.
		act(() => capturedCallbacks?.onClose?.());

		expect(mintVoiceToken).toHaveBeenCalledTimes(1); // no second mint attempt
		expect(result.current.status).toBe("idle");
	});

	it("end() closes the session, clears voice mode, and returns to idle", async () => {
		const close = vi.fn();
		let capturedCallbacks: Parameters<typeof startLiveSession>[0]["callbacks"] | undefined;
		vi.mocked(startLiveSession).mockImplementation((opts) => {
			capturedCallbacks = opts.callbacks;
			return Promise.resolve({ micAnalyser: fakeAnalyser(), outputAnalyser: fakeAnalyser(), close });
		});

		const { result } = renderHook(() => useVoiceSession(baseOptions()));
		act(() => result.current.start());
		await waitFor(() => capturedCallbacks !== undefined);
		act(() => capturedCallbacks?.onOpen?.());
		await waitFor(() => expect(result.current.status).toBe("listening"));

		act(() => result.current.end());

		expect(close).toHaveBeenCalledTimes(1);
		expect(setVoiceMode).toHaveBeenCalledWith(false);
		expect(result.current.status).toBe("idle");
		expect(result.current.micAnalyser).toBeNull();
	});
});
