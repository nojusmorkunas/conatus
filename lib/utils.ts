import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Task names run long, and an undo toast built around one grows with it until
// it spans the viewport. 40 characters keeps the toast one line wide.
export function truncate(text: string, max = 40) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
