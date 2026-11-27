"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Ellipsis, Flag, Paperclip, Pencil, Plus, Repeat, Trash2, X } from "lucide-react";

import { useOffline, useOnline, useRenamed, useSnapshot, useTaskDetails, useWrites } from "@/lib/offline/hooks";
import { byOrder } from "@/lib/offline/support";
import { isLocalId, type CommentEntity, type TaskEntity } from "@/lib/offline/types";
import { taskView } from "@/lib/offline/view";
import { visibleProjects } from "@/lib/task-views";
import { useTaskActions } from "@/lib/use-task-actions";
import type { attachments as attachmentsTable } from "@/lib/db/schema";
import { dueLabel, formatDateTime, humanizeDuration, pastDateLabel } from "@/lib/dates";
import { firstOccurrence } from "@/lib/recurrence";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput, DateTimeInput, useDatePreferences } from "@/components/date-input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LabelChip } from "@/components/labels/label-chip";
import type { TaskEdit } from "@/lib/offline/task-writes";
import { LabelPicker } from "@/components/labels/label-picker";
import { LinkifiedText } from "@/components/linkified-text";
import { TaskDecisions } from "@/components/offline/decisions";
import { TaskAddForm } from "./task-add-form";
import { RecurrencePicker } from "./recurrence-picker";
import { TaskCheckbox } from "./task-checkbox";
import type { ProjectMember, TaskWithLabels } from "./types";

type Comment = CommentEntity;
type Attachment = typeof attachmentsTable.$inferSelect;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The task [taskId] names, which follows it when it takes its server id. Renders nothing while the store doesn't have it. */
export function TaskModal({ taskId, ...props }: { taskId: string } & Omit<DialogProps, "task">) {
  const id = useRenamed(taskId) ?? taskId;
  const entity = useSnapshot((snapshot) => snapshot.tasks.get(id));
  const labelRows = useSnapshot((snapshot) => snapshot.labels);
  const task = useMemo(() => (entity ? taskView(entity, { labels: labelRows }) : null), [entity, labelRows]);
  return task && <TaskDialog task={task} {...props} />;
}

type DialogProps = {
  task: TaskWithLabels;
  members?: ProjectMember[];
  currentUserId: string;
  today: string;
  dateFormat: string;
  onClose: () => void;
  onDelete: (task: TaskWithLabels) => void;
  onPrev?: () => void;
  onNext?: () => void;
};

