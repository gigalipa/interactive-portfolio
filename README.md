# Interactive Portfolio

A multilingual, AI-powered personal portfolio site featuring a RAG-driven conversational
avatar. Visitors can ask questions about my professional, academic, and personal
background via text or voice, browse my CV and project portfolio, and book time with me.

**Status:** Phase 1 (scaffold) in progress — see [`project-roadmap.md`](./project-roadmap.md) for the full
build plan and current phase.

## Features (planned)

- Fully responsive, dark glassmorphic UI (deep blue → electric blue gradients, glow accents)
- Multilingual: English, Spanish, French
- **Main** page: full-screen animated 3D avatar with RAG-backed conversational AI
  - Text chat via `gemma-4-31b-it` (Google AI Studio)
  - Voice chat via Gemini 2.5 Flash Native Audio Dialog (Google AI Studio Live API)
  - Knowledge base grounded in `content/professional`, `content/academic`, `content/personal`, embedded into Chroma Cloud
- **CV** page: overview + accordion sections (experience, projects, academics, interests)
- **Portfolio** page: projects grouped by category and chronology, synced from Notion, each with a detail page
- **Contact** page: contact form + Notion-database-backed meeting booking, synced to Notion Calendar

## Tech stack

| Layer                  | Choice                                                                        | Status    |
| ---------------------- | ----------------------------------------------------------------------------- | --------- |
| Framework              | Astro (`output: 'server'`, React + Tailwind integrations)                     | confirmed |
| Styling                | Tailwind CSS                                                                  | confirmed |
| Package manager        | pnpm                                                                          | confirmed |
| Hosting                | Cloudflare Workers (static assets + server routes, via `@astrojs/cloudflare`) | confirmed |
| LLM (text)             | `gemma-4-31b-it` via Google AI Studio API                                     | confirmed |
| LLM (voice)            | Gemini 2.5 Flash Native Audio Dialog via Google AI Studio API                 | confirmed |
| Vector DB              | Chroma Cloud                                                                  | confirmed |
| Content/booking source | Notion (via Notion API)                                                       | confirmed |
| 3D avatar              | Ready Player Me + TalkingHead.js (proposed, Phase 8)                          | pending   |

Note: Cloudflare has consolidated Pages into Workers — the Astro Cloudflare adapter now
deploys exclusively to Workers (with static assets), not Pages. Functionally equivalent,
different terminology (see roadmap Phase 1.2 for the note on this pivot).

## Project structure

```
.
├── content/            # RAG source material: professional/ academic/ personal/
├── src/
│   ├── layouts/         # Shared Astro layouts
│   ├── pages/            # Routes (and, later, api/* server routes)
│   └── styles/           # Tailwind entrypoint
├── public/               # Static assets
├── astro.config.mjs
├── wrangler.jsonc         # Cloudflare Worker config
├── project-description.txt   # Original project brief
├── project-roadmap.md        # Phased, step-by-step build plan (source of truth)
├── LICENSE
└── README.md
```

## Development

```sh
pnpm install
pnpm dev        # local dev server
pnpm build      # production build (Worker + static assets)
pnpm preview    # preview the Worker build locally via wrangler
```

## License

Source code is MIT licensed — see [`LICENSE`](./LICENSE). Personal content (CV text,
biography, photos, avatar likeness, voice) is **not** covered by the MIT license and
remains all rights reserved — see the note at the bottom of the LICENSE file.
