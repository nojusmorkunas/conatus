"use client";

import { useState } from "react";
import { Copy, Link2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Invitation = {
  id: string;
  username: string | null;
  expiresAt: string;
  createdAt: string;
};

export function RegistrationInvites({
  initialInvitations,
}: {
  initialInvitations: Invitation[];
}) {
  const [username, setUsername] = useState("");
  const [invitations, setInvitations] = useState(initialInvitations);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setCreatedUrl(null);
    const response = await fetch("/api/admin/registration-invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim() }),
    });
    const body = await response.json().catch(() => null);
    setPending(false);
    if (!response.ok) {
      setMessage(body?.error ?? "Could not create a signup link.");
      return;
    }

    setInvitations((current) => [
      {
        id: body.id,
        username: body.username,
        expiresAt: body.expiresAt,
        createdAt: body.createdAt,
      },
      ...current,
    ]);
    setUsername("");
    setCreatedUrl(body.url);
  }

  async function copy() {
    if (!createdUrl) return;
    await navigator.clipboard.writeText(createdUrl);
    setMessage("Signup link copied.");
  }

  async function revoke(id: string) {
    const response = await fetch(`/api/admin/registration-invites/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setMessage("Could not revoke that signup link.");
      return;
    }
    setInvitations((current) => current.filter((invite) => invite.id !== id));
    setMessage("Signup link revoked.");
  }

  return (
    <section
      id="registration"
      aria-labelledby="registration-heading"
      className="scroll-mt-6 space-y-4 rounded-md border p-5"
    >
      <div>
        <h2 id="registration-heading" className="text-lg font-semibold">
          Server registration
        </h2>
        <p className="text-sm text-muted-foreground">
          Registration is invite-only. Links are single-use and expire after seven days.
        </p>
      </div>

      <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="text"
          aria-label="Invite username"
          placeholder="Username (optional)"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <Button type="submit" disabled={pending}>
          <Link2 /> {pending ? "Creating…" : "Create signup link"}
        </Button>
      </form>

      {createdUrl && (
        <div className="space-y-2 rounded-md bg-muted p-3">
          <p className="text-sm font-medium">Copy this link now</p>
          <div className="flex gap-2">
            <Input value={createdUrl} readOnly aria-label="New signup link" />
            <Button type="button" variant="outline" onClick={copy} aria-label="Copy signup link">
              <Copy />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            For security, the full link is not stored and cannot be shown again.
          </p>
        </div>
      )}

      {invitations.length > 0 ? (
        <ul className="divide-y rounded-md border">
          {invitations.map((invite) => (
            <li key={invite.id} className="flex items-center gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{invite.username ?? "Anyone with the link"}</p>
                <p className="text-xs text-muted-foreground">
                  Expires {new Date(invite.expiresAt).toLocaleString()}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Revoke signup link for ${invite.username ?? "anyone"}`}
                onClick={() => revoke(invite.id)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">There are no active signup links.</p>
      )}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </section>
  );
}
