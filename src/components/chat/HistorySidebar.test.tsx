import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistorySidebar } from "./HistorySidebar";

const conversations = [
	{ conversationId: "c-1", title: "First chat", updatedAt: "2026-08-05T00:00:00.000Z" },
	{ conversationId: "c-2", title: "Second chat", updatedAt: "2026-08-06T00:00:00.000Z" },
];

const baseProps = {
	open: true,
	conversations,
	titleText: "History",
	newConversationLabel: "New conversation",
	deleteLabel: "Delete conversation",
	retentionNoticeText: "Kept for 30 days.",
	onClose: vi.fn(),
	onSelect: vi.fn(),
	onDelete: vi.fn(),
	onNewConversation: vi.fn(),
};

describe("HistorySidebar", () => {
	it("renders nothing when open=false", () => {
		render(<HistorySidebar {...baseProps} open={false} />);
		expect(screen.queryByText("History")).not.toBeInTheDocument();
	});

	it("lists each conversation's title and the retention notice", () => {
		render(<HistorySidebar {...baseProps} />);
		expect(screen.getByText("First chat")).toBeInTheDocument();
		expect(screen.getByText("Second chat")).toBeInTheDocument();
		expect(screen.getByText("Kept for 30 days.")).toBeInTheDocument();
	});

	it("calls onSelect with the conversationId when a row is clicked", () => {
		const onSelect = vi.fn();
		render(<HistorySidebar {...baseProps} onSelect={onSelect} />);
		fireEvent.click(screen.getByText("First chat"));
		expect(onSelect).toHaveBeenCalledWith("c-1");
	});

	it("calls onDelete with the conversationId, not onSelect, when a delete button is clicked", () => {
		const onDelete = vi.fn();
		const onSelect = vi.fn();
		render(<HistorySidebar {...baseProps} onDelete={onDelete} onSelect={onSelect} />);
		fireEvent.click(screen.getAllByRole("button", { name: "Delete conversation" })[0]);
		expect(onDelete).toHaveBeenCalledWith("c-1");
		expect(onSelect).not.toHaveBeenCalled();
	});

	it("calls onNewConversation when the new-conversation action is clicked", () => {
		const onNewConversation = vi.fn();
		render(<HistorySidebar {...baseProps} onNewConversation={onNewConversation} />);
		fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
		expect(onNewConversation).toHaveBeenCalled();
	});
});
