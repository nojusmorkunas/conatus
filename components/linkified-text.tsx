import { splitLinks } from "@/lib/links";

/** Plain text with any http(s) URLs turned into links that open in a new tab. */
export function LinkifiedText({ text }: { text: string }) {
  return splitLinks(text).map((part, index) =>
    index % 2 ? (
      <a
        key={index}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 [overflow-wrap:anywhere] hover:opacity-80"
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}
