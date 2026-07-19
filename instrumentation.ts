import { reportError } from "./lib/error-reporter";

export async function register() {
  // Guard against edge runtime and `next build` (which also evaluates this
  // file but must not open a DB connection or start polling).
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.NEXT_PHASE?.startsWith("phase-production-build")) {
    const { startReminderWorker } = await import("./lib/jobs");
    await startReminderWorker();
  }
}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: NodeJS.Dict<string | string[]> },
  context: {
    routerKind: "Pages Router" | "App Router";
    routePath: string;
    routeType: "render" | "route" | "action" | "proxy";
    renderSource?: "react-server-components" | "react-server-components-payload" | "server-rendering";
    revalidateReason: "on-demand" | "stale" | undefined;
  },
) {
  reportError(err, { path: request.path, method: request.method, ...context });
}
