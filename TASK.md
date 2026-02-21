# Task: DevForge — Local Project Dashboard

## Goal
Build and evolve a local dashboard that scans developer project directories, catalogs all apps/projects with metadata, and provides a command center UI for managing what to work on.

## Context
- **Branch:** master
- **Date:** 2026-02-21
- **Repo:** https://github.com/silvesterdivas/devforge
- **Previous sessions:** Initial build session (this one)

## Constraints
- Zero external dependencies — Node.js built-in modules only (http, fs, path, child_process)
- Single file architecture — scan.js contains scanner, server, and HTML template
- GOAT design system enforced — all UI tokens defined in .goat/system.md
- Dark theme only — Boldness & Clarity + Dark Immersive archetype
- Fonts loaded from Google Fonts: Space Grotesk (display), Inter (body), JetBrains Mono (mono)
- Accent color: #00e5a0 (electric green)

## Key Files
- `scan.js` — Scanner + HTTP server + embedded HTML template (the entire app)
- `.goat/system.md` — Design system tokens (colors, typography, spacing, components)
- `config.json` — User-configured scan directories (auto-created at runtime)
- `state.json` — User-set project statuses keyed by slug (auto-created at runtime)
- `docs/plans/2026-02-21-devforge-design.md` — Original v1 design doc
- `docs/plans/2026-02-21-devforge-v2-design.md` — v2 design doc (folder picker + statuses)

## Key Decisions Made
- **Single file (scan.js) over multi-file:** Everything in one file for simplicity
  - *Reasoning:* No build step, easy to copy/share, matches the zero-dependencies philosophy
  - *Rejected:* Separate server.js + index.html — added complexity for no benefit

- **Node HTTP server over static-only:** Upgraded from double-click HTML to --serve mode
  - *Reasoning:* User wanted folder picker UI and status management from the browser, which requires writing to disk
  - *Rejected:* Static HTML + CLI-only (poor UX), localStorage-only for statuses (not portable)

- **Safe git calls via execFileSync:** Uses execFileSync("git", [args]) not shell strings
  - *Reasoning:* Security best practice — avoids shell injection even though data is local

- **Electric green accent (#00e5a0):** Chosen via GOAT init with Bold archetype
  - *Reasoning:* Terminal-green reads as dev credibility, command center feel, pops on near-black
  - *Rejected:* Purple (#8b7cf6) from v1 — too generic

- **state.json over localStorage:** Project statuses persist to a JSON file
  - *Reasoning:* Portable, survives browser clears, version-controllable
  - *Rejected:* localStorage (browser-only), both (unnecessary complexity)

## Approaches Tried & Failed
- None — clean build with no blockers this session.
