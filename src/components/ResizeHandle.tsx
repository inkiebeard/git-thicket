import { useEffect, useRef } from "react";

interface ResizeHandleProps {
  onDrag: (deltaX: number) => void;
}

export function ResizeHandle({ onDrag }: ResizeHandleProps) {
  const dragging = useRef(false);
  const lastX = useRef(0);
  const onDragRef = useRef(onDrag);
  onDragRef.current = onDrag;

  function onMouseDown(e: React.MouseEvent) {
    dragging.current = true;
    lastX.current = e.clientX;
    document.body.style.cursor = "col-resize";
    e.preventDefault();
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      const delta = e.clientX - lastX.current;
      lastX.current = e.clientX;
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
  }, []);

  return <div className="pane-divider" onMouseDown={onMouseDown} />;
}
