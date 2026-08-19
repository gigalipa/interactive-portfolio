/** Imperatively updates the server-rendered PresenceRing's visual state
 * (see src/components/ui/PresenceRing.astro) from client-side chat state.
 * There is exactly one PresenceRing per page. */
export function setPresenceState(state: "idle" | "listening" | "speaking"): void {
	if (typeof document === "undefined") return;
	document.querySelector(".presence-ring")?.setAttribute("data-state", state);
}

export function setVoiceMode(active: boolean): void {
	if (typeof document === "undefined") return;
	document.querySelector(".presence-ring")?.setAttribute("data-voice", String(active));
}

/** level: 0-1 output amplitude. Only meaningful while the ring is in the
 * "speaking" state — the caller is responsible for only calling this then. */
export function setVoicePulseRate(level: number): void {
	if (typeof document === "undefined") return;
	const ring = document.querySelector<HTMLElement>(".presence-ring");
	if (!ring) return;
	const seconds = 1.1 - level * 0.6;
	ring.style.setProperty("--pulse-rate", `${Math.max(seconds, 0.5)}s`);
}
