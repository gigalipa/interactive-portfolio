/** Imperatively updates the server-rendered PresenceRing's visual state
 * (see src/components/ui/PresenceRing.astro) from client-side chat state.
 * There is exactly one PresenceRing per page. */
export function setPresenceState(state: "idle" | "listening" | "speaking"): void {
	if (typeof document === "undefined") return;
	document.querySelector(".presence-ring")?.setAttribute("data-state", state);
}
