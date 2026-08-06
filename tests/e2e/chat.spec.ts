import { expect, test } from "@playwright/test";

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
