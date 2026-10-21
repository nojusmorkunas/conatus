"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { api } from "@/lib/api-client";
import { dateInTimezone, formatDate } from "@/lib/dates";
import { ApiTokenEditor } from "@/components/api-tokens/api-token-editor";
import { permissionSummary, projectsSummary } from "@/components/api-tokens/token-summary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError } from "@/components/ui/toast";

export type ApiToken = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  projectIds: string[] | null;
  expiresAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

export type TokenProject = {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
  isInbox: boolean;
  isArchived: boolean;
  inTrash: boolean;
  shared: boolean;
};

export function ApiTokens({ initialTokens, projects, timezone, dateFormat }: {
  initialTokens: ApiToken[];
  projects: TokenProject[];
  timezone: string;
  dateFormat: string;
}) {
  const [tokens, setTokens] = useState(initialTokens);
  const [editor, setEditor] = useState<{ id: string } | "new" | null>(null);
  const [created, setCreated] = useState<{ id: string; raw: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);
  const displayDate = (iso: string) => formatDate(dateInTimezone(new Date(iso), timezone), dateFormat);

  const onSaved = (token: ApiToken, raw?: string) => {
    if (raw !== undefined) {
      setTokens((current) => [token, ...current]);
      setCreated({ id: token.id, raw });
      setCopied(false);
    } else {
      setTokens((current) => current.map((item) => item.id === token.id ? token : item));
    }
    setEditor(null);
  };

  const onRevoke = async (token: ApiToken) => {
    if (!confirm(`Revoke “${token.name}”? Anything using it stops working right away.`)) return;
    try {
      await api.delete(`/api/tokens/${token.id}`);
      setTokens((current) => current.filter((item) => item.id !== token.id));
      if (created?.id === token.id) setCreated(null);
    } catch (error) {
      toastError(error, "Couldn't revoke the token.");
    }
  };

  const onCopy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.raw);
      setCopied(true);
    } catch (error) {
      toastError(error);
    }
  };

  const editorProps = { projects, timezone, dateFormat, onSaved, onCancel: () => setEditor(null) };

  return (
    <section id="api-tokens" aria-labelledby="api-tokens-heading" className="scroll-mt-6 rounded-md border p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="api-tokens-heading" className="scroll-mt-6 text-lg font-semibold">API tokens</h2>
        {editor !== "new" && (
          <Button type="button" variant="outline" onClick={() => setEditor("new")}>
            <Plus /> New token
          </Button>
        )}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Tokens let the Conatus MCP server, scripts and other apps use your account through the v1 API. Each one can do only what you allow, only in the projects you pick, until it expires or you revoke it.
      </p>
      <div className="space-y-4">
        {created && (
          <div role="status" className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <p className="font-medium">Token created</p>
            <p className="text-sm text-muted-foreground">Copy it now. You won&apos;t see it again.</p>
            <div className="flex items-center gap-2">
              <Input readOnly aria-label="New token value" className="min-w-0 font-mono text-xs" value={created.raw} />
              <Button type="button" variant="outline" onClick={onCopy}>{copied ? "Copied" : "Copy"}</Button>
            </div>
            <p className="text-sm text-muted-foreground">
              To connect the MCP server, run <code className="rounded bg-muted px-1 font-mono text-xs">npx -y conatus-mcp setup</code> and paste the token when it asks.{" "}
              <a href="https://useconatus.com/integrations/mcp/" target="_blank" rel="noreferrer" className="underline underline-offset-4">Setup guide</a>
            </p>
            <Button type="button" variant="ghost" onClick={() => setCreated(null)}>Done</Button>
          </div>
        )}
        {editor === "new" && (
          <div className="rounded-lg border p-4"><ApiTokenEditor {...editorProps} /></div>
        )}
        {tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tokens yet.</p>
        ) : (
          <ul className="space-y-2">
            {tokens.map((token) => {
              const { legacy, chips } = permissionSummary(token.scopes);
              const expires = token.expiresAt ? new Date(token.expiresAt).getTime() : null;
              const expired = expires !== null && expires <= now;
              // Calendar days in the account's time zone, so the count agrees with the date shown beside it.
              const days = token.expiresAt === null ? null
                : (Date.parse(dateInTimezone(new Date(token.expiresAt), timezone)) - Date.parse(dateInTimezone(new Date(now), timezone))) / 86_400_000;
              return (
                <li key={token.id} className="rounded-lg border p-3">
                  {typeof editor === "object" && editor?.id === token.id ? (
                    <ApiTokenEditor {...editorProps} token={token} />
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium">{token.name}</p>
                            {expired && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">Expired</span>}
                            {legacy && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">Legacy</span>}
                          </div>
                          <p className="font-mono text-xs text-muted-foreground">{token.prefix}…</p>
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" aria-label={`Edit ${token.name}`} onClick={() => setEditor({ id: token.id })}>Edit</Button>
                          <Button type="button" variant="ghost" size="sm" aria-label={`Revoke ${token.name}`} onClick={() => onRevoke(token)}>Revoke</Button>
                        </div>
                      </div>
                      <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[6.5rem_minmax(0,1fr)]">
                        <dt className="text-muted-foreground">Permissions</dt>
                        <dd>{legacy ? (
                          "Legacy access. This token predates permissions and can't use the v1 API or the MCP server. Edit it to give it permissions."
                        ) : (
                          <div className="flex flex-wrap gap-1">{chips.map((chip) => <span key={chip} className="rounded-md bg-muted px-1.5 py-0.5">{chip}</span>)}</div>
                        )}</dd>
                        <dt className="text-muted-foreground">Projects</dt>
                        <dd>{projectsSummary(token.projectIds, projects)}</dd>
                        <dt className="text-muted-foreground">Expires</dt>
                        <dd className={expired ? "text-destructive" : days !== null && days <= 7 ? "text-amber-700 dark:text-amber-300" : undefined}>
                          {token.expiresAt === null ? "Never" : expired ? `Expired on ${displayDate(token.expiresAt)}` : `${displayDate(token.expiresAt)} (${days === 0 ? "today" : `in ${days} ${days === 1 ? "day" : "days"}`})`}
                        </dd>
                        <dt className="text-muted-foreground">Created</dt>
                        <dd>{displayDate(token.createdAt)}</dd>
                        <dt className="text-muted-foreground">Last used</dt>
                        <dd>{token.lastUsedAt ? displayDate(token.lastUsedAt) : "Never"}</dd>
                      </dl>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
