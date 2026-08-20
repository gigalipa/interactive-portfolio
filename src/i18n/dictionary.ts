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
		title: string;
		tagline: string;
		summary: string;
		sections: {
			professionalExperience: string;
			projects: string;
			academicExperience: string;
			personalInterests: string;
		};
		viewProjects: string;
		present: string;
		emptySection: string;
	};
	portfolio: {
		title: string;
		intro: string;
		emptyState: string;
		backToPortfolio: string;
		linkLabels: {
			demo: string;
			repo: string;
			company: string;
			certificate: string;
			article: string;
			other: string;
		};
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
		voiceStart: string;
		voiceEndCall: string;
		voiceConnecting: string;
		voiceErrorGeneric: string;
		voiceMicDenied: string;
		thinking: string;
		errorGeneric: string;
		errorRateLimited: string;
		retry: string;
		newConversation: string;
		historyToggleLabel: string;
		historyTitle: string;
		deleteConversation: string;
		closeHistory: string;
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
