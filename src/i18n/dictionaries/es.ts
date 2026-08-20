import type { Dictionary } from "../dictionary";

export default {
	nav: {
		main: "Inicio",
		cv: "CV",
		portfolio: "Portafolio",
		contact: "Contacto",
	},
	meta: {
		description: "Daniel Peraza — portafolio interactivo impulsado por IA.",
	},
	home: {
		title: "Daniel Peraza — Portafolio Interactivo",
		status: "Señal: en línea",
		tagline:
			"Pregúntame lo que quieras sobre mi trabajo, trayectoria o proyectos.",
	},
	cv: {
		title: "CV",
		tagline:
			"Ingeniero de IA y Automatización | Project Manager | Especializado en Pipelines de LLM (n8n), PLN y Machine Learning",
		summary:
			"Ingeniero Junior de IA y Machine Learning con una sólida base en ingeniería y experiencia práctica diseñando soluciones de IA generativa, agentes de IA multi-modelo y flujos de trabajo empresariales automatizados. Dominio de Python, APIs REST personalizadas, enrutamiento de LLMs (Claude, Gemini, Llama, Hugging Face, EvoLink API), plataformas de orquestación (n8n, Docker), bases de datos vectoriales (pgvector, ChromaDB) y paneles predictivos de ML. Historial comprobado de traducir conceptos técnicos complejos en soluciones de negocio claras, entregar pruebas de concepto (PoC) rápidas y gestionar flujos de productividad automatizados mediante herramientas de línea de comandos y MCPs.",
		sections: {
			professionalExperience: "Experiencia Profesional",
			projects: "Proyectos",
			academicExperience: "Formación Académica y Certificaciones",
			personalInterests: "Intereses Personales y Trayectoria",
		},
		viewProjects: "Ver detalles del proyecto",
		present: "Presente",
		emptySection: "Aún no hay contenido publicado aquí.",
	},
	portfolio: {
		title: "Portafolio",
		intro: "Proyectos y casos de estudio, agrupados por categoría.",
		emptyState: "Aún no hay proyectos publicados — vuelve pronto.",
		backToPortfolio: "← Volver al portafolio",
		linkLabels: {
			demo: "Demo en vivo",
			repo: "Repositorio",
			company: "Empresa",
			certificate: "Certificado",
			article: "Artículo",
			other: "Enlace",
		},
	},
	contact: {
		phase: "Fase 7",
		title: "Contacto",
		body: "Aquí llegarán un formulario de contacto y la reserva de reuniones vía Notion.",
		cta: "Saludar",
	},
	chat: {
		inputPlaceholder: "Pregúntame sobre mi trabajo, experiencia o proyectos...",
		send: "Enviar",
		voiceComingSoon: "Chat de voz (próximamente)",
		voiceStart: "Iniciar chat de voz",
		voiceEndCall: "Finalizar llamada",
		voiceConnecting: "Conectando...",
		voiceErrorGeneric:
			"No se pudo conectar la sesión de voz. Prueba con el chat de texto.",
		voiceMicDenied:
			"Se denegó el acceso al micrófono. Aún puedes usar el chat de texto.",
		thinking: "Pensando...",
		errorGeneric:
			"El avatar no pudo responder en este momento. Inténtalo de nuevo.",
		errorRateLimited:
			"Demasiados mensajes — espera un momento antes de intentarlo de nuevo.",
		retry: "Reintentar",
		newConversation: "Nueva conversación",
		historyToggleLabel: "Historial de conversaciones",
		historyTitle: "Historial",
		deleteConversation: "Eliminar conversación",
		closeHistory: "Cerrar historial",
		retentionNotice:
			"Las conversaciones se conservan durante 30 días de inactividad y luego se eliminan automáticamente. Puedes eliminarlas cuando quieras.",
		consent: {
			message:
				"Este sitio puede recordar tu conversación con el avatar para que puedas continuarla más tarde — eso requiere una pequeña cookie. Sin ella, el chat sigue funcionando, solo que no se guardará.",
			accept: "Aceptar",
			reject: "Rechazar",
			infoToggle: "¿Qué es esta cookie?",
			infoBody:
				"Usamos una sola cookie, visitor_id, solo si aceptas. No contiene datos personales — solo permite encontrar tus conversaciones guardadas cuando regreses. Cloudflare, nuestro proveedor de hosting, también usa algunas cookies de seguridad estrictamente necesarias que no requieren consentimiento.",
			preferencesLink: "Preferencias de cookies",
			deleteOption: "También eliminar mis conversaciones guardadas",
		},
	},
} satisfies Dictionary;
