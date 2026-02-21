#!/usr/bin/env node
/**
 * DevForge v2 — Local Project Dashboard
 *
 * Usage:
 *   node scan.js                  # One-shot static HTML build
 *   node scan.js --serve          # Start live server on :3000
 *   node scan.js --add ~/path     # Add a scan directory
 *   node scan.js --remove ~/path  # Remove a scan directory
 *   node scan.js --list           # List configured directories
 *
 * Data is local-only. All rendered strings are escaped client-side.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const { execFileSync } = require("child_process");
const os = require("os");

const DIR = __dirname;
const CONFIG_PATH = path.join(DIR, "config.json");
const STATE_PATH = path.join(DIR, "state.json");
const OUTPUT = path.join(DIR, "devforge.html");
const DEFAULT_DIRS = [
  path.join(os.homedir(), "claude"),
  path.join(os.homedir(), "claudecode"),
];
const SKIP = new Set([
  "node_modules", ".git", ".next", ".expo", "devforge", "docs", ".DS_Store",
]);
const PORT = 3000;

// ── Config & State ──────────────────────────────────

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return { directories: DEFAULT_DIRS };
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function resolvePath(p) {
  if (p.startsWith("~")) p = path.join(os.homedir(), p.slice(1));
  return path.resolve(p);
}

// ── Scanner Helpers ─────────────────────────────────

function gitExec(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", timeout: 5000 }).trim();
  } catch { return ""; }
}

function titleCase(str) {
  return str.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return days + "d ago";
  if (days < 365) return Math.floor(days / 30) + "mo ago";
  return Math.floor(days / 365) + "y ago";
}

function detectFramework(deps) {
  if (deps["next"]) return "Next.js";
  if (deps["expo"]) return "Expo";
  if (deps["react-native"]) return "React Native";
  if (deps["express"]) return "Express";
  if (deps["fastify"]) return "Fastify";
  if (deps["vue"]) return "Vue";
  if (deps["nuxt"]) return "Nuxt";
  if (deps["svelte"]) return "Svelte";
  if (deps["astro"]) return "Astro";
  if (deps["react"]) return "React";
  return null;
}

function safeReaddir(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}

function detectTechStack(projectPath, pkg) {
  const tags = [];
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const fw = detectFramework(deps);
  if (fw) tags.push(fw);
  if (deps["typescript"] || deps["ts-node"]) tags.push("TypeScript");
  if (deps["tailwindcss"]) tags.push("Tailwind");
  if (deps["prisma"] || deps["@prisma/client"]) tags.push("Prisma");
  if (deps["sqlite3"] || deps["better-sqlite3"] || deps["expo-sqlite"]) tags.push("SQLite");
  if (deps["pg"] || deps["postgres"]) tags.push("PostgreSQL");
  if (tags.length === 0) {
    const files = safeReaddir(projectPath);
    if (files.some(f => f.endsWith(".py"))) tags.push("Python");
    if (files.some(f => f.endsWith(".swift"))) tags.push("Swift");
    if (files.some(f => f.endsWith(".rs"))) tags.push("Rust");
    if (files.some(f => f.endsWith(".go"))) tags.push("Go");
    if (files.some(f => f.endsWith(".html")) && tags.length === 0) tags.push("HTML");
  }
  return tags;
}

function detectProjectType(projectPath, pkg) {
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const files = safeReaddir(projectPath);
  const name = path.basename(projectPath).toLowerCase();
  if (deps["react-native"] || deps["expo"]) return "Mobile App";
  if (deps["express"] || deps["fastify"]) return "API";
  if (deps["next"] || deps["react"] || deps["vue"] || deps["svelte"]) return "Web App";
  if (name.includes("design") || files.some(f => f.includes("DESIGN_SYSTEM"))) return "Design System";
  if (files.some(f => f === "requirements.txt" || f === "pyproject.toml")) return "API";
  const htmlFiles = files.filter(f => f.endsWith(".html"));
  if (htmlFiles.length > 0 && files.length < 10) return "Mockup";
  if (htmlFiles.length > 0) return "Web App";
  return "Project";
}

function countSourceFiles(dir, depth) {
  if (depth === undefined) depth = 0;
  if (depth > 3) return 0;
  let count = 0;
  for (const entry of safeReaddir(dir)) {
    if (SKIP.has(entry) || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    try {
      const s = fs.statSync(full);
      count += s.isDirectory() ? countSourceFiles(full, depth + 1) : 1;
    } catch { /* skip */ }
  }
  return count;
}

