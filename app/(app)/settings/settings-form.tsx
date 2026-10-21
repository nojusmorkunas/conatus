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
import { activityGraphSourceOptions } from "@/lib/activity-sources";
import { defaultStartPage, startPageViews } from "@/lib/start-page";
import { api, jsonInit } from "@/lib/api-client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiTokens, type ApiToken, type TokenProject } from "@/components/api-tokens/api-tokens";
import { ThemeToggle } from "@/components/theme-toggle";
import { CompletionSoundToggle } from "@/components/completion-sound-toggle";
import { toastError } from "@/components/ui/toast";
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

type Webhook = {
  id: string;
  url: string;
  isActive: boolean;
  failureCount: number;
  createdAt: string;
};

export function SettingsForm({
  defaults,
  projects,
  icalToken,
  initialApiTokens,
  tokenProjects,
  initialWebhooks,
}: {
  defaults: SettingsInput;
  projects: { id: string; name: string }[];
  icalToken: string | null;
  initialApiTokens: ApiToken[];
  tokenProjects: TokenProject[];
  initialWebhooks: Webhook[];
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [token, setToken] = useState(icalToken);
  const [copied, setCopied] = useState(false);
  const [webhooks, setWebhooks] = useState(initialWebhooks);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [createdWebhook, setCreatedWebhook] = useState<{
    id: string;
    secret: string;
  } | null>(null);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  // Select shows a raw value unless it is given the value/label pairs.
  const startPageOptions = [
    ...startPageViews.map((view) => ({ value: view.value, label: view.label })),
    ...projects.map((project) => ({ value: project.id, label: project.name })),
  ];
  const { control, handleSubmit, formState } = useForm<SettingsInput>({
    resolver: zodResolver(settingsSchema),
    defaultValues: defaults,
  });

  const onSubmit = handleSubmit(async (values) => {
    setSaved(false);
    try {
      await api.patch("/api/settings", values);
      setSaved(true);
    } catch (error) {
      toastError(error, "Couldn't save your settings.");
    }
  });

  const onImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImportResult(null);
    try {
      const body = JSON.parse(await file.text());
      const res = await fetch("/api/import", jsonInit("POST", body));
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
    try {
      await api.delete("/api/settings/ical-token");
      setToken(null);
    } catch (error) {
      toastError(error, "Couldn't disable the calendar feed.");
    }
  };

  const onCopy = async () => {
    if (!feedUrl) return;
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
  };

  const onCreateWebhook = async () => {
    if (!webhookUrl.trim()) return;

    setCreatingWebhook(true);
    const res = await fetch("/api/webhooks", jsonInit("POST", { url: webhookUrl }));
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
    const res = await fetch(`/api/webhooks/${id}`, jsonInit("PATCH", { isActive: true }));
    if (!res.ok) return;
    const webhook = await res.json();
    setWebhooks((current) => current.map((item) => item.id === id ? webhook : item));
  };

  return (
    <div className="space-y-8">
      <form onSubmit={onSubmit}>
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
                items={weekStartOptions}
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

        <Field>
          <FieldLabel>Start page</FieldLabel>
          <Controller
            control={control}
            name="startPage"
            render={({ field }) => (
              <>
                <Select items={startPageOptions} value={field.value ?? defaultStartPage} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {startPageOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>Where the app opens.</FieldDescription>
              </>
            )}
          />
        </Field>

        <Field>
          <FieldLabel>Activity graph</FieldLabel>
          <Controller
            control={control}
            name="activityGraphSource"
            render={({ field }) => (
              <>
                <Select
                  items={activityGraphSourceOptions}
                  value={field.value}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activityGraphSourceOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  What the past-year graph on Stats counts.{" "}
                  {activityGraphSourceOptions.find((option) => option.value === field.value)?.description}
                </FieldDescription>
              </>
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

      </form>

      <section id="appearance" aria-labelledby="appearance-heading" className="scroll-mt-6 rounded-md border p-5">
        <h2 id="appearance-heading" className="mb-4 scroll-mt-6 text-lg font-semibold">Appearance</h2>
        <FieldGroup>
          <Field>
            <FieldLabel>Theme</FieldLabel>
            <ThemeToggle />
          </Field>
          <Field>
            <FieldLabel>Completion sound</FieldLabel>
            <CompletionSoundToggle />
            <FieldDescription>Plays when you tick a task off. This device only.</FieldDescription>
          </Field>
        </FieldGroup>
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

      <ApiTokens
        initialTokens={initialApiTokens}
        projects={tokenProjects}
        timezone={defaults.timezone}
        dateFormat={defaults.dateFormat}
      />

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
              <p className="mb-2 text-sm font-medium">Deleted items</p>
              <p className="mb-2 text-sm text-muted-foreground">
                Projects and tasks you delete stay in Trash until you restore them.
              </p>
              <Link href="/trash" className={buttonVariants({ variant: "outline" })}>
                Open Trash
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
    </div>
  );
}
