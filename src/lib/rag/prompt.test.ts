import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./prompt";
import type { RetrievedChunk } from "./retrieve";

const chunk: RetrievedChunk = {
	id: "abc-0",
	document: "Built an AI widget for a Notion dashboard.",
	distance: 0.12,
	notionPageId: "abc",
	title: "Language Quest AI Widget",
	contentType: "Project",
	tags: ["ai", "web-dev"],
	priority: 4,
	language: "EN",
	summary: "An AI-powered widget.",
};

describe("buildSystemPrompt", () => {
	it("includes persona, boundaries, and formatted context", () => {
		const prompt = buildSystemPrompt({ chunks: [chunk] });

		expect(prompt).toContain("first person");
		expect(prompt).toContain("Boundaries:");
		expect(prompt).toContain("[1] Language Quest AI Widget (Project | tags: ai, web-dev)");
		expect(prompt).toContain(chunk.document);
	});

	it("notes when no context was found", () => {
		const prompt = buildSystemPrompt({ chunks: [] });

		expect(prompt).toContain("No matching Knowledge Base entries");
	});

	it("mentions the visitor's language when provided", () => {
		const prompt = buildSystemPrompt({ chunks: [chunk], visitorLanguage: "ES" });

		expect(prompt).toContain("visitor's UI language is ES");
	});
});
