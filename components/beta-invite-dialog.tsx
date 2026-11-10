"use client";

import { useId, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";

import { Button, buttonVariants } from "@/components/ui/button";
import { jsonInit } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { BetaInvite } from "@/lib/beta-invites";

type Invite = Pick<BetaInvite, "id" | "title" | "body" | "joinUrl" | "alternative">;

// Counts as answered when it closes, however that happens (a button, Escape
// or a click outside), never when it renders: opening "/" renders the layout
// and then lands on the start page with a full page load, so anything recorded
// on render is gone before anyone can read it.
export function BetaInviteDialog({ invite }: { invite: Invite | null }) {
  const [open, setOpen] = useState(invite !== null);
  const [neverAgain, setNeverAgain] = useState(false);
  const checkboxId = useId();
  if (!invite) return null;

  function close() {
    setOpen(false);
    // keepalive lets the save finish when "Join the beta" opens a new tab. A
    // failed save only means the invite shows once more.
    void fetch("/api/beta-invite", {
      ...jsonInit("POST", { inviteId: invite!.id, optOut: neverAgain }),
      keepalive: true,
    }).catch(() => undefined);
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-background p-6 text-sm shadow-xl outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <Dialog.Title className="text-lg font-semibold">{invite.title}</Dialog.Title>
          <p className="mt-1 text-xs text-muted-foreground">
            Sorry to interrupt! This is a one-time note from the Conatus developer.
          </p>
          <Dialog.Description className="mt-4 text-muted-foreground">{invite.body}</Dialog.Description>
          {invite.alternative && <BetaInviteAlternative parts={invite.alternative} className="mt-3" />}
          <div className="mt-5 flex items-start gap-2.5">
            <input
              id={checkboxId}
              type="checkbox"
              className="mt-0.5 size-4 accent-foreground"
              checked={neverAgain}
              onChange={(event) => setNeverAgain(event.target.checked)}
            />
            <label htmlFor={checkboxId} className="cursor-pointer">
              Never show me beta invites again
              <span className="block text-xs text-muted-foreground">You can still join from Settings.</span>
            </label>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={close}>
              No thanks
            </Button>
            <a
              href={invite.joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants()}
              onClick={close}
            >
              Join the beta
            </a>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Also used by the Settings section.
export function BetaInviteAlternative({
  parts,
  className,
}: {
  parts: NonNullable<BetaInvite["alternative"]>;
  className?: string;
}) {
  return (
    <p className={cn("text-muted-foreground", className)}>
      {parts.map((part) =>
        typeof part === "string" ? part : (
          <a
            key={part.url}
            href={part.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline underline-offset-4"
          >
            {part.label}
          </a>
        ),
      )}
    </p>
  );
}
