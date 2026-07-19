type ErrorRecord = {
  level: "error";
  message: string;
  name: string;
  stack?: string;
  context?: Record<string, unknown>;
  timestamp: string;
  runtime: string;
};

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  return {
    message: typeof error === "string" ? error : String(error),
    name: "NonError",
    stack: undefined,
  };
}

// Reports errors without letting monitoring failures affect application behavior.
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  try {
    const normalized = normalizeError(error);
    const record: ErrorRecord = {
      level: "error",
      ...normalized,
      context,
      timestamp: new Date().toISOString(),
      runtime: process.env.NEXT_RUNTIME ?? "nodejs",
    };

    console.error("[error-report]", record);

    // To use Sentry or another tracker, call its captureException(error, { extra: context }) here.
    const webhookUrl = process.env.ERROR_WEBHOOK_URL;
    if (webhookUrl) {
      void fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      }).catch(() => {});
    }
  } catch {
    // Error reporting must never disrupt the caller.
  }
}
