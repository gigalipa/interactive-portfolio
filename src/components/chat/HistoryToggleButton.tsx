export interface HistoryToggleButtonProps {
	visible: boolean;
	label: string;
	onClick: () => void;
}

export function HistoryToggleButton({ visible, label, onClick }: HistoryToggleButtonProps) {
	if (!visible) return null;

	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			title={label}
			className="border-slate-mist-strong bg-deep-blue/40 text-ion/80 hover:bg-slate-mist flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-lg"
		>
			↺
		</button>
	);
}