function getReadmeExcerpt(dir) {
  for (const name of ["README.md", "readme.md", "Readme.md"]) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) {
      const lines = fs.readFileSync(p, "utf8").split("\n").filter(l => l.trim());
      const desc = lines.find(l => !l.startsWith("#") && !l.startsWith("![") && l.length > 10);
      return (desc || lines[0] || "").slice(0, 200);
    }
  }
  return "";
}

// ── Scanner ─────────────────────────────────────────

function scanProject(projectPath, sourceDir) {
  const name = path.basename(projectPath);
  try { if (!fs.statSync(projectPath).isDirectory()) return null; } catch { return null; }
  if (SKIP.has(name) || name.startsWith(".")) return null;

  let pkg = {};
  const pkgPath = path.join(projectPath, "package.json");
  if (fs.existsSync(pkgPath)) {
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")); } catch { /* skip */ }
  }

  const isGit = fs.existsSync(path.join(projectPath, ".git"));
  let lastCommit = null, commitCount = 0, branch = "";
  if (isGit) {
    lastCommit = gitExec(["log", "-1", "--format=%aI"], projectPath);
    commitCount = parseInt(gitExec(["rev-list", "--count", "HEAD"], projectPath)) || 0;
    branch = gitExec(["rev-parse", "--abbrev-ref", "HEAD"], projectPath);
  }

  let gitStatus = "dormant";
  if (lastCommit) {
    const days = Math.floor((Date.now() - new Date(lastCommit).getTime()) / 86400000);
    if (days <= 7) gitStatus = "active";
    else if (days <= 30) gitStatus = "recent";
  } else {
    const files = safeReaddir(projectPath);
    const mtimes = files.filter(f => !SKIP.has(f)).map(f => {
      try { return fs.statSync(path.join(projectPath, f)).mtimeMs; } catch { return 0; }
    });
    if (mtimes.length > 0) {
      const latest = Math.max(...mtimes);
      const days = Math.floor((Date.now() - latest) / 86400000);
      if (days <= 7) gitStatus = "active";
      else if (days <= 30) gitStatus = "recent";
      lastCommit = new Date(latest).toISOString();
    }
  }

  return {
    name: titleCase(name), slug: name,
    description: getReadmeExcerpt(projectPath) || pkg.description || "",
    tech: detectTechStack(projectPath, pkg),
    type: detectProjectType(projectPath, pkg),
    gitStatus, isGit, lastCommit,
    lastActivity: timeAgo(lastCommit),
    commitCount, branch,
    fileCount: countSourceFiles(projectPath),
    sourceDir: path.basename(sourceDir),
    path: projectPath,
  };
}

function scanAll(config) {
  const dirs = (config || loadConfig()).directories.map(resolvePath);
  const projects = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      const p = scanProject(path.join(dir, entry), dir);
      if (p) projects.push(p);
    }
  }
  projects.sort((a, b) => {
    if (!a.lastCommit && !b.lastCommit) return 0;
    if (!a.lastCommit) return 1;
    if (!b.lastCommit) return -1;
    return new Date(b.lastCommit) - new Date(a.lastCommit);
  });
  return projects;
}

function mergeState(projects, state) {
  return projects.map(p => ({
    ...p,
    userStatus: (state[p.slug] && state[p.slug].userStatus) || null,
  }));
}

// ── HTML Template ───────────────────────────────────

