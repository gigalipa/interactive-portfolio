/** Converts float32 samples in [-1, 1] to 16-bit PCM, clamping out-of-range input. */
export function floatTo16BitPCM(input: Float32Array): Int16Array {
	const output = new Int16Array(input.length);
	for (let i = 0; i < input.length; i++) {
		const s = Math.max(-1, Math.min(1, input[i]));
		output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
	}
	return output;
}

/** Converts 16-bit PCM back to float32 samples in [-1, 1]. */
export function int16ToFloat32(pcm: Int16Array): Float32Array {
	const output = new Float32Array(pcm.length);
	for (let i = 0; i < pcm.length; i++) {
		output[i] = pcm[i] / (pcm[i] < 0 ? 0x8000 : 0x7fff);
	}
	return output;
}

export function int16ToBase64(pcm: Int16Array): string {
	const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary);
}

export function base64ToInt16(base64: string): Int16Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return new Int16Array(bytes.buffer);
}

/** Root-mean-square level of byte-frequency data (0-255 per bin), normalized to 0-1. */
export function computeRmsLevel(frequencyData: Uint8Array): number {
	if (frequencyData.length === 0) return 0;
	let sumOfSquares = 0;
	for (let i = 0; i < frequencyData.length; i++) {
		sumOfSquares += frequencyData[i] * frequencyData[i];
	}
	const rms = Math.sqrt(sumOfSquares / frequencyData.length);
	return Math.min(rms / 255, 1);
}

/** Buckets byte-frequency data into `barCount` averaged, normalized (0-1) bar heights. */
export function computeBarHeights(frequencyData: Uint8Array, barCount: number): number[] {
	const bucketSize = Math.max(1, Math.floor(frequencyData.length / barCount));
	const heights: number[] = [];
	for (let i = 0; i < barCount; i++) {
		const start = i * bucketSize;
		const end = Math.min(start + bucketSize, frequencyData.length);
		let sum = 0;
		for (let j = start; j < end; j++) sum += frequencyData[j];
		const average = end > start ? sum / (end - start) : 0;
		heights.push(Math.min(average / 255, 1));
	}
	return heights;
}
