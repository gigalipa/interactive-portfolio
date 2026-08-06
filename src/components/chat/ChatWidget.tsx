import { useState } from "react";
import { useChatSession } from "../../lib/chat/useChatSession";
import { ChatMessages } from "./ChatMessages";
import { ChatBox } from "./ChatBox";
import { ConsentBanner } from "./ConsentBanner";
import { HistorySidebar } from "./HistorySidebar";
import { HistoryToggleButton } from "./HistoryToggleButton";
import { getDictionary, type Locale } from "../../i18n";

export interface ChatWidgetProps {
	lang: Locale;
}

export function ChatWidget({ lang }: ChatWidgetProps) {
	const t = getDictionary(lang).chat;
	const [preferencesOpen, setPreferencesOpen] = useState(false);

	const session = useChatSession({
		language: lang.toUpperCase(),
		errorGenericMessage: t.errorGeneric,
		errorRateLimitedMessage: t.errorRateLimited,
	});

	const showConsentBanner = session.consent === null || preferencesOpen;

	return (
		<>
			<HistorySidebar
				open={session.historyOpen}
				conversations={session.conversations}
				titleText={t.historyTitle}
				newConversationLabel={t.newConversation}
				deleteLabel={t.deleteConversation}
				closeLabel={t.closeHistory}
				retentionNoticeText={t.retentionNotice}
				onClose={session.closeHistory}
				onSelect={session.selectConversation}
				onDelete={session.deleteConversationById}
				onNewConversation={session.startNewConversation}
			/>

			<div className="pointer-events-auto fixed top-20 right-5 z-40 sm:top-24 sm:right-6">
				<HistoryToggleButton
					visible={session.conversations.length > 0}
					label={t.historyToggleLabel}
					onClick={session.toggleHistory}
				/>
			</div>

			<button
				type="button"
				onClick={() => setPreferencesOpen(true)}
				className="text-ion/40 hover:text-ion/70 pointer-events-auto fixed bottom-6 left-5 z-40 text-xs underline sm:left-6"
			>
				{t.consent.preferencesLink}
			</button>

			<div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex flex-col items-center gap-3 px-4 lg:inset-x-auto lg:top-36 lg:right-6 lg:items-stretch lg:px-0">
				<div className="pointer-events-auto flex w-full max-w-xl flex-col gap-3 lg:h-full lg:w-[28rem] lg:max-w-none lg:justify-end">
					{showConsentBanner && (
						<ConsentBanner
							messageText={t.consent.message}
							acceptLabel={t.consent.accept}
							rejectLabel={t.consent.reject}
							infoToggleLabel={t.consent.infoToggle}
							infoBodyText={t.consent.infoBody}
							showDeleteOption={session.consent === "accepted"}
							deleteOptionLabel={t.consent.deleteOption}
							onAccept={() => {
								session.acceptConsent();
								setPreferencesOpen(false);
							}}
							onReject={(alsoDelete) => {
								session.rejectConsent(alsoDelete);
								setPreferencesOpen(false);
							}}
						/>
					)}

					<ChatMessages
						messages={session.messages}
						status={session.status}
						errorMessage={session.errorMessage}
						thinkingLabel={t.thinking}
						retryLabel={t.retry}
						onRetry={session.retryLast}
					/>

					<ChatBox
						inputPlaceholder={t.inputPlaceholder}
						sendLabel={t.send}
						voiceLabel={t.voiceComingSoon}
						disabled={session.status === "sending" || session.status === "streaming"}
						onSend={session.sendMessage}
					/>
				</div>
			</div>
		</>
	);
}
