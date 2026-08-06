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
	chat: {
		inputPlaceholder: "Demandez-moi mon parcours, mon expérience ou mes projets...",
		send: "Envoyer",
		voiceComingSoon: "Chat vocal (bientôt disponible)",
		thinking: "Réflexion en cours...",
		errorGeneric: "L'avatar n'a pas pu répondre pour le moment. Veuillez réessayer.",
		errorRateLimited:
			"Trop de messages — merci de patienter un instant avant de réessayer.",
		retry: "Réessayer",
		newConversation: "Nouvelle conversation",
		historyToggleLabel: "Historique des conversations",
		historyTitle: "Historique",
		deleteConversation: "Supprimer la conversation",
		retentionNotice:
			"Les conversations sont conservées pendant 30 jours d'inactivité, puis supprimées automatiquement. Vous pouvez les supprimer à tout moment.",
		consent: {
			message:
				"Ce site peut mémoriser votre conversation avec l'avatar pour que vous puissiez la reprendre plus tard — cela nécessite un petit cookie. Sans lui, le chat fonctionne quand même, il ne sera simplement pas sauvegardé.",
			accept: "Accepter",
			reject: "Refuser",
			infoToggle: "Qu'est-ce que ce cookie ?",
			infoBody:
				"Nous utilisons un seul cookie, visitor_id, uniquement si vous acceptez. Il ne contient aucune donnée personnelle — il permet simplement de retrouver vos conversations enregistrées à votre retour. Cloudflare, notre hébergeur, utilise aussi quelques cookies de sécurité strictement nécessaires qui ne nécessitent pas de consentement.",
			preferencesLink: "Préférences de cookies",
			deleteOption: "Supprimer également mes conversations enregistrées",
		},
	},
} satisfies Dictionary;
