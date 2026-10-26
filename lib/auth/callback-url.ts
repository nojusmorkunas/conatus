export function safeCallbackPath(value: string | null | undefined): string {
  return value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
    ? value
    : "/";
}
