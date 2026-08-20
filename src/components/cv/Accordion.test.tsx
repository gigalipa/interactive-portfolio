import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Accordion } from "./Accordion";

describe("Accordion", () => {
	it("renders the title, collapsed by default (content not in the DOM)", () => {
		render(
			<Accordion title="Professional Experience">
				<p>Some entry content</p>
			</Accordion>,
		);
		expect(screen.getByText("Professional Experience")).toBeInTheDocument();
		expect(screen.queryByText("Some entry content")).not.toBeInTheDocument();
	});

	it("expands its content when the header is clicked", () => {
		render(
			<Accordion title="Projects">
				<p>Project list</p>
			</Accordion>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Projects" }));
		expect(screen.getByText("Project list")).toBeInTheDocument();
	});

	it("collapses again when the open header is clicked a second time", () => {
		render(
			<Accordion title="Projects">
				<p>Project list</p>
			</Accordion>,
		);
		const header = screen.getByRole("button", { name: "Projects" });
		fireEvent.click(header);
		fireEvent.click(header);
		expect(screen.queryByText("Project list")).not.toBeInTheDocument();
	});

	it("reflects open state via aria-expanded", () => {
		render(
			<Accordion title="Projects">
				<p>Project list</p>
			</Accordion>,
		);
		const header = screen.getByRole("button", { name: "Projects" });
		expect(header).toHaveAttribute("aria-expanded", "false");
		fireEvent.click(header);
		expect(header).toHaveAttribute("aria-expanded", "true");
	});

	it("starts expanded when defaultOpen is true", () => {
		render(
			<Accordion title="Projects" defaultOpen>
				<p>Project list</p>
			</Accordion>,
		);
		expect(screen.getByText("Project list")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Projects" })).toHaveAttribute(
			"aria-expanded",
			"true",
		);
	});

	it("keeps two independent Accordion instances open/closed independently", () => {
		render(
			<>
				<Accordion title="A">
					<p>Content A</p>
				</Accordion>
				<Accordion title="B">
					<p>Content B</p>
				</Accordion>
			</>,
		);
		fireEvent.click(screen.getByRole("button", { name: "A" }));
		expect(screen.getByText("Content A")).toBeInTheDocument();
		expect(screen.queryByText("Content B")).not.toBeInTheDocument();
	});
});
