"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  CalendarClock,
  ChevronLeft,
  FileSpreadsheet,
  FolderKanban,
  Layers3,
  ListTodo,
  KeyRound,
  MessageSquareText,
  ShieldCheck,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ProjectPreview = {
  id: string;
  name: string;
  sections: number;
  tasks: number;
  subtasks: number;
  comments: number;
  warnings: string[];
  recurringDatesNeedingReview: Array<{
    taskId: string;
    content: string;
    recurrence: string;
  }>;
  nameConflict: boolean;
};

type PreviewResponse = {
  projects: ProjectPreview[];
  totals: { projects: number; sections: number; tasks: number; comments: number };
};

type ImportResult = {
  projects: number;
  sections: number;
  tasks: number;
  comments: number;
  labels: number;
  renamed: number;
  skipped: number;
};

function appendFiles(form: FormData, files: File[]) {
  files.forEach((file) => form.append("files", file));
}

function Step({ number, label, active, complete }: { number: number; label: string; active: boolean; complete: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 text-sm", active ? "text-foreground" : "text-muted-foreground")}>
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-full border text-xs font-semibold",
          active && "border-foreground bg-foreground text-background",
          complete && "border-emerald-600 bg-emerald-600 text-white",
        )}
      >
        {complete ? <Check className="size-3.5" /> : number}
      </span>
      <span className="font-medium">{label}</span>
    </div>
  );
}

