# DevForge v2 — Folder Picker + Project Statuses

**Date:** 2026-02-21
**Status:** Approved

## Overview

Add two features to DevForge:
1. User-configurable scan directories (CLI + UI)
2. User-settable project statuses (Focus, Active, Backburner, Done, Archived)

## Architecture

Upgrade scan.js to dual-mode:
- `node scan.js` — one-shot static HTML generation (backward compatible)
- `node scan.js --serve` — local server on :3000 with full UI controls

Zero external dependencies. Node built-in `http`, `fs`, `path`, `child_process`.

## Data Files

- `config.json` — scan directory list
- `state.json` — per-project user statuses (keyed by slug)

## API Endpoints (server mode)

- `GET /` — serve dashboard
- `GET /api/projects` — scanned projects + merged state
- `GET /api/config` — current config
- `POST /api/config/dirs` — add/remove scan directory
- `POST /api/state` — update project user status
- `POST /api/rescan` — trigger re-scan

## CLI

- `node scan.js --serve` — start server
- `node scan.js --add <path>` — add directory
- `node scan.js --remove <path>` — remove directory

## UI Changes

- Settings panel (gear icon): manage directories, trigger rescan
- Status selector on each card: click to cycle through statuses
- Filter bar: All / Focus / Active / Backburner / Done (Archived hidden by default)
- Visual: Focus=green glow, Active=blue, Backburner=amber, Done=dimmed check, Archived=hidden
