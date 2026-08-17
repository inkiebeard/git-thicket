import { useState } from "react";
import type { RefInfo } from "../api/git";
import { splitRemoteRef } from "../lib/refNames";
import { otherWorktreeBranches } from "../lib/worktrees";
import { useActiveTab, useRepoStore } from "../store/repoStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { ContextMenu, type ContextMenuEntry } from "./ContextMenu";
import { CreatePullRequestDialog } from "./CreatePullRequestDialog";
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
  const doRebaseBranch = useRepoStore((s) => s.doRebaseBranch);
  const doMergeBranch = useRepoStore((s) => s.doMergeBranch);
  const doCreatePullRequest = useRepoStore((s) => s.doCreatePullRequest);

  const toggleRefFilter = useRepoStore((s) => s.toggleRefFilter);
  const activeTab = useActiveTab();
  const repoPath = activeTab?.repoPath ?? null;
  const refFilter = activeTab?.refFilter ?? [];
  const currentBranch = activeTab?.branch;
  const commits = activeTab?.commits ?? [];
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
  const refs = activeTab?.refs ?? [];

  const localBranchNames = Array.from(
    new Set(
      refs
        .filter((r) => r.kind === "branch" || r.kind === "head")
        .map((r) => r.name),
    ),
  );
  const remoteBranchNames = Array.from(
    new Set(
      refs
        .filter((r) => r.kind === "remote-branch")
        .map((r) => splitRemoteRef(r.name).branch),
    ),
  );

  const sourceBranch =
    target.kind === "remote-branch"
      ? splitRemoteRef(target.name).branch
      : target.name;

  const availableTargetBranches = Array.from(
    new Set([...localBranchNames, ...remoteBranchNames]),
  ).filter((b) => b && b !== sourceBranch);

  function defaultTargetBranchForPr(): string {
    const preferred = ["main", "master"];
    for (const candidate of preferred) {
      if (candidate !== sourceBranch && availableTargetBranches.includes(candidate)) {
        return candidate;
      }
    }
    if (currentBranch && currentBranch !== sourceBranch) return currentBranch;
    return availableTargetBranches[0] ?? sourceBranch;
  }

  const defaultPrTargetBranch = defaultTargetBranchForPr();
  const sourceCommitSubject = commits.find((c) => c.hash === target.hash)?.subject?.trim() ?? "";
  const defaultPrTitle = sourceCommitSubject || `Merge ${sourceBranch} into ${defaultPrTargetBranch}`;

  const [promptKind, setPromptKind] = useState<PromptKind | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteRemote, setConfirmDeleteRemote] = useState(false);
  const [confirmCheckout, setConfirmCheckout] = useState(false);
  const [confirmRebaseToRef, setConfirmRebaseToRef] = useState(false);
  const [confirmMergeToRef, setConfirmMergeToRef] = useState(false);
  const [showCreatePR, setShowCreatePR] = useState(false);

  const dialogOpen =
    promptKind !== null ||
    confirmDelete ||
    confirmDeleteRemote ||
    confirmCheckout ||
    confirmRebaseToRef ||
    confirmMergeToRef ||
    showCreatePR;
  const firstRemote = remotes[0] ?? null;
  const canMergeIntoCurrent =
    !!currentBranch &&
    !((target.kind === "branch" || target.kind === "head") && target.name === currentBranch);

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

  function addIntegrateActions(refName: string) {
    items.push({
      label: currentBranch ? `Merge ${refName} into ${currentBranch}` : "Merge into current branch",
      disabled: !canMergeIntoCurrent,
      onSelect: () => setConfirmMergeToRef(true),
    });
    items.push({
      label: `Rebase current branch onto ${refName}`,
      disabled: !currentBranch,
      onSelect: () => setConfirmRebaseToRef(true),
    });
  }

  if (repoPath) {
    const isFiltered = refFilter.includes(target.name);
    items.push({
      label: isFiltered ? `Remove ${target.name} from filter` : `Filter by ${target.name}`,
      onSelect: () => {
        toggleRefFilter(repoPath, target.name);
        onClose();
      },
    });
    items.push({ separator: true });
  }

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
    items.push({ label: "Copy ref name", onSelect: () => { copy(target.name); onClose(); } });
    addIntegrateActions(target.name);
    items.push({ label: "Rename…", onSelect: () => setPromptKind("rename") });
    items.push({ label: "Set upstream…", onSelect: () => setPromptKind("set-upstream") });
    if (target.kind === "head" && firstRemote) {
      items.push({ label: "Push", onSelect: () => { doPush(null); onClose(); } });
    }
    if (target.kind === "branch" || target.kind === "head") {
      items.push({
        label: "Create pull request…",
        onSelect: () => setShowCreatePR(true),
      });
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
    const { branch } = splitRemoteRef(target.name);
    items.push({ label: "Copy ref name", onSelect: () => { copy(branch); onClose(); } });
    addIntegrateActions(target.name);
    items.push({
      label: "Create pull request…",
      onSelect: () => setShowCreatePR(true),
    });
    items.push({
      label: "Delete on remote",
      danger: true,
      onSelect: () => setConfirmDeleteRemote(true),
    });
  } else if (target.kind === "tag") {
    items.push({ label: "Copy tag name", onSelect: () => { copy(target.name); onClose(); } });
    addIntegrateActions(target.name);
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
      {confirmRebaseToRef && (
        <ConfirmDialog
          title="Rebase current branch"
          message={`Rebase ${currentBranch} onto ${target.name}?`}
          confirmLabel="Rebase"
          onCancel={onClose}
          onConfirm={() => {
            doRebaseBranch(target.name);
            onClose();
          }}
        />
      )}
      {confirmMergeToRef && (
        <ConfirmDialog
          title="Merge into current branch"
          message={`Merge ${target.name} into ${currentBranch}?`}
          confirmLabel="Merge"
          onCancel={onClose}
          onConfirm={() => {
            doMergeBranch(target.name);
            onClose();
          }}
        />
      )}
      {showCreatePR && (target.kind === "branch" || target.kind === "head" || target.kind === "remote-branch") && (
        <CreatePullRequestDialog
          repoPath={activeTab?.repoPath ?? ""}
          currentBranch={sourceBranch}
          defaultTargetBranch={defaultPrTargetBranch}
          defaultTitle={defaultPrTitle}
          availableTargetBranches={availableTargetBranches.length > 0 ? availableTargetBranches : [defaultPrTargetBranch]}
          onCancel={() => setShowCreatePR(false)}
          onConfirm={(targetBranch, title, description, draft) => {
            doCreatePullRequest(sourceBranch, targetBranch, title, description, draft);
            setShowCreatePR(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
