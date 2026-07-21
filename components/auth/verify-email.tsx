"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { ResendVerificationForm } from "@/components/auth/resend-verification-form";

type VerificationState = "pending" | "success" | "error";

export function VerifyEmail({ token }: { token?: string }) {
  const [state, setState] = useState<VerificationState>(
    token ? "pending" : "error",
  );

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      signal: controller.signal,
    }).then((response) => {
      setState(response.ok ? "success" : "error");
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name === "AbortError") return;
      setState("error");
    });

    return () => controller.abort();
  }, [token]);

  if (state === "pending") {
    return <p className="text-sm text-muted-foreground">Verifying your email...</p>;
  }

  if (state === "success") {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Email verified</h1>
        <p className="text-sm text-muted-foreground">
          Email verified. You can now log in.
        </p>
        <Link href="/login" className="text-sm underline underline-offset-4">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Invalid verification link</h1>
        <p className="text-sm text-muted-foreground">
          This verification link is invalid or has expired.
        </p>
      </div>
      <ResendVerificationForm />
      <Link href="/login" className="text-sm underline underline-offset-4">
        Back to log in
      </Link>
    </div>
  );
}
