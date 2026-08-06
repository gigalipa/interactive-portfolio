import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConsentBanner } from "./ConsentBanner";

const baseProps = {
	messageText: "We use a cookie to save your chat.",
	acceptLabel: "Accept",
	rejectLabel: "Reject",
	infoToggleLabel: "What's this cookie?",
	infoBodyText: "Details about the cookie.",
	showDeleteOption: false,
	deleteOptionLabel: "Also delete my saved conversations",
	onAccept: vi.fn(),
	onReject: vi.fn(),
};

describe("ConsentBanner", () => {
	it("renders the consent message and calls onAccept", () => {
		const onAccept = vi.fn();
		render(<ConsentBanner {...baseProps} onAccept={onAccept} />);
		expect(screen.getByText(baseProps.messageText)).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Accept" }));
		expect(onAccept).toHaveBeenCalled();
	});

	it("calls onReject(false) when rejected without the delete option shown", () => {
		const onReject = vi.fn();
		render(<ConsentBanner {...baseProps} onReject={onReject} />);
		fireEvent.click(screen.getByRole("button", { name: "Reject" }));
		expect(onReject).toHaveBeenCalledWith(false);
	});

	it("toggles the info body text on info-toggle click", () => {
		render(<ConsentBanner {...baseProps} />);
		expect(screen.queryByText("Details about the cookie.")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "What's this cookie?" }));
		expect(screen.getByText("Details about the cookie.")).toBeInTheDocument();
	});

	it("shows a delete-option checkbox and passes its value to onReject when showDeleteOption is true", () => {
		const onReject = vi.fn();
		render(<ConsentBanner {...baseProps} showDeleteOption onReject={onReject} />);
		fireEvent.click(screen.getByRole("checkbox", { name: baseProps.deleteOptionLabel }));
		fireEvent.click(screen.getByRole("button", { name: "Reject" }));
		expect(onReject).toHaveBeenCalledWith(true);
	});
});
