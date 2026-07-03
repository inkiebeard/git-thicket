import type { FileChange, FileStatus } from "../api/git";
import { useActiveTab, useRepoStore } from "../store/repoStore";

const STATUS_LABEL: Record<FileStatus, string> = {
  added: "A",
  deleted: "D",
  modified: "M",
  renamed: "R",
  copied: "C",
  "type-changed": "T",
};

function FileChip({ file }: { file: FileChange }) {
  const selectedFilePath = useActiveTab()?.selectedFilePath ?? null;
  const selectFile = useRepoStore((s) => s.selectFile);
  const isSelected = file.path === selectedFilePath;

  return (
    <button
      className={`file-chip${isSelected ? " selected" : ""}`}
      onClick={() => selectFile(file.path)}
      title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
    >
      <span className={`file-status status-${file.status}`}>
        {STATUS_LABEL[file.status]}
      </span>
      <span className="file-chip-path">
        {file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
      </span>
    </button>
  );
}

export function FileList() {
  const activeTab = useActiveTab();
  const commitFiles = activeTab?.commitFiles ?? [];
  const loadingFiles = activeTab?.loadingFiles ?? false;
  const selectedSha = activeTab?.selectedSha ?? null;

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
        <FileChip key={f.path} file={f} />
      ))}
    </div>
  );
}
