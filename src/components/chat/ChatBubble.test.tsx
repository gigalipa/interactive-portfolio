import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatBubble } from "./ChatBubble";

describe("ChatBubble", () => {
	it("renders the message text", () => {
		render(<ChatBubble role="user" text="Hello there" />);
		expect(screen.getByText("Hello there")).toBeInTheDocument();
	});

	it("applies avatar styling for role='model'", () => {
		render(<ChatBubble role="model" text="Hi!" />);
		expect(screen.getByTestId("chat-bubble-model")).toHaveClass("border-electric-blue/60");
	});

	it("applies visitor styling for role='user'", () => {
		render(<ChatBubble role="user" text="Hi!" />);
		expect(screen.getByTestId("chat-bubble-user")).toHaveClass("border-signal-cyan/60");
	});

	it("renders markdown formatting in the avatar's replies", () => {
		render(<ChatBubble role="model" text="I've built **Asset Foundry** and other projects." />);
		expect(screen.getByText("Asset Foundry").tagName).toBe("STRONG");
	});

	it("renders markdown lists in the avatar's replies", () => {
		render(<ChatBubble role="model" text={"Projects:\n- Asset Foundry\n- Language Quest"} />);
		expect(screen.getByText("Asset Foundry").closest("ul")).toBeInTheDocument();
	});

	it("renders the visitor's message as plain text, without markdown formatting", () => {
		render(<ChatBubble role="user" text="I like **bold** text" />);
		expect(screen.getByText("I like **bold** text")).toBeInTheDocument();
	});
});
