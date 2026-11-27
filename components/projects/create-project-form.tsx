"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWrites } from "@/lib/offline/hooks";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjectColorPicker } from "./project-color-picker";
import { ProjectIconPicker } from "./project-icon-picker";
import { projectDepth } from "./project-tree";
import type { Project } from "./project-types";

export function CreateProjectForm({
  projects,
  onDone,
}: {
  projects: Project[];
  onDone: () => void;
}) {
  const { lists } = useWrites();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [color, setColor] = useState("gray");
  const [parentId, setParentId] = useState("none");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    lists.createProject(name, color, icon, parentId === "none" ? null : parentId);
    onDone();
  }

  // Doubles as the Select `items` map, so the trigger shows the project name
  // instead of the raw id.
  const parentOptions: Record<string, string> = { none: "None" };
  for (const project of projects) {
    if (!project.shared && !project.isInbox && projectDepth(project, projects) < 3) {
      parentOptions[project.id] = project.name;
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border border-border p-2">
      <Input
        autoFocus
        placeholder="Project name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <ProjectIconPicker value={icon} color={color} onChange={setIcon} />
      <ProjectColorPicker value={color} onChange={setColor} />
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Parent (optional)
        <Select
          items={parentOptions}
          value={parentId}
          onValueChange={(value) =>
            setParentId(typeof value === "string" ? value : "none")
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(parentOptions).map(([id, label]) => (
              <SelectItem key={id} value={id}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Add
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
