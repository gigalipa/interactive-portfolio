import { beforeEach, describe, expect, it } from "vitest";
import {
	clearSessionMessages,
	loadSessionMessages,
	saveSessionMessages,
} from "./sessionHistory";
import type { ChatMessage } from "../history/types";

const sample: ChatMessage[] = [
	{ role: "user", text: "Hi", at: "2026-08-06T00:00:00.000Z" },
];

describe("session message storage", () => {
	beforeEach(() => {
		window.sessionStorage.clear();
	});

	it("returns an empty array when nothing is stored", () => {
		expect(loadSessionMessages()).toEqual([]);
	});

	it("round-trips messages through save/load", () => {
		saveSessionMessages(sample);
		expect(loadSessionMessages()).toEqual(sample);
	});

	it("returns an empty array for corrupt stored JSON", () => {
		window.sessionStorage.setItem("chat_session_messages", "{not json");
		expect(loadSessionMessages()).toEqual([]);
	});

	it("clears stored messages", () => {
		saveSessionMessages(sample);
		clearSessionMessages();
		expect(loadSessionMessages()).toEqual([]);
	});
});
