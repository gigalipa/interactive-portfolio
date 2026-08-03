import { expect, test } from "@playwright/test";

test("root redirects to a locale-prefixed homepage", async ({ page }) => {
	await page.goto("/");
	await expect(page).toHaveURL(/\/(en|es|fr)\/$/);
	await expect(page).toHaveTitle(/Daniel Peraza/);
});

test("english homepage loads", async ({ page }) => {
	await page.goto("/en/");
	await expect(page).toHaveTitle(/Daniel Peraza/);
	await expect(page.locator("h1")).toHaveText("Daniel Peraza");
});

for (const [locale, navMain] of [
	["en", "Main"],
	["es", "Inicio"],
	["fr", "Accueil"],
] as const) {
	test(`${locale} nav is localized`, async ({ page }) => {
		await page.goto(`/${locale}/`);
		await page.click("summary");
		await expect(
			page.getByRole("link", { name: navMain, exact: true }),
		).toBeVisible();
	});
}

test("language switcher preserves the current route", async ({ page }) => {
	await page.goto("/en/cv");
	await page.click("summary");
	await page.getByRole("link", { name: "ES" }).click();
	await expect(page).toHaveURL(/\/es\/cv$/);
});