function dashboardHTML(options) {
  const isLive = options && options.live;
  const projects = options && options.projects;
  const config = options && options.config;
  const scannedAt = new Date().toLocaleString();

  // In live mode, data is fetched from API. In static mode, embedded.
  const dataScript = isLive
    ? "var P=[],CFG={directories:[]};fetch('/api/projects').then(r=>r.json()).then(d=>{P=d;init()});fetch('/api/config').then(r=>r.json()).then(d=>{CFG=d});"
    : "var P=" + JSON.stringify(projects) + ";var CFG=" + JSON.stringify(config) + ";";

  // NOTE: All rendered strings are escaped client-side via esc() which uses
  // document.createElement('div').textContent for safe HTML encoding.
  // Data originates exclusively from the local filesystem.
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DevForge</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
<style>
/* ── GOAT Design System: DevForge ──
   Archetype: Boldness & Clarity + Dark Immersive
   Tokens from .goat/system.md — do not hardcode values */

:root {
  /* Backgrounds */
  --bg-primary: #09090b;
  --bg-surface: #131316;
  --bg-elevated: #1c1c22;
  /* Foregrounds */
  --fg-primary: #f0f0f3;
  --fg-muted: #6e6e80;
  /* Accent */
  --accent: #00e5a0;
  --accent-hover: #00cc8e;
  --accent-dim: rgba(0, 229, 160, 0.10);
  --focus-glow: rgba(0, 229, 160, 0.25);
  /* Semantic */
  --border: #23232e;
  --success: #00e5a0;
  --warning: #f59e0b;
  --error: #ef4444;
  /* Radii — small:4 medium:8 large:12 */
  --r-sm: 4px;
  --r-md: 8px;
  --r-lg: 12px;
  /* Typography */
  --font-display: 'Space Grotesk', sans-serif;
  --font-body: 'Inter', -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: var(--font-body);
  background: var(--bg-primary);
  color: var(--fg-primary);
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  font-size: 14px;
  line-height: 1.55;
}

/* ── Layout ── */
.wrap { max-width: 1200px; margin: 0 auto; padding: 48px 24px; }

/* ── Header ── */
.hd { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 48px; }
.hd-left h1 {
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.5px;
  margin-bottom: 8px;
  color: var(--fg-primary);
}
.hd-left h1 span { color: var(--accent); }
.hd-meta { display: flex; gap: 16px; color: var(--fg-muted); font-size: 13px; font-family: var(--font-mono); }
.hd-meta span::before {
  content: '';
  display: inline-block;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--accent);
  margin-right: 8px;
  vertical-align: middle;
  box-shadow: 0 0 6px var(--focus-glow);
}
.gear-btn {
  width: 36px; height: 36px;
  border-radius: var(--r-md);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--fg-muted);
  font-size: 16px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.gear-btn:hover { color: var(--accent); border-color: var(--accent); }
.gear-btn.open { color: var(--accent); background: var(--accent-dim); border-color: var(--accent); }

/* ── Settings Panel ── */
.settings {
  display: none;
  margin-bottom: 32px;
  padding: 20px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.settings.show { display: block; animation: slideIn 0.2s ease; }
.settings h3 {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 400;
  margin-bottom: 12px;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 1.5px;
}
.dir-list { margin-bottom: 12px; }
.dir-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg-primary);
  border-radius: var(--r-sm);
  margin-bottom: 4px;
  font-size: 13px;
  font-family: var(--font-mono);
  color: var(--fg-primary);
}
.dir-rm {
  background: none; border: none;
  color: var(--fg-muted);
  cursor: pointer; font-size: 16px; padding: 0 4px;
  transition: color 0.15s;
}
.dir-rm:hover { color: var(--error); }
.dir-add { display: flex; gap: 8px; }
.dir-input {
  flex: 1;
  padding: 8px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  color: var(--fg-primary);
  font-size: 13px;
  font-family: var(--font-mono);
  outline: none;
}
.dir-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-dim); }
.dir-input::placeholder { color: var(--fg-muted); }
.btn {
  height: 36px;
  padding: 0 16px;
  background: var(--accent);
  border: none;
  border-radius: var(--r-sm);
  color: var(--bg-primary);
  font-size: 13px;
  font-weight: 500;
  font-family: var(--font-body);
  cursor: pointer;
  transition: background 0.15s;
}
.btn:hover { background: var(--accent-hover); }
.btn-outline {
  background: none;
  border: 1px solid var(--border);
  color: var(--fg-muted);
}
.btn-outline:hover { border-color: var(--accent); color: var(--accent); }
.settings-actions { display: flex; gap: 8px; margin-top: 16px; }

