import type { WorkingFileEntry } from "../api/git";

/**
 * `git status` reports a conflict as independent index/worktree status
 * chars, not a single flag. A "both sides touched it" conflict (add/add,
 * delete/delete) shows the same status on both sides instead of the literal
 * "unmerged" ('U') char, so that combination counts too.
 */
export function isConflicted(entry: WorkingFileEntry): boolean {
  if (entry.indexStatus === "unmerged" || entry.worktreeStatus === "unmerged") return true;
  return (
    entry.indexStatus === entry.worktreeStatus &&
    (entry.indexStatus === "added" || entry.indexStatus === "deleted")
  );
}

export type ConflictChoice = "ours" | "theirs" | "both-ot" | "both-to" | "none";

export interface TextSegment {
  type: "text";
  lines: string[];
}

export interface ConflictSegment {
  type: "conflict";
  id: number;
  oursLabel: string;
  oursLines: string[];
  theirsLabel: string;
  theirsLines: string[];
  baseLabel?: string;
  baseLines?: string[];
}

export type FileSegment = TextSegment | ConflictSegment;

/**
 * Splits raw file content on git's `<<<<<<<`/`|||||||`/`=======`/`>>>>>>>`
 * conflict markers into alternating plain-text and conflict segments.
 * Tolerates the optional diff3-style `|||||||` base block.
 */
export function parseConflictMarkers(content: string): {
  segments: FileSegment[];
  hasConflicts: boolean;
} {
  const lines = content.split("\n");
  const segments: FileSegment[] = [];
  let currentText: string[] = [];
  let id = 0;
  let hasConflicts = false;
  let i = 0;

  function flushText() {
    if (currentText.length > 0) {
      segments.push({ type: "text", lines: currentText });
      currentText = [];
    }
  }

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("<<<<<<<")) {
      hasConflicts = true;
      const oursLabel = line.slice(7).trim() || "ours";
      i++;
      const oursLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith("|||||||") && !lines[i].startsWith("=======")) {
        oursLines.push(lines[i]);
        i++;
      }
      let baseLines: string[] | undefined;
      let baseLabel = "base";
      if (i < lines.length && lines[i].startsWith("|||||||")) {
        baseLabel = lines[i].slice(7).trim() || "base";
        i++;
        baseLines = [];
        while (i < lines.length && !lines[i].startsWith("=======")) {
          baseLines.push(lines[i]);
          i++;
        }
      }
      if (i < lines.length && lines[i].startsWith("=======")) i++;
      const theirsLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith(">>>>>>>")) {
        theirsLines.push(lines[i]);
        i++;
      }
      const theirsLabel = i < lines.length ? lines[i].slice(7).trim() || "theirs" : "theirs";
      if (i < lines.length) i++;
      flushText();
      segments.push({
        type: "conflict",
        id: id++,
        oursLabel,
        oursLines,
        theirsLabel,
        theirsLines,
        baseLabel,
        baseLines,
      });
    } else {
      currentText.push(line);
      i++;
    }
  }
  flushText();

  return { segments, hasConflicts };
}

/** Rebuilds file text from parsed segments, resolving each conflict per `choices`. Unresolved (missing/`null`-less entries never set) conflicts keep their original markers untouched. */
export function composeResolution(
  segments: FileSegment[],
  choices: Record<number, ConflictChoice | undefined>,
): string {
  const parts: string[] = [];
  for (const seg of segments) {
    if (seg.type === "text") {
      parts.push(...seg.lines);
      continue;
    }
    const choice = choices[seg.id];
    switch (choice) {
      case "ours":
        parts.push(...seg.oursLines);
        break;
      case "theirs":
        parts.push(...seg.theirsLines);
        break;
      case "both-ot":
        parts.push(...seg.oursLines, ...seg.theirsLines);
        break;
      case "both-to":
        parts.push(...seg.theirsLines, ...seg.oursLines);
        break;
      case "none":
        break;
      default:
        parts.push(`<<<<<<< ${seg.oursLabel}`, ...seg.oursLines);
        if (seg.baseLines) parts.push(`||||||| ${seg.baseLabel ?? "base"}`, ...seg.baseLines);
        parts.push("=======", ...seg.theirsLines, `>>>>>>> ${seg.theirsLabel}`);
    }
  }
  return parts.join("\n");
}
