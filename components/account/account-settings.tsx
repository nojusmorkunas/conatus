"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AccountSettings({
  username,
  hasPassword,
}: {
  username: string;
  hasPassword: boolean;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordExists, setPasswordExists] = useState(hasPassword);
  const [passwordPending, setPasswordPending] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [confirmationUsername, setConfirmationUsername] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage(null);

    if (newPassword.length < 8) {
      setPasswordMessage("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage("Passwords do not match.");
      return;
    }

    setPasswordPending(true);
    const response = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    });
    const result = await response.json();
    setPasswordPending(false);

    if (!response.ok) {
      setPasswordMessage(
        typeof result.error === "string"
          ? result.error
          : "Could not update password.",
      );
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordExists(true);
    setPasswordMessage("Password updated.");
  }

  async function deleteAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeleteError(null);
    setDeletePending(true);

    const response = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: confirmationUsername }),
    });

    if (!response.ok) {
      const result = await response.json();
      setDeleteError(
        typeof result.error === "string"
          ? result.error
          : "Could not delete account.",
      );
      setDeletePending(false);
      return;
    }

    await signOut({ callbackUrl: "/login" });
  }

  return (
    <section
      id="account"
      aria-labelledby="account-heading"
      className="scroll-mt-6 space-y-5 rounded-md border p-5"
    >
      <h2 id="account-heading" className="scroll-mt-6 text-lg font-semibold">Account</h2>

      <div className="space-y-2">
        <label htmlFor="account-username" className="text-sm font-medium">Username</label>
        <Input id="account-username" type="text" value={username} readOnly />
      </div>

      <form onSubmit={changePassword} className="space-y-3">
        <h3 className="text-sm font-medium">
          {passwordExists ? "Change password" : "Set password"}
        </h3>
        {passwordExists && (
          <div className="space-y-2">
            <label htmlFor="current-password" className="text-sm font-medium">Current password</label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>
        )}
        {!passwordExists && (
          <p className="text-sm text-muted-foreground">
            Set a password to sign in with this username.
          </p>
        )}
        <div className="space-y-2">
          <label htmlFor="new-password" className="text-sm font-medium">New password</label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="confirm-password" className="text-sm font-medium">Confirm new password</label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={passwordPending}>
            {passwordPending ? "Saving…" : passwordExists ? "Change password" : "Set password"}
          </Button>
          {passwordMessage && (
            <p role="status" className="text-sm text-muted-foreground">{passwordMessage}</p>
          )}
        </div>
      </form>

      <form onSubmit={deleteAccount} className="space-y-3 rounded-md border border-destructive/50 p-4">
        <div>
          <h3 className="font-medium text-destructive">Danger zone</h3>
          <p className="text-sm text-muted-foreground">
            Deleting your account permanently removes your projects and data. Collaborators will lose access to projects you own.
          </p>
        </div>
        <div className="space-y-2">
          <label htmlFor="delete-confirmation" className="text-sm font-medium">
            Type {username} to confirm
          </label>
          <Input
            id="delete-confirmation"
            type="text"
            autoComplete="off"
            value={confirmationUsername}
            onChange={(event) => setConfirmationUsername(event.target.value)}
          />
        </div>
        <Button
          type="submit"
          variant="destructive"
          disabled={deletePending || confirmationUsername !== username}
        >
          {deletePending ? "Deleting…" : "Delete account"}
        </Button>
        {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
      </form>
    </section>
  );
}
