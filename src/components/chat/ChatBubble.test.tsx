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
		expect(screen.getByText("Hi!")).toHaveClass("border-electric-blue/60");
	});

	it("applies visitor styling for role='user'", () => {
		render(<ChatBubble role="user" text="Hi!" />);
		expect(screen.getByText("Hi!")).toHaveClass("border-signal-cyan/60");
	});
});
