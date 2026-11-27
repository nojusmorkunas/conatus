"use client";

import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";

import { parseFilter } from "@/lib/filter";
import { useSidebarLists, useWrites } from "@/lib/offline/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProjectColorPicker } from "@/components/projects/project-color-picker";
import { FilterRow } from "@/components/filters/filter-sidebar-section";
import { LabelRow } from "@/components/labels/label-sidebar-section";

type FormKind = "filter" | "label" | null;

export function FiltersLabelsManager() {
  const { lists } = useWrites();
  const { labels, filters } = useSidebarLists();
  const [creating, setCreating] = useState<FormKind>(null);
  const [filterName, setFilterName] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [labelName, setLabelName] = useState("");
  const [labelColor, setLabelColor] = useState("gray");
  const [error, setError] = useState<string | null>(null);

  function openForm(kind: Exclude<FormKind, null>) {
    setCreating(kind);
    setError(null);
  }

  function closeForm() {
    setCreating(null);
    setError(null);
  }

  function createFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseFilter(filterQuery.trim());
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    lists.createFilter(filterName, filterQuery);
    setFilterName("");
    setFilterQuery("");
    closeForm();
  }

  function createLabel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    lists.createLabel(labelName, labelColor);
    setLabelName("");
    setLabelColor("gray");
    closeForm();
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Filters</h2>
          <Button size="sm" onClick={() => openForm("filter")} disabled={creating !== null}>
            <Plus data-icon="inline-start" />
            Add filter
          </Button>
        </div>
        {creating === "filter" && (
          <form onSubmit={createFilter} className="mb-3 rounded-md border bg-muted/30 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                autoFocus
                value={filterName}
                onChange={(event) => setFilterName(event.target.value)}
                placeholder="Filter name"
                aria-label="Filter name"
                maxLength={120}
                required
              />
              <Input
                value={filterQuery}
                onChange={(event) => setFilterQuery(event.target.value)}
                placeholder="Query, e.g. today & p1"
                aria-label="Filter query"
                maxLength={500}
                required
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Try <span className="font-mono">today</span>, <span className="font-mono">p1</span>, <span className="font-mono">@label</span>, or <span className="font-mono">#project</span>.
            </p>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={closeForm}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Create filter
              </Button>
            </div>
          </form>
        )}
        {filters.length === 0 ? (
          <p className="text-sm text-muted-foreground">No filters yet.</p>
        ) : (
          <div className="rounded-md border">
            {filters.map((filter) => (
              <FilterRow
                key={filter.id}
                filter={filter}
                menuAlwaysVisible
                className="h-10 rounded-none border-0 border-b border-border pl-1.5 pr-2 last:border-b-0 hover:bg-muted focus-within:bg-muted"
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Labels</h2>
          <Button size="sm" onClick={() => openForm("label")} disabled={creating !== null}>
            <Plus data-icon="inline-start" />
            Add label
          </Button>
        </div>
        {creating === "label" && (
          <form onSubmit={createLabel} className="mb-3 rounded-md border bg-muted/30 p-3">
            <Input
              autoFocus
              value={labelName}
              onChange={(event) => setLabelName(event.target.value)}
              placeholder="Label name"
              aria-label="Label name"
              maxLength={120}
              required
            />
            <div className="mt-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Color</p>
              <ProjectColorPicker value={labelColor} onChange={setLabelColor} />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={closeForm}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Create label
              </Button>
            </div>
          </form>
        )}
        {labels.length === 0 ? (
          <p className="text-sm text-muted-foreground">No labels yet.</p>
        ) : (
          <div className="rounded-md border">
            {labels.map((label) => (
              <LabelRow
                key={label.id}
                label={label}
                menuAlwaysVisible
                className="h-10 rounded-none border-0 border-b border-border pl-1.5 pr-2 last:border-b-0 hover:bg-muted focus-within:bg-muted"
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
