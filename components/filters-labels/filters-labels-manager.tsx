"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Filter, Plus } from "lucide-react";

import type { filters as filtersTable, labels as labelsTable } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProjectColorPicker } from "@/components/projects/project-color-picker";
import { ProjectColorDot } from "@/components/projects/project-color-dot";

type FilterItem = typeof filtersTable.$inferSelect;
type LabelItem = typeof labelsTable.$inferSelect;
type FormKind = "filter" | "label" | null;

async function errorMessage(response: Response) {
  const body = await response.json().catch(() => null);
  if (typeof body?.error === "string") return body.error;
  if (body?.error && typeof body.error === "object") {
    const first = Object.values(body.error).flat().find(Boolean);
    if (typeof first === "string") return first;
  }
  return "Could not save your changes. Please try again.";
}

export function FiltersLabelsManager({
  initialFilters,
  initialLabels,
}: {
  initialFilters: FilterItem[];
  initialLabels: LabelItem[];
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [labels, setLabels] = useState(initialLabels);
  const [creating, setCreating] = useState<FormKind>(null);
  const [filterName, setFilterName] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [labelName, setLabelName] = useState("");
  const [labelColor, setLabelColor] = useState("gray");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function openForm(kind: Exclude<FormKind, null>) {
    setCreating(kind);
    setError(null);
  }

  function closeForm() {
    setCreating(null);
    setError(null);
  }

  async function createFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const response = await fetch("/api/filters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: filterName, query: filterQuery }),
      });
      if (!response.ok) {
        setError(await errorMessage(response));
        return;
      }
      const filter = (await response.json()) as FilterItem;
      setFilters((current) => [...current, filter]);
      setFilterName("");
      setFilterQuery("");
      closeForm();
    } finally {
      setSaving(false);
    }
  }

  async function createLabel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const response = await fetch("/api/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: labelName, color: labelColor }),
      });
      if (!response.ok) {
        setError(await errorMessage(response));
        return;
      }
      const label = (await response.json()) as LabelItem;
      setLabels((current) => [...current, label]);
      setLabelName("");
      setLabelColor("gray");
      closeForm();
    } finally {
      setSaving(false);
    }
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
              <Button type="button" variant="ghost" size="sm" onClick={closeForm} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Creating…" : "Create filter"}
              </Button>
            </div>
          </form>
        )}
        {filters.length === 0 ? (
          <p className="text-sm text-muted-foreground">No filters yet.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {filters.map((filter) => (
              <Link
                key={filter.id}
                href={`/filters/${filter.id}`}
                className="flex h-10 items-center gap-2 px-3 text-sm hover:bg-muted"
              >
                <Filter className="size-4 text-muted-foreground" />
                {filter.name}
              </Link>
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
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={closeForm} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Creating…" : "Create label"}
              </Button>
            </div>
          </form>
        )}
        {labels.length === 0 ? (
          <p className="text-sm text-muted-foreground">No labels yet.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {labels.map((label) => (
              <div key={label.id} className="flex h-10 items-center gap-2 px-3 text-sm">
                <ProjectColorDot color={label.color} />
                {label.name}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
