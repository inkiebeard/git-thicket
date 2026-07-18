# Thicket

A lightweight, cross-platform git tree viewer. Dark mode only, no bloat —
just a fast way to walk commit history, see what changed, and act on a repo.

- **Branch graph** — color-coded lanes so you can actually follow merges
  and branch points at a glance, with badges showing which branches are
  local-only vs. published to a remote
- **Commit detail** — full author/committer identity, timestamps, and
  parsed `Co-authored-by:` trailers
- **Diffs** — per-file, hunk-collapsible, unified or side-by-side split view
- **Git actions** — fetch, pull, push (with confirm-gated `--force` /
  `--force-with-lease`), stash push/pop
- **Multi-repo tabs** — work across several repos at once; open tabs and
  layout persist between sessions
- **Resizable panes** — drag to taste, it's remembered

Built with [Tauri](https://tauri.app) (Rust shell) + React/TypeScript.
Git data comes from shelling out to your system's `git` binary — no
bundled git implementation, no native library dependency.

## Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- `git` on your `PATH`
- Platform build tools:
  - **Windows**: [MSVC Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf` (Debian/Ubuntu package names — see [Tauri's Linux prerequisites](https://tauri.app/start/prerequisites/) for other distros)

## Getting started

```sh
npm install
npm run tauri dev
```

This starts the Vite dev server and launches the app with hot reload for
both the frontend and the Rust backend.

## Building a release

### Quick local build for your platform

```sh
npm run build:prod
```

Produces a platform-native executable in `src-tauri/target/release/bundle/`:
- **macOS**: `Thicket.app`
- **Windows**: MSI installer
- **Linux**: AppImage

### Platform-specific builds

For macOS, you can build for specific architectures:

```sh
npm run build:prod:macos       # Universal (Intel + Apple Silicon)
npm run build:prod:macos:intel # Intel only
npm run build:prod:macos:arm   # Apple Silicon only
```

Or target specific platforms:

```sh
npm run build:prod:windows
npm run build:prod:linux
```

See [BUILD.md](BUILD.md) for detailed platform-specific instructions and troubleshooting.

### CI/CD release builds

To build all three platforms at once via CI, push a version tag:

```sh
git tag v0.1.0
git push --tags
```

This triggers [`.github/workflows/release.yml`](.github/workflows/release.yml),
which builds each platform on its native runner and attaches the installers
to a draft GitHub Release.

## Project layout

```
src/                    React/TypeScript frontend
  api/git.ts            Typed wrappers around every Tauri command
  store/repoStore.ts    Zustand store — one entry per open repo tab
  lib/                  Pure logic: graph layout, diff parsing, small hooks
  components/           UI: commit graph, diff viewer, toolbar, tabs, etc.
src-tauri/src/
  git.rs                Rust commands that shell out to `git`
  lib.rs                Tauri app setup, command registration
```

See [AGENTS.md](AGENTS.md) for conventions to follow when working in this
codebase, and [PLAN.md](PLAN.md) for the feature backlog.
