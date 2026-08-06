import { expect, test, type Page } from "@playwright/test";

const INPUT_PLACEHOLDER = "Ask me about my work, background, or projects...";
// A real Gemini round-trip (retrieval + generation) is far slower than
// Playwright's 30s default test timeout allows for.
const REPLY_TIMEOUT = 90_000;
const LIVE_MODEL_TEST_TIMEOUT = 180_000;
// The free tier budgets input tokens per minute, and one RAG-augmented prompt is
// a sizeable chunk of it. Space the live specs out so they don't 429 each other.
const QUOTA_COOLDOWN = 35_000;

async function askAndAwaitReply(page: Page, question: string) {
	const input = page.getByPlaceholder(INPUT_PLACEHOLDER);
	await expect(input).toBeVisible();
	await input.fill(question);
	await page.getByRole("button", { name: "Send" }).click();

	const reply = page.getByTestId("chat-bubble-model").first();
	await expect(reply).toBeVisible({ timeout: REPLY_TIMEOUT });
	// The send button re-enables only once the stream is done.
	await expect(page.getByRole("button", { name: "Send" })).toBeEnabled({ timeout: REPLY_TIMEOUT });
	return reply;
}

test("shows the consent banner on first visit and a chat box after accepting", async ({ page }) => {
	await page.goto("/en/");
	await expect(page.getByText(/This site can remember your conversation/)).toBeVisible();
	await page.getByRole("button", { name: "Accept" }).click();
	await expect(page.getByPlaceholder("Ask me about my work, background, or projects...")).toBeVisible();
});

test("rejecting consent still allows sending a message", async ({ page }) => {
	await page.goto("/en/");
	await page.getByRole("button", { name: "Reject" }).click();
	const input = page.getByPlaceholder("Ask me about my work, background, or projects...");
	await expect(input).toBeVisible();
	await input.fill("What's your background?");
	await page.getByRole("button", { name: "Send" }).click();
	await expect(page.getByText("What's your background?")).toBeVisible();
});

test("the history toggle is hidden until a persisted conversation exists", async ({ page }) => {
	await page.goto("/en/");
	await expect(page.getByRole("button", { name: "Conversation history" })).toHaveCount(0);
});

test("consent choice persists across a reload", async ({ page }) => {
	await page.goto("/en/");
	await page.getByRole("button", { name: "Accept" }).click();
	await page.reload();
	await expect(page.getByText(/This site can remember your conversation/)).not.toBeVisible();
	await expect(page.getByPlaceholder("Ask me about my work, background, or projects...")).toBeVisible();
});

// These three drive the real Gemini endpoint. They run one at a time, spaced out,
// and only under chromium: the free-tier quota is a per-minute input-token budget
// that firing them in parallel across both browser projects exhausts, after which
// every request comes back 429. What they cover (streaming render, persistence,
// deletion) is application behaviour rather than anything browser-specific, and
// the specs above still run under both projects.
test.describe("live model round-trips", () => {
	// Configured here rather than via test.setTimeout so the cooldown hook below
	// gets the longer budget too.
	test.describe.configure({ mode: "serial", timeout: LIVE_MODEL_TEST_TIMEOUT });
	test.skip(
		({ browserName }) => browserName !== "chromium",
		"The live-model quota only stretches to one browser project.",
	);

	test.beforeEach(async () => {
		await new Promise((resolve) => setTimeout(resolve, QUOTA_COOLDOWN));
	});

	test("streams the avatar's reply into the transcript", async ({ page }) => {
		await page.goto("/en/");
		await page.getByRole("button", { name: "Reject" }).click();

		const reply = await askAndAwaitReply(page, "Who are you, in one sentence?");

		// The visitor's own optimistically-appended bubble is separate from the reply.
		await expect(page.getByTestId("chat-bubble-user")).toHaveText("Who are you, in one sentence?");
		expect((await reply.innerText()).trim().length).toBeGreaterThan(0);
		// No error bubble alongside it.
		await expect(page.getByRole("alert")).toHaveCount(0);
	});

	test("a persisted conversation is listed in the history sidebar after a reload", async ({ page }) => {
		await page.goto("/en/");
		await page.getByRole("button", { name: "Accept" }).click();
		await askAndAwaitReply(page, "What projects have you worked on?");

		await page.reload();

		const historyToggle = page.getByRole("button", { name: "Conversation history" });
		await expect(historyToggle).toBeVisible();
		await historyToggle.click();
		await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
		await expect(page.getByRole("button", { name: "What projects have you worked on?" })).toBeVisible();
	});

	test("deleting a conversation removes it from the history sidebar", async ({ page }) => {
		await page.goto("/en/");
		await page.getByRole("button", { name: "Accept" }).click();
		await askAndAwaitReply(page, "Tell me about your background.");

		const historyToggle = page.getByRole("button", { name: "Conversation history" });
		await expect(historyToggle).toBeVisible();
		await historyToggle.click();

		const row = page.getByRole("button", { name: "Tell me about your background." });
		await expect(row).toBeVisible();
		await page.getByRole("button", { name: "Delete conversation" }).first().click();

		await expect(row).toHaveCount(0);
	});
});
