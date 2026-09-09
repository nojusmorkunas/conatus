"use client";

import { Check, ChevronDown, Flag, Hash, Inbox, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { priorityLabels } from "./priority";

export type ComposerProject = { id: string; name: string; isInbox: boolean; isArchived?: boolean };
export type ComposerSection = { id: string; projectId: string; name: string; isArchived?: boolean };
export type ComposerLabel = { id: string; name: string };

export const composerPriorityColors: Record<number, string> = {
  1: "text-red-600 dark:text-red-400",
  2: "text-orange-700 dark:text-orange-400",
  3: "text-blue-600 dark:text-blue-400",
  4: "text-muted-foreground",
};

export function ComposerChip({ icon: Icon, children, label, onClick, onRemove, className, disabled }: {
  icon: LucideIcon;
  children: ReactNode;
  label: string;
  onClick: () => void;
  onRemove?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <span className={cn("inline-flex max-w-full items-center rounded-md border border-border text-xs text-muted-foreground", className)}>
      <button type="button" aria-label={label} title={typeof children === "string" ? children : undefined} disabled={disabled} onClick={onClick} className="flex min-h-8 min-w-0 items-center gap-1.5 rounded-md px-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{children}</span>
        {!onRemove && <ChevronDown className="size-3 shrink-0 opacity-60" aria-hidden="true" />}
      </button>
      {onRemove && <button type="button" disabled={disabled} aria-label={`Remove ${label.toLowerCase()}`} onClick={onRemove} className="flex min-h-8 w-7 shrink-0 items-center justify-center rounded-r-md transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><X className="size-3" /></button>}
    </span>
  );
}

export function ComposerPanel({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <section data-composer-panel aria-label={title} className="border-t border-border px-3 pt-2 pb-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <button type="button" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><X className="size-4" /></button>
      </div>
      {children}
    </section>
  );
}

export function ComposerPriorityPicker({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
      {[1, 2, 3, 4].map((priority) => (
        <button key={priority} type="button" autoFocus={value === priority} aria-pressed={value === priority} onClick={() => onChange(priority)} className={cn("flex min-h-10 items-center gap-2 rounded-md px-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring", value === priority && "bg-muted", composerPriorityColors[priority])}>
          <Flag className="size-4" aria-hidden="true" />
          {priority === 4 ? "No priority" : priorityLabels[priority]}
          {value === priority && <Check className="ml-auto size-3.5" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

export function ComposerProjectPicker({ projects, sections, projectId, sectionId, search, onChange }: {
  projects: ComposerProject[];
  sections: ComposerSection[];
  projectId: string;
  sectionId: string | null;
  search: string;
  onChange: (projectId: string, sectionId: string | null) => void;
}) {
  const query = search.trim().toLowerCase();
  const matches = projects.filter((project) => project.name.toLowerCase().includes(query) || sections.some((section) => section.projectId === project.id && section.name.toLowerCase().includes(query)));
  return (
    <div className="mt-2 max-h-56 overflow-y-auto">
      {matches.length === 0 && <p className="py-3 text-sm text-muted-foreground">No matching projects or sections.</p>}
      {matches.map((project) => {
        const Icon = project.isInbox ? Inbox : Hash;
        return <div key={project.id}>
          <button type="button" aria-label={`Choose project ${project.name}`} aria-pressed={projectId === project.id && !sectionId} onClick={() => onChange(project.id, null)} className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="truncate">{project.name}</span>{projectId === project.id && !sectionId && <Check className="ml-auto size-3.5" />}
          </button>
          {sections.filter((section) => section.projectId === project.id && (project.name.toLowerCase().includes(query) || section.name.toLowerCase().includes(query))).map((section) => (
            <button key={section.id} type="button" aria-label={`Choose section ${project.name} / ${section.name}`} aria-pressed={sectionId === section.id} onClick={() => onChange(project.id, section.id)} className="flex min-h-9 w-full items-center gap-2 rounded-md pr-2 pl-8 text-left text-sm text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
              <span className="truncate">{section.name}</span>{sectionId === section.id && <Check className="ml-auto size-3.5" />}
            </button>
          ))}
        </div>;
      })}
    </div>
  );
}
