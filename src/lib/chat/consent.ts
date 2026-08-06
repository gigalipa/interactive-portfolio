export type ConsentChoice = "accepted" | "rejected";

const STORAGE_KEY = "chat_consent";

export function getConsent(): ConsentChoice | null {
	if (typeof window === "undefined") return null;
	const value = window.localStorage.getItem(STORAGE_KEY);
	return value === "accepted" || value === "rejected" ? value : null;
}

export function setConsent(choice: ConsentChoice): void {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(STORAGE_KEY, choice);
}
