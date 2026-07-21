"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";

import type { comments as commentsTable } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Comment = typeof commentsTable.$inferSelect;

export function ProjectCommentsPanel({
  projectId,
  projectName,
  currentUserId,
  onClose,
  onCommentCountChange,
}: {
  projectId: string;
  projectName: string;
  currentUserId: string;
  onClose: () => void;
  onCommentCountChange: (count: number) => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/comments?projectId=${projectId}`)
      .then((response) => (response.ok ? response.json() : []))
      .then(setComments);
  }, [projectId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function withError(action: () => Promise<Response>) {
    setError(null);
    const response = await action();
    if (!response.ok) {
      setError("That didn't work. Try again.");
      return null;
    }
    return response;
  }

  async function addComment(content: string) {
    const response = await withError(() =>
      fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, content }),
      }),
    );
    if (!response) return;
    const comment = await response.json();
    setComments((current) => {
      const next = [...current, comment];
      onCommentCountChange(next.length);
      return next;
    });
  }

  async function editComment(comment: Comment, content: string) {
    const response = await withError(() =>
      fetch(`/api/comments/${comment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    );
    if (!response) return;
    const updated = await response.json();
    setComments((current) =>
      current.map((existing) => (existing.id === updated.id ? updated : existing)),
    );
  }

  async function deleteComment(comment: Comment) {
    const response = await withError(() =>
      fetch(`/api/comments/${comment.id}`, { method: "DELETE" }),
    );
    if (!response) return;
    setComments((current) => {
      const next = current.filter((existing) => existing.id !== comment.id);
      onCommentCountChange(next.length);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20 md:bg-transparent">
      <div className="flex h-full w-full flex-col border-l bg-background p-4 md:w-96">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="truncate text-sm font-medium">Comments: {projectName}</h2>
          <Button variant="ghost" size="icon-xs" aria-label="Close comments" onClick={onClose}>
            <X className="size-3.5" />
          </Button>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
          {comments.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              canEdit={comment.userId === currentUserId}
              onEdit={(content) => editComment(comment, content)}
              onDelete={() => deleteComment(comment)}
            />
          ))}
          <CommentForm onSubmit={addComment} />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function CommentRow({
  comment,
  canEdit,
  onEdit,
  onDelete,
}: {
  comment: Comment;
  canEdit: boolean;
  onEdit: (content: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(comment.content);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setEditing(false);
    if (content.trim() && content !== comment.content) onEdit(content.trim());
  }

  if (editing) {
    return (
      <form onSubmit={submit} className="flex flex-col gap-1">
        <Textarea
          autoFocus
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onBlur={submit}
        />
      </form>
    );
  }

  return (
    <div className="group flex flex-col gap-1 rounded-md p-2 hover:bg-muted/50">
      <div className="flex items-start justify-between gap-2">
        <p className="whitespace-pre-wrap text-sm">{comment.content}</p>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button variant="ghost" size="icon-xs" aria-label="Edit comment" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-xs" aria-label="Delete comment" onClick={onDelete}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        {new Date(comment.createdAt).toLocaleString()}
      </span>
    </div>
  );
}

function CommentForm({ onSubmit }: { onSubmit: (content: string) => void }) {
  const [content, setContent] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!content.trim()) return;
    onSubmit(content.trim());
    setContent("");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Textarea
        placeholder="Add a comment"
        value={content}
        onChange={(event) => setContent(event.target.value)}
      />
      <Button type="submit" size="sm" className="self-end" disabled={!content.trim()}>
        Add comment
      </Button>
    </form>
  );
}
