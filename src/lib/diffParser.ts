export type DiffLineType = "add" | "remove" | "context";

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface ParsedDiff {
  hunks: DiffHunk[];
  isBinary: boolean;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function parseDiff(raw: string): ParsedDiff {
  if (raw.includes("Binary files") || raw.includes("GIT binary patch")) {
    return { hunks: [], isBinary: true };
  }

  const lines = raw.split("\n");
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    const match = HUNK_HEADER.exec(line);
    if (match) {
      oldLine = parseInt(match[1], 10);
      newLine = parseInt(match[2], 10);
      current = { header: line, lines: [] };
      hunks.push(current);
      continue;
    }

    if (!current) continue; // skip diff --git / index / --- / +++ preamble

    if (line.startsWith("+")) {
      current.lines.push({
        type: "add",
        content: line.slice(1),
        oldLine: null,
        newLine: newLine++,
      });
    } else if (line.startsWith("-")) {
      current.lines.push({
        type: "remove",
        content: line.slice(1),
        oldLine: oldLine++,
        newLine: null,
      });
    } else if (line.startsWith(" ") || line === "") {
      current.lines.push({
        type: "context",
        content: line.slice(1),
        oldLine: oldLine++,
        newLine: newLine++,
      });
    }
    // lines like "\ No newline at end of file" are ignored
  }

  return { hunks, isBinary: false };
}

export interface SplitRow {
  left: DiffLine | null;
  right: DiffLine | null;
}

/**
 * Pairs up a hunk's flat line list into left/right rows for a side-by-side
 * view: runs of consecutive removals and additions are zipped together
 * row-by-row, context lines occupy both sides of their own row.
 */
export function toSplitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let removeBuf: DiffLine[] = [];
  let addBuf: DiffLine[] = [];

  function flush() {
    const count = Math.max(removeBuf.length, addBuf.length);
    for (let i = 0; i < count; i++) {
      rows.push({ left: removeBuf[i] ?? null, right: addBuf[i] ?? null });
    }
    removeBuf = [];
    addBuf = [];
  }

  for (const line of lines) {
    if (line.type === "remove") {
      removeBuf.push(line);
    } else if (line.type === "add") {
      addBuf.push(line);
    } else {
      flush();
      rows.push({ left: line, right: line });
    }
  }
  flush();

  return rows;
}
