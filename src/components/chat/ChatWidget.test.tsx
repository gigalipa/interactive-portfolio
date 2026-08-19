import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const chatSessionState = {
	consent: "rejected" as const,
	messages: [],
	status: "idle" as const,
	errorMessage: null,
	sendMessage: vi.fn(),
	retryLast: vi.fn(),
	conversations: [],
	historyOpen: false,
	toggleHistory: vi.fn(),
	closeHistory: vi.fn(),
	selectConversation: vi.fn(),
	deleteConversationById: vi.fn(),
	startNewConversation: vi.fn(),
	acceptConsent: vi.fn(),
	rejectConsent: vi.fn(),
	appendVoiceTurn: vi.fn(),
};

vi.mock("../../lib/chat/useChatSession", () => ({
	useChatSession: () => chatSessionState,
}));

const voiceSessionState = {
	status: "idle" as string,
	micAnalyser: null,
	start: vi.fn(),
	end: vi.fn(),
};

let capturedVoiceOptions:
	| { onError: (key: "voice_connection_failed" | "voice_mic_denied") => void }
	| undefined;

vi.mock("../../lib/voice/useVoiceSession", () => ({
	useVoiceSession: (opts: typeof capturedVoiceOptions) => {
		capturedVoiceOptions = opts;
		return voiceSessionState;
	},
}));

import { act } from "@testing-library/react";
import { ChatWidget } from "./ChatWidget";

describe("ChatWidget voice mode", () => {
	it("shows ChatBox (not VoiceVisor) when the voice session is idle", () => {
		voiceSessionState.status = "idle";
		render(<ChatWidget lang="en" />);
		expect(screen.getByPlaceholderText("Ask me about my work, background, or projects...")).toBeInTheDocument();
	});

	it("shows VoiceVisor (not ChatBox) once the voice session is listening", () => {
		voiceSessionState.status = "listening";
		render(<ChatWidget lang="en" />);
		expect(
			screen.queryByPlaceholderText("Ask me about my work, background, or projects..."),
		).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "End call" })).toBeInTheDocument();
	});

	it("calls voiceSession.start() when the waves button is clicked while idle", () => {
		voiceSessionState.status = "idle";
		render(<ChatWidget lang="en" />);
		fireEvent.click(screen.getByRole("button", { name: "Start voice chat" }));
		expect(voiceSessionState.start).toHaveBeenCalledTimes(1);
	});

	it("calls voiceSession.end() when the end-call button is clicked", () => {
		voiceSessionState.status = "speaking";
		render(<ChatWidget lang="en" />);
		fireEvent.click(screen.getByRole("button", { name: "End call" }));
		expect(voiceSessionState.end).toHaveBeenCalledTimes(1);
	});

	it("shows the mic-denied message and ChatBox (not VoiceVisor) after onError fires with voice_mic_denied and status is error", () => {
		voiceSessionState.status = "error";
		render(<ChatWidget lang="en" />);

		act(() => capturedVoiceOptions?.onError("voice_mic_denied"));

		expect(
			screen.getByText("Microphone access was denied. You can still use text chat."),
		).toBeInTheDocument();
		expect(screen.getByPlaceholderText("Ask me about my work, background, or projects...")).toBeInTheDocument();
	});

	it("shows the generic voice error message when onError fires with voice_connection_failed", () => {
		voiceSessionState.status = "error";
		render(<ChatWidget lang="en" />);

		act(() => capturedVoiceOptions?.onError("voice_connection_failed"));

		expect(
			screen.getByText("The voice session couldn't connect. Please try text chat instead."),
		).toBeInTheDocument();
	});

	it("does not show a voice error message when idle", () => {
		voiceSessionState.status = "idle";
		render(<ChatWidget lang="en" />);
		expect(
			screen.queryByText("The voice session couldn't connect. Please try text chat instead."),
		).not.toBeInTheDocument();
	});
});
