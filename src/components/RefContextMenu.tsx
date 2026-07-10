import { useState } from "react";
import type { RefInfo } from "../api/git";
import { splitRemoteRef } from "../lib/refNames";
import { otherWorktreeBranches } from "../lib/worktrees";
import { useActiveTab, useRepoStore } from "../store/repoStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { ContextMenu, type ContextMenuEntry } from "./ContextMenu";
import { PromptDialog } from "./PromptDialog";

interface RefContextMenuProps {
  x: number;
  y: number;
  ref: RefInfo;
  remotes: string[];
  onClose: () => void;
}

type PromptKind = "rename" | "set-upstream";

export function RefContextMenu({ x, y, ref: target, remotes, onClose }: RefContextMenuProps) {
  const doCheckoutRef = useRepoStore((s) => s.doCheckoutRef);
  const doRenameBranch = useRepoStore((s) => s.doRenameBranch);
  const doSetUpstream = useRepoStore((s) => s.doSetUpstream);
  const doDeleteBranch = useRepoStore((s) => s.doDeleteBranch);
  const doDeleteRemoteBranch = useRepoStore((s) => s.doDeleteRemoteBranch);
  const doPush = useRepoStore((s) => s.doPush);
  const doPushTag = useRepoStore((s) => s.doPushTag);
  const doDeleteTag = useRepoStore((s) => s.doDeleteTag);
  const doDeleteRemoteTag = useRepoStore((s) => s.doDeleteRemoteTag);

  const activeTab = useActiveTab();
  const workingStatus = activeTab?.workingStatus ?? [];
  const hasUncommittedChanges = workingStatus.some(
    (f) => f.indexStatus !== "none" || f.worktreeStatus !== "none",
  );
  const worktreeBranches = otherWorktreeBranches(
    activeTab?.worktrees ?? [],
    activeTab?.repoPath ?? "",
  );
  const worktreePath =
    target.kind === "branch" ? worktreeBranches.get(target.name) : undefined;

  const [promptKind, setPromptKind] = useState<PromptKind | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteRemote, setConfirmDeleteRemote] = useState(false);
  const [confirmCheckout, setConfirmCheckout] = useState(false);

  const dialogOpen =
    promptKind !== null || confirmDelete || confirmDeleteRemote || confirmCheckout;
  const firstRemote = remotes[0] ?? null;

  // `git checkout` only refuses when a changed file's content would actually
  // be overwritten — it carries forward unrelated uncommitted edits without
  // a word, so ask first any time there's working-tree state to protect.
  function checkout() {
    if (hasUncommittedChanges) {
      setConfirmCheckout(true);
    } else {
      doCheckoutRef(target.name);
      onClose();
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
  }

  const items: ContextMenuEntry[] = [];

  if (target.kind === "head" || target.kind === "branch") {
    if (target.kind === "branch") {
      items.push({
        label: worktreePath
          ? `Checkout ${target.name} (checked out in another worktree)`
          : `Checkout ${target.name}`,
        disabled: !!worktreePath,
        onSelect: checkout,
      });
    }
    items.push({ label: "Rename…", onSelect: () => setPromptKind("rename") });
    items.push({ label: "Set upstream…", onSelect: () => setPromptKind("set-upstream") });
    if (target.kind === "head" && firstRemote) {
      items.push({ label: "Push", onSelect: () => { doPush(null); onClose(); } });
    }
    if (target.kind === "branch") {
      items.push({
        label: worktreePath ? "Delete (checked out in another worktree)" : "Delete",
        danger: true,
        disabled: !!worktreePath,
        onSelect: () => setConfirmDelete(true),
      });
    }
  } else if (target.kind === "remote-branch") {
    items.push({
      label: "Checkout (create local branch)",
      onSelect: checkout,
    });
    items.push({
      label: "Delete on remote",
      danger: true,
      onSelect: () => setConfirmDeleteRemote(true),
    });
  } else if (target.kind === "tag") {
    items.push({ label: "Copy tag name", onSelect: () => { copy(target.name); onClose(); } });
    if (firstRemote) {
      items.push({
        label: `Push tag to ${firstRemote}`,
        onSelect: () => { doPushTag(firstRemote, target.name); onClose(); },
      });
    }
    items.push({
      label: "Delete tag",
      danger: true,
      onSelect: () => setConfirmDelete(true),
    });
    if (firstRemote) {
      items.push({
        label: "Delete tag on remote",
        danger: true,
        onSelect: () => setConfirmDeleteRemote(true),
      });
    }
  }

  return (
    <>
      {!dialogOpen && items.length > 0 && (
        <ContextMenu x={x} y={y} items={items} onClose={onClose} />
      )}
      {promptKind === "rename" && (
        <PromptDialog
          title={`Rename ${target.name}`}
          label="New name"
          confirmLabel="Rename"
          initialValue={target.name}
          onCancel={onClose}
          onConfirm={(newName) => {
            doRenameBranch(target.name, newName);
            onClose();
          }}
        />
      )}
      {promptKind === "set-upstream" && (
        <PromptDialog
          title={`Set upstream for ${target.name}`}
          label="Upstream (e.g. origin/main)"
          confirmLabel="Set upstream"
          initialValue={target.upstream ?? (firstRemote ? `${firstRemote}/${target.name}` : "")}
          onCancel={onClose}
          onConfirm={(upstream) => {
            doSetUpstream(target.name, upstream);
            onClose();
          }}
        />
      )}
      {confirmCheckout && (
        <ConfirmDialog
          title={`Checkout "${target.name}"`}
          message={`You have uncommitted changes. Switching to "${target.name}" will fail if it conflicts with them, but if it doesn't, git carries them onto the new branch untouched — they won't be reverted or lost. Continue?`}
          confirmLabel="Checkout"
          onCancel={onClose}
          onConfirm={() => {
            doCheckoutRef(target.name);
            onClose();
          }}
        />
      )}
      {confirmDelete && target.kind === "branch" && (
        <ConfirmDialog
          title="Delete branch"
          message={`Delete local branch "${target.name}"? If it isn't fully merged into your current branch, this will fail.`}
          confirmLabel="Delete"
          danger
          onCancel={onClose}
          onConfirm={() => {
            doDeleteBranch(target.name, false);
            onClose();
          }}
        />
      )}
      {confirmDelete && target.kind === "tag" && (
        <ConfirmDialog
          title="Delete tag"
          message={`Delete local tag "${target.name}"? This doesn't affect the tag on any remote.`}
          confirmLabel="Delete"
          danger
          onCancel={onClose}
          onConfirm={() => {
            doDeleteTag(target.name);
            onClose();
          }}
        />
      )}
      {confirmDeleteRemote && target.kind === "remote-branch" && (
        <ConfirmDialog
          title="Delete remote branch"
          message={`Delete "${splitRemoteRef(target.name).branch}" from ${splitRemoteRef(target.name).remote}? Anyone else tracking this branch will lose it on their next fetch.`}
          confirmLabel="Delete"
          danger
          onCancel={onClose}
          onConfirm={() => {
            const { remote, branch } = splitRemoteRef(target.name);
            doDeleteRemoteBranch(remote, branch);
            onClose();
          }}
        />
      )}
      {confirmDeleteRemote && target.kind === "tag" && firstRemote && (
        <ConfirmDialog
          title="Delete remote tag"
          message={`Delete tag "${target.name}" from ${firstRemote}? Anyone else who fetched it keeps their copy until they prune.`}
          confirmLabel="Delete"
          danger
          onCancel={onClose}
          onConfirm={() => {
            doDeleteRemoteTag(firstRemote, target.name);
            onClose();
          }}
        />
      )}
    </>
  );
}