/* ── Filters ── */
.fl { display: flex; gap: 8px; margin-bottom: 32px; flex-wrap: wrap; align-items: center; }
.fg {
  display: flex;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
}
.fb {
  padding: 8px 16px;
  background: none;
  border: none;
  color: var(--fg-muted);
  font-size: 13px;
  font-family: var(--font-body);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.fb:hover { color: var(--fg-primary); background: var(--bg-elevated); }
.fb.on { color: var(--accent); background: var(--accent-dim); }
.fb + .fb { border-left: 1px solid var(--border); }
.sr {
  flex: 1; min-width: 200px;
  height: 36px;
  padding: 0 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  color: var(--fg-primary);
  font-size: 13px;
  font-family: var(--font-body);
  outline: none;
  transition: border-color 0.15s;
}
.sr:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-dim); }
.sr::placeholder { color: var(--fg-muted); }

/* ── Stats Bar ── */
.sb {
  display: flex; gap: 32px;
  margin-bottom: 32px;
  padding: 20px 24px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.st { display: flex; flex-direction: column; gap: 4px; }
.sv {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
  color: var(--fg-primary);
}
.sv-accent { color: var(--accent); }
.sl {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* ── Grid ── */
.gr { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }

/* ── Card ── */
.cd {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: 20px;
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
  position: relative;
}
.cd:hover {
  border-color: var(--accent);
  background: var(--bg-elevated);
  box-shadow: 0 0 0 1px var(--accent-dim);
}
.cd.dimmed { opacity: 0.45; }
.cd.dimmed:hover { opacity: 0.7; }
.ch { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
.cn {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.3px;
  color: var(--fg-primary);
}
.ct {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 4px 8px;
  border-radius: var(--r-sm);
  background: var(--accent-dim);
  color: var(--accent);
  white-space: nowrap;
  font-weight: 400;
  letter-spacing: 0.3px;
}
.cs {
  font-size: 13px;
  color: var(--fg-muted);
  line-height: 1.55;
  margin-bottom: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.tg { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px; }
.t {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 4px 8px;
  border-radius: var(--r-sm);
  background: var(--bg-elevated);
  color: var(--fg-muted);
  font-weight: 400;
  border: 1px solid var(--border);
}
.cf { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--fg-muted); }
.cfl { display: flex; align-items: center; gap: 12px; }

/* ── Status Dots ── */
.dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 4px;
  vertical-align: middle;
}
.dot.focus { background: var(--accent); box-shadow: 0 0 8px var(--focus-glow); }
.dot.active { background: #60a5fa; }
.dot.backburner { background: var(--warning); }
.dot.done { background: var(--fg-muted); }
.dot.archived { background: var(--fg-muted); opacity: 0.3; }
.dot.recent { background: var(--warning); }
.dot.dormant { background: var(--fg-muted); opacity: 0.5; }

.sb-badge {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 4px 8px;
  border-radius: var(--r-sm);
  background: var(--bg-primary);
  color: var(--fg-muted);
  border: 1px solid var(--border);
}
.gb { font-family: var(--font-mono); font-size: 11px; opacity: 0.5; }

/* ── Status Selector ── */
.status-sel { position: relative; display: inline-block; }
.status-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  padding: 4px 10px;
  font-size: 11px;
  font-family: var(--font-body);
  cursor: pointer;
  color: var(--fg-muted);
  transition: all 0.15s;
  display: flex; align-items: center; gap: 4px;
}
.status-btn:hover { border-color: var(--accent); color: var(--fg-primary); }
.status-dd {
  display: none;
  position: absolute;
  top: 100%; left: 0;
  margin-top: 4px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
  z-index: 10;
  min-width: 140px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.5);
}
.status-dd.open { display: block; }
.status-opt {
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
  color: var(--fg-muted);
  transition: all 0.1s;
  display: flex; align-items: center; gap: 8px;
}
.status-opt:hover { background: var(--bg-elevated); color: var(--fg-primary); }
.status-opt.current { color: var(--accent); background: var(--accent-dim); }

/* ── Expanded Detail ── */
.dt {
  display: none;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  font-size: 13px;
  color: var(--fg-muted);
  line-height: 1.55;
}
.cd.ex .dt { display: block; }
.cd.ex .cs { -webkit-line-clamp: unset; }
.dr { display: flex; justify-content: space-between; padding: 4px 0; gap: 16px; }
.dl { color: var(--fg-muted); font-family: var(--font-mono); font-size: 11px; white-space: nowrap; }
.dv { color: var(--fg-primary); font-weight: 500; text-align: right; word-break: break-all; }

/* ── Empty State ── */
.em { text-align: center; padding: 80px 20px; color: var(--fg-muted); grid-column: 1 / -1; }
.em-i { font-size: 48px; margin-bottom: 16px; opacity: 0.2; }
.em-t { font-size: 14px; font-family: var(--font-mono); }

/* ── Responsive ── */
@media (max-width: 768px) {
  .wrap { padding: 24px 16px; }
  .gr { grid-template-columns: 1fr; }
  .fl { flex-direction: column; }
  .sb { flex-wrap: wrap; gap: 16px; }
  .hd-left h1 { font-size: 24px; }
}

/* ── Animations ── */
.cd { animation: cardIn 0.3s ease both; }
@keyframes cardIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes slideIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
</style>
</head>
<body>
<div class="wrap">
  <div class="hd">
    <div class="hd-left">
      <h1>Dev<span>Forge</span></h1>
      <div class="hd-meta">
        <span id="pc"></span>
        <span>${scannedAt}</span>
      </div>
    </div>
    <button class="gear-btn" id="gearBtn" title="Settings">&#9881;</button>
  </div>

  <div class="settings" id="settings">
    <h3>Scan Directories</h3>
    <div class="dir-list" id="dirList"></div>
    <div class="dir-add">
      <input class="dir-input" id="dirInput" type="text" placeholder="~/path/to/projects">
      <button class="btn" id="addDirBtn">Add</button>
    </div>
    <div class="settings-actions">
      <button class="btn btn-outline" id="rescanBtn">Rescan Now</button>
    </div>
  </div>

  <div class="fl">
    <div class="fg" id="tf"></div>
    <div class="fg" id="sf">
      <button class="fb on" data-s="all">All</button>
      <button class="fb" data-s="focus">Focus</button>
      <button class="fb" data-s="active">Active</button>
      <button class="fb" data-s="backburner">Backburner</button>
      <button class="fb" data-s="done">Done</button>
      <button class="fb" data-s="archived">Archived</button>
      <button class="fb" data-s="unset">Unset</button>
    </div>
    <input class="sr" type="text" placeholder="Search projects..." id="q">
  </div>

  <div class="sb" id="sb"></div>
  <div class="gr" id="g"></div>
</div>
<script>
${dataScript}
var LIVE=${isLive ? "true" : "false"};
var aT='all',aS='all',sq='';
var STATUSES=['focus','active','backburner','done','archived'];
var STATUS_LABELS={focus:'Focus',active:'Active',backburner:'Backburner',done:'Done',archived:'Archived'};
var STATUS_ICONS={focus:'\\u25CF',active:'\\u25CF',backburner:'\\u25CF',done:'\\u2713',archived:'\\u2014'};

function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML}

