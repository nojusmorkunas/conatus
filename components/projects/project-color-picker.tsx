import { cn } from "@/lib/utils";
import { projectColors } from "@/lib/validation";
import { ProjectColorDot } from "./project-color-dot";

export function ProjectColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 p-1">
      {projectColors.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={color}
          onClick={() => onChange(color)}
          className={cn(
            "flex size-6 items-center justify-center rounded-full outline-none",
            value === color && "ring-2 ring-ring ring-offset-1",
          )}
        >
          <ProjectColorDot color={color} className="size-4" />
        </button>
      ))}
    </div>
  );
}
