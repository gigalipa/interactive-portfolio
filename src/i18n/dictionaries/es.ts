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
} satisfies Dictionary;
