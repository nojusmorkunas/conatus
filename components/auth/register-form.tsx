"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import type { z } from "zod";

import { registerSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";

const signupSchema = registerSchema.omit({ timezone: true });
type SignupInput = z.infer<typeof signupSchema>;

export function RegisterForm({
  defaultUsername = "",
  inviteToken,
  bootstrap = false,
  usernameLocked = false,
}: {
  defaultUsername?: string;
  inviteToken?: string;
  bootstrap?: boolean;
  usernameLocked?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { username: defaultUsername },
  });

  const onSubmit = handleSubmit(async ({ username, password }) => {
    setError(null);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, timezone, inviteToken }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(
        response.status === 409
          ? "That username is already registered."
          : typeof body?.error === "string"
            ? body.error
            : "Something went wrong. Please try again.",
      );
      return;
    }

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });
    router.push(result?.error ? "/login" : "/onboarding");
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} className="w-full">
      <FieldGroup>
        <div>
          <h1 className="text-xl font-semibold">
            {bootstrap ? "Set up this server" : "Create an account"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {bootstrap
              ? "The first account becomes the server administrator."
              : "You were invited to join this server."}
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="username">Username</FieldLabel>
          <Input
            id="username"
            type="text"
            autoComplete="username"
            readOnly={usernameLocked}
            {...register("username")}
          />
          <FieldError errors={[errors.username]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            {...register("password")}
          />
          <FieldError errors={[errors.password]} />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={isSubmitting}>
          Create account
        </Button>
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="underline underline-offset-4">
            Log in
          </Link>
        </p>
      </FieldGroup>
    </form>
  );
}