function api(method,url,body){
  return fetch(url,{method:method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}).then(function(r){return r.json()});
}

function init(){
  document.getElementById('pc').textContent=P.length+' projects';
  var types=['all'];P.forEach(function(p){if(types.indexOf(p.type)===-1)types.push(p.type)});
  document.getElementById('tf').innerHTML=types.map(function(t){return'<button class="fb'+(t==='all'?' on':'')+'" data-t="'+t+'">'+(t==='all'?'All':esc(t))+'</button>'}).join('');
  buildStats();renderDirs();render();bindEvents();
}

function buildStats(){
  var fc=0,ac=0,gi=0,tc=0,tf=0;
  P.forEach(function(p){
    if(p.userStatus==='focus')fc++;
    if(p.userStatus==='active'||(!p.userStatus&&p.gitStatus==='active'))ac++;
    if(p.isGit)gi++;tc+=p.commitCount;tf+=p.fileCount;
  });
  document.getElementById('sb').innerHTML=
    '<div class="st"><span class="sv">'+P.length+'</span><span class="sl">Total</span></div>'+
    '<div class="st"><span class="sv sv-accent">'+fc+'</span><span class="sl">Focus</span></div>'+
    '<div class="st"><span class="sv">'+ac+'</span><span class="sl">Active</span></div>'+
    '<div class="st"><span class="sv">'+gi+'</span><span class="sl">Git Repos</span></div>'+
    '<div class="st"><span class="sv">'+tc+'</span><span class="sl">Commits</span></div>'+
    '<div class="st"><span class="sv">'+tf+'</span><span class="sl">Files</span></div>';
}

