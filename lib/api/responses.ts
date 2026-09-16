import { z } from "zod";

// Every route repeats these three replies. The bodies are part of the public
// /api/v1 contract the MCP server parses, so they have to stay byte-identical
// to what the routes returned inline.
export const unauthorized = () =>
  Response.json({ error: "Unauthorized" }, { status: 401 });

export const notFound = () =>
  Response.json({ error: "Not found" }, { status: 404 });

export const invalid = <T>(error: z.ZodError<T>) =>
  Response.json({ error: z.flattenError(error).fieldErrors }, { status: 400 });
