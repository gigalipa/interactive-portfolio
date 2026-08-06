import { useState, type KeyboardEvent } from "react";

export interface ChatBoxProps {
	inputPlaceholder: string;
	sendLabel: string;
	voiceLabel: string;
	disabled: boolean;
	onSend: (text: string) => void;
}

export function ChatBox({ inputPlaceholder, sendLabel, voiceLabel, disabled, onSend }: ChatBoxProps) {
	const [value, setValue] = useState("");

	const submit = () => {
		const trimmed = value.trim();
		if (!trimmed) return;
		onSend(trimmed);
		setValue("");
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter") submit();
	};

	return (
		<div className="border-slate-mist bg-deep-blue/40 shadow-glow-blue flex items-center gap-2 rounded-full border p-2 backdrop-blur-xl">
			<button
				type="button"
				disabled
				aria-label={voiceLabel}
				title={voiceLabel}
				className="border-slate-mist-strong text-ion/40 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
			>
				~
			</button>
			<input
				type="text"
				value={value}
				onChange={(event) => setValue(event.target.value)}
				onKeyDown={handleKeyDown}
				placeholder={inputPlaceholder}
				disabled={disabled}
				className="text-ion placeholder:text-ion/40 flex-1 bg-transparent px-2 text-sm outline-none disabled:opacity-50"
			/>
			<button
				type="button"
				onClick={submit}
				disabled={disabled}
				className="border-electric-blue/70 bg-electric-blue/15 text-ion shadow-glow-blue hover:bg-electric-blue/25 shrink-0 rounded-full border px-4 py-2 text-sm font-medium backdrop-blur-lg disabled:opacity-50"
			>
				{sendLabel}
			</button>
		</div>
	);
}
