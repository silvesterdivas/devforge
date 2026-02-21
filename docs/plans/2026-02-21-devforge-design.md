# DevForge — Local Project Dashboard

**Date:** 2026-02-21
**Status:** Approved

## Overview

A local dashboard that scans `~/claude/` and `~/claudecode/` to catalog all projects. A Node.js scanner extracts metadata and generates a single self-contained HTML file.

## Architecture

Two files:
- `scan.js` — Node script that scans directories and outputs `devforge.html`
- `devforge.html` — Generated self-contained dashboard (data embedded as JSON)

No server, no build step, no external dependencies.

## Scanner (`scan.js`)

Walks target directories one level deep. For each subfolder:
- **Name** — folder name, title-cased
- **Description** — first line of README.md
- **Tech stack** — parsed from package.json dependencies, file extensions
- **Framework** — detected (Next.js, Expo, Express, FastAPI, etc.)
- **Git status** — repo check, last commit date, commit count, branch
- **Project type** — auto-classified: Mobile App, Web App, Design System, Mockup, Tool, API
- **File count** — source files excluding node_modules/.git
- **Source directory** — which parent dir (claude vs claudecode)

## Dashboard UI

- **Header:** Project name, total count, last scanned timestamp
- **Filters:** By type, by activity status, sort options
- **Card grid:** Responsive cards with name, description, tech badges, status dot, last activity, commit count, source badge, type tag
- **Expand:** Click card for README excerpt and file tree
- **Theme:** Dark, clean typography, no framework — vanilla CSS

## Usage

```bash
node scan.js
open devforge.html
```
