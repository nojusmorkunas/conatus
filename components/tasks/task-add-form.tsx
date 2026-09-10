"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlignLeft, ArrowUp, Bell, CalendarDays, Check, Flag, Hash, Inbox, LoaderCircle, Paperclip, Plus, Repeat, Tag, Timer, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { parseQuickAddPreview, removeQuickAddTokens, type QuickAddToken } from "@/lib/parser/quick-add";
import { firstOccurrence } from "@/lib/recurrence";
import { addDays, dueLabel, humanizeDuration, weekStartOf } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { localDateTimeToUtc } from "@/lib/local-time";
import { RecurrencePicker } from "./recurrence-picker";
import { TaskComposerInput } from "./task-composer-input";
import { ComposerChip, ComposerPanel, ComposerPriorityPicker, ComposerProjectPicker, composerPriorityColors, type ComposerLabel, type ComposerProject, type ComposerSection } from "./task-composer-controls";

type Panel = "project" | "date" | "priority" | "reminders" | "labels" | "deadline" | "duration";
type Schedule = { date: string; time: string; recurrence: string | null };
type Details = { labelIds: string[]; reminders: string[]; files: File[] };
const emptySchedule: Schedule = { date: "", time: "", recurrence: null };
const panelTitles: Record<Panel, string> = { project: "Project and section", date: "Date and repeat", priority: "Priority", reminders: "Reminders", labels: "Labels", deadline: "Deadline", duration: "Duration" };

