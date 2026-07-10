import { useEffect, useMemo, useState } from "react";
import { readWorkingFile } from "../api/git";
import {
  composeResolution,
  parseConflictMarkers,
  type ConflictChoice,
  type ConflictSegment,
  type FileSegment,
} from "../lib/conflicts";
import { useRepoStore } from "../store/repoStore";
import { ModalOverlay } from "./ModalOverlay";

interface ConflictResolutionDialogProps {
  repoPath: string;
  path: string;
  onClose: () => void;
}

const CHOICE_LABEL: Record<ConflictChoice, string> = {
  ours: "Use ours",
  theirs: "Use theirs",
  "both-ot": "Use both (ours → theirs)",
  "both-to": "Use both (theirs → ours)",
  none: "Discard both",
};

function ConflictBlock({
  segment,
  choice,
  onChoose,
}: {
  segment: ConflictSegment;
  choice: ConflictChoice | undefined;
  onChoose: (choice: ConflictChoice) => void;
}) {
  return (
    <div className="conflict-block">
      <div className="conflict-columns">
        <div className="conflict-side">
          <div className="conflict-side-header">Current — {segment.oursLabel}</div>
          <pre className="conflict-side-content">{segment.oursLines.join("\n") || "(empty)"}</pre>
        </div>
        <div className="conflict-side">
          <div className="conflict-side-header">Incoming — {segment.theirsLabel}</div>
          <pre className="conflict-side-content">{segment.theirsLines.join("\n") || "(empty)"}</pre>
        </div>
      </div>
      <div className="conflict-block-actions">
        {(Object.keys(CHOICE_LABEL) as ConflictChoice[]).map((c) => (
          <button
            key={c}
            className={`btn-secondary${choice === c ? " conflict-choice-active" : ""}`}
            onClick={() => onChoose(c)}
          >
            {CHOICE_LABEL[c]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ConflictResolutionDialog({ repoPath, path, onClose }: ConflictResolutionDialogProps) {
  const doResolveConflict = useRepoStore((s) => s.doResolveConflict);

  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<number, ConflictChoice | undefined>>({});
  const [finalText, setFinalText] = useState("");

  useEffect(() => {
    let cancelled = false;
    setContent(null);
    setError(null);
    readWorkingFile(repoPath, path)
      .then((text) => {
        if (cancelled) return;
        setContent(text);
        setFinalText(text);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [repoPath, path]);

  const parsed = useMemo(() => (content !== null ? parseConflictMarkers(content) : null), [content]);
  const conflictSegments = useMemo(
    () => (parsed?.segments.filter((s): s is ConflictSegment => s.type === "conflict") ?? []),
    [parsed],
  );

  function chooseFor(segments: FileSegment[], id: number, choice: ConflictChoice) {
    const nextChoices = { ...choices, [id]: choice };
    setChoices(nextChoices);
    setFinalText(composeResolution(segments, nextChoices));
  }

  const stillHasMarkers = finalText.includes("<<<<<<<") || finalText.includes(">>>>>>>");
  const resolvedCount = conflictSegments.filter((s) => choices[s.id] !== undefined).length;

  return (
    <ModalOverlay onClose={onClose}>
      <div className="modal modal-wide conflict-modal">
        <div className="modal-title">Resolve conflicts — {path}</div>

        {error && <div className="modal-message conflict-warning">{error}</div>}

        {!error && content === null && <div className="modal-message">Loading…</div>}

        {!error && parsed && !parsed.hasConflicts && (
          <div className="modal-message">
            No conflict markers found in this file — edit it directly below if needed.
          </div>
        )}

        {!error && parsed && parsed.hasConflicts && (
          <>
            <div className="modal-message">
              {resolvedCount} of {conflictSegments.length} conflict block
              {conflictSegments.length === 1 ? "" : "s"} resolved. Picking a chunk regenerates the
              output below — edits made directly in the box are kept until you pick another chunk.
            </div>
            <div className="conflict-block-list">
              {conflictSegments.map((seg) => (
                <ConflictBlock
                  key={seg.id}
                  segment={seg}
                  choice={choices[seg.id]}
                  onChoose={(choice) => chooseFor(parsed.segments, seg.id, choice)}
                />
              ))}
            </div>
          </>
        )}

        {!error && parsed && (
          <div className="conflict-output">
            <div className="modal-label">Final output (editable)</div>
            <textarea
              className="modal-input conflict-output-textarea"
              value={finalText}
              onChange={(e) => setFinalText(e.target.value)}
              spellCheck={false}
            />
            {stillHasMarkers && (
              <div className="conflict-warning">
                Conflict markers are still present in the output — this file likely isn't fully
                resolved yet.
              </div>
            )}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={content === null || !!error}
            onClick={() => {
              doResolveConflict(path, finalText);
              onClose();
            }}
          >
            Save &amp; mark resolved
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
