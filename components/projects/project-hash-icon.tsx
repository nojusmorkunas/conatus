import { cn } from "@/lib/utils";
import { projectColors } from "@/lib/validation";

const colorClass: Record<(typeof projectColors)[number], string> = {
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

export function ProjectHashIcon({
  color,
  className,
}: {
  color: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "w-4 shrink-0 text-center text-sm font-medium",
        colorClass[color as keyof typeof colorClass] ?? colorClass.gray,
        className,
      )}
    >
      #
    </span>
  );
}
