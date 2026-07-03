import { useMemo } from "react";
import { useActiveTab, useRepoStore } from "../store/repoStore";

const IS_MAC = navigator.platform.toLowerCase().includes("mac");
const CO_AUTHOR_RE = /^co-authored-by:\s*(.+?)\s*<(.+?)>\s*$/i;

interface Person {
  name: string;
  email: string;
}

function parseBody(body: string): { text: string; coAuthors: Person[] } {
  const coAuthors: Person[] = [];
  const textLines: string[] = [];

  for (const line of body.split("\n")) {
    const match = CO_AUTHOR_RE.exec(line.trim());
    if (match) {
      coAuthors.push({ name: match[1], email: match[2] });
    } else {
      textLines.push(line);
    }
  }

  return { text: textLines.join("\n").trim(), coAuthors };
}

function formatFullDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

function CommitComposer() {
  const activeTab = useActiveTab();
  const message = activeTab?.commitMessage ?? "";
  const amend = activeTab?.amend ?? false;
  const workingStatus = activeTab?.workingStatus ?? [];
  const busy = activeTab?.busy ?? false;
  const setCommitMessage = useRepoStore((s) => s.setCommitMessage);
  const setAmend = useRepoStore((s) => s.setAmend);
  const commitStagedChanges = useRepoStore((s) => s.commitStagedChanges);

  const stagedCount = workingStatus.filter((f) => f.indexStatus !== "none").length;
  // Amending doesn't require anything staged — a message-only amend is valid.
  const canCommit = (amend || stagedCount > 0) && message.trim().length > 0 && !busy;

  return (
    <div className="commit-detail commit-composer">
      <textarea
        className="commit-composer-input"
        placeholder="Commit message"
        rows={3}
        value={message}
        onChange={(e) => setCommitMessage(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canCommit) {
            e.preventDefault();
            commitStagedChanges();
          }
        }}
      />
      <label className="commit-composer-amend">
        <input
          type="checkbox"
          checked={amend}
          onChange={(e) => setAmend(e.target.checked)}
        />
        Amend previous commit
      </label>
      <div className="commit-composer-actions">
        <span className="commit-composer-hint">
          {amend
            ? stagedCount > 0
              ? `Amending — ${stagedCount} file${stagedCount === 1 ? "" : "s"} staged`
              : "Amending — message only"
            : stagedCount === 0
              ? "No files staged"
              : `${stagedCount} file${stagedCount === 1 ? "" : "s"} staged`}
        </span>
        <button
          className="btn-primary"
          disabled={!canCommit}
          onClick={() => commitStagedChanges()}
          title={`${amend ? "Amend" : "Commit"} (${IS_MAC ? "⌘" : "Ctrl"}+Enter)`}
        >
          {amend ? "Amend" : "Commit"}
        </button>
      </div>
    </div>
  );
}

export function CommitDetail() {
  const activeTab = useActiveTab();
  const detail = activeTab?.commitDetail ?? null;
  const loading = activeTab?.loadingDetail ?? false;
  const viewingWorkingTree = activeTab?.viewingWorkingTree ?? false;

  const parsed = useMemo(
    () => (detail ? parseBody(detail.body) : null),
    [detail],
  );

  if (viewingWorkingTree) {
    return <CommitComposer />;
  }
  if (loading) {
    return <div className="commit-detail commit-detail-loading">Loading commit…</div>;
  }
  if (!detail || !parsed) {
    return null;
  }

  const committerDiffers =
    detail.committerName !== detail.authorName ||
    detail.committerEmail !== detail.authorEmail;

  return (
    <div className="commit-detail">
      <div className="commit-detail-subject">{detail.subject}</div>
      {parsed.text && <div className="commit-detail-body">{parsed.text}</div>}
      <div className="commit-detail-people">
        <div className="commit-detail-person">
          <span className="commit-detail-label">Author</span>
          <span className="commit-detail-name">{detail.authorName}</span>
          <span className="commit-detail-email">{detail.authorEmail}</span>
          <span className="commit-detail-date" title={detail.authorDate}>
            {formatFullDate(detail.authorDate)}
          </span>
        </div>
        {committerDiffers && (
          <div className="commit-detail-person">
            <span className="commit-detail-label">Committer</span>
            <span className="commit-detail-name">{detail.committerName}</span>
            <span className="commit-detail-email">{detail.committerEmail}</span>
            <span className="commit-detail-date" title={detail.committerDate}>
              {formatFullDate(detail.committerDate)}
            </span>
          </div>
        )}
        {parsed.coAuthors.map((c) => (
          <div className="commit-detail-person" key={c.email}>
            <span className="commit-detail-label">Co-author</span>
            <span className="commit-detail-name">{c.name}</span>
            <span className="commit-detail-email">{c.email}</span>
          </div>
        ))}
      </div>
      <div className="commit-detail-hash">{detail.hash}</div>
    </div>
  );
}
