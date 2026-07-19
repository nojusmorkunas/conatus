"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import type { z } from "zod";

import { requestPasswordResetSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";

type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export function ForgotPasswordForm() {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RequestPasswordResetInput>({
    resolver: zodResolver(requestPasswordResetSchema),
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null);
    const response = await fetch("/api/auth/password-reset/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      setError("Something went wrong. Please try again.");
      return;
    }
    setSubmitted(true);
  });

  return (
    <form onSubmit={onSubmit} className="w-full">
      <FieldGroup>
        <div>
          <h1 className="text-xl font-semibold">Forgot your password?</h1>
          <p className="text-sm text-muted-foreground">
            Enter your email to receive a reset link.
          </p>
        </div>
        {submitted ? (
          <p className="text-sm text-muted-foreground">
            If an account exists for that email, we&apos;ve sent a reset link.
          </p>
        ) : (
          <>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                {...register("email")}
              />
              <FieldError errors={[errors.email]} />
            </Field>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={isSubmitting}>
              Send reset link
            </Button>
          </>
        )}
        <p className="text-sm text-muted-foreground">
          <Link href="/login" className="underline underline-offset-4">
            Back to log in
          </Link>
        </p>
      </FieldGroup>
    </form>
  );
}