export function TaskAddForm({
  projectId, sectionId, parentId, afterId, today, labels, onCreated, onError, onCancel,
  initiallyExpanded = false, alignWithTask = false,
}: {
  projectId: string;
  sectionId: string | null;
  parentId?: string;
  afterId?: string | null;
  today: string;
  labels: ComposerLabel[];
  onCreated: () => void;
  onError: () => void;
  onCancel?: () => void;
  initiallyExpanded?: boolean;
  /** Align the collapsed trigger with a task row's title column. */
  alignWithTask?: boolean;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [manualPriority, setManualPriority] = useState(4);
  const [schedule, setSchedule] = useState<Schedule>(emptySchedule);
  const [manualDeadline, setManualDeadline] = useState("");
  const [manualDuration, setManualDuration] = useState("");
  const [destination, setDestination] = useState({ projectId, sectionId });
  const [manualLabelIds, setManualLabelIds] = useState<string[]>([]);
  const [createdLabels, setCreatedLabels] = useState<ComposerLabel[]>([]);
  const [projects, setProjects] = useState<ComposerProject[]>([]);
  const [sections, setSections] = useState<ComposerSection[]>([]);
  const [referencesLoading, setReferencesLoading] = useState(true);
  const [referencesError, setReferencesError] = useState(false);
  const [referenceAttempt, setReferenceAttempt] = useState(0);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [labelSearch, setLabelSearch] = useState("");
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [reminderDraft, setReminderDraft] = useState("");
  const [editingReminder, setEditingReminder] = useState<string | null>(null);
  const [reminders, setReminders] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Once the task exists, retries only write its missing details.
  const [recovery, setRecovery] = useState<{ taskId: string; details: Details } | null>(null);
  const submitting = useRef(false);
  const rootRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();

  const availableLabels = useMemo(() => [...labels, ...createdLabels.filter((label) => !labels.some((existing) => existing.id === label.id))], [labels, createdLabels]);
  const { parsed, tokens } = useMemo(() => parseQuickAddPreview(content, {
    today,
    projectNames: parentId ? [] : projects.map((project) => project.name),
    labelNames: availableLabels.map((label) => label.name),
  }), [content, today, parentId, projects, availableLabels]);
  const recurrence = parsed.recurrence ?? schedule.recurrence;
  const explicitParsedDate = tokens.some((token) => token.kind === "date" || token.kind === "recurrence");
  const dueDate = (explicitParsedDate ? parsed.dueDate : schedule.date || parsed.dueDate) || (recurrence ? firstOccurrence(recurrence, today) : "");
  const dueTime = dueDate ? parsed.dueTime ?? schedule.time : "";
  const priority = tokens.some((token) => token.kind === "priority") ? parsed.priority : manualPriority;
  const deadline = parsed.deadlineDate ?? manualDeadline;
  const duration = parsed.durationMinutes ? String(parsed.durationMinutes) : manualDuration;
  const selectedReminders = [...new Set([...reminders, ...(parsed.reminderAt ? [parsed.reminderAt] : [])])];
  const parsedProject = projects.find((project) => project.name.toLowerCase() === parsed.projectName?.toLowerCase());
  const targetProjectId = parentId ? projectId : parsedProject?.id ?? destination.projectId;
  const targetSectionId = targetProjectId === destination.projectId ? destination.sectionId : null;
  const targetProject = projects.find((project) => project.id === targetProjectId);
  const targetSection = sections.find((section) => section.id === targetSectionId);
  const selectedLabels = availableLabels.filter((label) => manualLabelIds.includes(label.id) || parsed.labelNames.some((name) => name.toLowerCase() === label.name.toLowerCase()));
  const frozen = pending || Boolean(recovery);
  const dateText = dueDate ? `${dueLabel(dueDate, today, "dd/MM/yyyy")}${dueTime ? ` · ${dueTime}` : ""}` : "Date";

  useEffect(() => {
    function onFocusRequest() {
      if (document.querySelector<HTMLElement>("[data-quick-add]") !== rootRef.current) return;
      setExpanded(true);
      inputRef.current?.focus();
    }
    window.addEventListener("quick-add:focus", onFocusRequest);
    return () => window.removeEventListener("quick-add:focus", onFocusRequest);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    let active = true;
    Promise.allSettled([api.get<ComposerProject[]>("/api/projects"), api.get<ComposerSection[]>("/api/sections")]).then(([projectResult, sectionResult]) => {
      if (!active) return;
      if (projectResult.status === "fulfilled") setProjects(projectResult.value.filter((project) => !project.isArchived));
      if (sectionResult.status === "fulfilled") setSections(sectionResult.value.filter((section) => !section.isArchived));
      setReferencesError(projectResult.status === "rejected" || sectionResult.status === "rejected");
      setReferencesLoading(false);
    });
    return () => { active = false; };
  }, [expanded, referenceAttempt]);

  function strip(kinds: QuickAddToken["kind"][], value?: string) {
    setContent(removeQuickAddTokens(content, tokens.filter((token) => kinds.includes(token.kind) && (value === undefined || token.value.toLowerCase() === value.toLowerCase()))));
  }

  function closePanel() {
    setPanel(null);
    inputRef.current?.focus();
  }

  function changeSchedule(next: Schedule) {
    strip(["date", "time", "recurrence"]);
    setSchedule(next);
  }

  function removeLabel(label: ComposerLabel) {
    strip(["label"], label.name);
    setManualLabelIds((current) => current.filter((id) => id !== label.id));
  }

  function reset() {
    setContent(""); setDescription(""); setDescriptionOpen(false);
    setManualPriority(4); setSchedule(emptySchedule); setManualDeadline(""); setManualDuration("");
    setDestination({ projectId, sectionId }); setManualLabelIds([]); setReminders([]); setReminderDraft(""); setEditingReminder(null);
    setFiles([]); setPanel(null); setRecovery(null); setError(null); setLabelSearch(""); setProjectSearch("");
  }

  function cancel() {
    if (pending) return;
    if (recovery) onCreated();
    reset();
    setExpanded(false);
    onCancel?.();
  }

  async function saveDetails(taskId: string, details: Details) {
    const remaining: Details = { labelIds: [], reminders: [], files: [] };
    const failures: string[] = [];
    const jobs: { run: () => Promise<unknown>; failed: () => void; name: string }[] = [];
    if (details.labelIds.length) jobs.push({ run: () => api.patch(`/api/tasks/${taskId}`, { labelIds: details.labelIds }), failed: () => { remaining.labelIds = details.labelIds; }, name: "labels" });
    for (const value of details.reminders) jobs.push({ run: () => {
      const remindAt = localDateTimeToUtc(value, Intl.DateTimeFormat().resolvedOptions().timeZone);
      if (!remindAt) throw new Error("Invalid reminder time");
      return api.post("/api/reminders", { taskId, remindAt: remindAt.toISOString() });
    }, failed: () => { remaining.reminders.push(value); }, name: "reminders" });
    for (const file of details.files) jobs.push({ run: () => { const body = new FormData(); body.set("taskId", taskId); body.set("file", file); return api.post("/api/attachments", body); }, failed: () => { remaining.files.push(file); }, name: "attachments" });
    const results = await Promise.allSettled(jobs.map((job) => Promise.resolve().then(job.run)));
    results.forEach((result, index) => { if (result.status === "rejected") { jobs[index].failed(); failures.push(jobs[index].name); } });
    if (failures.length) {
      setRecovery({ taskId, details: remaining });
      setError(`Task added, but ${[...new Set(failures)].join(" and ")} couldn't be saved. Retry to save the missing details.`);
      return false;
    }
    return true;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || creatingLabel || (!recovery && !parsed.content.trim())) return;
    if (!recovery && parsed.content.length > 500) { setError("Keep the task name under 500 characters."); return; }
    if (!recovery && duration && (!Number.isInteger(Number(duration)) || Number(duration) < 1 || Number(duration) > 1440)) { setError("Set a duration between 1 and 1,440 minutes."); return; }
    if (!recovery && selectedReminders.some((value) => !localDateTimeToUtc(value, Intl.DateTimeFormat().resolvedOptions().timeZone))) { setError("That reminder time does not exist in this device's time zone. Choose another time."); return; }
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      const task = recovery ?? await api.post<{ id: string }>("/api/tasks", {
        projectId: targetProjectId, sectionId: targetSectionId, parentId,
        ...(afterId !== undefined && targetProjectId === projectId && targetSectionId === sectionId ? { afterId } : {}),
        content: parsed.content, description: description.trim() || undefined, priority,
        dueDate: dueDate || undefined, dueTime: dueTime || undefined, recurrence: recurrence || undefined,
        deadlineDate: deadline || undefined, durationMinutes: duration ? Number(duration) : undefined,
      });
      const taskId = "taskId" in task ? task.taskId : task.id;
      const details = recovery?.details ?? { labelIds: selectedLabels.map((label) => label.id), reminders: selectedReminders, files };
      if (!(await saveDetails(taskId, details))) return;
      reset();
      setExpanded(true);
      onCreated();
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch {
      setError("Couldn't add the task. Your draft is still here; please try again.");
      onError();
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  async function createLabel() {
    const name = labelSearch.trim();
    if (!name || creatingLabel) return;
    setCreatingLabel(true); setError(null);
    try {
      const label = await api.post<ComposerLabel>("/api/labels", { name, color: "gray" });
      setCreatedLabels((current) => [...current, label]);
      setManualLabelIds((current) => [...current, label.id]);
      setLabelSearch("");
    } catch { setError("Couldn't create the label. Please try again."); }
    finally { setCreatingLabel(false); }
  }

  const selectedNames = selectedLabels.map((label) => label.name).join(", ");
  const recognitionSummary = [dueDate && `Date: ${dateText}`, recurrence && `Repeat: ${recurrence}`, priority < 4 && `Priority ${priority}`, selectedNames && `Labels: ${selectedNames}`, deadline && `Deadline: ${dueLabel(deadline, today, "dd/MM/yyyy")}`, duration && `Duration: ${duration} minutes`, parsedProject && `Project: ${parsedProject.name}`, parsed.reminderAt && `Reminder: ${new Date(parsed.reminderAt).toLocaleString()}`].filter(Boolean).join(". ");

  if (!expanded) return (
    <button ref={rootRef as React.Ref<HTMLButtonElement>} type="button" data-quick-add className={cn("group/add-task flex w-full items-center gap-2 rounded-lg border border-dashed border-transparent py-2 text-left text-sm text-muted-foreground transition-colors hover:border-border hover:bg-muted/35 hover:text-foreground", alignWithTask ? "relative pr-2 pl-9 md:pl-[72px]" : "px-2")} onClick={() => setExpanded(true)}>
      <span className={cn("flex size-5 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover/add-task:bg-foreground group-hover/add-task:text-background", alignWithTask && "absolute left-2 md:left-11")}><Plus className="size-3.5" /></span>
      New task
    </button>
  );

  return (
    <form ref={rootRef as React.Ref<HTMLFormElement>} data-quick-add aria-label="New task" aria-busy={pending} onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        // Portalled menus and dialogs handle their own Escape. React still
        // bubbles their events here after they close, when menuOpen may be false.
        if (!rootRef.current?.contains(event.target as Node)) return;
        event.preventDefault(); event.stopPropagation();
        if (menuOpen) { setMenuOpen(false); return; }
        if (panel) { closePanel(); return; }
        cancel();
      }}
      className={cn("min-w-0 rounded-xl border border-border bg-card shadow-sm transition-colors focus-within:border-muted-foreground/50", alignWithTask && "md:ml-11")}
    >
      <fieldset disabled={frozen} className="min-w-0">
        <div className="px-3 pt-3 pb-2">
          <TaskComposerInput value={content} tokens={tokens} inputRef={inputRef} disabled={frozen} hintId={hintId} onChange={(value) => { setContent(value); setError(null); }} onSubmit={() => (rootRef.current as HTMLFormElement)?.requestSubmit()} />
          <span id={hintId} className="sr-only">Dates, repeats, p1 to p4, #projects and @labels are recognized as you type. Enter adds the task. Shift+Enter starts a new line.</span>
          {descriptionOpen && <Textarea autoFocus aria-label="Description" placeholder="Description" maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 min-h-16 resize-y border-0 bg-transparent px-0 py-1 shadow-none focus-visible:ring-0 md:text-sm" />}
        </div>
        <div className="flex items-end gap-2 px-2 pb-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger render={<button type="button" aria-label="Add task details" title="Add task details" className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><Plus className="size-4" /></button>} />
              <DropdownMenuContent className="w-60" align="start" sideOffset={8} finalFocus={panel || descriptionOpen ? false : undefined}>
                <DropdownMenuItem className="min-h-9 gap-3 px-2" onClick={() => { setDescriptionOpen(true); setPanel(null); }}><AlignLeft />Description{descriptionOpen && <Check className="ml-auto" />}</DropdownMenuItem>
                <DropdownMenuItem className="min-h-9 gap-3 px-2" onClick={() => fileInputRef.current?.click()}><Paperclip />Attachment</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="min-h-9 gap-3 px-2" onClick={() => setPanel("date")}><CalendarDays />Date</DropdownMenuItem>
                <DropdownMenuItem className="min-h-9 gap-3 px-2" onClick={() => setPanel("priority")}><Flag />Priority<span className="ml-auto text-xs text-muted-foreground">p1–p4</span></DropdownMenuItem>
                <DropdownMenuItem className="min-h-9 gap-3 px-2" onClick={() => { setEditingReminder(null); setReminderDraft(""); setPanel("reminders"); }}><Bell />Reminders</DropdownMenuItem>
                <DropdownMenuItem className="min-h-9 gap-3 px-2" onClick={() => setPanel("labels")}><Tag />Labels<span className="ml-auto text-xs text-muted-foreground">@</span></DropdownMenuItem>
                <DropdownMenuItem className="min-h-9 gap-3 px-2" onClick={() => setPanel("deadline")}><Flag />Deadline<span className="ml-auto text-xs text-muted-foreground">{'{date}'}</span></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="min-h-9 gap-3 px-2" onClick={() => setPanel("date")}><Repeat />Repeat</DropdownMenuItem>
                <DropdownMenuItem className="min-h-9 gap-3 px-2" onClick={() => setPanel("duration")}><Timer />Duration</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <input ref={fileInputRef} type="file" multiple className="hidden" aria-label="Attachments" onChange={(event) => {
              const selected = Array.from(event.target.files ?? []);
              const invalid = selected.filter((file) => !file.size || file.size > 10 * 1024 * 1024);
              setError(invalid.length ? "Attachments must be nonempty and no larger than 10 MB each." : null);
              setFiles((current) => [...current, ...selected.filter((file) => file.size > 0 && file.size <= 10 * 1024 * 1024)]);
              event.target.value = "";
            }} />
            <ComposerChip icon={targetProject?.isInbox ? Inbox : Hash} label="Project and section" disabled={Boolean(parentId)} onClick={() => setPanel("project")}>
              {`${targetProject?.name ?? (referencesLoading ? "Loading…" : "Current project")}${targetSectionId ? ` / ${targetSection?.name ?? "Section"}` : ""}`}
            </ComposerChip>
            <ComposerChip icon={recurrence ? Repeat : CalendarDays} label="Date" onClick={() => setPanel("date")} onRemove={dueDate ? () => changeSchedule(emptySchedule) : undefined} className={dueDate ? "text-amber-800 dark:text-amber-400" : undefined}>{dateText}</ComposerChip>
            {recurrence && panel !== "date" && <RecurrencePicker value={recurrence} onChange={(rule) => changeSchedule({ date: dueDate, time: dueTime, recurrence: rule })} anchorDate={dueDate || today} />}
            {priority < 4 && <ComposerChip icon={Flag} label="Priority" onClick={() => setPanel("priority")} onRemove={() => { strip(["priority"]); setManualPriority(4); }} className={composerPriorityColors[priority]}>{`P${priority}`}</ComposerChip>}
            {selectedLabels.map((label) => <ComposerChip key={label.id} icon={Tag} label={`Label ${label.name}`} onClick={() => setPanel("labels")} onRemove={() => removeLabel(label)}>{label.name}</ComposerChip>)}
            {deadline && <ComposerChip icon={Flag} label="Deadline" onClick={() => setPanel("deadline")} onRemove={() => { strip(["deadline"]); setManualDeadline(""); }}>{`Deadline: ${dueLabel(deadline, today, "dd/MM/yyyy")}`}</ComposerChip>}
            {duration && <ComposerChip icon={Timer} label="Duration" onClick={() => setPanel("duration")} onRemove={() => { strip(["duration"]); setManualDuration(""); }}>{humanizeDuration(Number(duration))}</ComposerChip>}
            {selectedReminders.map((reminder) => <ComposerChip key={reminder} icon={Bell} label={`Reminder ${new Date(reminder).toLocaleString()}`} onClick={() => { setEditingReminder(reminder); setReminderDraft(reminder); setPanel("reminders"); }} onRemove={() => { if (reminder === parsed.reminderAt) strip(["reminder"]); setReminders((current) => current.filter((item) => item !== reminder)); }}>{new Date(reminder).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</ComposerChip>)}
            {files.map((file, index) => <ComposerChip key={`${file.name}-${index}`} icon={Paperclip} label={`Attachment ${file.name}`} onClick={() => fileInputRef.current?.click()} onRemove={() => setFiles((current) => current.filter((_, i) => i !== index))}>{file.name}</ComposerChip>)}
          </div>
          {!recovery && <div className="flex shrink-0 items-center gap-1">
            <button type="button" aria-label="Cancel" title="Cancel (Esc)" onClick={cancel} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><X className="size-4" /></button>
            <Button type="submit" size="icon-sm" aria-label="Add task" title="Add task (Enter)" disabled={frozen || creatingLabel || !content.trim()} className="rounded-lg">{pending ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <ArrowUp className="size-4" />}</Button>
          </div>}
        </div>
        {panel && <ComposerPanel title={panelTitles[panel]} onClose={closePanel}>
          {panel === "project" && <>
            <Input autoFocus aria-label="Search projects and sections" placeholder="Search projects and sections" value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
            {referencesLoading ? <p className="py-3 text-sm text-muted-foreground">Loading projects…</p> : <ComposerProjectPicker projects={projects} sections={sections} projectId={targetProjectId} sectionId={targetSectionId} search={projectSearch} onChange={(id, section) => { strip(["project"]); setDestination({ projectId: id, sectionId: section }); closePanel(); }} />}
            {referencesError && <p className="mt-2 text-sm text-destructive">Couldn&apos;t load all projects and sections. <button type="button" className="underline underline-offset-2" onClick={() => { setReferencesLoading(true); setReferenceAttempt((value) => value + 1); }}>Try again</button></p>}
          </>}
          {panel === "date" && <>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {[{ label: "Today", date: today }, { label: "Tomorrow", date: addDays(today, 1) }, { label: "Next week", date: weekStartOf(addDays(today, 7), 1) }].map((option) => <Button key={option.label} type="button" size="sm" variant="outline" onClick={() => { changeSchedule({ date: option.date, time: dueTime, recurrence }); closePanel(); }}>{option.label}</Button>)}
              <Button type="button" size="sm" variant="ghost" onClick={() => { changeSchedule(emptySchedule); closePanel(); }}>No date</Button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1 text-xs text-muted-foreground">Date<Input autoFocus type="date" aria-label="Due date" className="mt-1" value={dueDate} onChange={(event) => changeSchedule(event.target.value ? { date: event.target.value, time: dueTime, recurrence } : emptySchedule)} /></label>
              <label className="min-w-0 flex-1 text-xs text-muted-foreground">Time<Input type="time" aria-label="Due time" className="mt-1" value={dueTime} onChange={(event) => changeSchedule({ date: dueDate || today, time: event.target.value, recurrence })} /></label>
              <RecurrencePicker value={recurrence} onChange={(rule) => changeSchedule({ date: dueDate || (rule ? firstOccurrence(rule, today) : ""), time: dueTime, recurrence: rule })} anchorDate={dueDate || today} />
            </div>
          </>}
          {panel === "priority" && <ComposerPriorityPicker value={priority} onChange={(value) => { strip(["priority"]); setManualPriority(value); closePanel(); }} />}
          {panel === "deadline" && <>
            <p className="mb-2 text-xs text-muted-foreground">The date this must be finished by.</p>
            <div className="flex flex-wrap gap-2"><Input autoFocus type="date" aria-label="Deadline date" className="w-auto max-w-full" value={deadline} onChange={(event) => { strip(["deadline"]); setManualDeadline(event.target.value); }} /><Button type="button" variant="ghost" size="sm" onClick={() => { strip(["deadline"]); setManualDeadline(""); closePanel(); }}>No deadline</Button></div>
          </>}
          {panel === "duration" && <label className="block text-xs text-muted-foreground">Estimated time in minutes<Input autoFocus type="number" aria-label="Duration in minutes" min={1} max={1440} step={1} placeholder="30" className="mt-1 w-32" value={duration} onChange={(event) => { strip(["duration"]); setManualDuration(event.target.value); }} /></label>}
          {panel === "reminders" && <>
            <p className="mb-2 text-xs text-muted-foreground">Get a reminder at a specific time. Uses this device&apos;s time zone.</p>
            <div className="flex flex-wrap gap-2"><Input autoFocus type="datetime-local" aria-label="Reminder date and time" className="min-w-0 flex-1" value={reminderDraft} onChange={(event) => setReminderDraft(event.target.value)} /><Button type="button" size="sm" disabled={!reminderDraft || !Number.isFinite(new Date(reminderDraft).getTime())} onClick={() => { if (editingReminder === parsed.reminderAt) strip(["reminder"]); setReminders((current) => [...new Set([...current.filter((value) => value !== editingReminder), reminderDraft])]); setReminderDraft(""); setEditingReminder(null); closePanel(); }}>{editingReminder ? "Save reminder" : "Add reminder"}</Button></div>
          </>}
          {panel === "labels" && <>
            <Input autoFocus aria-label="Search or create labels" placeholder="Search or create a label" maxLength={120} value={labelSearch} onChange={(event) => setLabelSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (labelSearch.trim() && !availableLabels.some((label) => label.name.toLowerCase() === labelSearch.trim().toLowerCase())) void createLabel(); } }} />
            <div className="mt-2 max-h-44 overflow-y-auto">
              {availableLabels.filter((label) => label.name.toLowerCase().includes(labelSearch.trim().toLowerCase())).map((label) => <label key={label.id} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-muted"><input type="checkbox" className="size-4 accent-foreground" checked={selectedLabels.some((selected) => selected.id === label.id)} onChange={(event) => event.target.checked ? setManualLabelIds((current) => [...current, label.id]) : removeLabel(label)} /><Tag className="size-3.5 text-muted-foreground" /><span className="truncate">{label.name}</span></label>)}
              {!availableLabels.length && !labelSearch && <p className="py-2 text-sm text-muted-foreground">Type a name above to create your first label.</p>}
              {labelSearch.trim() && !availableLabels.some((label) => label.name.toLowerCase() === labelSearch.trim().toLowerCase()) && <Button type="button" variant="ghost" size="sm" className="mt-1 max-w-full" disabled={creatingLabel} onClick={() => void createLabel()}><Plus className="size-3.5" /><span className="truncate">{creatingLabel ? "Creating…" : `Create “${labelSearch.trim()}”`}</span></Button>}
            </div>
          </>}
        </ComposerPanel>}
      </fieldset>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{recognitionSummary}</p>
      {error && <p role="alert" className="px-3 pt-1 pb-3 text-sm text-destructive">{error}</p>}
      {recovery && <div className="flex justify-end gap-2 px-3 pb-3"><Button type="button" size="sm" variant="ghost" disabled={pending} onClick={cancel}>Done</Button><Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Retry details"}</Button></div>}
    </form>
  );
}
