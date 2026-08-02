// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintPluginAstro from "eslint-plugin-astro";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

// NOTE: eslint-plugin-react / eslint-plugin-jsx-a11y are not yet compatible
// with ESLint 10's flat config runtime (crash on load), while
// eslint-plugin-astro requires ESLint 10. Dropped the React-specific lint
// rules for now; TS + Astro linting still catch real issues, JSX still
// type-checks via `astro check`. Revisit once the plugins catch up.
export default tseslint.config(
	{
		ignores: ["dist/**", ".astro/**", ".wrangler/**", "node_modules/**"],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	...eslintPluginAstro.configs.recommended,
	{
		files: ["**/*.{ts,tsx,js,jsx}"],
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
		},
	},
	eslintConfigPrettier,
);
