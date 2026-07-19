import { cn } from "@/lib/utils";
import { projectColors } from "@/lib/validation";

const colorClass: Record<(typeof projectColors)[number], string> = {
  gray: "bg-zinc-400",
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  yellow: "bg-yellow-400",
  lime: "bg-lime-500",
  green: "bg-green-500",
  teal: "bg-teal-500",
  cyan: "bg-cyan-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
};

export const projectColorTextClass: Record<(typeof projectColors)[number], string> = {
  gray: "text-zinc-400",
  red: "text-red-500",
  orange: "text-orange-500",
  amber: "text-amber-500",
  yellow: "text-yellow-400",
  lime: "text-lime-500",
  green: "text-green-500",
  teal: "text-teal-500",
  cyan: "text-cyan-500",
  blue: "text-blue-500",
  indigo: "text-indigo-500",
  purple: "text-purple-500",
  pink: "text-pink-500",
};

export function ProjectColorDot({
  color,
  className,
}: {
  color: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-full",
        colorClass[color as keyof typeof colorClass] ?? colorClass.gray,
        className,
      )}
    />
  );
}
