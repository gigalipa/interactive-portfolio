import { describe, expect, it } from "vitest";
import {
	base64ToInt16,
	computeBarHeights,
	computeRmsLevel,
	floatTo16BitPCM,
	int16ToBase64,
	int16ToFloat32,
} from "./audioUtils";

describe("floatTo16BitPCM", () => {
	it("converts full-scale float samples to full-scale int16", () => {
		const result = floatTo16BitPCM(new Float32Array([1, -1, 0]));
		expect(result[0]).toBe(0x7fff);
		expect(result[1]).toBe(-0x8000);
		expect(result[2]).toBe(0);
	});

	it("clamps out-of-range input", () => {
		const result = floatTo16BitPCM(new Float32Array([2, -2]));
		expect(result[0]).toBe(0x7fff);
		expect(result[1]).toBe(-0x8000);
	});
});

describe("int16ToBase64 / base64ToInt16", () => {
	it("round-trips a sample buffer", () => {
		const original = new Int16Array([0, 1, -1, 12345, -12345, 32767, -32768]);
		const roundTripped = base64ToInt16(int16ToBase64(original));
		expect(Array.from(roundTripped)).toEqual(Array.from(original));
	});
});

describe("int16ToFloat32", () => {
	it("converts full-scale int16 back to approximately full-scale float", () => {
		const result = int16ToFloat32(new Int16Array([32767, -32768, 0]));
		expect(result[0]).toBeCloseTo(1, 3);
		expect(result[1]).toBeCloseTo(-1, 3);
		expect(result[2]).toBe(0);
	});
});

describe("computeRmsLevel", () => {
	it("returns 0 for silence", () => {
		expect(computeRmsLevel(new Uint8Array(8))).toBe(0);
	});

	it("returns 1 for full-scale data", () => {
		expect(computeRmsLevel(new Uint8Array(8).fill(255))).toBe(1);
	});

	it("returns a value between 0 and 1 for partial data", () => {
		const level = computeRmsLevel(new Uint8Array(8).fill(128));
		expect(level).toBeGreaterThan(0);
		expect(level).toBeLessThan(1);
	});
});

describe("computeBarHeights", () => {
	it("returns exactly barCount heights, each 0-1", () => {
		const data = new Uint8Array(256).fill(128);
		const heights = computeBarHeights(data, 24);
		expect(heights).toHaveLength(24);
		heights.forEach((h) => {
			expect(h).toBeGreaterThanOrEqual(0);
			expect(h).toBeLessThanOrEqual(1);
		});
	});

	it("maps full-scale frequency data to full-scale bars", () => {
		const data = new Uint8Array(240).fill(255);
		const heights = computeBarHeights(data, 24);
		heights.forEach((h) => expect(h).toBe(1));
	});

	it("maps silence to zero-height bars", () => {
		const data = new Uint8Array(240).fill(0);
		const heights = computeBarHeights(data, 24);
		heights.forEach((h) => expect(h).toBe(0));
	});
});
