# DevForge

Local dashboard that scans your project directories and gives you a command center view of everything you're building.

## Features

- **Auto-discovery** — Scans directories for projects, detects git repos, frameworks, and tech stacks
- **Project statuses** — Set Focus / Active / Backburner / Done / Archived on any project
- **Folder management** — Add or remove scan directories via CLI or the settings UI
- **Filter & search** — Filter by project type, status, or search by name/tech
- **Zero dependencies** — Node.js only, no npm install needed

## Quick Start

```bash
# Live mode (recommended) — full UI controls
node scan.js --serve
# Opens at http://localhost:3000

# Static mode — generates a single HTML file
node scan.js
open devforge.html
```

## CLI

```bash
node scan.js --serve              # Start live dashboard on :3000
node scan.js                      # One-shot static HTML build
node scan.js --add ~/projects     # Add a scan directory
node scan.js --remove ~/projects  # Remove a scan directory
node scan.js --list               # Show configured directories
```

## How It Works

The scanner walks each configured directory one level deep. For each subfolder it extracts:

- Project name and README description
- Tech stack from package.json dependencies
- Framework detection (Next.js, Expo, Express, FastAPI, etc.)
- Git metadata (last commit, commit count, branch)
- Project type classification (Mobile App, Web App, API, Design System, Mockup)
- Source file count

User-set statuses persist to `state.json`. Scan directories persist to `config.json`.

## Files

```
devforge/
├── scan.js          # Scanner + server (single file)
├── config.json      # Scan directories (auto-created)
├── state.json       # Project statuses (auto-created)
├── devforge.html    # Generated static dashboard
└── .goat/system.md  # Design system tokens
```
