import { useState } from "react";
import type { CommitInfo, RefInfo, ResetMode } from "../api/git";
import { useRepoStore } from "../store/repoStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { ContextMenu, type ContextMenuEntry } from "./ContextMenu";
import { PromptDialog } from "./PromptDialog";

interface CommitContextMenuProps {
  x: number;
  y: number;
  commit: CommitInfo;
  /** Local branches whose tip is this commit. */
  branches: RefInfo[];
  onClose: () => void;
}

export function CommitContextMenu({
  x,
  y,
  commit,
  branches,
  onClose,
}: CommitContextMenuProps) {
  const doCheckoutRef = useRepoStore((s) => s.doCheckoutRef);
  const doCreateBranch = useRepoStore((s) => s.doCreateBranch);
  const doDeleteBranch = useRepoStore((s) => s.doDeleteBranch);
  const doCreateTag = useRepoStore((s) => s.doCreateTag);
  const doCherryPick = useRepoStore((s) => s.doCherryPick);
  const doRevertCommit = useRepoStore((s) => s.doRevertCommit);
  const doResetToCommit = useRepoStore((s) => s.doResetToCommit);

  const [promptMode, setPromptMode] = useState<"branch" | "tag" | null>(null);
  const [resetMode, setResetMode] = useState<ResetMode | null>(null);
  const [deleteBranchName, setDeleteBranchName] = useState<string | null>(null);

  const sha = commit.hash;
  const dialogOpen = promptMode !== null || resetMode !== null || deleteBranchName !== null;

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
  }

  const items: ContextMenuEntry[] = [
    { label: "Copy SHA", onSelect: () => copy(sha) },
    { label: "Copy short SHA", onSelect: () => copy(sha.slice(0, 7)) },
    { label: "Copy commit message", onSelect: () => copy(commit.subject) },
    { separator: true },
    { label: "Checkout this commit (detached HEAD)", onSelect: () => doCheckoutRef(sha) },
    { label: "Create branch here…", onSelect: () => setPromptMode("branch") },
    { label: "Cherry-pick onto current branch", onSelect: () => doCherryPick(sha) },
    { label: "Revert commit", onSelect: () => doRevertCommit(sha) },
    { label: "Reset current branch → Soft", onSelect: () => setResetMode("soft") },
    { label: "Reset current branch → Mixed", onSelect: () => setResetMode("mixed") },
    { label: "Reset current branch → Hard", onSelect: () => setResetMode("hard"), danger: true },
    { label: "Create tag…", onSelect: () => setPromptMode("tag") },
  ];

  if (branches.length > 0) {
    items.push({ separator: true });
    for (const b of branches) {
      items.push({ label: `Checkout ${b.name}`, onSelect: () => doCheckoutRef(b.name) });
      items.push({
        label: `Delete ${b.name}`,
        danger: true,
        onSelect: () => setDeleteBranchName(b.name),
      });
    }
  }

  return (
    <>
      {!dialogOpen && <ContextMenu x={x} y={y} items={items} onClose={onClose} />}
      {promptMode === "branch" && (
        <PromptDialog
          title="Create branch"
          label="Branch name"
          confirmLabel="Create"
          onCancel={onClose}
          onConfirm={(name) => {
            doCreateBranch(name, sha);
            onClose();
          }}
        />
      )}
      {promptMode === "tag" && (
        <PromptDialog
          title="Create tag"
          label="Tag name"
          confirmLabel="Create"
          onCancel={onClose}
          onConfirm={(name) => {
            doCreateTag(name, sha);
            onClose();
          }}
        />
      )}
      {resetMode && (
        <ConfirmDialog
          title={`Reset current branch (${resetMode})`}
          message={
            resetMode === "hard"
              ? `This discards all uncommitted changes and moves the current branch to ${sha.slice(0, 7)}. This cannot be undone.`
              : `This moves the current branch to ${sha.slice(0, 7)}.`
          }
          confirmLabel="Reset"
          danger={resetMode === "hard"}
          onCancel={onClose}
          onConfirm={() => {
            doResetToCommit(sha, resetMode);
            onClose();
          }}
        />
      )}
      {deleteBranchName && (
        <ConfirmDialog
          title="Delete branch"
          message={`Delete local branch "${deleteBranchName}"? If it isn't fully merged into your current branch, this will fail.`}
          confirmLabel="Delete"
          danger
          onCancel={onClose}
          onConfirm={() => {
            doDeleteBranch(deleteBranchName, false);
            onClose();
          }}
        />
      )}
    </>
  );
}