function renderDirs(){
  if(!LIVE)return;
  var list=document.getElementById('dirList');
  if(!CFG.directories)return;
  list.innerHTML=CFG.directories.map(function(d){
    return'<div class="dir-item"><span>'+esc(d)+'</span><button class="dir-rm" data-dir="'+esc(d)+'" title="Remove">&times;</button></div>'
  }).join('');
}

function getDisplayStatus(p){
  return p.userStatus||p.gitStatus||'dormant';
}

function render(){
  var showArchived=aS==='archived';
  var f=P.filter(function(p){
    var ds=getDisplayStatus(p);
    if(!showArchived&&ds==='archived')return false;
    if(aT!=='all'&&p.type!==aT)return false;
    if(aS!=='all'){
      if(aS==='unset')return !p.userStatus;
      return ds===aS;
    }
    if(sq){var q=sq.toLowerCase();return p.name.toLowerCase().indexOf(q)!==-1||p.description.toLowerCase().indexOf(q)!==-1||p.tech.some(function(t){return t.toLowerCase().indexOf(q)!==-1})||p.type.toLowerCase().indexOf(q)!==-1}
    return true;
  });

  // Sort: focus first, then active, then backburner, then rest
  var order={focus:0,active:1,backburner:2,done:3,dormant:3,recent:2,archived:4};
  f.sort(function(a,b){
    var oa=order[getDisplayStatus(a)]||3,ob=order[getDisplayStatus(b)]||3;
    if(oa!==ob)return oa-ob;
    if(!a.lastCommit&&!b.lastCommit)return 0;
    if(!a.lastCommit)return 1;if(!b.lastCommit)return-1;
    return new Date(b.lastCommit)-new Date(a.lastCommit);
  });

  var g=document.getElementById('g');
  if(!f.length){g.innerHTML='<div class="em"><div class="em-i">&#128269;</div><div class="em-t">No projects match your filters</div></div>';return}
  g.innerHTML=f.map(function(p,i){
    var tags=p.tech.map(function(t){return'<span class="t">'+esc(t)+'</span>'}).join('');
    var ds=getDisplayStatus(p);
    var dsLabel=STATUS_LABELS[ds]||(ds.charAt(0).toUpperCase()+ds.slice(1));
    var dimmed=(ds==='done'||ds==='archived')?' dimmed':'';
    return'<div class="cd'+dimmed+'" data-slug="'+esc(p.slug)+'" style="animation-delay:'+(i*.04)+'s">'+
      '<div class="ch"><span class="cn">'+esc(p.name)+'</span><span class="ct">'+esc(p.type)+'</span></div>'+
      '<div class="cs">'+esc(p.description)+'</div>'+
      '<div class="tg">'+tags+'</div>'+
      '<div class="cf"><div class="cfl">'+
        '<div class="status-sel" data-slug="'+esc(p.slug)+'">'+
          '<button class="status-btn"><span class="dot '+ds+'"></span>'+dsLabel+'</button>'+
          '<div class="status-dd">'+
            STATUSES.map(function(s){return'<div class="status-opt'+(ds===s?' current':'')+'" data-status="'+s+'"><span class="dot '+s+'"></span>'+STATUS_LABELS[s]+'</div>'}).join('')+
            '<div class="status-opt'+((!p.userStatus)?' current':'')+'" data-status="clear" style="border-top:1px solid var(--border)"><span style="opacity:.4">&#8709;</span> Clear</div>'+
          '</div>'+
        '</div>'+
        (p.lastActivity?'<span>'+esc(p.lastActivity)+'</span>':'')+
        (p.isGit?'<span class="gb">'+p.commitCount+' commits</span>':'')+
      '</div><span class="sb-badge">~/'+esc(p.sourceDir)+'</span></div>'+
      '<div class="dt">'+
        '<div class="dr"><span class="dl">Path</span><span class="dv">'+esc(p.path)+'</span></div>'+
        (p.branch?'<div class="dr"><span class="dl">Branch</span><span class="dv">'+esc(p.branch)+'</span></div>':'')+
        '<div class="dr"><span class="dl">Files</span><span class="dv">'+p.fileCount+' source files</span></div>'+
        (p.gitStatus?'<div class="dr"><span class="dl">Git Activity</span><span class="dv">'+esc(p.gitStatus)+'</span></div>':'')+
        (p.description?'<div class="dr"><span class="dl">About</span><span class="dv">'+esc(p.description)+'</span></div>':'')+
      '</div></div>'
  }).join('');
}

