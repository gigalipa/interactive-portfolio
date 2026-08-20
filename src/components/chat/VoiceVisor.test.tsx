import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceVisor } from "./VoiceVisor";

function fakeAnalyser(fill: number): AnalyserNode {
	return {
		frequencyBinCount: 32,
		getByteFrequencyData: (array: Uint8Array) => array.fill(fill),
	} as unknown as AnalyserNode;
}

let rafSpy: ReturnType<typeof vi.spyOn>;
let cafSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	rafSpy = vi
		.spyOn(window, "requestAnimationFrame")
		.mockImplementation((cb) => {
			cb(0);
			return 1;
		});
	cafSpy = vi
		.spyOn(window, "cancelAnimationFrame")
		.mockImplementation(() => {});
});

afterEach(() => {
	rafSpy.mockRestore();
	cafSpy.mockRestore();
});

describe("VoiceVisor", () => {
	it("renders 24 bars", () => {
		render(
			<VoiceVisor
				analyser={fakeAnalyser(0)}
				endCallLabel="End call"
				onEndCall={vi.fn()}
			/>,
		);
		expect(screen.getAllByTestId("voice-visor-bar")).toHaveLength(24);
	});

	it("renders bars with nonzero height when the analyser reports signal", () => {
		render(
			<VoiceVisor
				analyser={fakeAnalyser(200)}
				endCallLabel="End call"
				onEndCall={vi.fn()}
			/>,
		);
		const bars = screen.getAllByTestId("voice-visor-bar");
		const heights = bars.map((bar) =>
			parseFloat((bar as HTMLElement).style.height),
		);
		expect(heights.some((h) => h > 0)).toBe(true);
	});

	it("renders flat bars when analyser is null (no signal yet)", () => {
		render(
			<VoiceVisor
				analyser={null}
				endCallLabel="End call"
				onEndCall={vi.fn()}
			/>,
		);
		const bars = screen.getAllByTestId("voice-visor-bar");
		const heights = bars.map((bar) =>
			parseFloat((bar as HTMLElement).style.height),
		);
		expect(heights.every((h) => h === 0)).toBe(true);
	});

	it("calls onEndCall when the end-call button is clicked", () => {
		const onEndCall = vi.fn();
		render(
			<VoiceVisor
				analyser={fakeAnalyser(0)}
				endCallLabel="End call"
				onEndCall={onEndCall}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "End call" }));
		expect(onEndCall).toHaveBeenCalledTimes(1);
	});

	it("stops the animation frame loop on unmount", () => {
		const { unmount } = render(
			<VoiceVisor
				analyser={fakeAnalyser(0)}
				endCallLabel="End call"
				onEndCall={vi.fn()}
			/>,
		);
		unmount();
		expect(cafSpy).toHaveBeenCalled();
	});
});