export function TodoistImporter({ onboarding = false }: { onboarding?: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [source, setSource] = useState<"api" | "backup">("api");
  const [apiToken, setApiToken] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [conflictPolicy, setConflictPolicy] = useState<"rename" | "skip">("rename");
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [recurrenceDueDates, setRecurrenceDueDates] = useState<Record<string, string>>({});

  const selectedProjects = useMemo(
    () => preview?.projects.filter((project) => selected.has(project.id)) ?? [],
    [preview, selected],
  );
  const selectedTotals = useMemo(
    () => selectedProjects.reduce(
      (totals, project) => ({
        projects: totals.projects + 1,
        sections: totals.sections + project.sections,
        tasks: totals.tasks + project.tasks,
        comments: totals.comments + project.comments,
      }),
      { projects: 0, sections: 0, tasks: 0, comments: 0 },
    ),
    [selectedProjects],
  );
  const hasSelectedConflicts = selectedProjects.some((project) => project.nameConflict);
  const selectedRecurringDatesNeedingReview = selectedProjects.flatMap((project) =>
    project.recurringDatesNeedingReview.map((task) => ({
      ...task,
      projectId: project.id,
      projectName: project.name,
      reviewKey: `${project.id}:${task.taskId}`,
    })),
  );
  const missingRecurringDates = selectedRecurringDatesNeedingReview.filter(
    (task) => !recurrenceDueDates[task.reviewKey],
  ).length;
  const step = result ? 3 : preview ? 2 : 1;

  function chooseFiles(nextFiles: File[]) {
    setFiles(nextFiles);
    setPreview(null);
    setSelected(new Set());
    setResult(null);
    setRecurrenceDueDates({});
    setError(null);
  }

  async function createPreview() {
    if (source === "backup" && files.length === 0) return;
    if (source === "api" && !apiToken.trim()) return;
    setPreviewing(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("source", source);
      if (source === "api") form.set("apiToken", apiToken);
      else appendFiles(form, files);
      const response = await fetch("/api/import/todoist/preview", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The backup could not be previewed.");
      const nextPreview = body as PreviewResponse;
      setPreview(nextPreview);
      setSelected(new Set(nextPreview.projects.map((project) => project.id)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The backup could not be previewed.");
    } finally {
      setPreviewing(false);
    }
  }

  async function importSelected() {
    if (!preview || selected.size === 0) return;
    setImporting(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("source", source);
      if (source === "api") form.set("apiToken", apiToken);
      else appendFiles(form, files);
      form.set("selectedProjectIds", JSON.stringify([...selected]));
      form.set("conflictPolicy", conflictPolicy);
      form.set("recurrenceDueDates", JSON.stringify(
        Object.fromEntries(
          Object.entries(recurrenceDueDates).filter(([key]) =>
            selectedRecurringDatesNeedingReview.some((task) => task.reviewKey === key),
          ),
        ),
      ));
      const response = await fetch("/api/import/todoist/commit", { method: "POST", body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The import failed.");
      setResult(body as ImportResult);
      window.dispatchEvent(new Event("sidebar:projects:refresh"));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The import failed.");
    } finally {
      setImporting(false);
    }
  }

  function toggleProject(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startOver() {
    chooseFiles([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function finishOnboarding() {
    const response = await fetch("/api/onboarding", { method: "POST" });
    if (!response.ok) {
      setError("Your setup could not be completed. Try again.");
      return;
    }
    router.replace("/today");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border bg-card px-5 py-4">
        <Step number={1} label="Connect or upload" active={step === 1} complete={step > 1} />
        <div className="hidden h-px flex-1 bg-border sm:block" />
        <Step number={2} label="Review projects" active={step === 2} complete={step > 2} />
        <div className="hidden h-px flex-1 bg-border sm:block" />
        <Step number={3} label="Done" active={step === 3} complete={step === 3} />
      </div>

      {step === 1 && (
        <section className="rounded-xl border bg-card p-6" aria-labelledby="choose-backup-heading">
          <div className="mb-5 max-w-2xl">
            <h2 id="choose-backup-heading" className="text-lg font-semibold">Bring in your Todoist data</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Connect with an API token for up-to-date recurring dates, or upload a backup.
              Nothing is added while the preview is being reviewed.
            </p>
          </div>

          <div className="mb-5 grid gap-2 sm:grid-cols-2" role="tablist" aria-label="Todoist import source">
            <button type="button" role="tab" aria-selected={source === "api"} onClick={() => { setSource("api"); setPreview(null); setError(null); }} className={cn("rounded-lg border p-4 text-left", source === "api" && "border-foreground bg-muted/40")}>
              <KeyRound className="mb-2 size-5" />
              <span className="block text-sm font-semibold">Connect with API token</span>
              <span className="mt-1 block text-xs text-muted-foreground">Recommended · includes current recurring due dates</span>
            </button>
            <button type="button" role="tab" aria-selected={source === "backup"} onClick={() => { setSource("backup"); setPreview(null); setError(null); }} className={cn("rounded-lg border p-4 text-left", source === "backup" && "border-foreground bg-muted/40")}>
              <Archive className="mb-2 size-5" />
              <span className="block text-sm font-semibold">Upload a backup</span>
              <span className="mt-1 block text-xs text-muted-foreground">ZIP or CSV export</span>
            </button>
          </div>

          {source === "api" ? (
            <div className="rounded-xl border bg-muted/20 p-5">
              <label htmlFor="todoist-api-token" className="text-sm font-medium">Todoist API token</label>
              <input
                id="todoist-api-token"
                type="password"
                autoComplete="off"
                value={apiToken}
                onChange={(event) => setApiToken(event.target.value)}
                placeholder="Paste your token"
                className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Find it in Todoist under Settings → Integrations → Developer. The token is sent only to Todoist for this import and is not stored.
              </p>
            </div>
          ) : (
            <>

          <button
            type="button"
            className={cn(
              "flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
              dragging ? "border-foreground bg-muted" : "border-border hover:border-muted-foreground hover:bg-muted/40",
            )}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              chooseFiles(Array.from(event.dataTransfer.files));
            }}
          >
            <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
              <Upload className="size-5" />
            </span>
            <span className="font-medium">Drop a backup here, or choose a file</span>
            <span className="mt-1 text-sm text-muted-foreground">ZIP or CSV · up to 25 MB</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".zip,.csv,application/zip,text/csv"
            className="hidden"
            onChange={(event) => chooseFiles(Array.from(event.target.files ?? []))}
          />

          {files.length > 0 && (
            <div className="mt-4 rounded-lg border bg-muted/30 p-3">
              {files.map((file) => (
                <div key={`${file.name}-${file.size}`} className="flex items-center gap-3 py-1 text-sm">
                  {file.name.toLowerCase().endsWith(".zip") ? <Archive className="size-4" /> : <FileSpreadsheet className="size-4" />}
                  <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
                  <span className="text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</span>
                </div>
              ))}
            </div>
          )}
            </>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 text-emerald-600" />
              The preview is read-only; credentials and uploaded files are not stored.
            </div>
            <Button type="button" size="lg" disabled={(source === "backup" ? files.length === 0 : !apiToken.trim()) || previewing} onClick={createPreview}>
              {previewing ? "Reading Todoist…" : "Review projects"}
            </Button>
          </div>
        </section>
      )}

      {step === 2 && preview && (
        <section className="space-y-5" aria-labelledby="review-projects-heading">
          <div className="rounded-xl border bg-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 id="review-projects-heading" className="text-lg font-semibold">Choose projects to import</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Review the counts and uncheck anything you do not want. Importing starts only when you confirm below.
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
                <Button type="button" variant="outline" onClick={() => setSelected(new Set(preview.projects.map((project) => project.id)))}>
                  Select all
                </Button>
              </div>
            </div>

            <div className="mt-5 divide-y rounded-lg border">
              {preview.projects.map((project) => {
                const checked = selected.has(project.id);
                return (
                  <label key={project.id} className={cn("flex cursor-pointer items-start gap-3 p-4 hover:bg-muted/40", checked && "bg-muted/20")}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleProject(project.id)}
                      className="mt-1 size-4 accent-foreground"
                    />
                    <FolderKanban className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{project.name}</span>
                        {project.nameConflict && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                            Name already exists
                          </span>
                        )}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>{project.tasks} tasks{project.subtasks ? ` · ${project.subtasks} subtasks` : ""}</span>
                        <span>{project.sections} sections</span>
                        <span>{project.comments} comments</span>
                      </span>
                      {project.warnings.length > 0 && (
                        <details className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                          <summary>{project.warnings.length} import {project.warnings.length === 1 ? "note" : "notes"}</summary>
                          <ul className="mt-1 list-disc space-y-1 pl-5">
                            {project.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                          </ul>
                        </details>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {hasSelectedConflicts && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/40">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" />
                <div>
                  <h3 className="font-medium">Some project names already exist</h3>
                  <div className="mt-3 space-y-2 text-sm">
                    <label className="flex cursor-pointer items-start gap-2">
                      <input type="radio" name="conflict" checked={conflictPolicy === "rename"} onChange={() => setConflictPolicy("rename")} className="mt-1 accent-foreground" />
                      <span><strong>Create a renamed copy</strong><br /><span className="text-muted-foreground">Adds “Todoist import” to the new project name.</span></span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2">
                      <input type="radio" name="conflict" checked={conflictPolicy === "skip"} onChange={() => setConflictPolicy("skip")} className="mt-1 accent-foreground" />
                      <span><strong>Skip existing names</strong><br /><span className="text-muted-foreground">Leaves the existing project untouched.</span></span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedRecurringDatesNeedingReview.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/40">
              <div className="flex gap-3">
                <CalendarClock className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">Confirm current recurring dates</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Todoist leaves the current occurrence out of CSV backups. Open each task in Todoist and enter the date it currently shows. The importer will not guess or continue with missing dates.
                  </p>
                  <div className="mt-4 space-y-3">
                    {selectedRecurringDatesNeedingReview.map((task) => (
                      <label key={task.reviewKey} className="grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{task.content}</span>
                          <span className="block truncate text-xs text-muted-foreground">{task.projectName} · {task.recurrence}</span>
                        </span>
                        <input
                          type="date"
                          required
                          aria-label={`Current Todoist date for ${task.content}`}
                          value={recurrenceDueDates[task.reviewKey] ?? ""}
                          onChange={(event) => setRecurrenceDueDates((current) => ({
                            ...current,
                            [task.reviewKey]: event.target.value,
                          }))}
                          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border bg-card p-5">
            <h3 className="font-semibold">Ready to import</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { Icon: FolderKanban, count: selectedTotals.projects, label: "Projects" },
                { Icon: Layers3, count: selectedTotals.sections, label: "Sections" },
                { Icon: ListTodo, count: selectedTotals.tasks, label: "Tasks" },
                { Icon: MessageSquareText, count: selectedTotals.comments, label: "Comments" },
              ].map(({ Icon, count, label }) => (
                <div key={label} className="rounded-lg bg-muted/50 p-3">
                  <Icon className="mb-2 size-4 text-muted-foreground" />
                  <p className="text-lg font-semibold">{count}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="ghost" onClick={() => setPreview(null)}>
                <ChevronLeft /> Change import source
              </Button>
              <Button type="button" size="lg" disabled={selected.size === 0 || importing || missingRecurringDates > 0} onClick={importSelected}>
                {importing
                  ? "Importing…"
                  : missingRecurringDates > 0
                    ? `Enter ${missingRecurringDates} recurring ${missingRecurringDates === 1 ? "date" : "dates"}`
                    : `Import ${selected.size} selected ${selected.size === 1 ? "project" : "projects"}`}
              </Button>
            </div>
          </div>
        </section>
      )}

      {step === 3 && result && (
        <section className="rounded-xl border bg-card p-8 text-center" aria-labelledby="import-complete-heading">
          <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 className="size-7" />
          </span>
          <h2 id="import-complete-heading" className="text-xl font-semibold">Import complete</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Added {result.projects} projects, {result.sections} sections, {result.tasks} tasks, and {result.comments} comments.
            {result.labels > 0 ? ` Created ${result.labels} new ${result.labels === 1 ? "label" : "labels"}.` : ""}
            {result.renamed > 0 ? ` ${result.renamed} conflicting project ${result.renamed === 1 ? "was" : "were"} renamed.` : ""}
            {result.skipped > 0 ? ` ${result.skipped} ${result.skipped === 1 ? "project was" : "projects were"} skipped.` : ""}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button type="button" variant="outline" onClick={startOver}>Import more data</Button>
            <Button type="button" onClick={onboarding ? finishOnboarding : () => router.push("/today")}>
              {onboarding ? "Finish setup" : "View projects"}
            </Button>
          </div>
        </section>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
