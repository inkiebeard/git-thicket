# AGENTS.md

Guidance for AI coding agents working in this repo. Read this before making
changes — it captures decisions that aren't obvious from the code alone.

## What this is

A lightweight, cross-platform git tree viewer: Tauri (Rust shell) + React/TS
frontend, dark mode only. See [README.md](README.md) for the feature list
and [PLAN.md](PLAN.md) for the backlog.

## Core architectural decisions (don't relitigate these without asking)

- **Git access is always via the system `git` CLI**, shelled out from Rust
  (`std::process::Command`). No libgit2, no isomorphic-git. If a feature
  needs git data that isn't exposed yet, add a Tauri command in
  `src-tauri/src/git.rs` that runs the right plain-text git subcommand and
  parses its output — don't reach for a git library.
- **No light theme.** `App.css` defines one dark palette via CSS variables.
  Don't add a theme switcher unless explicitly asked.
- **State lives in one Zustand store** (`src/store/repoStore.ts`), keyed by
  open repo tab. Each `RepoTab` holds that repo's commits/refs/selection/etc.
  Components read the active tab via `useActiveTab()` — don't add parallel
  per-component state for things that belong on the tab.
- **Session persistence** is `localStorage` only (open tabs, active tab,
  pane widths, diff view mode, recent repos). No backend/config file.

## Where things go

- `src-tauri/src/git.rs` — one Rust `#[tauri::command]` per git operation,
  returning serde-serializable structs. Register new commands in
  `invoke_handler!` in `lib.rs`.
- `src/api/git.ts` — one typed wrapper function per Rust command. Convert
  snake_case fields from Rust to camelCase here; keep that conversion out
  of components.
- `src/lib/` — pure, framework-free logic (graph layout, diff parsing) and
  small reusable hooks (`useClickOutside`, `useResizableWidths`). If it
  doesn't need React state, it goes here, not in a component.
- `src/components/` — one component per UI concern. Components read state
  via `useActiveTab()` / `useRepoStore()` selectors, never by prop-drilling
  the whole store.

## Known sharp edges

- **Merge commits**: `get_commit_files` deliberately uses `git diff` (not
  `git diff-tree`) against `<sha>^`, because `diff-tree` silently returns
  nothing for merge commits unless you pass `-m`/`-c`. If you touch this
  function, keep using `diff`.
- **Graph rendering**: each commit row is an independent `<svg>`; lane
  continuity across rows depends on `hasIncoming` (top-half connector) and
  `parentLanes`/`passThroughLanes` (bottom-half + full-height connectors)
  all using the *target* lane's color, not the current lane's index. See
  `src/lib/graphLayout.ts` if lines look disconnected or mis-colored again.
- **Diff line backgrounds**: `.diff-line` needs `width: max-content;
  min-width: 100%` inside a `overflow-x: auto` container, or long lines'
  colored background clips at the pane edge instead of scrolling with the
  content. Don't revert this to a plain flex row.
- **Windows dev server flakiness**: in this sandboxed environment,
  `npm run tauri dev` launched via a plain backgrounded shell has died
  unexpectedly more than once. Launch it via
  `Start-Process -FilePath cmd.exe -ArgumentList '...' -WindowStyle Hidden`
  (fully detached from the shell) if you need it to survive.

## Verification checklist before calling a change done

1. `cd src-tauri && cargo check` — Rust changes compile
2. `npx tsc --noEmit` — frontend type-checks
3. If the dev server is running, confirm the relevant HMR/rebuild log line
   shows success and the `thicket` process is still alive
   (`Get-Process -Name thicket`)
4. For anything touching git command output parsing, sanity-check against
   a real repo with actual branch/merge history — there are several under
   `~/Documents/dev/` on this machine

## Commit style

Conventional-ish: `type(scope): summary`, e.g. `feat(ui): ...`,
`fix(backend): ...`, `chore: ...`, `ci: ...`. Keep the body focused on
*why*, not a line-by-line diff summary.
