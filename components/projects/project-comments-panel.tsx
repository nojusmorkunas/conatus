"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Pencil, Trash2, X } from "lucide-react";

import { useOnline, useProjectComments, useWrites } from "@/lib/offline/hooks";
import type { CommentEntity } from "@/lib/offline/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDatePreferences } from "@/components/date-input";
import { formatDateTime } from "@/lib/dates";

type Comment = CommentEntity;

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
  const writes = useWrites();
  const { comments, loaded } = useProjectComments(projectId);
  const online = useOnline();

  // The header's count is the server's until the panel has all the comments.
  useEffect(() => {
    if (loaded) onCommentCountChange(comments.length);
  }, [loaded, comments.length, onCommentCountChange]);

  function addComment(content: string) {
    writes.notes.addComment(null, projectId, content, currentUserId);
    return Promise.resolve(true);
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/20" />
        <Dialog.Popup className="fixed inset-y-0 right-0 z-50 flex w-full flex-col md:max-w-96 border-l border-border bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">

        <div className="mb-4 flex items-center justify-between gap-2">
          <Dialog.Title className="truncate text-sm font-medium">Comments: {projectName}</Dialog.Title>
          <Dialog.Close render={<Button variant="ghost" size="icon-sm" aria-label="Close comments" />}>
            <X className="size-4" />
          </Dialog.Close>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {comments.length === 0 && (loaded || !online) && <p className="text-sm text-muted-foreground">No comments yet.</p>}
          {comments.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              canEdit={comment.userId === currentUserId}
              onEdit={(content) => writes.notes.editComment(comment, content)}
              onDelete={() => writes.notes.deleteComment(comment)}
            />
          ))}
          <CommentForm onSubmit={addComment} />
        </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
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
  const { dateFormat } = useDatePreferences();

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
          aria-label="Edit comment"
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
        <p className="min-w-0 whitespace-pre-wrap break-words text-sm">{comment.content}</p>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-1 opacity-70 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
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
        {formatDateTime(new Date(comment.createdAt), dateFormat)}
      </span>
    </div>
  );
}

function CommentForm({ onSubmit }: { onSubmit: (content: string) => Promise<boolean> }) {
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!content.trim() || pending) return;
    setPending(true);
    try {
      if (await onSubmit(content.trim())) setContent("");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Textarea
        aria-label="Add a comment"
        placeholder="Add a comment"
        value={content}
        disabled={pending}
        onChange={(event) => setContent(event.target.value)}
      />
      <Button type="submit" size="sm" className="self-end" disabled={pending || !content.trim()}>
        {pending ? "Adding…" : "Add comment"}
      </Button>
    </form>
  );
}
