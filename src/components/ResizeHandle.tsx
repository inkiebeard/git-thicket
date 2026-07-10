import { useEffect, useRef } from "react";

interface ResizeHandleProps {
  onDrag: (delta: number) => void;
  /** Auto-fit: shrink/grow the column to its widest visible content + a small padding. */
  onDoubleClick?: () => void;
  axis?: "x" | "y";
}

export function ResizeHandle({ onDrag, onDoubleClick, axis = "x" }: ResizeHandleProps) {
  const dragging = useRef(false);
  const last = useRef(0);
  const onDragRef = useRef(onDrag);
  onDragRef.current = onDrag;

  function onMouseDown(e: React.MouseEvent) {
    dragging.current = true;
    last.current = axis === "x" ? e.clientX : e.clientY;
    document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
    e.preventDefault();
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      const pos = axis === "x" ? e.clientX : e.clientY;
      const delta = pos - last.current;
      last.current = pos;
      onDragRef.current(delta);
    }
    function onMouseUp() {
      dragging.current = false;
      document.body.style.cursor = "";
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [axis]);

  return (
    <div
      className={axis === "x" ? "pane-divider" : "pane-divider-horizontal"}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
    />
  );
}