function setStatus(slug,status){
  var proj=P.find(function(p){return p.slug===slug});
  if(!proj)return;
  if(status==='clear'){proj.userStatus=null}else{proj.userStatus=status}
  if(LIVE){api('POST','/api/state',{slug:slug,userStatus:status==='clear'?null:status})}
  buildStats();render();
}

function bindEvents(){
  // Type filters
  document.getElementById('tf').addEventListener('click',function(e){if(!e.target.matches('.fb'))return;aT=e.target.dataset.t;document.querySelectorAll('#tf .fb').forEach(function(b){b.classList.remove('on')});e.target.classList.add('on');render()});
  // Status filters
  document.getElementById('sf').addEventListener('click',function(e){if(!e.target.matches('.fb'))return;aS=e.target.dataset.s;document.querySelectorAll('#sf .fb').forEach(function(b){b.classList.remove('on')});e.target.classList.add('on');render()});
  // Search
  document.getElementById('q').addEventListener('input',function(e){sq=e.target.value;render()});

  // Card expand + status dropdown
  document.getElementById('g').addEventListener('click',function(e){
    // Status button click
    var btn=e.target.closest('.status-btn');
    if(btn){e.stopPropagation();var dd=btn.nextElementSibling;document.querySelectorAll('.status-dd.open').forEach(function(d){if(d!==dd)d.classList.remove('open')});dd.classList.toggle('open');return}
    // Status option click
    var opt=e.target.closest('.status-opt');
    if(opt){e.stopPropagation();var sel=opt.closest('.status-sel');var slug=sel.dataset.slug;setStatus(slug,opt.dataset.status);return}
    // Card expand
    var cd=e.target.closest('.cd');if(cd)cd.classList.toggle('ex');
  });

  // Close dropdowns on outside click
  document.addEventListener('click',function(){document.querySelectorAll('.status-dd.open').forEach(function(d){d.classList.remove('open')})});

  // Settings gear
  document.getElementById('gearBtn').addEventListener('click',function(){
    var s=document.getElementById('settings');s.classList.toggle('show');this.classList.toggle('open');
  });

  // Add directory
  if(LIVE){
    document.getElementById('addDirBtn').addEventListener('click',function(){
      var input=document.getElementById('dirInput');var dir=input.value.trim();
      if(!dir)return;
      api('POST','/api/config/dirs',{action:'add',directory:dir}).then(function(r){
        if(r.ok){CFG=r.config;renderDirs();input.value=''}
      });
    });
    document.getElementById('dirList').addEventListener('click',function(e){
      var rm=e.target.closest('.dir-rm');if(!rm)return;
      api('POST','/api/config/dirs',{action:'remove',directory:rm.dataset.dir}).then(function(r){
        if(r.ok){CFG=r.config;renderDirs()}
      });
    });
    document.getElementById('rescanBtn').addEventListener('click',function(){
      this.textContent='Scanning...';var self=this;
      api('POST','/api/rescan').then(function(r){P=r;buildStats();render();self.textContent='Rescan Now'});
    });
  }
}

