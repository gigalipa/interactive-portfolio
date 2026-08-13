import { useEffect, useRef, useState } from "react";
import { computeBarHeights } from "../../lib/voice/audioUtils";

const BAR_COUNT = 24;

export interface VoiceVisorProps {
	analyser: AnalyserNode | null;
	endCallLabel: string;
	onEndCall: () => void;
}

export function VoiceVisor({ analyser, endCallLabel, onEndCall }: VoiceVisorProps) {
	const [heights, setHeights] = useState<number[]>(() => new Array(BAR_COUNT).fill(0));
	const rafRef = useRef<number | null>(null);

	useEffect(() => {
		if (!analyser) {
			setHeights(new Array(BAR_COUNT).fill(0));
			return;
		}

		let cancelled = false;
		const data = new Uint8Array(analyser.frequencyBinCount);
		const tick = () => {
			if (cancelled) return;
			analyser.getByteFrequencyData(data);
			setHeights(computeBarHeights(data, BAR_COUNT));
			// Deferred via microtask so a synchronous rAF stub (used in tests to
			// render exactly one frame) can't recurse the call stack into overflow;
			// real browsers already schedule rAF asynchronously so this is a no-op
			// behavior change outside of tests. The `cancelled` check (set
			// synchronously by cleanup) guards against this microtask firing after
			// unmount, when its requestAnimationFrame call would be scheduled too
			// late to be captured by rafRef and thus never cancelled.
			queueMicrotask(() => {
				if (!cancelled) rafRef.current = requestAnimationFrame(tick);
			});
		};
		rafRef.current = requestAnimationFrame(tick);

		return () => {
			cancelled = true;
			if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
		};
	}, [analyser]);

	return (
		<div className="border-slate-mist bg-deep-blue/40 shadow-glow-blue flex items-center gap-2 rounded-full border p-2 backdrop-blur-xl">
			<div className="flex h-9 flex-1 items-center justify-center gap-[3px] px-2">
				{heights.map((height, index) => (
					<span
						key={index}
						data-testid="voice-visor-bar"
						className="bg-signal-cyan shadow-glow-cyan w-1 rounded-full transition-[height] duration-75"
						style={{ height: `${height > 0 ? Math.max(height * 100, 8) : 0}%` }}
					/>
				))}
			</div>
			<button
				type="button"
				onClick={onEndCall}
				aria-label={endCallLabel}
				title={endCallLabel}
				className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-red-500/60 bg-red-500/15 text-red-400 hover:bg-red-500/25"
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M4 6l16 12M20 6L4 18"
					/>
				</svg>
			</button>
		</div>
	);
}
