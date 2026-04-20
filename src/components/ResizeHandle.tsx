import * as React from "react";
import { cn } from "@/lib/utils";

interface Props {
  side: "left" | "right";
  onResize: (width: number) => void;
  onReset: () => void;
  className?: string;
}

export function ResizeHandle({ side, onResize, onReset, className }: Props) {
  const [dragging, setDragging] = React.useState(false);
  const startX = React.useRef(0);
  const startWidth = React.useRef(0);

  const onPointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const handle = e.currentTarget as HTMLElement;
      const sibling =
        side === "left"
          ? (handle.previousElementSibling as HTMLElement)
          : (handle.nextElementSibling as HTMLElement);
      if (!sibling) return;

      startX.current = e.clientX;
      startWidth.current = sibling.getBoundingClientRect().width;
      setDragging(true);
      handle.setPointerCapture(e.pointerId);
    },
    [side],
  );

  const onPointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const delta = e.clientX - startX.current;
      const newWidth =
        side === "left"
          ? startWidth.current + delta
          : startWidth.current - delta;
      onResize(newWidth);
    },
    [dragging, side, onResize],
  );

  const onPointerUp = React.useCallback(() => {
    setDragging(false);
  }, []);

  return (
    <div
      className={cn(
        "relative z-10 w-0 shrink-0",
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onReset}
    >
      {/* Wider invisible hit area + visible highlight on hover/drag */}
      <div
        className={cn(
          "absolute inset-y-0 w-1.5 cursor-col-resize",
          dragging ? "bg-primary/40" : "bg-transparent hover:bg-primary/20",
        )}
        style={{
          left: -3,
          transition: dragging ? "none" : "background-color 150ms",
        }}
      />
    </div>
  );
}
