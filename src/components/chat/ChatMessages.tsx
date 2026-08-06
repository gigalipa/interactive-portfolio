import { useEffect, useRef } from "react";
import { ChatBubble } from "./ChatBubble";
import type { ChatStatus, DisplayMessage } from "../../lib/chat/useChatSession";

export interface ChatMessagesProps {
	messages: DisplayMessage[];
	status: ChatStatus;
	errorMessage: string | null;
	thinkingLabel: string;
	retryLabel: string;
	onRetry: () => void;
}

export function ChatMessages({
	messages,
	status,
	errorMessage,
	thinkingLabel,
	retryLabel,
	onRetry,
}: ChatMessagesProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	// Whether the visitor was pinned to the bottom *before* this update. If they
	// deliberately scrolled up to re-read something, don't yank them back down.
	const wasNearBottomRef = useRef(true);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		if (wasNearBottomRef.current) container.scrollTop = container.scrollHeight;
	}, [messages, status]);

	const handleScroll = () => {
		const container = containerRef.current;
		if (!container) return;
		wasNearBottomRef.current =
			container.scrollHeight - container.scrollTop - container.clientHeight < 100;
	};

	if (messages.length === 0 && status === "idle") return null;

	return (
		<div
			ref={containerRef}
			onScroll={handleScroll}
			role="log"
			aria-live="polite"
			aria-relevant="additions"
			className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto px-1 py-2"
		>
			{messages.map((message) => (
				<ChatBubble key={message.id} role={message.role} text={message.text} />
			))}
			{status === "sending" && (
				<div className="flex justify-start">
					<p className="border-electric-blue/60 bg-deep-blue/80 text-ion/70 rounded-2xl rounded-bl-sm border px-4 py-2.5 text-sm backdrop-blur-lg">
						{thinkingLabel}
					</p>
				</div>
			)}
			{status === "error" && errorMessage && (
				<div className="flex justify-start">
					<div
						role="alert"
						className="border-electric-blue/60 bg-deep-blue/80 text-ion flex max-w-[80%] flex-col gap-2 rounded-2xl rounded-bl-sm border px-4 py-2.5 text-sm backdrop-blur-lg"
					>
						<p>{errorMessage}</p>
						<button
							type="button"
							onClick={onRetry}
							className="border-electric-blue/70 text-ion/90 hover:bg-electric-blue/15 self-start rounded-full border px-3 py-1 text-xs"
						>
							{retryLabel}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
