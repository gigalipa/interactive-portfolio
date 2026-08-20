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
		title: "CV",
		tagline: "AI & Automation Engineer | Project Manager | Specialized in LLM Pipelines (n8n), NLP & Machine Learning",
		summary:
			"Junior AI & ML Engineer with a strong engineering foundation and hands-on experience architecting generative AI solutions, multi-model AI agents, and automated business workflows. Proficient in Python, custom REST APIs, LLM routing (Claude, Gemini, Llama, Hugging Face, EvoLink API), orchestration platforms (n8n, Docker), vector databases (pgvector, ChromaDB), and predictive ML dashboards. Proven track record of turning complex technical concepts into clear business solutions, delivering rapid proofs of concept, and managing automated productivity workflows via CLI tools and MCPs.",
		sections: {
			professionalExperience: "Professional Experience",
			projects: "Projects",
			academicExperience: "Academic Experience & Certifications",
			personalInterests: "Personal Interests & Background",
		},
		viewProjects: "View project details",
		present: "Present",
		emptySection: "Nothing published here yet.",
	},
	portfolio: {
		title: "Portfolio",
		intro: "Projects and case studies, grouped by category.",
		emptyState: "No projects published yet — check back soon.",
		backToPortfolio: "← Back to portfolio",
		linkLabels: {
			demo: "Live demo",
			repo: "Repository",
			company: "Company",
			certificate: "Certificate",
			article: "Article",
			other: "Link",
		},
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
