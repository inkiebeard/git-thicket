import { useState } from "react";
import type { FileChange, FileStatus, WorkingFileEntry } from "../api/git";
import { isConflicted } from "../lib/conflicts";
import { useActiveTab, useRepoStore } from "../store/repoStore";
import { ConflictResolutionDialog } from "./ConflictResolutionDialog";

const STATUS_LABEL: Record<string, string> = {
  added: "A",
  deleted: "D",
  modified: "M",
  renamed: "R",
  copied: "C",
  "type-changed": "T",
  unmerged: "U",
  untracked: "?",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`file-status status-${status}`}>{STATUS_LABEL[status] ?? "?"}</span>
  );
}

function FileChangeCounts({ insertions, deletions }: { insertions: number; deletions: number }) {
  if (insertions === 0 && deletions === 0) return null;
  return (
    <span className="file-row-changes">
      {insertions > 0 && <span className="file-row-changes-add">+{insertions}</span>}
      {deletions > 0 && <span className="file-row-changes-del">−{deletions}</span>}
    </span>
  );
}

function FileRow({ file }: { file: FileChange }) {
  const selectedFilePath = useActiveTab()?.selectedFilePath ?? null;
  const selectFile = useRepoStore((s) => s.selectFile);
  const isSelected = file.path === selectedFilePath;

  return (
    <button
      className={`file-row${isSelected ? " selected" : ""}`}
      onClick={() => selectFile(file.path)}
      title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
    >
      <StatusBadge status={file.status as FileStatus} />
      <span className="file-row-path">
        {file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
      </span>
      <FileChangeCounts insertions={file.insertions} deletions={file.deletions} />
    </button>
  );
}

function WorkingFileRow({
  entry,
  staged,
  isMultiSelected,
  onSelect,
  onToggleStage,
}: {
  entry: WorkingFileEntry;
  staged: boolean;
  isMultiSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onToggleStage: () => void;
}) {
  const activeTab = useActiveTab();
  const selectedFilePath = activeTab?.selectedFilePath ?? null;
  const selectedFileStaged = activeTab?.selectedFileStaged ?? false;
  const isSelected =
    isMultiSelected || (entry.path === selectedFilePath && staged === selectedFileStaged);
  const status = staged ? entry.indexStatus : entry.worktreeStatus;
  const insertions = staged ? entry.indexInsertions : entry.worktreeInsertions;
  const deletions = staged ? entry.indexDeletions : entry.worktreeDeletions;
  const conflicted = isConflicted(entry);

  return (
    <button
      className={`file-row${isSelected ? " selected" : ""}${conflicted ? " file-row-conflict" : ""}`}
      onClick={onSelect}
      title={
        conflicted
          ? `${entry.path} has a merge conflict — click to resolve`
          : entry.oldPath
            ? `${entry.oldPath} → ${entry.path}`
            : entry.path
      }
    >
      <StatusBadge status={status} />
      <span className="file-row-path">
        {entry.oldPath ? `${entry.oldPath} → ${entry.path}` : entry.path}
      </span>
      <FileChangeCounts insertions={insertions} deletions={deletions} />
      <span
        className="file-row-stage-toggle"
        role="button"
        title={staged ? "Unstage" : "Stage"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleStage();
        }}
      >
        {staged ? "−" : "+"}
      </span>
    </button>
  );
}

interface MultiSelect {
  staged: boolean;
  paths: Set<string>;
  anchor: string | null;
}

const EMPTY_MULTI_SELECT: MultiSelect = { staged: false, paths: new Set(), anchor: null };

