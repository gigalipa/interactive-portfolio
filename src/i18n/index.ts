import type { Dictionary } from "./dictionary";
import type { Locale } from "./locales";
import en from "./dictionaries/en";
import es from "./dictionaries/es";
import fr from "./dictionaries/fr";

const dictionaries: Record<Locale, Dictionary> = { en, es, fr };

export function getDictionary(locale: Locale): Dictionary {
	return dictionaries[locale];
}

export { locales, defaultLocale, localeLabels, type Locale } from "./locales";
export type { Dictionary } from "./dictionary";
