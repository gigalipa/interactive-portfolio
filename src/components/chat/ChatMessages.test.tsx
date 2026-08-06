import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatMessages } from "./ChatMessages";

const baseProps = {
	messages: [],
	status: "idle" as const,
	errorMessage: null,
	thinkingLabel: "Thinking...",
	retryLabel: "Retry",
	onRetry: vi.fn(),
};

describe("ChatMessages", () => {
	it("renders each message as a bubble", () => {
		render(
			<ChatMessages
				{...baseProps}
				messages={[
					{ id: "1", role: "user", text: "Hi" },
					{ id: "2", role: "model", text: "Hello!" },
				]}
			/>,
		);
		expect(screen.getByText("Hi")).toBeInTheDocument();
		expect(screen.getByText("Hello!")).toBeInTheDocument();
	});

	it("shows the thinking indicator while status is 'sending'", () => {
		render(<ChatMessages {...baseProps} status="sending" />);
		expect(screen.getByText("Thinking...")).toBeInTheDocument();
	});

	it("does not show the thinking indicator once streaming has started", () => {
		render(<ChatMessages {...baseProps} status="streaming" />);
		expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();
	});

	it("shows an error bubble with a retry button when status is 'error'", () => {
		const onRetry = vi.fn();
		render(<ChatMessages {...baseProps} status="error" errorMessage="Something broke" onRetry={onRetry} />);
		expect(screen.getByText("Something broke")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		expect(onRetry).toHaveBeenCalled();
	});
});
