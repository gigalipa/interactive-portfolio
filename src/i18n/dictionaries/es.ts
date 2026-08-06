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
			"Pregúntame lo que quieras sobre mi trabajo, trayectoria o proyectos — la interfaz conversacional llega en la Fase 3.",
	},
	cv: {
		phase: "Fase 5",
		title: "CV",
		body: "Aquí llegarán el resumen y las secciones desplegables (experiencia, proyectos, formación, intereses).",
	},
	portfolio: {
		phase: "Fase 6",
		title: "Portafolio",
		body: "Proyectos agrupados por categoría y orden cronológico, sincronizados desde Notion, llegarán aquí.",
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
		thinking: "Pensando...",
		errorGeneric: "El avatar no pudo responder en este momento. Inténtalo de nuevo.",
		errorRateLimited:
			"Demasiados mensajes — espera un momento antes de intentarlo de nuevo.",
		retry: "Reintentar",
		newConversation: "Nueva conversación",
		historyToggleLabel: "Historial de conversaciones",
		historyTitle: "Historial",
		deleteConversation: "Eliminar conversación",
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
