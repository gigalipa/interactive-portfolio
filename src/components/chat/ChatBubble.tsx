export interface ChatBubbleProps {
	role: "user" | "model";
	text: string;
}

export function ChatBubble({ role, text }: ChatBubbleProps) {
	const isModel = role === "model";
	return (
		<div className={`flex ${isModel ? "justify-start" : "justify-end"}`}>
			<p
				data-testid={isModel ? "chat-bubble-model" : "chat-bubble-user"}
				className={
					isModel
						? "border-electric-blue/60 bg-deep-blue/80 text-ion max-w-[80%] rounded-2xl rounded-bl-sm border px-4 py-2.5 text-sm whitespace-pre-wrap backdrop-blur-lg"
						: "border-signal-cyan/60 bg-slate-mist text-ion max-w-[80%] rounded-2xl rounded-br-sm border px-4 py-2.5 text-sm whitespace-pre-wrap backdrop-blur-lg"
				}
			>
				{text}
			</p>
		</div>
	);
}
