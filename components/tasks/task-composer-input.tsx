"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

import type { QuickAddToken } from "@/lib/parser/quick-add";

export function TaskComposerInput({
  value,
  tokens,
  inputRef,
  disabled,
  hintId,
  onChange,
  onSubmit,
}: {
  value: string;
  tokens: QuickAddToken[];
  inputRef: RefObject<HTMLTextAreaElement | null>;
  disabled: boolean;
  hintId: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const highlightsRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    function resize() {
      if (!input) return;
      input.style.height = "0px";
      input.style.height = `${Math.min(input.scrollHeight, 168)}px`;
    }
    resize();
    // Wrapping changes when the sidebar or viewport is resized, too.
    const observer = new ResizeObserver(resize);
    if (input.parentElement) observer.observe(input.parentElement);
    return () => observer.disconnect();
  }, [value, inputRef]);

  const highlighted = tokens.map((token, index) => {
    const plain = value.slice(tokens[index - 1]?.end ?? 0, token.start);
    return (
      <span key={`${token.start}-${token.kind}`}>
        {plain}
        <mark data-token-kind={token.kind}>{value.slice(token.start, token.end)}</mark>
      </span>
    );
  });

  return (
    <div className="task-composer-input relative min-w-0">
      <div ref={highlightsRef} className="task-composer-highlights task-composer-text" aria-hidden="true" data-composer-highlights>
        {highlighted}{value.slice(tokens.at(-1)?.end ?? 0)}{"\n"}
      </div>
      <textarea
        ref={inputRef}
        autoFocus
        aria-label="Task name"
        aria-describedby={hintId}
        placeholder="Task name, e.g. Pay rent tomorrow"
        className="task-composer-text relative block w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground disabled:opacity-60"
        rows={1}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => {
          if (highlightsRef.current) highlightsRef.current.scrollTop = event.currentTarget.scrollTop;
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
    </div>
  );
}
