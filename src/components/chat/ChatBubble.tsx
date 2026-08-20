import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

export interface ChatBubbleProps {
	role: "user" | "model";
	text: string;
	mode?: "voice";
}

// The avatar's replies come back as markdown (bold, lists, code, links); style
// each element to match the site's dark palette instead of using the browser
// default (or the @tailwindcss/typography plugin, which this project doesn't
// pull in elsewhere).
const markdownComponents: Components = {
	p: ({ children }) => <p className="my-1 first:mt-0 last:mb-0">{children}</p>,
	strong: ({ children }) => (
		<strong className="font-semibold">{children}</strong>
	),
	em: ({ children }) => <em className="italic">{children}</em>,
	a: ({ children, href }) => (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			className="text-signal-cyan hover:text-signal-cyan/80 underline"
		>
			{children}
		</a>
	),
	ul: ({ children }) => (
		<ul className="my-1 list-disc space-y-0.5 pl-5">{children}</ul>
	),
	ol: ({ children }) => (
		<ol className="my-1 list-decimal space-y-0.5 pl-5">{children}</ol>
	),
	li: ({ children }) => <li>{children}</li>,
	code: ({ children, className }) =>
		className?.includes("language-") ? (
			<code className={className}>{children}</code>
		) : (
			<code className="bg-slate-mist rounded px-1 py-0.5 font-mono text-xs">
				{children}
			</code>
		),
	pre: ({ children }) => (
		<pre className="bg-void/60 my-2 overflow-x-auto rounded-lg p-2 font-mono text-xs">
			{children}
		</pre>
	),
	h1: ({ children }) => (
		<p className="font-display mt-2 mb-1 font-semibold">{children}</p>
	),
	h2: ({ children }) => (
		<p className="font-display mt-2 mb-1 font-semibold">{children}</p>
	),
	h3: ({ children }) => (
		<p className="font-display mt-2 mb-1 font-semibold">{children}</p>
	),
	blockquote: ({ children }) => (
		<blockquote className="border-slate-mist-strong text-ion/80 my-1 border-l-2 pl-2 italic">
			{children}
		</blockquote>
	),
};

export function ChatBubble({ role, text, mode }: ChatBubbleProps) {
	const isModel = role === "model";
	return (
		<div
			className={`flex items-end gap-1 ${isModel ? "justify-start" : "flex-row-reverse justify-end"}`}
		>
			{mode === "voice" && (
				<span
					data-testid="chat-bubble-voice-indicator"
					title="Voice message"
					className="text-ion/40 mb-1 shrink-0 text-xs"
				>
					🎙
				</span>
			)}
			<div
				data-testid={isModel ? "chat-bubble-model" : "chat-bubble-user"}
				className={
					mode === "voice"
						? isModel
							? "border-voice-violet/60 bg-deep-blue/80 text-ion max-w-[80%] rounded-2xl rounded-bl-sm border px-4 py-2.5 text-left text-sm backdrop-blur-lg"
							: "border-voice-violet/60 bg-slate-mist text-ion max-w-[80%] rounded-2xl rounded-br-sm border px-4 py-2.5 text-right text-sm whitespace-pre-wrap backdrop-blur-lg"
						: isModel
							? "border-electric-blue/60 bg-deep-blue/80 text-ion max-w-[80%] rounded-2xl rounded-bl-sm border px-4 py-2.5 text-left text-sm backdrop-blur-lg"
							: "border-signal-cyan/60 bg-slate-mist text-ion max-w-[80%] rounded-2xl rounded-br-sm border px-4 py-2.5 text-right text-sm whitespace-pre-wrap backdrop-blur-lg"
				}
			>
				{isModel ? (
					<ReactMarkdown
						remarkPlugins={[remarkGfm]}
						components={markdownComponents}
					>
						{text}
					</ReactMarkdown>
				) : (
					text
				)}
			</div>
		</div>
	);
}
