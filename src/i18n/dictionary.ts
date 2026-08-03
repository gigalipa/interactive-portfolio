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
}
