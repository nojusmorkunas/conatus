"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { z } from "zod";

import { credentialsSchema } from "@/lib/validation";
import { SsoButton } from "@/components/auth/sso-button";
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
  callbackUrl = "/",
  bootstrapAvailable = false,
  ssoName = null,
  ssoFailed = false,
}: {
  callbackUrl?: string;
  bootstrapAvailable?: boolean;
  ssoName?: string | null;
  ssoFailed?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(
    ssoFailed ? "Single sign-on failed. Try again or ask the server administrator." : null,
  );
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(credentialsSchema) });

  const onSubmit = handleSubmit(async ({ username, password }) => {
    setError(null);
    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });
    if (result?.error) {
      if (result.code === "rate_limited") {
        setError("Too many attempts. Please wait a bit and try again.");
        return;
      }
      setError("Invalid username or password.");
      return;
    }
    router.push(callbackUrl);
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
          <FieldLabel htmlFor="username">Username</FieldLabel>
          <Input id="username" type="text" autoComplete="username" {...register("username")} />
          <FieldError errors={[errors.username]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register("password")}
          />
          <FieldError errors={[errors.password]} />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={isSubmitting}>
          Log in
        </Button>
        {ssoName && <SsoButton redirectTo={callbackUrl}>Continue with {ssoName}</SsoButton>}
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
