"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

const DEFAULT = 288;
const MIN = 224;
const MAX = 448;
const clamp = (width: number) => Math.max(MIN, Math.min(MAX, width));

export function SidebarResizeHandle({ sidebarRef }: { sidebarRef: RefObject<HTMLElement | null> }) {
  const [width, setWidth] = useState(DEFAULT);
  const drag = useRef<{ x: number; width: number } | null>(null);

  function apply(next: number) {
    const value = clamp(next);
    sidebarRef.current?.style.setProperty("--sidebar-width", `${value}px`);
    setWidth(value);
    try { localStorage.setItem("sidebar:width", String(value)); } catch { /* Resizing still works without storage. */ }
  }

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const stored = Number(localStorage.getItem("sidebar:width"));
        if (Number.isFinite(stored) && stored > 0) {
          sidebarRef.current?.style.setProperty("--sidebar-width", `${clamp(stored)}px`);
          setWidth(clamp(stored));
        }
      } catch { /* Use the default width when storage is unavailable. */ }
    });
    return () => cancelAnimationFrame(frame);
  }, [sidebarRef]);

  return (
    <div
      role="separator"
      aria-label="Resize sidebar"
      aria-controls="project-sidebar-panel"
      aria-orientation="vertical"
      aria-valuemin={MIN}
      aria-valuemax={MAX}
      aria-valuenow={width}
      aria-valuetext={`${width} pixels`}
      tabIndex={0}
      title="Drag to resize. Use arrow keys to adjust or double-click to reset."
      className="absolute inset-y-0 right-0 z-10 hidden w-1.5 cursor-col-resize touch-none select-none hover:bg-primary/30 focus-visible:bg-primary/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary md:block"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, width: sidebarRef.current?.getBoundingClientRect().width ?? width };
      }}
      onPointerMove={(event) => {
        if (drag.current) apply(drag.current.width + event.clientX - drag.current.x);
      }}
      onPointerUp={(event) => {
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      onDoubleClick={() => apply(DEFAULT)}
      onKeyDown={(event) => {
        const next = event.key === "ArrowLeft" ? width - 8
          : event.key === "ArrowRight" ? width + 8
          : event.key === "Home" ? MIN
          : event.key === "End" ? MAX : null;
        if (next !== null) { event.preventDefault(); apply(next); }
      }}
    />
  );
}
