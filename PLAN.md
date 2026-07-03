# PLAN.md

Living backlog for Thicket. Not a roadmap with dates — just what's shipped,
what's explicitly next, and ideas worth remembering. Move items between
sections as they're picked up; delete rather than let this rot.

## Shipped (v1)

- Branch graph with color-coded lanes, merge/branch connectors
- Local-only vs. published branch badges (upstream tracking)
- Commit detail panel: author/committer identity, full dates, co-authors
- Per-file diffs: unified + split view, collapsible hunks
- Fetch / pull / push (with confirm-gated `--force`, `--force-with-lease`)
- Stash push / pop
- Multi-repo tabs with session persistence
- Resizable panes
- Cross-platform release CI (Windows/macOS/Linux via GitHub Actions)

## Next up

- [ ] Staging + commit creation & branch creation via right click menu
- [ ] Interactive rebase / cherry-pick
- [ ] Automated tests (currently none — verification has been manual
  cargo check / tsc / run-and-click)
- [ ] Pagination/lazy-load beyond the initial commit window for very large repos
- [ ] Search/filter commits (by message, author, path)
- [ ] Syntax highlighting in diffs (currently plain +/- color coding only)
- [ ] Ahead/behind counts on branch badges, not just published/local
- [ ] Windows installer: bundle/auto-install WebView2 runtime fallback for
      machines that don't already have it

## Ideas / not committed to

- Blame view
- Merge conflict resolution UI
- Light theme toggle (currently dark-only by design, see AGENTS.md)
- Keyboard navigation (j/k through commits, etc.)


## How to add to this doc

When a user requests a feature that isn't getting built right now, add it
under "Next up" or "Ideas" with a one-line description — not a full design.
When something ships, move its line to "Shipped" and collapse it to a
summary; don't keep duplicate detail that's now in the README.