if(!LIVE)init();
</script>
</body>
</html>`;
}

// ── HTTP Server ─────────────────────────────────────

function readBody(req) {
  return new Promise(function(resolve) {
    var chunks = [];
    req.on("data", function(c) { chunks.push(c); });
    req.on("end", function() {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { resolve({}); }
    });
  });
}

function startServer() {
  var cachedProjects = null;

  function getProjects() {
    if (!cachedProjects) {
      var config = loadConfig();
      var state = loadState();
      cachedProjects = mergeState(scanAll(config), state);
    }
    return cachedProjects;
  }

  var server = http.createServer(function(req, res) {
    var url = req.url;
    var method = req.method;

    // CORS for local dev
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    if (url === "/" && method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(dashboardHTML({ live: true }));
      return;
    }

    if (url === "/api/projects" && method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(getProjects()));
      return;
    }

    if (url === "/api/config" && method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(loadConfig()));
      return;
    }

    if (url === "/api/config/dirs" && method === "POST") {
      readBody(req).then(function(body) {
        var config = loadConfig();
        var dir = body.directory;
        if (!dir) { res.writeHead(400); res.end(JSON.stringify({ error: "missing directory" })); return; }
        dir = resolvePath(dir);

        if (body.action === "add") {
          if (config.directories.indexOf(dir) === -1) {
            if (!fs.existsSync(dir)) { res.writeHead(400); res.end(JSON.stringify({ error: "directory does not exist: " + dir })); return; }
            config.directories.push(dir);
            saveConfig(config);
            cachedProjects = null;
          }
        } else if (body.action === "remove") {
          config.directories = config.directories.filter(function(d) { return resolvePath(d) !== dir; });
          saveConfig(config);
          cachedProjects = null;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, config: config }));
      });
      return;
    }

    if (url === "/api/state" && method === "POST") {
      readBody(req).then(function(body) {
        var state = loadState();
        if (!body.slug) { res.writeHead(400); res.end(JSON.stringify({ error: "missing slug" })); return; }
        if (body.userStatus === null) {
          delete state[body.slug];
        } else {
          state[body.slug] = { userStatus: body.userStatus };
        }
        saveState(state);
        // Update cached projects
        if (cachedProjects) {
          cachedProjects.forEach(function(p) {
            if (p.slug === body.slug) p.userStatus = body.userStatus;
          });
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    if (url === "/api/rescan" && method === "POST") {
      cachedProjects = null;
      var projects = getProjects();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(projects));
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(PORT, function() {
    console.log("DevForge running at http://localhost:" + PORT);
    console.log("Press Ctrl+C to stop");
  });
}

// ── CLI ─────────────────────────────────────────────

var args = process.argv.slice(2);

if (args.includes("--serve")) {
  startServer();
} else if (args.includes("--add")) {
  var addIdx = args.indexOf("--add");
  var addDir = args[addIdx + 1];
  if (!addDir) { console.error("Usage: node scan.js --add <path>"); process.exit(1); }
  addDir = resolvePath(addDir);
  if (!fs.existsSync(addDir)) { console.error("Directory does not exist: " + addDir); process.exit(1); }
  var config = loadConfig();
  if (config.directories.map(resolvePath).indexOf(addDir) === -1) {
    config.directories.push(addDir);
    saveConfig(config);
    console.log("Added: " + addDir);
  } else {
    console.log("Already configured: " + addDir);
  }
  console.log("Directories: " + config.directories.join(", "));
} else if (args.includes("--remove")) {
  var rmIdx = args.indexOf("--remove");
  var rmDir = args[rmIdx + 1];
  if (!rmDir) { console.error("Usage: node scan.js --remove <path>"); process.exit(1); }
  rmDir = resolvePath(rmDir);
  var config2 = loadConfig();
  var before = config2.directories.length;
  config2.directories = config2.directories.filter(function(d) { return resolvePath(d) !== rmDir; });
  if (config2.directories.length < before) {
    saveConfig(config2);
    console.log("Removed: " + rmDir);
  } else {
    console.log("Not found: " + rmDir);
  }
  console.log("Directories: " + config2.directories.join(", "));
} else if (args.includes("--list")) {
  var config3 = loadConfig();
  console.log("Scan directories:");
  config3.directories.forEach(function(d) { console.log("  " + d); });
} else {
  // Default: one-shot static build
  console.log("Scanning projects...");
  var config4 = loadConfig();
  var state = loadState();
  var projects = mergeState(scanAll(config4), state);
  console.log("Found " + projects.length + " projects");
  var html = dashboardHTML({ live: false, projects: projects, config: config4 });
  fs.writeFileSync(OUTPUT, html);
  console.log("Dashboard written to " + OUTPUT);
  console.log("Open with: open " + OUTPUT);
  console.log("\nTip: Run 'node scan.js --serve' for live mode with full UI controls");
}
