import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatBox } from "./ChatBox";

const baseProps = {
	inputPlaceholder: "Ask me anything",
	sendLabel: "Send",
	voiceLabel: "Voice chat (coming soon)",
	disabled: false,
	onSend: vi.fn(),
};

describe("ChatBox", () => {
	it("calls onSend with the trimmed input and clears it on submit", () => {
		const onSend = vi.fn();
		render(<ChatBox {...baseProps} onSend={onSend} />);
		const input = screen.getByPlaceholderText("Ask me anything");
		fireEvent.change(input, { target: { value: "  Hello there  " } });
		fireEvent.click(screen.getByRole("button", { name: "Send" }));
		expect(onSend).toHaveBeenCalledWith("Hello there");
		expect(input).toHaveValue("");
	});

	it("does not call onSend for an empty/whitespace-only message", () => {
		const onSend = vi.fn();
		render(<ChatBox {...baseProps} onSend={onSend} />);
		fireEvent.change(screen.getByPlaceholderText("Ask me anything"), { target: { value: "   " } });
		fireEvent.click(screen.getByRole("button", { name: "Send" }));
		expect(onSend).not.toHaveBeenCalled();
	});

	it("submits on Enter key press in the input", () => {
		const onSend = vi.fn();
		render(<ChatBox {...baseProps} onSend={onSend} />);
		const input = screen.getByPlaceholderText("Ask me anything");
		fireEvent.change(input, { target: { value: "Hi" } });
		fireEvent.keyDown(input, { key: "Enter" });
		expect(onSend).toHaveBeenCalledWith("Hi");
	});

	it("disables the input and send button when disabled=true", () => {
		render(<ChatBox {...baseProps} disabled />);
		expect(screen.getByPlaceholderText("Ask me anything")).toBeDisabled();
		expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
	});

	it("renders a disabled voice button with the provided label", () => {
		render(<ChatBox {...baseProps} />);
		expect(screen.getByRole("button", { name: "Voice chat (coming soon)" })).toBeDisabled();
	});
});
