import type { ConversationSummary } from "../../lib/history/types";

export interface HistorySidebarProps {
	open: boolean;
	conversations: ConversationSummary[];
	titleText: string;
	newConversationLabel: string;
	deleteLabel: string;
	closeLabel: string;
	retentionNoticeText: string;
	onClose: () => void;
	onSelect: (conversationId: string) => void;
	onDelete: (conversationId: string) => void;
	onNewConversation: () => void;
}

export function HistorySidebar({
	open,
	conversations,
	titleText,
	newConversationLabel,
	deleteLabel,
	closeLabel,
	retentionNoticeText,
	onClose,
	onSelect,
	onDelete,
	onNewConversation,
}: HistorySidebarProps) {
	if (!open) return null;

	return (
		<div className="border-slate-mist bg-deep-blue/70 text-ion fixed top-0 left-0 z-50 flex h-full w-72 flex-col gap-3 border-r p-4 backdrop-blur-2xl">
			<div className="flex items-center justify-between">
				<h2 className="font-display text-base font-semibold">{titleText}</h2>
				<button
					type="button"
					onClick={onClose}
					aria-label={closeLabel}
					className="text-ion/60 hover:text-ion"
				>
					×
				</button>
			</div>
			<button
				type="button"
				onClick={onNewConversation}
				className="border-electric-blue/70 bg-electric-blue/15 hover:bg-electric-blue/25 rounded-full border px-3 py-1.5 text-left text-sm"
			>
				{newConversationLabel}
			</button>
			<ul className="flex flex-1 flex-col gap-1 overflow-y-auto">
				{conversations.map((conversation) => (
					<li
						key={conversation.conversationId}
						className="group flex items-center gap-1"
					>
						<button
							type="button"
							onClick={() => onSelect(conversation.conversationId)}
							className="hover:bg-slate-mist text-ion/90 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-sm"
						>
							{conversation.title}
						</button>
						<button
							type="button"
							onClick={() => onDelete(conversation.conversationId)}
							aria-label={deleteLabel}
							className="text-ion/40 hover:text-ion/80 px-1 text-xs opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
						>
							×
						</button>
					</li>
				))}
			</ul>
			<p className="text-ion/50 border-slate-mist border-t pt-3 text-xs">
				{retentionNoticeText}
			</p>
		</div>
	);
}
