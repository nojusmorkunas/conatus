"use client";

import { Folder } from "lucide-react";

import { cn } from "@/lib/utils";
import { projectColorTextClass } from "./project-color-dot";
import { ProjectIcon, projectIconPresets } from "./project-icons";

export function ProjectTile({ icon, color }: { icon: string | null; color: string }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center" aria-hidden>
      <ProjectIcon
        icon={icon}
        className={projectColorTextClass[color as keyof typeof projectColorTextClass] ?? projectColorTextClass.gray}
      />
    </span>
  );
}

export function ProjectIconPicker({
  value,
  color,
  onChange,
}: {
  value: string | null;
  color: string;
  onChange: (icon: string | null) => void;
}) {
  const colorClass = projectColorTextClass[color as keyof typeof projectColorTextClass] ?? projectColorTextClass.gray;

  return (
    <div className="grid grid-cols-6 gap-1" aria-label="Project icon">
      <button
        type="button"
        aria-label="Default folder icon"
        className={cn(
          "flex size-8 items-center justify-center rounded-md hover:bg-muted",
          value === null && "bg-muted ring-1 ring-border",
        )}
        onClick={() => onChange(null)}
      >
        <Folder className={cn("size-4", colorClass)} />
      </button>
      {projectIconPresets.map(({ value: icon, label, Icon }) => (
        <button
          key={icon}
          type="button"
          aria-label={`Use ${label} icon`}
          title={label}
          className={cn(
            "flex size-8 items-center justify-center rounded-md hover:bg-muted",
            value === icon && "bg-muted ring-1 ring-border",
          )}
          onClick={() => onChange(icon)}
        >
          <Icon className={cn("size-4", colorClass)} />
        </button>
      ))}
    </div>
  );
}
