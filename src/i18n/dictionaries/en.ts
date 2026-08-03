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
		status: "Signal: online",
		tagline:
			"Ask me anything about my work, background, or projects — the conversational interface lands here in Phase 3.",
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
} satisfies Dictionary;
