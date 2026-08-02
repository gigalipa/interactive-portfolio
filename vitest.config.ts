import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./tests/setup.ts"],
		include: ["src/**/*.{test,spec}.{ts,tsx}"],
		exclude: ["tests/e2e/**"],
		coverage: {
			provider: "v8",
			reporter: ["text", "html"],
		},
	},
});
