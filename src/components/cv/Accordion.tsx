import { useState, type ReactNode } from "react";

export interface AccordionProps {
	title: string;
	children: ReactNode;
	defaultOpen?: boolean;
}

export function Accordion({
	title,
	children,
	defaultOpen = false,
}: AccordionProps) {
	const [isOpen, setIsOpen] = useState(defaultOpen);

	return (
		<div className="border-slate-mist bg-deep-blue/40 rounded-2xl border backdrop-blur-xl">
			<button
				type="button"
				onClick={() => setIsOpen((open) => !open)}
				aria-expanded={isOpen}
				className="text-ion flex w-full items-center justify-between px-5 py-4 text-left"
			>
				<span className="font-display text-base font-semibold">{title}</span>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					className={`h-4 w-4 shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
				>
					<path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
				</svg>
			</button>
			{isOpen && (
				<div className="flex flex-col gap-3 px-5 pb-5">{children}</div>
			)}
		</div>
	);
}
