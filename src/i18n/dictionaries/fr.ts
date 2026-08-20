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
			"Posez-moi vos questions sur mon travail, mon parcours ou mes projets.",
	},
	cv: {
		title: "CV",
		tagline:
			"Ingénieur IA & Automatisation | Chef de projet | Spécialisé en pipelines LLM (n8n), NLP et Machine Learning",
		summary:
			"Ingénieur IA & ML junior doté d'une solide formation en ingénierie et d'une expérience concrète dans la conception de solutions d'IA générative, d'agents IA multi-modèles et de flux de travail métier automatisés. Maîtrise de Python, des API REST personnalisées, du routage de LLM (Claude, Gemini, Llama, Hugging Face, EvoLink API), des plateformes d'orchestration (n8n, Docker), des bases de données vectorielles (pgvector, ChromaDB) et des tableaux de bord prédictifs en ML. Expérience avérée dans la traduction de concepts techniques complexes en solutions métier claires, la livraison rapide de preuves de concept (PoC) et la gestion de flux de productivité automatisés via des outils en ligne de commande et des MCP.",
		sections: {
			professionalExperience: "Expérience Professionnelle",
			projects: "Projets",
			academicExperience: "Formation Académique et Certifications",
			personalInterests: "Centres d'Intérêt et Parcours Personnel",
		},
		viewProjects: "Voir les détails du projet",
		present: "Présent",
		emptySection: "Rien n'a encore été publié ici.",
	},
	portfolio: {
		title: "Portfolio",
		intro: "Projets et études de cas, regroupés par catégorie.",
		emptyState: "Aucun projet publié pour l'instant — revenez bientôt.",
		backToPortfolio: "← Retour au portfolio",
		linkLabels: {
			demo: "Démo en direct",
			repo: "Dépôt",
			company: "Entreprise",
			certificate: "Certificat",
			article: "Article",
			other: "Lien",
		},
	},
	contact: {
		phase: "Phase 7",
		title: "Contact",
		body: "Un formulaire de contact et la prise de rendez-vous via Notion arriveront ici.",
		cta: "Dire bonjour",
	},
	chat: {
		inputPlaceholder:
			"Demandez-moi mon parcours, mon expérience ou mes projets...",
		send: "Envoyer",
		voiceComingSoon: "Chat vocal (bientôt disponible)",
		voiceStart: "Démarrer le chat vocal",
		voiceEndCall: "Terminer l'appel",
		voiceConnecting: "Connexion...",
		voiceErrorGeneric:
			"La session vocale n'a pas pu se connecter. Essayez le chat texte.",
		voiceMicDenied:
			"L'accès au microphone a été refusé. Vous pouvez toujours utiliser le chat texte.",
		thinking: "Réflexion en cours...",
		errorGeneric:
			"L'avatar n'a pas pu répondre pour le moment. Veuillez réessayer.",
		errorRateLimited:
			"Trop de messages — merci de patienter un instant avant de réessayer.",
		retry: "Réessayer",
		newConversation: "Nouvelle conversation",
		historyToggleLabel: "Historique des conversations",
		historyTitle: "Historique",
		deleteConversation: "Supprimer la conversation",
		closeHistory: "Fermer l'historique",
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
