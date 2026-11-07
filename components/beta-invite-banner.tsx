"use client";

import { useEffect, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { jsonInit } from "@/lib/api-client";
import type { BetaInvite } from "@/lib/beta-invites";

type Invite = Pick<BetaInvite, "id" | "title" | "body" | "joinUrl">;

function markSeen(inviteId: string, optOut: boolean) {
  // A failed save only means the invite shows once more on the next visit.
  void fetch("/api/beta-invite", { ...jsonInit("POST", { inviteId, optOut }), keepalive: true })
    .catch(() => undefined);
}

export function BetaInviteBanner({ invite }: { invite: Invite | null }) {
  // The layout stops passing the invite once the server has recorded it as
  // seen, which happens on the next refresh. Hold on to it so the banner stays
  // up for the rest of this visit instead of vanishing mid-read.
  const [shown, setShown] = useState(invite);

  useEffect(() => {
    if (shown) markSeen(shown.id, false);
  }, [shown]);

  if (!shown) return null;

  return (
    <div className="mx-auto w-full max-w-4xl px-3 pt-4 sm:px-6 sm:pt-6">
      <aside
        aria-label="Beta invite"
        className="rounded-lg border bg-card p-4 text-sm text-card-foreground"
      >
        <p className="font-medium">{shown.title}</p>
        <p className="mt-1 text-muted-foreground">{shown.body}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          From the Conatus developer. Only server admins see this, and only once.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={shown.joinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ size: "sm" })}
            onClick={() => setShown(null)}
          >
            Join the beta
          </a>
          <Button type="button" size="sm" variant="outline" onClick={() => setShown(null)}>
            No thanks
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              markSeen(shown.id, true);
              setShown(null);
            }}
          >
            Don&apos;t ask me about this or future betas
          </Button>
        </div>
      </aside>
    </div>
  );
}
