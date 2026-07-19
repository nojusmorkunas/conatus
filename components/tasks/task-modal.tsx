"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Ellipsis, Flag, Hash, Paperclip, Pencil, Plus, Repeat, Trash2, X } from "lucide-react";

import type { attachments as attachmentsTable, comments as commentsTable, labels as labelsTable, reminders as remindersTable } from "@/lib/db/schema";
import { dueLabel, pastDateLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LabelChip } from "@/components/labels/label-chip";
import { LabelPicker } from "@/components/labels/label-picker";
import { TaskAddForm } from "./task-add-form";
import { TaskCheckbox } from "./task-checkbox";
import type { ProjectMember, TaskWithLabels } from "./task-list";

type Label = typeof labelsTable.$inferSelect;
type Comment = typeof commentsTable.$inferSelect;
type Attachment = typeof attachmentsTable.$inferSelect;
type Reminder = typeof remindersTable.$inferSelect;
type Project = { id: string; name: string };

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function humanizeDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (!hours) return `${remaining}m`;
  if (!remaining) return `${hours}h`;
  return `${hours}h ${remaining}m`;
}

export function TaskModal({ task, labels, members = [], currentUserId, today, dateFormat, onClose, onChanged, onDelete, onPrev, onNext }: {
  task: TaskWithLabels;
  labels: Label[];
  members?: ProjectMember[];
  currentUserId: string;
  today: string;
  dateFormat: string;
  onClose: () => void;
  onChanged: () => void;
  onDelete: (task: TaskWithLabels) => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [projectTasks, setProjectTasks] = useState<TaskWithLabels[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
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

  async function withError(action: () => Promise<Response>) {
    setError(null);
    const response = await action();
    if (!response.ok) { setError("That didn't work. Try again."); return null; }
    return response;
  }
  async function patch(body: object) {
    const response = await withError(() => fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    if (response) onChanged();
    return response;
  }
  async function fetchProjectTasks() {
    const response = await fetch(`/api/tasks?projectId=${task.projectId}`);
    if (response.ok) setProjectTasks(await response.json());
  }

  useEffect(() => { void fetch("/api/projects").then((r) => r.ok ? r.json() : []).then(setProjects); }, []);
  useEffect(() => {
    void fetch(`/api/comments?taskId=${task.id}`).then((r) => r.ok ? r.json() : []).then(setComments);
    void fetch(`/api/attachments?taskId=${task.id}`).then((r) => r.ok ? r.json() : []).then(setAttachments);
    void fetch(`/api/reminders?taskId=${task.id}`).then((r) => r.ok ? r.json() : []).then(setReminders);
    void fetch(`/api/tasks?projectId=${task.projectId}`).then((r) => r.ok ? r.json() : []).then(setProjectTasks);
  }, [task.id]); // eslint-disable-line react-hooks/exhaustive-deps -- fetches intentionally reset by task id
  useEffect(() => { const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown); }, [onClose]);

  const subtasks = projectTasks.filter((candidate) => candidate.parentId === task.id).sort((a, b) => a.order < b.order ? -1 : 1);
  const done = subtasks.filter((subtask) => subtask.isCompleted).length;
  const projectName = projects.find((project) => project.id === task.projectId)?.name ?? "Project";
  const currentMember = members.find((member) => member.id === currentUserId);
  const avatar = currentMember?.username.charAt(0).toUpperCase() ?? "•";

  async function saveTitle() { setEditingTitle(false); const content = title.trim(); if (content && content !== task.content) await patch({ content }); else setTitle(task.content); }
  async function saveDescription() { setEditingDescription(false); if (description !== (task.description ?? "")) await patch({ description: description || null }); }
  async function toggleSubtask(subtask: TaskWithLabels) { const response = await withError(() => fetch(`/api/tasks/${subtask.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed: !subtask.isCompleted }) })); if (response) { await fetchProjectTasks(); onChanged(); } }
  async function addComment(content: string) { const response = await withError(() => fetch("/api/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: task.id, content }) })); if (response) { const comment = await response.json(); setComments((current) => [...current, comment]); onChanged(); } }
  async function editComment(comment: Comment, content: string) { const response = await withError(() => fetch(`/api/comments/${comment.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) })); if (response) { const updated = await response.json(); setComments((current) => current.map((item) => item.id === updated.id ? updated : item)); onChanged(); } }
  async function deleteComment(comment: Comment) { const response = await withError(() => fetch(`/api/comments/${comment.id}`, { method: "DELETE" })); if (response) { setComments((current) => current.filter((item) => item.id !== comment.id)); onChanged(); } }
  async function uploadFile(file: File) { const body = new FormData(); body.set("taskId", task.id); body.set("file", file); setUploading(true); const response = await withError(() => fetch("/api/attachments", { method: "POST", body })); setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; if (response) { const attachment = await response.json(); setAttachments((current) => [...current, attachment]); onChanged(); } }
  async function deleteAttachment(attachment: Attachment) { const response = await withError(() => fetch(`/api/attachments/${attachment.id}`, { method: "DELETE" })); if (response) { setAttachments((current) => current.filter((item) => item.id !== attachment.id)); onChanged(); } }
  async function addReminder() { if (!reminderValue) return; const response = await withError(() => fetch("/api/reminders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: task.id, remindAt: new Date(reminderValue).toISOString() }) })); if (response) { const reminder = await response.json(); setReminders((current) => [...current, reminder]); setReminderValue(""); setAddingReminder(false); onChanged(); } }
  async function deleteReminder(reminder: Reminder) { const response = await withError(() => fetch(`/api/reminders/${reminder.id}`, { method: "DELETE" })); if (response) { setReminders((current) => current.filter((item) => item.id !== reminder.id)); onChanged(); } }

  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4 md:py-[6vh]" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" className="mx-auto flex h-full max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-background shadow-xl">
      <header className="flex items-center gap-1 border-b px-4 py-2">
        <a href={`/projects/${task.projectId}`} className="mr-auto flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><Hash className="size-3.5" />{projectName}</a>
        <Button variant="ghost" size="icon-xs" aria-label="Previous task" disabled={!onPrev} onClick={onPrev}><ChevronUp className="size-3.5" /></Button>
        <Button variant="ghost" size="icon-xs" aria-label="Next task" disabled={!onNext} onClick={onNext}><ChevronDown className="size-3.5" /></Button>
        <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Task actions"><Ellipsis className="size-3.5" /></Button>} /><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => void navigator.clipboard.writeText(`${location.origin}/projects/${task.projectId}?task=${task.id}`)}>Copy link to task</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onClick={() => { onDelete(task); onClose(); }}>Delete task</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        <Button variant="ghost" size="icon-xs" aria-label="Close" onClick={onClose}><X className="size-3.5" /></Button>
      </header>
      <div className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        <main className="flex-1 px-6 py-4 md:overflow-y-auto">
          <div className="flex items-start gap-3"><TaskCheckbox priority={task.priority} checked={task.isCompleted} onToggle={() => void patch({ completed: !task.isCompleted })} />{editingTitle ? <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => void saveTitle()} onKeyDown={(e) => { if (e.key === "Enter") void saveTitle(); }} className="text-lg font-semibold" /> : <button type="button" className={cn("w-full text-left text-lg font-semibold", task.isCompleted && "text-muted-foreground line-through")} onClick={() => setEditingTitle(true)}>{task.content}</button>}</div>
          <div className="ml-9 mt-2">{editingDescription ? <Textarea autoFocus value={description} onChange={(e) => setDescription(e.target.value)} onBlur={() => void saveDescription()} /> : <button type="button" className={cn("whitespace-pre-wrap text-left text-sm", task.description ? "text-muted-foreground" : "text-muted-foreground/60")} onClick={() => setEditingDescription(true)}>{task.description || "Description"}</button>}</div>
          <section className="mt-6"><div className="flex items-center gap-1"><button type="button" aria-label="Toggle sub-tasks" onClick={() => setSubtasksOpen((value) => !value)}>{subtasksOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</button><h3 className="text-sm font-medium">Sub-tasks</h3>{subtasks.length > 0 && <span className="text-sm text-muted-foreground">{done}/{subtasks.length}</span>}</div>{subtasksOpen && <><div>{subtasks.map((subtask) => <div key={subtask.id} className="flex items-center gap-2 border-b py-2"><TaskCheckbox priority={subtask.priority} checked={subtask.isCompleted} onToggle={() => void toggleSubtask(subtask)} /><span className={cn("text-sm", subtask.isCompleted && "line-through text-muted-foreground")}>{subtask.content}</span></div>)}</div><TaskAddForm projectId={task.projectId} sectionId={task.sectionId} parentId={task.id} today={today} labels={labels} onCreated={() => { void fetchProjectTasks(); onChanged(); }} onError={() => setError("That didn't work. Try again.")} /></>}</section>
          <section className="mt-6"><h3 className="text-sm font-medium">Comments {comments.length > 0 && <span className="text-muted-foreground">{comments.length}</span>}</h3>{attachments.map((attachment) => <div key={attachment.id} className="group flex items-center justify-between gap-2 rounded-md p-2 hover:bg-muted/50"><a href={`/api/attachments/${attachment.id}`} className="truncate text-sm underline-offset-2 hover:underline">{attachment.filename}</a><div className="flex shrink-0 items-center gap-2"><span className="text-xs text-muted-foreground">{formatSize(attachment.size)}</span><Button variant="ghost" size="icon-xs" aria-label="Delete attachment" className="opacity-0 transition-opacity group-hover:opacity-100" onClick={() => void deleteAttachment(attachment)}><Trash2 className="size-3.5" /></Button></div></div>)}{comments.map((comment) => <CommentRow key={comment.id} comment={comment} author={members.find((member) => member.id === comment.userId)?.username} canEdit={comment.userId === currentUserId} onEdit={(content) => void editComment(comment, content)} onDelete={() => void deleteComment(comment)} />)}</section>
          <CommentInput avatar={avatar} onSubmit={(content) => void addComment(content)} onAttachment={(file) => void uploadFile(file)} uploading={uploading} fileInputRef={fileInputRef} />
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </main>
        <aside className="w-full shrink-0 border-t bg-muted/20 px-4 py-2 md:w-64 md:overflow-y-auto md:border-t-0 md:border-l">
          <RailRow label="Project"><Select value={task.projectId} onValueChange={(value) => void patch({ projectId: value })}><SelectTrigger size="sm" aria-label="Project"><SelectValue>{projectName}</SelectValue></SelectTrigger><SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></RailRow>
          <RailRow label="Date">{editingDate ? <div className="flex flex-wrap gap-1"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /><Button size="sm" onClick={() => { void patch({ dueDate: date || null, dueTime: date && time ? time : null }); setEditingDate(false); }}>Save</Button><Button variant="ghost" size="sm" onClick={() => { void patch({ dueDate: null, dueTime: null }); setEditingDate(false); }}>Clear</Button></div> : <button type="button" className={cn("flex items-center gap-1 text-sm", task.dueDate ? task.dueDate < today ? "text-red-600" : task.dueDate === today ? "text-green-600" : "text-muted-foreground" : "text-muted-foreground")} onClick={() => setEditingDate(true)}>{task.recurrence && <Repeat className="size-3.5" />}{task.dueDate ? `${dueLabel(task.dueDate, today, dateFormat)}${task.dueTime ? ` ${task.dueTime}` : ""}` : "Add date"}</button>}</RailRow>
          {task.recurrence && <RailRow label="Repeat ends">{editingRecurrenceEnd ? <div className="flex flex-wrap gap-1"><Input aria-label="Repeat end date" type="date" min={task.dueDate ?? undefined} value={recurrenceEnd} onChange={(e) => setRecurrenceEnd(e.target.value)} /><Button size="sm" onClick={() => { void patch({ recurrenceEndDate: recurrenceEnd || null }); setEditingRecurrenceEnd(false); }}>Save</Button><Button variant="ghost" size="sm" onClick={() => { setRecurrenceEnd(""); void patch({ recurrenceEndDate: null }); setEditingRecurrenceEnd(false); }}>No end</Button></div> : <button type="button" className="flex items-center gap-1 text-sm text-muted-foreground" onClick={() => setEditingRecurrenceEnd(true)}><Repeat className="size-3.5" />{task.recurrenceEndDate ? dueLabel(task.recurrenceEndDate, today, dateFormat) : "No end date"}</button>}</RailRow>}
          <RailRow label="Deadline">{editingDeadline ? <div className="flex flex-wrap gap-1"><Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /><Button size="sm" onClick={() => { void patch({ deadlineDate: deadline || null }); setEditingDeadline(false); }}>Save</Button><Button variant="ghost" size="sm" onClick={() => { void patch({ deadlineDate: null }); setEditingDeadline(false); }}>Clear</Button></div> : <button type="button" className={cn("flex items-center gap-1 text-sm", task.deadlineDate ? task.deadlineDate < today ? "text-red-600" : task.deadlineDate === today ? "text-amber-600" : "text-muted-foreground" : "text-muted-foreground")} onClick={() => setEditingDeadline(true)}><Flag className="size-3.5" />{task.deadlineDate ? (task.deadlineDate < today ? pastDateLabel(task.deadlineDate, today, dateFormat) : dueLabel(task.deadlineDate, today, dateFormat)) : "Add deadline"}</button>}</RailRow>
          <RailRow label="Duration">{editingDuration ? <div className="flex flex-wrap gap-1"><Input type="number" min={1} max={1440} value={duration} onChange={(e) => setDuration(e.target.value)} /><Button size="sm" onClick={() => { void patch({ durationMinutes: duration ? Number(duration) : null }); setEditingDuration(false); }}>Save</Button><Button variant="ghost" size="sm" onClick={() => { void patch({ durationMinutes: null }); setEditingDuration(false); }}>Clear</Button></div> : <button type="button" className={cn("text-sm", !task.durationMinutes && "text-muted-foreground")} onClick={() => setEditingDuration(true)}>{task.durationMinutes ? humanizeDuration(task.durationMinutes) : "Add duration"}</button>}</RailRow>
          <RailRow label="Priority"><Select value={String(task.priority)} onValueChange={(value) => void patch({ priority: Number(value) })}><SelectTrigger size="sm" aria-label="Priority"><SelectValue><Flag className={cn("size-3.5 fill-current", ["text-red-500", "text-orange-500", "text-blue-500", "text-muted-foreground"][task.priority - 1])} />P{task.priority}</SelectValue></SelectTrigger><SelectContent>{[1, 2, 3, 4].map((priority) => <SelectItem key={priority} value={String(priority)}><span className="flex items-center gap-1"><Flag className={cn("size-3.5 fill-current", ["text-red-500", "text-orange-500", "text-blue-500", "text-muted-foreground"][priority - 1])} />P{priority}</span></SelectItem>)}</SelectContent></Select></RailRow>
          <RailRow label={<span className="flex items-center justify-between">Labels <LabelPicker labels={labels} selectedIds={task.labels.map((label) => label.id)} onChange={(labelIds) => void patch({ labelIds })} /></span>}>{task.labels.map((label) => <span key={label.id} className="mr-1 inline-flex items-center"><LabelChip label={label} /><button type="button" aria-label={`Remove label ${label.name}`} onClick={() => void patch({ labelIds: task.labels.filter((item) => item.id !== label.id).map((item) => item.id) })}><X className="size-3" /></button></span>)}</RailRow>
          {members.length > 1 && <RailRow label="Assignee"><Select value={task.assigneeId ?? undefined} onValueChange={(value) => void patch({ assigneeId: value })}><SelectTrigger size="sm" aria-label="Assignee"><SelectValue placeholder="Choose member">{task.assigneeId ? members.find((member) => member.id === task.assigneeId)?.username : null}</SelectValue></SelectTrigger><SelectContent>{members.map((member) => <SelectItem key={member.id} value={member.id}>{member.username}</SelectItem>)}</SelectContent></Select>{task.assigneeId && <Button variant="ghost" size="sm" onClick={() => void patch({ assigneeId: null })}>Unassign</Button>}</RailRow>}
          <RailRow label={<span className="flex items-center justify-between">Reminders <Button variant="ghost" size="icon-xs" aria-label="Add reminder" onClick={() => setAddingReminder((value) => !value)}><Plus className="size-3.5" /></Button></span>}>{addingReminder && <div className="flex gap-1"><Input type="datetime-local" value={reminderValue} onChange={(e) => setReminderValue(e.target.value)} /><Button size="sm" onClick={() => void addReminder()}>Add</Button></div>}{reminders.map((reminder) => <div key={reminder.id} className="group flex items-center justify-between gap-1 text-sm"><span>{new Date(reminder.remindAt).toLocaleString()}</span><Button variant="ghost" size="icon-xs" aria-label="Delete reminder" className="opacity-0 group-hover:opacity-100" onClick={() => void deleteReminder(reminder)}><Trash2 className="size-3.5" /></Button></div>)}</RailRow>
        </aside>
      </div>
    </div>
  </div>;
}

function RailRow({ label, children }: { label: ReactNode; children: ReactNode }) { return <div className="border-b py-3 last:border-b-0"><span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>{children}</div>; }

function CommentRow({ comment, author, canEdit, onEdit, onDelete }: { comment: Comment; author?: string; canEdit: boolean; onEdit: (content: string) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false); const [content, setContent] = useState(comment.content);
  function submit(event: FormEvent) { event.preventDefault(); setEditing(false); if (content.trim() && content !== comment.content) onEdit(content.trim()); }
  if (editing) return <form onSubmit={submit} className="py-2"><Textarea autoFocus value={content} onChange={(e) => setContent(e.target.value)} onBlur={submit} /></form>;
  return <div className="group flex items-start gap-2 py-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">{author?.charAt(0).toUpperCase() ?? "?"}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="text-xs"><span className="font-medium">{author ?? "Member"}</span> <span className="text-muted-foreground">{new Date(comment.createdAt).toLocaleString()}</span></p>{canEdit && <span className="flex opacity-0 transition-opacity group-hover:opacity-100"><Button variant="ghost" size="icon-xs" aria-label="Edit comment" onClick={() => setEditing(true)}><Pencil className="size-3.5" /></Button><Button variant="ghost" size="icon-xs" aria-label="Delete comment" onClick={onDelete}><Trash2 className="size-3.5" /></Button></span>}</div><p className="whitespace-pre-wrap text-sm">{comment.content}</p></div></div>;
}

function CommentInput({ avatar, onSubmit, onAttachment, uploading, fileInputRef }: { avatar: string; onSubmit: (content: string) => void; onAttachment: (file: File) => void; uploading: boolean; fileInputRef: RefObject<HTMLInputElement | null> }) {
  const [content, setContent] = useState(""); function submit(event: FormEvent) { event.preventDefault(); if (!content.trim()) return; onSubmit(content.trim()); setContent(""); }
  return <div className="mt-2 flex items-center gap-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">{avatar}</span><form onSubmit={submit} className="flex flex-1 items-center gap-1 rounded-full border px-3 py-1.5 focus-within:ring-1 focus-within:ring-ring"><input className="flex-1 bg-transparent text-sm outline-none" placeholder="Comment" value={content} onChange={(e) => setContent(e.target.value)} /><Button type="button" variant="ghost" size="icon-xs" aria-label="Add attachment" disabled={uploading} onClick={() => fileInputRef.current?.click()}><Paperclip className="size-3.5" /></Button><input ref={fileInputRef} type="file" className="hidden" disabled={uploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) onAttachment(file); }} /></form></div>;
}
