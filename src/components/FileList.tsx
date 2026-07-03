import type { FileChange, FileStatus, WorkingFileEntry } from "../api/git";
import { useActiveTab, useRepoStore } from "../store/repoStore";

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
}: {
  entry: WorkingFileEntry;
  staged: boolean;
}) {
  const activeTab = useActiveTab();
  const selectedFilePath = activeTab?.selectedFilePath ?? null;
  const selectedFileStaged = activeTab?.selectedFileStaged ?? false;
  const selectWorkingFile = useRepoStore((s) => s.selectWorkingFile);
  const stageFile = useRepoStore((s) => s.stageFile);
  const unstageFile = useRepoStore((s) => s.unstageFile);
  const isSelected = entry.path === selectedFilePath && staged === selectedFileStaged;
  const status = staged ? entry.indexStatus : entry.worktreeStatus;
  const insertions = staged ? entry.indexInsertions : entry.worktreeInsertions;
  const deletions = staged ? entry.indexDeletions : entry.worktreeDeletions;

  return (
    <button
      className={`file-row${isSelected ? " selected" : ""}`}
      onClick={() => selectWorkingFile(entry.path, staged)}
      title={entry.oldPath ? `${entry.oldPath} → ${entry.path}` : entry.path}
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
          if (staged) unstageFile(entry.path);
          else stageFile(entry.path);
        }}
      >
        {staged ? "−" : "+"}
      </span>
    </button>
  );
}

function WorkingFileList() {
  const activeTab = useActiveTab();
  const workingStatus = activeTab?.workingStatus ?? [];
  const stageAllFiles = useRepoStore((s) => s.stageAllFiles);
  const unstageAllFiles = useRepoStore((s) => s.unstageAllFiles);

  const staged = workingStatus.filter((f) => f.indexStatus !== "none");
  const unstaged = workingStatus.filter((f) => f.worktreeStatus !== "none");

  if (staged.length === 0 && unstaged.length === 0) {
    return <div className="empty-state">No uncommitted changes</div>;
  }

  return (
    <div className="file-list working-file-list">
      <div className="file-list-section">
        <div className="file-list-section-header">
          <span>Staged ({staged.length})</span>
          {staged.length > 0 && (
            <button className="file-list-section-action" onClick={() => unstageAllFiles()}>
              Unstage all
            </button>
          )}
        </div>
        <div className="file-list-section-body">
          {staged.length === 0 ? (
            <span className="file-list-section-empty">Nothing staged</span>
          ) : (
            staged.map((f) => <WorkingFileRow key={`s-${f.path}`} entry={f} staged />)
          )}
        </div>
      </div>
      <div className="file-list-section">
        <div className="file-list-section-header">
          <span>Changes ({unstaged.length})</span>
          {unstaged.length > 0 && (
            <button className="file-list-section-action" onClick={() => stageAllFiles()}>
              Stage all
            </button>
          )}
        </div>
        <div className="file-list-section-body">
          {unstaged.length === 0 ? (
            <span className="file-list-section-empty">Nothing unstaged</span>
          ) : (
            unstaged.map((f) => (
              <WorkingFileRow key={`u-${f.path}`} entry={f} staged={false} />
            ))
          )}
        </div>
      </div>
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
