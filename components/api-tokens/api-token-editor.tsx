"use client";

import { useEffect, useId, useState, type FormEvent } from "react";

import { api, ApiError } from "@/lib/api-client";
import { addDays, dateInTimezone, formatDate, todayInTimezone } from "@/lib/dates";
import { localDateTimeToUtc } from "@/lib/local-time";
import { agentDefaultScopes, agentTokenScopes, coveredProjectIds, tokenPermissionGroups, tokenScopePresets } from "@/lib/token-access";
import type { ApiToken, TokenProject } from "@/components/api-tokens/api-tokens";
import { ProjectColorDot } from "@/components/projects/project-color-dot";
import { buildProjectTree } from "@/components/projects/project-tree";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toastError } from "@/components/ui/toast";

export function ApiTokenEditor({ token, projects, timezone, dateFormat, onSaved, onCancel }: {
  token?: ApiToken;
  projects: TokenProject[];
  timezone: string;
  dateFormat: string;
  onSaved: (token: ApiToken, raw?: string) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const radioName = useId();
  const [name, setName] = useState(token?.name ?? "");
  const [expiry, setExpiry] = useState(token ? "keep" : "90");
  const [customDate, setCustomDate] = useState("");
  const [scopes, setScopes] = useState(() => new Set(
    token ? agentTokenScopes.filter((scope) => token.scopes.includes(scope)) : agentDefaultScopes,
  ));
  const [mode, setMode] = useState(token?.projectIds ? "selected" : "all");
  const [selected, setSelected] = useState<string[]>(token?.projectIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);
  const tomorrow = addDays(todayInTimezone(timezone), 1);
  const displayDate = (iso: string) => formatDate(dateInTimezone(new Date(iso), timezone), dateFormat);
  const expiryOptions = [
    ...(token ? [{ value: "keep", label: "Keep current" }] : []),
    { value: "7", label: "7 days" },
    { value: "30", label: "30 days" },
    { value: "60", label: "60 days" },
    { value: "90", label: "90 days" },
    { value: "365", label: "1 year" },
    { value: "custom", label: "Custom date" },
    { value: "never", label: "No expiration" },
  ];
  let expiryPreview: string;
  if (expiry === "custom") {
    expiryPreview = customDate
      ? `Expires on ${formatDate(customDate, dateFormat)} at 23:59, ${timezone} time.`
      : "Pick the last day the token should work.";
  } else if (expiry === "never") {
    expiryPreview = "Never expires. It works until you revoke it.";
  } else if (expiry === "keep") {
    expiryPreview = !token?.expiresAt ? "Never expires."
      : new Date(token.expiresAt).getTime() <= now
        ? `Expired on ${displayDate(token.expiresAt)}. Pick a new expiration to use it again.`
        : `Expires on ${displayDate(token.expiresAt)}.`;
  } else {
    expiryPreview = `Expires on ${displayDate(new Date(now + Number(expiry) * 86_400_000).toISOString())}.`;
  }

  const preset = tokenScopePresets.find((item) => item.scopes.length === scopes.size && item.scopes.every((scope) => scopes.has(scope)));
  const ownProjects = projects.filter((project) => !project.shared);
  const ownById = new Map(ownProjects.map((project) => [project.id, project]));
  const covered = coveredProjectIds(selected, ownProjects);
  const tree = buildProjectTree(projects.filter((project) => !project.inTrash));
  const rows: { project: TokenProject; depth: number }[] = [];
  const flatten = (nodes: typeof tree, depth: number) => {
    for (const node of nodes) {
      rows.push({ project: node.project, depth });
      flatten(node.children, depth + 1);
    }
  };
  flatten(tree, 0);
  const visibleIds = new Set(rows.map(({ project }) => project.id));
  const hiddenCount = selected.filter((projectId) => !visibleIds.has(projectId)).length;
  const inbox = projects.find((project) => project.isInbox && !project.shared);
  const hasLegacyScopes = token?.scopes.some((scope) => !agentTokenScopes.some((known) => known === scope));

  const includedWith = (project: TokenProject) => {
    if (project.shared) return undefined;
    const visited = new Set([project.id]);
    let parentId = project.parentId;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = ownById.get(parentId);
      if (!parent) break;
      if (selected.includes(parentId)) return parent.name;
      parentId = parent.parentId;
    }
  };

  const toggleProject = (projectId: string, checked: boolean) => {
    setSelected((current) => {
      if (!checked) return current.filter((value) => value !== projectId);
      const descendants = coveredProjectIds([projectId], ownProjects);
      return [...current.filter((value) => !descendants.has(value)), projectId];
    });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setError(null);
    if (!name.trim()) return setError("Give the token a name.");
    if (scopes.size === 0) return setError("Pick at least one permission.");
    if (mode === "selected" && selected.length === 0) return setError("Pick at least one project, or allow all projects.");
    const customExpiry = expiry === "custom" ? localDateTimeToUtc(`${customDate}T23:59`, timezone) : null;
    if (expiry === "custom" && (!customDate || customDate < tomorrow || !customExpiry)) {
      return setError("Pick a date after today.");
    }
    const expiresAt = expiry === "never" ? null : expiry === "custom"
      ? customExpiry!.toISOString()
      : expiry === "keep" ? undefined : new Date(Date.now() + Number(expiry) * 86_400_000).toISOString();
    const body = {
      name: name.trim(),
      scopes: agentTokenScopes.filter((scope) => scopes.has(scope)),
      projectIds: mode === "all" ? null : selected,
      ...(expiry === "keep" ? {} : { expiresAt }),
    };
    setSaving(true);
    try {
      if (token) {
        onSaved(await api.patch<ApiToken>(`/api/tokens/${token.id}`, body));
      } else {
        const { token: raw, ...created } = await api.post<ApiToken & { token: string }>("/api/tokens", body);
        onSaved(created, raw);
      }
    } catch (error) {
      if (error instanceof ApiError) setError(error.message);
      else toastError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <h3 className="text-sm font-semibold">{token ? "Edit token" : "New token"}</h3>
      <Field>
        <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
        <Input id={`${id}-name`} value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Claude MCP server" autoFocus />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-expiration`}>Expiration</FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          <Select items={expiryOptions} value={expiry} onValueChange={(value) => { if (value) setExpiry(value); }}>
            <SelectTrigger id={`${id}-expiration`} aria-describedby={`${id}-expiry-preview`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {expiryOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {expiry === "custom" && (
            <Input type="date" aria-label="Expiry date" aria-describedby={`${id}-expiry-preview`} min={tomorrow} value={customDate} onChange={(event) => setCustomDate(event.target.value)} className="w-auto" />
          )}
        </div>
        <FieldDescription id={`${id}-expiry-preview`}>{expiryPreview}</FieldDescription>
      </Field>
      <div className="space-y-3">
        {hasLegacyScopes && <p className="text-sm text-amber-700 dark:text-amber-300">This token still has legacy access. Saving replaces it with the permissions ticked below.</p>}
        <h4 className="text-sm font-medium">Permissions</h4>
        <p className="text-sm text-muted-foreground">The token can do only what you tick. Agents using the MCP server get the same limits.</p>
        <div role="group" aria-label="Permission presets" className="flex flex-wrap items-center gap-2">
          {tokenScopePresets.map((item) => (
            <Button key={item.id} size="sm" type="button" variant={preset?.id === item.id ? "secondary" : "outline"} aria-pressed={preset?.id === item.id} onClick={() => setScopes(new Set(item.scopes))}>{item.label}</Button>
          ))}
          {!preset && <span className="text-xs text-muted-foreground">Custom</span>}
        </div>
        <div className="rounded-lg border divide-y">
          {tokenPermissionGroups.map((group, index) => (
            <div key={group.label} role="group" aria-labelledby={`${id}-group-${index}`} className="grid gap-2 p-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
              <p id={`${id}-group-${index}`} className="text-sm font-medium">{group.label}</p>
              <div className="space-y-2">
                {group.permissions.map((permission) => (
                  <div key={permission.scope}>
                    <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium">
                      <input type="checkbox" className="size-4 accent-foreground" aria-describedby={`${id}-${permission.scope}`} checked={scopes.has(permission.scope)} onChange={(event) => {
                        const checked = event.target.checked;
                        setScopes((current) => {
                          const next = new Set(current);
                          if (checked) next.add(permission.scope);
                          else next.delete(permission.scope);
                          return next;
                        });
                      }} />
                      {permission.label}
                    </label>
                    <p id={`${id}-${permission.scope}`} className="mt-0.5 pl-6 text-sm text-muted-foreground">{permission.description}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Tokens made here can&apos;t reach your account settings, sharing, filters, attachments, webhooks, data export or other tokens.</p>
      </div>
      <div className="space-y-3">
        <h4 id={`${id}-projects`} className="text-sm font-medium">Projects</h4>
        <div role="radiogroup" aria-labelledby={`${id}-projects`} className="space-y-2">
          {[
            { value: "all", label: "All projects", description: "Includes projects you create or join later." },
            { value: "selected", label: "Only selected projects", description: "Sub-projects come with their parent, including new ones. The token can create projects only inside the selected ones." },
          ].map((option) => (
            <div key={option.value}>
              <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium">
                <input type="radio" name={radioName} value={option.value} className="size-4 accent-foreground" aria-describedby={`${id}-${option.value}-description`} checked={mode === option.value} onChange={() => setMode(option.value)} />
                {option.label}
              </label>
              <p id={`${id}-${option.value}-description`} className="mt-0.5 pl-6 text-sm text-muted-foreground">{option.description}</p>
            </div>
          ))}
        </div>
        {mode === "selected" && (
          <>
            <ul aria-label="Projects this token can reach" className="max-h-80 overflow-y-auto rounded-lg border divide-y">
              {rows.map(({ project, depth }) => {
                const explicit = selected.includes(project.id);
                const inherited = covered.has(project.id) && !explicit;
                const ancestor = inherited ? includedWith(project) : undefined;
                const descriptionId = `${id}-included-${project.id}`;
                return (
                  <li key={project.id}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40" style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}>
                      <input type="checkbox" className="size-4 accent-foreground" aria-label={project.name} aria-describedby={ancestor ? descriptionId : undefined} checked={explicit || inherited} disabled={inherited} onChange={(event) => toggleProject(project.id, event.target.checked)} />
                      <ProjectColorDot color={project.color} />
                      <span className="min-w-0 flex-1 truncate">{project.name}</span>
                      {project.shared && <span className="text-xs text-muted-foreground">Shared</span>}
                      {project.isArchived && <span className="text-xs text-muted-foreground">Archived</span>}
                    </label>
                    {ancestor && <p id={descriptionId} className="pb-2 pr-3 text-xs text-muted-foreground" style={{ paddingLeft: `${3.375 + depth * 1.25}rem` }}>Included with {ancestor}</p>}
                  </li>
                );
              })}
            </ul>
            {hiddenCount > 0 && <p className="text-xs text-muted-foreground">Also covers {hiddenCount} {hiddenCount === 1 ? "project that is" : "projects that are"} in Trash or no longer shared with you.</p>}
            {agentTokenScopes.some((scope) => scope.startsWith("labels:") && scopes.has(scope)) && <p className="text-xs text-muted-foreground">Labels belong to your whole account, so the label permissions above apply to every label.</p>}
            {scopes.has("tasks:write") && inbox && !covered.has(inbox.id) && <p className="text-xs text-muted-foreground">Inbox isn&apos;t selected, so quick add needs a #project in the text.</p>}
          </>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>{saving ? token ? "Saving…" : "Creating…" : token ? "Save changes" : "Create token"}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
