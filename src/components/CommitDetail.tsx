import { useMemo } from "react";
import { useActiveTab } from "../store/repoStore";

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

export function CommitDetail() {
  const activeTab = useActiveTab();
  const detail = activeTab?.commitDetail ?? null;
  const loading = activeTab?.loadingDetail ?? false;

  const parsed = useMemo(
    () => (detail ? parseBody(detail.body) : null),
    [detail],
  );

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
