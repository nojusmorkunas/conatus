"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  dateFormats,
  settingsSchema,
  type SettingsInput,
} from "@/lib/validation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const timezones = Intl.supportedValuesOf("timeZone");
const weekStartOptions = [
  { value: 1, label: "Monday" },
  { value: 0, label: "Sunday" },
];

type ApiToken = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  expiresAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

type Webhook = {
  id: string;
  url: string;
  isActive: boolean;
  failureCount: number;
  createdAt: string;
};

function formatTokenDate(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

export function SettingsForm({
  defaults,
  icalToken,
  initialApiTokens,
  initialWebhooks,
}: {
  defaults: SettingsInput;
  icalToken: string | null;
  initialApiTokens: ApiToken[];
  initialWebhooks: Webhook[];
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [token, setToken] = useState(icalToken);
  const [copied, setCopied] = useState(false);
  const [apiTokens, setApiTokens] = useState(initialApiTokens);
  const [apiTokenName, setApiTokenName] = useState("");
  const [createdApiToken, setCreatedApiToken] = useState<{
    id: string;
    raw: string;
  } | null>(null);
  const [apiTokenCopied, setApiTokenCopied] = useState(false);
  const [creatingApiToken, setCreatingApiToken] = useState(false);
  const [webhooks, setWebhooks] = useState(initialWebhooks);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [createdWebhook, setCreatedWebhook] = useState<{
    id: string;
    secret: string;
  } | null>(null);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const { control, handleSubmit, formState } = useForm<SettingsInput>({
    resolver: zodResolver(settingsSchema),
    defaultValues: defaults,
  });

  const onSubmit = handleSubmit(async (values) => {
    setSaved(false);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    setSaved(true);
  });

  const onImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImportResult(null);
    try {
      const body = JSON.parse(await file.text());
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      setImportResult(
        res.ok
          ? `Imported ${result.projects} projects, ${result.sections} sections, ${result.tasks} tasks, ${result.labels} labels.`
          : `Import failed: ${JSON.stringify(result.error)}`,
      );
    } catch {
      setImportResult("Import failed: invalid file");
    }
  };

  const onAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setAvatarUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch("/api/account/avatar", {
        method: "POST",
        body: form,
      });
      if (response.ok) router.refresh();
    } finally {
      setAvatarUploading(false);
    }
  };

  const feedUrl = token && typeof window !== "undefined"
    ? `${window.location.origin}/api/ical/${token}`
    : null;

  const onEnableOrRegenerate = async () => {
    const res = await fetch("/api/settings/ical-token", { method: "POST" });
    const result = await res.json();
    setToken(result.token);
    setCopied(false);
  };

  const onDisable = async () => {
    await fetch("/api/settings/ical-token", { method: "DELETE" });
    setToken(null);
  };

  const onCopy = async () => {
    if (!feedUrl) return;
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
  };

  const refreshApiTokens = async () => {
    const res = await fetch("/api/tokens");
    if (res.ok) setApiTokens(await res.json());
  };

  const onCreateApiToken = async () => {
    if (!apiTokenName.trim()) return;

    setCreatingApiToken(true);
    const res = await fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: apiTokenName }),
    });
    if (res.ok) {
      const result = await res.json();
      setCreatedApiToken({ id: result.id, raw: result.token });
      setApiTokenCopied(false);
      setApiTokenName("");
      await refreshApiTokens();
    }
    setCreatingApiToken(false);
  };

  const onCopyApiToken = async () => {
    if (!createdApiToken) return;
    await navigator.clipboard.writeText(createdApiToken.raw);
    setApiTokenCopied(true);
  };

  const onRevokeApiToken = async (id: string, name: string) => {
    if (!confirm(`Revoke API token “${name}”?`)) return;

    const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" });
    if (!res.ok) return;

    setApiTokens((current) => current.filter((item) => item.id !== id));
    if (createdApiToken?.id === id) setCreatedApiToken(null);
  };

  const onCreateWebhook = async () => {
    if (!webhookUrl.trim()) return;

    setCreatingWebhook(true);
    const res = await fetch("/api/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    });
    if (res.ok) {
      const result = await res.json();
      setWebhooks((current) => [{
        id: result.id,
        url: result.url,
        isActive: true,
        failureCount: 0,
        createdAt: new Date().toISOString(),
      }, ...current]);
      setCreatedWebhook({ id: result.id, secret: result.secret });
      setWebhookCopied(false);
      setWebhookUrl("");
    }
    setCreatingWebhook(false);
  };

  const onCopyWebhookSecret = async () => {
    if (!createdWebhook) return;
    await navigator.clipboard.writeText(createdWebhook.secret);
    setWebhookCopied(true);
  };

  const onDeleteWebhook = async (id: string, url: string) => {
    if (!confirm(`Delete webhook “${url}”?`)) return;
    const res = await fetch(`/api/webhooks/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setWebhooks((current) => current.filter((webhook) => webhook.id !== id));
    if (createdWebhook?.id === id) setCreatedWebhook(null);
  };

  const onEnableWebhook = async (id: string) => {
    const res = await fetch(`/api/webhooks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: true }),
    });
    if (!res.ok) return;
    const webhook = await res.json();
    setWebhooks((current) => current.map((item) => item.id === id ? webhook : item));
  };

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <section id="preferences" aria-labelledby="preferences-heading" className="scroll-mt-6 rounded-md border p-5">
        <h2 id="preferences-heading" className="mb-4 scroll-mt-6 text-lg font-semibold">Preferences</h2>
        <FieldGroup>
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Controller
              control={control}
              name="name"
              render={({ field }) => (
                <Input maxLength={100} value={field.value ?? ""} onChange={field.onChange} />
              )}
            />
          </Field>

          <Field>
            <FieldLabel>Profile photo</FieldLabel>
            <Input
              type="file"
              accept="image/*"
              disabled={avatarUploading}
              onChange={onAvatarChange}
            />
          </Field>

          <Field>
          <FieldLabel>Timezone</FieldLabel>
          <Controller
            control={control}
            name="timezone"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timezones.map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {zone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field>
          <FieldLabel>Date format</FieldLabel>
          <Controller
            control={control}
            name="dateFormat"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dateFormats.map((format) => (
                    <SelectItem key={format} value={format}>
                      {format}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field>
          <FieldLabel>First day of week</FieldLabel>
          <Controller
            control={control}
            name="weekStart"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(value) => field.onChange(Number(value))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {weekStartOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field>
          <FieldLabel>Daily goal</FieldLabel>
          <Controller
            control={control}
            name="dailyGoal"
            render={({ field }) => (
              <Input
                type="number"
                min={1}
                max={100}
                value={field.value}
                onChange={(event) => field.onChange(event.target.valueAsNumber)}
              />
            )}
          />
        </Field>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={formState.isSubmitting}>
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Sign out
          </Button>
          {saved && (
            <span className="text-sm text-muted-foreground">Saved.</span>
          )}
        </div>
        </FieldGroup>
      </section>

      <section id="appearance" aria-labelledby="appearance-heading" className="scroll-mt-6 rounded-md border p-5">
        <h2 id="appearance-heading" className="mb-4 scroll-mt-6 text-lg font-semibold">Appearance</h2>
        <Field>
          <FieldLabel>Theme</FieldLabel>
          <ThemeToggle />
        </Field>
      </section>

      <section id="calendar-feed" aria-labelledby="calendar-feed-heading" className="scroll-mt-6 rounded-md border p-5">
        <h2 id="calendar-feed-heading" className="mb-4 scroll-mt-6 text-lg font-semibold">Calendar feed</h2>
        <Field>
          {!token ? (
            <Button type="button" variant="outline" onClick={onEnableOrRegenerate}>
              Enable calendar feed
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input readOnly value={feedUrl ?? ""} className="font-mono text-xs" />
                <Button type="button" variant="outline" onClick={onCopy}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" onClick={onEnableOrRegenerate}>
                  Regenerate
                </Button>
                <Button type="button" variant="ghost" onClick={onDisable}>
                  Disable
                </Button>
              </div>
            </div>
          )}
        </Field>
      </section>

      <section id="api-tokens" aria-labelledby="api-tokens-heading" className="scroll-mt-6 rounded-md border p-5">
        <h2 id="api-tokens-heading" className="mb-4 scroll-mt-6 text-lg font-semibold">API tokens</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Agent tokens use least-privilege scopes, expire after 90 days by default,
          and work with the v1 API and installable MCP server.
        </p>
        <Field>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                value={apiTokenName}
                maxLength={80}
                placeholder="Token name"
                onChange={(event) => setApiTokenName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  void onCreateApiToken();
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={creatingApiToken || !apiTokenName.trim()}
                onClick={onCreateApiToken}
              >
                {creatingApiToken ? "Creating…" : "Create"}
              </Button>
            </div>

            {createdApiToken && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={createdApiToken.raw}
                    className="font-mono text-xs"
                  />
                  <Button type="button" variant="outline" onClick={onCopyApiToken}>
                    {apiTokenCopied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Save this token now. You won&apos;t see it again.
                </p>
              </div>
            )}

            {apiTokens.length === 0 ? (
              <p className="text-sm text-muted-foreground">No API tokens.</p>
            ) : (
              <div className="space-y-2">
                {apiTokens.map((apiToken) => (
                  <div
                    key={apiToken.id}
                    className="flex items-center justify-between gap-3 rounded-md border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{apiToken.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {apiToken.prefix}…
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Created {formatTokenDate(apiToken.createdAt)} · Last used{" "}
                        {apiToken.lastUsedAt
                          ? formatTokenDate(apiToken.lastUsedAt)
                          : "never"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {apiToken.scopes.length} scoped permissions · Expires{" "}
                        {apiToken.expiresAt ? formatTokenDate(apiToken.expiresAt) : "never"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onRevokeApiToken(apiToken.id, apiToken.name)}
                    >
                      Revoke
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Field>
      </section>

      <section id="webhooks" aria-labelledby="webhooks-heading" className="scroll-mt-6 rounded-md border p-5">
        <h2 id="webhooks-heading" className="mb-4 scroll-mt-6 text-lg font-semibold">Webhooks</h2>
        <Field>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                value={webhookUrl}
                type="url"
                placeholder="https://example.com/webhook"
                onChange={(event) => setWebhookUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  void onCreateWebhook();
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={creatingWebhook || !webhookUrl.trim()}
                onClick={onCreateWebhook}
              >
                {creatingWebhook ? "Creating…" : "Add"}
              </Button>
            </div>

            {createdWebhook && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Input readOnly value={createdWebhook.secret} className="font-mono text-xs" />
                  <Button type="button" variant="outline" onClick={onCopyWebhookSecret}>
                    {webhookCopied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Save this secret now. You won&apos;t see it again. Payloads are signed with X-Webhook-Signature (HMAC-SHA256 of the raw body).
                </p>
              </div>
            )}

            {webhooks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No webhooks.</p>
            ) : (
              <div className="space-y-2">
                {webhooks.map((webhook) => (
                  <div key={webhook.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{webhook.url}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="mr-1 inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                          {webhook.isActive ? "Active" : "Disabled"}
                        </span>
                        {webhook.failureCount > 0 ? ` · ${webhook.failureCount} failures` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {!webhook.isActive && (
                        <Button type="button" variant="outline" onClick={() => onEnableWebhook(webhook.id)}>
                          Re-enable
                        </Button>
                      )}
                      <Button type="button" variant="ghost" onClick={() => onDeleteWebhook(webhook.id, webhook.url)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Field>
      </section>

      <section id="data" aria-labelledby="data-heading" className="scroll-mt-6 rounded-md border p-5">
        <h2 id="data-heading" className="mb-4 scroll-mt-6 text-lg font-semibold">Data</h2>
        <Field>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="font-medium">Move from Todoist</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Connect directly to Todoist or review a ZIP/CSV backup, then choose exactly which projects to bring over.
              </p>
              <Link href="/settings/import" className={cn(buttonVariants({ variant: "default" }), "mt-3")}>
                Import from Todoist
              </Link>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Clone backup</p>
              <div className="flex flex-wrap items-center gap-3">
            <a
              href="/api/export"
              download="export.json"
              className={buttonVariants({ variant: "outline" })}
            >
              Export data
            </a>
            <label className={cn(buttonVariants({ variant: "outline" }), "cursor-pointer")}>
              Import clone backup
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={onImport}
              />
            </label>
              </div>
            </div>
          </div>
          {importResult && (
            <span className="text-sm text-muted-foreground">{importResult}</span>
          )}
        </Field>
      </section>
    </form>
  );
}