function TaskDialog({ task, members = [], currentUserId, today, dateFormat, onClose, onDelete, onPrev, onNext }: DialogProps) {
  const { store, repo, outbox } = useOffline();
  const writes = useWrites();
  const actions = useTaskActions(writes.tasks);
  const online = useOnline();
  const { comments, reminders } = useTaskDetails(task.id);
  const taskRows = useSnapshot((snapshot) => snapshot.tasks);
  const projectRows = useSnapshot((snapshot) => snapshot.projects);
  const subtasks = useMemo(() => [...taskRows.values()].filter((subtask) => subtask.parentId === task.id && subtask.deletedAt === null).sort(byOrder), [taskRows, task.id]);
  const projects = useMemo(() => visibleProjects(projectRows.values()), [projectRows]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(task.content);
  const [editingDescription, setEditingDescription] = useState(false);
  const [description, setDescription] = useState(task.description ?? "");
  const [subtasksOpen, setSubtasksOpen] = useState(true);
  const [editingDate, setEditingDate] = useState(false);
  const [date, setDate] = useState(task.dueDate ?? "");
  const [time, setTime] = useState(task.dueTime ?? "");
  const [editingRecurrenceEnd, setEditingRecurrenceEnd] = useState(false);
  const [recurrenceEnd, setRecurrenceEnd] = useState(task.recurrenceEndDate ?? "");
  const [editingDeadline, setEditingDeadline] = useState(false);
  const [deadline, setDeadline] = useState(task.deadlineDate ?? "");
  const [editingDuration, setEditingDuration] = useState(false);
  const [duration, setDuration] = useState(task.durationMinutes ? String(task.durationMinutes) : "");
  const [addingReminder, setAddingReminder] = useState(false);
  const [reminderValue, setReminderValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // The store's copy, which a write needs; the task prop may be a render behind.
  const current = () => store.getSnapshot().tasks.get(task.id);
  const patch = (edit: TaskEdit) => {
    const entity = current();
    if (entity) writes.tasks.update(entity, edit);
  };
  function toggleCompleted(entity: TaskEntity | undefined) {
    if (!entity) return;
    if (entity.isCompleted) writes.tasks.reopen(entity);
    else writes.tasks.complete(entity);
  }
  function toggleTask() {
    toggleCompleted(current());
  }
  function changeProject(projectId: string | null) {
    const entity = current();
    if (projectId && entity && projectId !== task.projectId) writes.tasks.move(entity, projectId, null);
  }
  function setLabels(labelIds: string[]) {
    const entity = current();
    if (entity) writes.tasks.setLabels(entity, labelIds);
  }

  // Attachments and assignees live only on the server, which needs the task's own id.
  async function serverId() {
    if (!isLocalId(task.id)) return task.id;
    await repo.sync();
    return outbox.renamedTo(task.id);
  }
  async function onServer(action: (id: string) => Promise<Response | boolean>) {
    setError(null);
    try {
      const id = await serverId();
      const result = id ? await action(id) : false;
      if (result === true || (result !== false && result.ok)) return true;
    } catch {}
    setError("That didn't work. Try again.");
    return false;
  }
  async function assign(assigneeId: string | null) {
    await onServer((id) => actions.assign(id, assigneeId));
  }

  useEffect(() => {
    if (!online || isLocalId(task.id)) return;
    let live = true;
    void fetch(`/api/attachments?taskId=${task.id}`).then((r) => r.ok ? r.json() : null).then((list) => live && list && setAttachments(list), () => {});
    return () => { live = false; };
  }, [online, task.id]);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.offsetParent !== null);
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", keydown);
      previouslyFocused?.focus();
    };
  }, []);

  const done = subtasks.filter((subtask) => subtask.isCompleted).length;
  const projectName = projects.find((project) => project.id === task.projectId)?.name ?? "Project";
  const currentMember = members.find((member) => member.id === currentUserId);
  const avatar = currentMember?.username.charAt(0).toUpperCase() ?? "•";

  function saveTitle() { setEditingTitle(false); const content = title.trim(); if (content && content !== task.content) patch({ content }); else setTitle(task.content); }
  function saveDescription() { setEditingDescription(false); if (description !== (task.description ?? "")) patch({ description }); }
  function addComment(content: string) { writes.notes.addComment(task.id, null, content, currentUserId); }
  function addReminder() { if (!Number.isFinite(new Date(reminderValue).getTime())) return; writes.notes.addReminder(task.id, new Date(reminderValue).toISOString()); setReminderValue(""); setAddingReminder(false); }
  async function uploadFile(file: File) { setUploading(true); await onServer(async (id) => { const body = new FormData(); body.set("taskId", id); body.set("file", file); const response = await fetch("/api/attachments", { method: "POST", body }); if (response.ok) { const attachment = await response.json(); setAttachments((list) => [...list, attachment]); } return response; }); setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  async function deleteAttachment(attachment: Attachment) { await onServer(async () => { const response = await fetch(`/api/attachments/${attachment.id}`, { method: "DELETE" }); if (response.ok) setAttachments((list) => list.filter((item) => item.id !== attachment.id)); return response; }); }

  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-4 md:py-[6vh]" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="task-dialog-title" tabIndex={-1} className="task-dialog mx-auto flex h-full max-h-[calc(100dvh-1rem-env(safe-area-inset-bottom))] w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-background shadow-xl md:max-h-[82vh]">
      <header className="flex items-center gap-1 border-b px-4 py-2">
        <a href={`/projects/${encodeURIComponent(task.projectId)}`} className="mr-auto text-sm text-muted-foreground hover:text-foreground">{projectName}</a>
        <Button variant="ghost" size="icon-xs" aria-label="Previous task" disabled={!onPrev} onClick={onPrev}><ChevronUp className="size-3.5" /></Button>
        <Button variant="ghost" size="icon-xs" aria-label="Next task" disabled={!onNext} onClick={onNext}><ChevronDown className="size-3.5" /></Button>
        <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Task actions"><Ellipsis className="size-3.5" /></Button>} /><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => void navigator.clipboard.writeText(`${location.origin}/projects/${task.projectId}?task=${task.id}`)}>Copy link to task</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => { onDelete(task); onClose(); }}>Move to Trash</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        <Button ref={closeButtonRef} variant="ghost" size="icon-xs" aria-label="Close" onClick={onClose}><X className="size-3.5" /></Button>
      </header>
      <div className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        <div className="flex-1 px-3 py-4 sm:px-4 md:overflow-y-auto">
          <TaskDecisions taskId={task.id} />
          <div className="flex items-start gap-3"><TaskCheckbox priority={task.priority} checked={task.isCompleted} onToggle={toggleTask} />{editingTitle ? <Input id="task-dialog-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); }} className="text-lg font-semibold" /> : <ClickToEdit id="task-dialog-title" label="Edit title" text={task.content} className={cn("w-full text-lg font-semibold", task.isCompleted && "text-muted-foreground line-through")} onEdit={() => setEditingTitle(true)} />}</div>
          <div className="ml-9 mt-2">{editingDescription ? <Textarea autoFocus value={description} onChange={(e) => setDescription(e.target.value)} onBlur={saveDescription} /> : <ClickToEdit label="Edit description" text={task.description || "Description"} className={cn("whitespace-pre-wrap text-base sm:text-sm", task.description ? "text-muted-foreground" : "text-muted-foreground/60")} onEdit={() => setEditingDescription(true)} />}</div>
          <section className="mt-6"><div className="flex items-center gap-1"><Button type="button" variant="ghost" size="icon-xs" aria-label="Toggle sub-tasks" onClick={() => setSubtasksOpen((value) => !value)}>{subtasksOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</Button><h3 className="text-base font-medium sm:text-sm">Sub-tasks</h3>{subtasks.length > 0 && <span className="text-base text-muted-foreground sm:text-sm">{done}/{subtasks.length}</span>}</div>{subtasksOpen && <><div>{subtasks.map((subtask) => <div key={subtask.id} className="flex items-center gap-2 border-b py-2"><TaskCheckbox priority={subtask.priority} checked={subtask.isCompleted} onToggle={() => toggleCompleted(subtask)} /><span className={cn("text-base sm:text-sm", subtask.isCompleted && "line-through text-muted-foreground")}>{subtask.content}</span></div>)}</div>{!task.isCompleted && <TaskAddForm projectId={task.projectId} sectionId={task.sectionId} parentId={task.id} today={today}  onError={() => setError("That didn't work. Try again.")} />}</>}</section>
          <section className="mt-6"><h3 className="text-base font-medium sm:text-sm">Comments {comments.length > 0 && <span className="text-muted-foreground">{comments.length}</span>}</h3>{attachments.map((attachment) => <div key={attachment.id} className="group flex items-center justify-between gap-2 rounded-md p-2 hover:bg-muted/50"><a href={`/api/attachments/${attachment.id}`} className="truncate text-base underline-offset-2 hover:underline sm:text-sm">{attachment.filename}</a><div className="flex shrink-0 items-center gap-2"><span className="text-xs text-muted-foreground">{formatSize(attachment.size)}</span><Button variant="ghost" size="icon-xs" aria-label="Delete attachment" className="opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100" disabled={!online} onClick={() => void deleteAttachment(attachment)}><Trash2 className="size-3.5" /></Button></div></div>)}{comments.map((comment) => <CommentRow key={comment.id} comment={comment} author={members.find((member) => member.id === comment.userId)?.username} canEdit={comment.userId === currentUserId} onEdit={(content) => writes.notes.editComment(comment, content)} onDelete={() => writes.notes.deleteComment(comment)} />)}</section>
          <CommentInput avatar={avatar} onSubmit={addComment} onAttachment={(file) => void uploadFile(file)} uploading={uploading} online={online} fileInputRef={fileInputRef} />
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
        <div className="w-full shrink-0 border-t bg-muted/20 px-3 py-2 sm:px-4 md:w-64 md:overflow-y-auto md:border-t-0 md:border-l">
          <RailRow label="Project"><Select value={task.projectId} onValueChange={changeProject}><SelectTrigger size="sm" aria-label="Project"><SelectValue>{projectName}</SelectValue></SelectTrigger><SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></RailRow>
          <RailRow label="Date">{editingDate ? <div className="flex flex-wrap gap-1"><DateInput aria-label="Due date" value={date} onChange={setDate} /><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /><Button size="sm" onClick={() => { patch({ dueDate: date || null, dueTime: date && time ? time : null }); setEditingDate(false); }}>Save</Button><Button variant="ghost" size="sm" onClick={() => { patch({ dueDate: null, dueTime: null }); setEditingDate(false); }}>Clear</Button></div> : <button type="button" className={cn("flex items-center gap-1 text-sm", task.dueDate ? task.dueDate < today ? "text-red-600" : task.dueDate === today ? "text-green-600" : "text-muted-foreground" : "text-muted-foreground")} onClick={() => setEditingDate(true)}>{task.recurrence && <Repeat className="size-3.5" />}{task.dueDate ? `${dueLabel(task.dueDate, today, dateFormat)}${task.dueTime ? ` ${task.dueTime}` : ""}` : "Add date"}</button>}</RailRow>
          <RailRow label="Repeats"><RecurrencePicker appearance="inline" value={task.recurrence} anchorDate={task.dueDate ?? today} onChange={(rule) => patch(rule ? { recurrence: rule, ...(task.dueDate ? {} : { dueDate: firstOccurrence(rule, today) }) } : { recurrence: null })} />{task.recurrence && (editingRecurrenceEnd ? <div className="mt-2 flex flex-wrap gap-1"><DateInput aria-label="Repeat end date" min={task.dueDate ?? undefined} value={recurrenceEnd} onChange={setRecurrenceEnd} /><Button size="sm" onClick={() => { patch({ recurrenceEndDate: recurrenceEnd || null }); setEditingRecurrenceEnd(false); }}>Save</Button><Button variant="ghost" size="sm" onClick={() => { setRecurrenceEnd(""); patch({ recurrenceEndDate: null }); setEditingRecurrenceEnd(false); }}>No end</Button></div> : <button type="button" className="mt-1 flex items-center gap-1 text-sm text-muted-foreground" onClick={() => setEditingRecurrenceEnd(true)}>{task.recurrenceEndDate ? `Ends ${dueLabel(task.recurrenceEndDate, today, dateFormat)}` : "No end date"}</button>)}</RailRow>
          <RailRow label="Deadline">{editingDeadline ? <div className="flex flex-wrap gap-1"><DateInput aria-label="Deadline date" value={deadline} onChange={setDeadline} /><Button size="sm" onClick={() => { patch({ deadlineDate: deadline || null }); setEditingDeadline(false); }}>Save</Button><Button variant="ghost" size="sm" onClick={() => { patch({ deadlineDate: null }); setEditingDeadline(false); }}>Clear</Button></div> : <button type="button" className={cn("flex items-center gap-1 text-sm", task.deadlineDate ? task.deadlineDate < today ? "text-red-600" : task.deadlineDate === today ? "text-amber-600" : "text-muted-foreground" : "text-muted-foreground")} onClick={() => setEditingDeadline(true)}><Flag className="size-3.5" />{task.deadlineDate ? (task.deadlineDate < today ? pastDateLabel(task.deadlineDate, today, dateFormat) : dueLabel(task.deadlineDate, today, dateFormat)) : "Add deadline"}</button>}</RailRow>
          <RailRow label="Duration">{editingDuration ? <div className="flex flex-wrap items-center gap-1"><Input type="number" min={1} max={1440} aria-label="Duration in minutes" className="w-20" value={duration} onChange={(e) => setDuration(e.target.value)} /><span className="text-xs text-muted-foreground">minutes</span><Button size="sm" onClick={() => { patch({ durationMinutes: duration ? Number(duration) : null }); setEditingDuration(false); }}>Save</Button><Button variant="ghost" size="sm" onClick={() => { patch({ durationMinutes: null }); setEditingDuration(false); }}>Clear</Button></div> : <button type="button" className={cn("text-sm", !task.durationMinutes && "text-muted-foreground")} onClick={() => setEditingDuration(true)}>{task.durationMinutes ? humanizeDuration(task.durationMinutes) : "Add duration"}</button>}</RailRow>
          <RailRow label="Priority"><Select value={String(task.priority)} onValueChange={(value) => patch({ priority: Number(value) })}><SelectTrigger size="sm" aria-label="Priority"><SelectValue><Flag className={cn("size-3.5 fill-current", ["text-red-500", "text-orange-500", "text-blue-500", "text-muted-foreground"][task.priority - 1])} />P{task.priority}</SelectValue></SelectTrigger><SelectContent>{[1, 2, 3, 4].map((priority) => <SelectItem key={priority} value={String(priority)}><span className="flex items-center gap-1"><Flag className={cn("size-3.5 fill-current", ["text-red-500", "text-orange-500", "text-blue-500", "text-muted-foreground"][priority - 1])} />P{priority}</span></SelectItem>)}</SelectContent></Select></RailRow>
          <RailRow label={<span className="flex items-center justify-between">Labels <LabelPicker selectedIds={task.labels.map((label) => label.id)} onChange={setLabels} /></span>}>{task.labels.map((label) => <span key={label.id} className="mr-1 inline-flex items-center"><LabelChip label={label} /><button type="button" aria-label={`Remove label ${label.name}`} onClick={() => setLabels(task.labels.filter((item) => item.id !== label.id).map((item) => item.id))}><X className="size-3" /></button></span>)}</RailRow>
          {members.length > 1 && <RailRow label="Assignee"><Select value={task.assigneeId ?? undefined} disabled={!online} onValueChange={(value) => void assign(value)}><SelectTrigger size="sm" aria-label="Assignee"><SelectValue placeholder="Choose member">{task.assigneeId ? members.find((member) => member.id === task.assigneeId)?.username : null}</SelectValue></SelectTrigger><SelectContent>{members.map((member) => <SelectItem key={member.id} value={member.id}>{member.username}</SelectItem>)}</SelectContent></Select>{!online && <span className="block text-xs text-muted-foreground">Needs a connection</span>}{task.assigneeId && <Button variant="ghost" size="sm" disabled={!online} onClick={() => void assign(null)}>Unassign</Button>}</RailRow>}
          <RailRow label={<span className="flex items-center justify-between">Reminders <Button variant="ghost" size="icon-xs" aria-label="Add reminder" onClick={() => setAddingReminder((value) => !value)}><Plus className="size-3.5" /></Button></span>}>{addingReminder && <div className="flex flex-wrap gap-1"><DateTimeInput label="Reminder" className="w-full" value={reminderValue} onChange={setReminderValue} /><Button size="sm" onClick={() => void addReminder()}>Add</Button></div>}{reminders.map((reminder) => <div key={reminder.id} className="group flex items-center justify-between gap-1 text-sm"><span>{formatDateTime(new Date(reminder.remindAt), dateFormat)}</span><Button variant="ghost" size="icon-xs" aria-label="Delete reminder" className="opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100" onClick={() => writes.notes.deleteReminder(reminder)}><Trash2 className="size-3.5" /></Button></div>)}</RailRow>
        </div>
      </div>
    </div>
  </div>;
}

// Click-to-edit text that keeps its links clickable, which a <button> can't
// hold. Clicking a link or selecting text doesn't start editing. Keyboard users
// get the edit button, which shows once focused.
function ClickToEdit({ id, label, text, className, onEdit }: { id?: string; label: string; text: string; className: string; onEdit: () => void }) {
  return (
    <div className={cn("cursor-text select-text", className)} onClick={(event) => {
      if (!(event.target as Element).closest("a") && !window.getSelection()?.toString()) onEdit();
    }}>
      <span id={id}><LinkifiedText text={text} /></span>
      <button type="button" className="sr-only focus-visible:not-sr-only focus-visible:ml-2 focus-visible:text-xs focus-visible:font-normal focus-visible:underline" onClick={onEdit}>{label}</button>
    </div>
  );
}

function RailRow({ label, children }: { label: ReactNode; children: ReactNode }) { return <div className="border-b py-3 last:border-b-0"><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>{children}</div>; }

function CommentRow({ comment, author, canEdit, onEdit, onDelete }: { comment: Comment; author?: string; canEdit: boolean; onEdit: (content: string) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false); const [content, setContent] = useState(comment.content);
  const { dateFormat } = useDatePreferences();
  function submit(event: FormEvent) { event.preventDefault(); setEditing(false); if (content.trim() && content !== comment.content) onEdit(content.trim()); }
  if (editing) return <form onSubmit={submit} className="py-2"><Textarea autoFocus value={content} onChange={(e) => setContent(e.target.value)} onBlur={submit} /></form>;
  return <div className="group flex items-start gap-2 py-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">{author?.charAt(0).toUpperCase() ?? "?"}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="text-xs"><span className="font-medium">{author ?? "Member"}</span> <span className="text-muted-foreground">{formatDateTime(new Date(comment.createdAt), dateFormat)}</span></p>{canEdit && <span className="flex opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100"><Button variant="ghost" size="icon-xs" aria-label="Edit comment" onClick={() => setEditing(true)}><Pencil className="size-3.5" /></Button><Button variant="ghost" size="icon-xs" aria-label="Delete comment" onClick={onDelete}><Trash2 className="size-3.5" /></Button></span>}</div><p className="whitespace-pre-wrap text-base sm:text-sm">{comment.content}</p></div></div>;
}

function CommentInput({ avatar, onSubmit, onAttachment, uploading, online, fileInputRef }: { avatar: string; onSubmit: (content: string) => void; onAttachment: (file: File) => void; uploading: boolean; online: boolean; fileInputRef: RefObject<HTMLInputElement | null> }) {
  const [content, setContent] = useState(""); function submit(event: FormEvent) { event.preventDefault(); if (!content.trim()) return; onSubmit(content.trim()); setContent(""); }
  return <div className="mt-2 flex items-center gap-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">{avatar}</span><form onSubmit={submit} className="flex flex-1 items-center gap-1 rounded-full border px-3 py-1.5 focus-within:ring-1 focus-within:ring-ring"><input className="min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm" placeholder="Comment" value={content} onChange={(e) => setContent(e.target.value)} /><Button type="button" variant="ghost" size="icon-xs" aria-label="Add attachment" title={online ? undefined : "Needs a connection"} disabled={uploading || !online} onClick={() => fileInputRef.current?.click()}><Paperclip className="size-3.5" /></Button><input ref={fileInputRef} type="file" className="hidden" disabled={uploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) onAttachment(file); }} /></form></div>;
}
