import { createHash } from "node:crypto";

import { parseTodoistCsv, type TodoistProjectImport } from "./todoist-import";
import { fetchTodoistProjects } from "./todoist-api";
import { readZipEntries } from "./zip";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_FILES = 500;

function projectNameFromFileName(fileName: string): string {
  const normalized = fileName.replaceAll("\\", "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1).replace(/\.csv$/i, "").trim();
}

function sourceId(index: number, fileName: string): string {
  return `${index}-${createHash("sha256").update(fileName).digest("hex").slice(0, 12)}`;
}

export async function parseTodoistUpload(
  files: File[],
  referenceDate: string,
): Promise<TodoistProjectImport[]> {
  if (files.length === 0) throw new Error("Choose a Todoist ZIP backup or CSV file.");
  if (files.length > MAX_FILES) throw new Error(`Choose at most ${MAX_FILES} files.`);
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_UPLOAD_BYTES) throw new Error("The selected files exceed the 25 MB limit.");

  const backupDate = files
    .map((file) => /Todoist backup (\d{4}-\d{2}-\d{2})/i.exec(file.name)?.[1])
    .find((value): value is string => Boolean(value));
  const scheduleReferenceDate = backupDate ?? referenceDate;
  const csvFiles: { name: string; data: Buffer }[] = [];
  for (const file of files) {
    const data = Buffer.from(await file.arrayBuffer());
    if (/\.zip$/i.test(file.name) || file.type === "application/zip") {
      csvFiles.push(
        ...readZipEntries(data, {
          maxEntries: MAX_FILES,
          maxUncompressedBytes: MAX_UNCOMPRESSED_BYTES,
        }).filter((entry) => /\.csv$/i.test(entry.name)),
      );
    } else if (/\.csv$/i.test(file.name) || file.type === "text/csv") {
      csvFiles.push({ name: file.name, data });
    } else {
      throw new Error(`${file.name} is not a ZIP or CSV file.`);
    }
  }

  if (csvFiles.length === 0) throw new Error("No Todoist CSV files were found.");
  if (csvFiles.length > MAX_FILES) throw new Error(`The backup contains more than ${MAX_FILES} CSV files.`);
  const uncompressedBytes = csvFiles.reduce((total, file) => total + file.data.length, 0);
  if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) throw new Error("The backup is too large.");

  return csvFiles.map((file, index) =>
    parseTodoistCsv(file.data.toString("utf8"), {
      sourceId: sourceId(index, file.name),
      projectName: projectNameFromFileName(file.name),
      referenceDate: scheduleReferenceDate,
    }),
  );
}

export async function parseTodoistImportSource(
  form: FormData,
  referenceDate: string,
): Promise<TodoistProjectImport[]> {
  if (form.get("source") === "api") {
    const token = form.get("apiToken");
    if (typeof token !== "string") throw new Error("Enter your Todoist API token.");
    return fetchTodoistProjects(token);
  }
  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  return parseTodoistUpload(files, referenceDate);
}
