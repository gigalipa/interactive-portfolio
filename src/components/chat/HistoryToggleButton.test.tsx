import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryToggleButton } from "./HistoryToggleButton";

describe("HistoryToggleButton", () => {
	it("renders nothing when visible=false", () => {
		render(<HistoryToggleButton visible={false} label="Conversation history" onClick={vi.fn()} />);
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	it("renders and calls onClick when visible=true", () => {
		const onClick = vi.fn();
		render(<HistoryToggleButton visible label="Conversation history" onClick={onClick} />);
		fireEvent.click(screen.getByRole("button", { name: "Conversation history" }));
		expect(onClick).toHaveBeenCalled();
	});
});
