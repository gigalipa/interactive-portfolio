# Interactive Portfolio

A multilingual, AI-powered personal portfolio site featuring a RAG-driven conversational
avatar. Visitors can ask questions about my professional, academic, and personal
background via text or voice, browse my CV and project portfolio, and book time with me.

**Status:** pre-scaffold — see [`project-roadmap.md`](./project-roadmap.md) for the full
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

| Layer | Choice | Status |
|---|---|---|
| Framework | Astro (proposed) | pending confirmation |
| Styling | Tailwind CSS (proposed) | pending confirmation |
| Hosting | Cloudflare Pages | confirmed |
| LLM (text) | `gemma-4-31b-it` via Google AI Studio API | confirmed |
| LLM (voice) | Gemini 2.5 Flash Native Audio Dialog via Google AI Studio API | confirmed |
| Vector DB | Chroma Cloud | confirmed |
| Content/booking source | Notion (via Notion API) | confirmed |
| 3D avatar | Ready Player Me + TalkingHead.js (proposed, Phase 8) | pending |

See `project-roadmap.md` Phase 1.1 for open stack decisions.

## Project structure

```
.
├── content/            # RAG source material: professional/ academic/ personal/
├── project-description.txt   # Original project brief
├── project-roadmap.md        # Phased, step-by-step build plan (source of truth)
├── LICENSE
└── README.md
```

(Application source will be added once the framework scaffold lands — Phase 1.2 of the roadmap.)

## Development

Setup instructions will be added once the project is scaffolded (Phase 1.2).

## License

Source code is MIT licensed — see [`LICENSE`](./LICENSE). Personal content (CV text,
biography, photos, avatar likeness, voice) is **not** covered by the MIT license and
remains all rights reserved — see the note at the bottom of the LICENSE file.
