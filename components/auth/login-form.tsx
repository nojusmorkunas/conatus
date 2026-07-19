"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { z } from "zod";

import { credentialsSchema } from "@/lib/validation";
import { ResendVerificationForm } from "@/components/auth/resend-verification-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";

type LoginInput = z.infer<typeof credentialsSchema>;

export function LoginForm({
  oauthError,
  passwordReset = false,
  verificationSent = false,
  bootstrapAvailable = false,
}: {
  oauthError?: string;
  passwordReset?: boolean;
  verificationSent?: boolean;
  bootstrapAvailable?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(oauthError ?? null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(credentialsSchema) });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError(null);
    setUnverifiedEmail(null);
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    if (result?.error) {
      if (result.code === "email_unverified") {
        setError("Please verify your email first.");
        setUnverifiedEmail(email);
        return;
      }
      if (result.code === "rate_limited") {
        setError("Too many attempts. Please wait a bit and try again.");
        return;
      }
      setError("Invalid email or password.");
      return;
    }
    router.push("/");
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} className="w-full">
      <FieldGroup>
        <div>
          <h1 className="text-xl font-semibold">Log in</h1>
          <p className="text-sm text-muted-foreground">Welcome back.</p>
        </div>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
          <FieldError errors={[errors.email]} />
        </Field>
        <Field>
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Link
              href="/forgot-password"
              className="text-sm underline underline-offset-4"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register("password")}
          />
          <FieldError errors={[errors.password]} />
        </Field>
        {passwordReset && (
          <p className="text-sm text-muted-foreground">
            Your password has been reset. Log in with your new password.
          </p>
        )}
        {verificationSent && (
          <p className="text-sm text-muted-foreground">
            Check your email for a verification link before logging in.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {unverifiedEmail && (
          <ResendVerificationForm email={unverifiedEmail} />
        )}
        <Button type="submit" disabled={isSubmitting}>
          Log in
        </Button>
        {bootstrapAvailable ? (
          <p className="text-sm text-muted-foreground">
            New server?{" "}
            <Link href="/register" className="underline underline-offset-4">
              Create the administrator account
            </Link>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Need an account? Ask the server administrator for a signup link.
          </p>
        )}
      </FieldGroup>
    </form>
  );
}
