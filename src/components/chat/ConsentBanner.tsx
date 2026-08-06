import { useState } from "react";

export interface ConsentBannerProps {
	messageText: string;
	acceptLabel: string;
	rejectLabel: string;
	infoToggleLabel: string;
	infoBodyText: string;
	showDeleteOption: boolean;
	deleteOptionLabel: string;
	onAccept: () => void;
	onReject: (alsoDeleteHistory: boolean) => void;
}

export function ConsentBanner({
	messageText,
	acceptLabel,
	rejectLabel,
	infoToggleLabel,
	infoBodyText,
	showDeleteOption,
	deleteOptionLabel,
	onAccept,
	onReject,
}: ConsentBannerProps) {
	const [infoOpen, setInfoOpen] = useState(false);
	const [alsoDelete, setAlsoDelete] = useState(false);

	return (
		<div className="border-slate-mist bg-deep-blue/60 shadow-glow-blue text-ion mx-auto flex max-w-xl flex-col gap-3 rounded-2xl border p-4 text-sm backdrop-blur-xl">
			<p>{messageText}</p>
			<button
				type="button"
				onClick={() => setInfoOpen((open) => !open)}
				className="text-signal-cyan/80 self-start text-xs underline"
			>
				{infoToggleLabel}
			</button>
			{infoOpen && <p className="text-ion/70 text-xs">{infoBodyText}</p>}
			{showDeleteOption && (
				<label className="text-ion/70 flex items-center gap-2 text-xs">
					<input
						type="checkbox"
						checked={alsoDelete}
						onChange={(event) => setAlsoDelete(event.target.checked)}
					/>
					{deleteOptionLabel}
				</label>
			)}
			<div className="flex gap-2">
				<button
					type="button"
					onClick={onAccept}
					className="border-electric-blue/70 bg-electric-blue/15 text-ion shadow-glow-blue hover:bg-electric-blue/25 rounded-full border px-4 py-2 text-sm font-medium"
				>
					{acceptLabel}
				</button>
				<button
					type="button"
					onClick={() => onReject(alsoDelete)}
					className="border-slate-mist-strong text-ion/80 hover:bg-slate-mist rounded-full border bg-transparent px-4 py-2 text-sm font-medium"
				>
					{rejectLabel}
				</button>
			</div>
		</div>
	);
}