function WorkingFileList() {
  const activeTab = useActiveTab();
  const repoPath = activeTab?.repoPath ?? "";
  const workingStatus = activeTab?.workingStatus ?? [];
  const stageAllFiles = useRepoStore((s) => s.stageAllFiles);
  const unstageAllFiles = useRepoStore((s) => s.unstageAllFiles);
  const stageFile = useRepoStore((s) => s.stageFile);
  const unstageFile = useRepoStore((s) => s.unstageFile);
  const stageFiles = useRepoStore((s) => s.stageFiles);
  const unstageFiles = useRepoStore((s) => s.unstageFiles);
  const selectWorkingFile = useRepoStore((s) => s.selectWorkingFile);

  const [multi, setMulti] = useState<MultiSelect>(EMPTY_MULTI_SELECT);
  const [conflictPath, setConflictPath] = useState<string | null>(null);

  const staged = workingStatus.filter((f) => f.indexStatus !== "none");
  const unstaged = workingStatus.filter((f) => f.worktreeStatus !== "none");
  const stagedPaths = staged.map((f) => f.path);
  const unstagedPaths = unstaged.map((f) => f.path);

  if (staged.length === 0 && unstaged.length === 0) {
    return <div className="empty-state">No uncommitted changes</div>;
  }

  // Shift extends/replaces the selection with the range between the anchor
  // (the last plain click) and this row, within the same section — staged
  // and unstaged are different git operations, so a range can't cross them.
  // Ctrl/Cmd toggles just this row in or out of the current selection. A
  // plain click resets to just this row and moves the anchor here.
  function handleSelect(path: string, isStaged: boolean, orderedPaths: string[]) {
    return (e: React.MouseEvent) => {
      if (e.shiftKey && multi.anchor && multi.staged === isStaged) {
        const anchorIdx = orderedPaths.indexOf(multi.anchor);
        const targetIdx = orderedPaths.indexOf(path);
        if (anchorIdx !== -1 && targetIdx !== -1) {
          const [start, end] =
            anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
          setMulti({
            staged: isStaged,
            paths: new Set(orderedPaths.slice(start, end + 1)),
            anchor: multi.anchor,
          });
        }
      } else if ((e.ctrlKey || e.metaKey) && multi.staged === isStaged) {
        setMulti((prev) => {
          const next = new Set(prev.paths);
          if (next.has(path)) next.delete(path);
          else next.add(path);
          return { staged: isStaged, paths: next, anchor: path };
        });
      } else {
        setMulti({ staged: isStaged, paths: new Set([path]), anchor: path });
      }
      selectWorkingFile(path, isStaged);
    };
  }

  function handleToggleStage(path: string, isStaged: boolean) {
    return () => {
      const inSelection =
        multi.staged === isStaged && multi.paths.has(path) && multi.paths.size > 1;
      const paths = inSelection ? [...multi.paths] : [path];
      if (isStaged) {
        if (paths.length > 1) unstageFiles(paths);
        else unstageFile(path);
      } else {
        if (paths.length > 1) stageFiles(paths);
        else stageFile(path);
      }
      if (inSelection) setMulti(EMPTY_MULTI_SELECT);
    };
  }

  const stagedSelection = multi.staged === true && multi.paths.size > 1 ? multi.paths : null;
  const unstagedSelection = multi.staged === false && multi.paths.size > 1 ? multi.paths : null;

  return (
    <div className="file-list working-file-list">
      <div className="file-list-section">
        <div className="file-list-section-header">
          <span>Staged ({staged.length})</span>
          {staged.length > 0 && (
            <button
              className="file-list-section-action"
              onClick={() => {
                if (stagedSelection) {
                  unstageFiles([...stagedSelection]);
                  setMulti(EMPTY_MULTI_SELECT);
                } else {
                  unstageAllFiles();
                }
              }}
            >
              {stagedSelection ? `Unstage selected (${stagedSelection.size})` : "Unstage all"}
            </button>
          )}
        </div>
        <div className="file-list-section-body">
          {staged.length === 0 ? (
            <span className="file-list-section-empty">Nothing staged</span>
          ) : (
            staged.map((f) => (
              <WorkingFileRow
                key={`s-${f.path}`}
                entry={f}
                staged
                isMultiSelected={multi.staged === true && multi.paths.size > 1 && multi.paths.has(f.path)}
                onSelect={
                  isConflicted(f) ? () => setConflictPath(f.path) : handleSelect(f.path, true, stagedPaths)
                }
                onToggleStage={handleToggleStage(f.path, true)}
              />
            ))
          )}
        </div>
      </div>
      <div className="file-list-section">
        <div className="file-list-section-header">
          <span>Changes ({unstaged.length})</span>
          {unstaged.length > 0 && (
            <button
              className="file-list-section-action"
              onClick={() => {
                if (unstagedSelection) {
                  stageFiles([...unstagedSelection]);
                  setMulti(EMPTY_MULTI_SELECT);
                } else {
                  stageAllFiles();
                }
              }}
            >
              {unstagedSelection ? `Stage selected (${unstagedSelection.size})` : "Stage all"}
            </button>
          )}
        </div>
        <div className="file-list-section-body">
          {unstaged.length === 0 ? (
            <span className="file-list-section-empty">Nothing unstaged</span>
          ) : (
            unstaged.map((f) => (
              <WorkingFileRow
                key={`u-${f.path}`}
                entry={f}
                staged={false}
                isMultiSelected={multi.staged === false && multi.paths.size > 1 && multi.paths.has(f.path)}
                onSelect={
                  isConflicted(f)
                    ? () => setConflictPath(f.path)
                    : handleSelect(f.path, false, unstagedPaths)
                }
                onToggleStage={handleToggleStage(f.path, false)}
              />
            ))
          )}
        </div>
      </div>
      {conflictPath && (
        <ConflictResolutionDialog
          repoPath={repoPath}
          path={conflictPath}
          onClose={() => setConflictPath(null)}
        />
      )}
    </div>
  );
}

export function FileList() {
  const activeTab = useActiveTab();
  const commitFiles = activeTab?.commitFiles ?? [];
  const loadingFiles = activeTab?.loadingFiles ?? false;
  const selectedSha = activeTab?.selectedSha ?? null;
  const viewingWorkingTree = activeTab?.viewingWorkingTree ?? false;

  if (viewingWorkingTree) {
    return <WorkingFileList />;
  }
  if (!selectedSha) {
    return <div className="empty-state">Select a commit to see changed files</div>;
  }
  if (loadingFiles) {
    return <div className="empty-state">Loading files…</div>;
  }
  if (commitFiles.length === 0) {
    return <div className="empty-state">No file changes</div>;
  }

  return (
    <div className="file-list">
      {commitFiles.map((f) => (
        <FileRow key={f.path} file={f} />
      ))}
    </div>
  );
}
