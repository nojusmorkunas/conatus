import {
  BookOpen,
  BriefcaseBusiness,
  Folder,
  HeartPulse,
  House,
  Lightbulb,
  Palette,
  Plane,
  Rocket,
  Sprout,
  Target,
  WalletCards,
  Wrench,
} from "lucide-react";

import { cn } from "@/lib/utils";

export const projectIconPresets = [
  { value: "home", label: "Home", Icon: House },
  { value: "work", label: "Work", Icon: BriefcaseBusiness },
  { value: "goals", label: "Goals", Icon: Target },
  { value: "learning", label: "Learning", Icon: BookOpen },
  { value: "ideas", label: "Ideas", Icon: Lightbulb },
  { value: "launch", label: "Launch", Icon: Rocket },
  { value: "growth", label: "Growth", Icon: Sprout },
  { value: "creative", label: "Creative", Icon: Palette },
  { value: "finance", label: "Finance", Icon: WalletCards },
  { value: "tools", label: "Tools", Icon: Wrench },
  { value: "health", label: "Health", Icon: HeartPulse },
  { value: "travel", label: "Travel", Icon: Plane },
] as const;

export function ProjectIcon({
  icon,
  className,
}: {
  icon: string | null;
  className?: string;
}) {
  const preset = projectIconPresets.find((candidate) => candidate.value === icon);
  const Icon = preset?.Icon ?? Folder;

  return <Icon className={cn("size-4", className)} aria-hidden />;
}
