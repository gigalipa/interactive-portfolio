import type { Dictionary } from "../dictionary";

export default {
	nav: {
		main: "Main",
		cv: "CV",
		portfolio: "Portfolio",
		contact: "Contact",
	},
	meta: {
		description: "Daniel Peraza — interactive, AI-powered portfolio.",
	},
	home: {
		title: "Daniel Peraza — Interactive Portfolio",
		status: "Signal: online",
		tagline: "Ask me anything about my work, background, or projects.",
	},
	cv: {
		phase: "Phase 5",
		title: "CV",
		body: "Overview and accordion sections (experience, projects, academics, interests) land here.",
	},
	portfolio: {
		phase: "Phase 6",
		title: "Portfolio",
		body: "Projects grouped by category and chronology, synced from Notion, land here.",
	},
	contact: {
		phase: "Phase 7",
		title: "Contact",
		body: "A contact form and Notion-backed meeting booking land here.",
		cta: "Say hello",
	},
	chat: {
		inputPlaceholder: "Ask me about my work, background, or projects...",
		send: "Send",
		voiceComingSoon: "Voice chat (coming soon)",
		voiceStart: "Start voice chat",
		voiceEndCall: "End call",
		voiceConnecting: "Connecting...",
		voiceErrorGeneric: "The voice session couldn't connect. Please try text chat instead.",
		voiceMicDenied: "Microphone access was denied. You can still use text chat.",
		thinking: "Thinking...",
		errorGeneric: "The avatar couldn't reply just now. Please try again.",
		errorRateLimited:
			"Too many messages — please slow down and try again in a moment.",
		retry: "Retry",
		newConversation: "New conversation",
		historyToggleLabel: "Conversation history",
		historyTitle: "History",
		deleteConversation: "Delete conversation",
		closeHistory: "Close history",
		retentionNotice:
			"Conversations are kept for 30 days of inactivity, then deleted automatically. You can delete any of them anytime.",
		consent: {
			message:
				"This site can remember your conversation with the avatar so you can pick it up later — that needs one small cookie. Without it, chat still works, it just won't be saved.",
			accept: "Accept",
			reject: "Reject",
			infoToggle: "What's this cookie?",
			infoBody:
				"We set a single cookie, visitor_id, only if you accept. It has no personal data — it just lets us find your saved conversations when you come back. Cloudflare, our hosting provider, also sets a small number of strictly necessary security cookies that don't require consent.",
			preferencesLink: "Cookie preferences",
			deleteOption: "Also delete my saved conversations",
		},
	},
} satisfies Dictionary;
