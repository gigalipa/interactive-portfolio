import type { Dictionary } from "../dictionary";

export default {
	nav: {
		main: "Accueil",
		cv: "CV",
		portfolio: "Portfolio",
		contact: "Contact",
	},
	meta: {
		description: "Daniel Peraza — portfolio interactif propulsé par l'IA.",
	},
	home: {
		title: "Daniel Peraza — Portfolio Interactif",
		status: "Signal : en ligne",
		tagline:
			"Posez-moi vos questions sur mon travail, mon parcours ou mes projets — l'interface conversationnelle arrive en Phase 3.",
	},
	cv: {
		phase: "Phase 5",
		title: "CV",
		body: "L'aperçu et les sections déroulantes (expérience, projets, formation, centres d'intérêt) arriveront ici.",
	},
	portfolio: {
		phase: "Phase 6",
		title: "Portfolio",
		body: "Les projets regroupés par catégorie et par ordre chronologique, synchronisés depuis Notion, arriveront ici.",
	},
	contact: {
		phase: "Phase 7",
		title: "Contact",
		body: "Un formulaire de contact et la prise de rendez-vous via Notion arriveront ici.",
		cta: "Dire bonjour",
	},
} satisfies Dictionary;
