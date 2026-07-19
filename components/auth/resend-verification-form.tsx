"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { resendVerificationSchema } from "@/lib/validation";

type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

export function ResendVerificationForm({
  email,
}: {
  email?: string;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResendVerificationInput>({
    resolver: zodResolver(resendVerificationSchema),
    defaultValues: { email },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const response = await fetch("/api/auth/verify-email/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      setError("Something went wrong. Please try again.");
      return;
    }
    setSubmitted(true);
  });

  if (submitted) {
    return (
      <p className="text-sm text-muted-foreground">
        If an unverified account exists for that email, we&apos;ve sent a new link.
      </p>
    );
  }

  if (email) {
    return (
      <div className="space-y-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={() => void onSubmit()}
        >
          Resend verification email
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field>
        <FieldLabel htmlFor="resend-email">Email</FieldLabel>
        <Input
          id="resend-email"
          type="email"
          autoComplete="email"
          {...register("email")}
        />
        <FieldError errors={[errors.email]} />
      </Field>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" variant="outline" disabled={isSubmitting}>
        Resend verification email
      </Button>
    </form>
  );
}
