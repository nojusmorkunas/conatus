type ClientError = {
  message?: string;
  stack?: string;
  digest?: string;
  path?: string;
};

export function reportClientError(error: ClientError): void {
  try {
    void fetch("/api/monitoring/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(error),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Error reporting must never disrupt the error boundary.
  }
}
