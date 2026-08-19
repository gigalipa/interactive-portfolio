/// <reference types="astro/client" />

interface ImportMetaEnv {
	readonly NOTION_TOKEN: string;
	readonly GOOGLE_API_KEY_LLM: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
