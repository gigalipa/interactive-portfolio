export interface Dictionary {
	nav: {
		main: string;
		cv: string;
		portfolio: string;
		contact: string;
	};
	meta: {
		description: string;
	};
	home: {
		title: string;
		status: string;
		tagline: string;
	};
	cv: {
		phase: string;
		title: string;
		body: string;
	};
	portfolio: {
		phase: string;
		title: string;
		body: string;
	};
	contact: {
		phase: string;
		title: string;
		body: string;
		cta: string;
	};
	chat: {
		inputPlaceholder: string;
		send: string;
		voiceComingSoon: string;
		thinking: string;
		errorGeneric: string;
		errorRateLimited: string;
		retry: string;
		newConversation: string;
		historyToggleLabel: string;
		historyTitle: string;
		deleteConversation: string;
		retentionNotice: string;
		consent: {
			message: string;
			accept: string;
			reject: string;
			infoToggle: string;
			infoBody: string;
			preferencesLink: string;
			deleteOption: string;
		};
	};
}
