import { Music2 } from "lucide-react";
import { colorFromId } from "../../lib/avatar-color";

const GRADIENTS: Record<string, string> = {
  "bg-accent-muted": "from-accent-muted to-surface",
  "bg-success-muted": "from-success-muted to-surface",
  "bg-warning-muted": "from-warning-muted to-surface",
  "bg-danger-muted": "from-danger-muted to-surface",
  "bg-metal-muted": "from-metal-muted to-surface",
};

const SIZE_CLASSES = {
  sm: "h-12 w-12 shrink-0 rounded-lg",
  lg: "h-24 w-full rounded-lg",
} as const;

const ICON_SIZE = {
  sm: "h-5 w-5",
  lg: "h-7 w-7",
} as const;

/** Placeholder trực quan tất định theo id project — không phải waveform dữ liệu thật (chưa có gì để biểu diễn). */
export function ProjectThumb({
  id,
  size = "lg",
  className = "",
}: {
  id: string;
  size?: "sm" | "lg";
  className?: string;
}) {
  const { bg, text } = colorFromId(id);
  const gradient = GRADIENTS[bg] ?? "from-surface-subtle to-surface";
  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br ${gradient} ${SIZE_CLASSES[size]} ${className}`}
    >
      <Music2 className={`${ICON_SIZE[size]} ${text} opacity-70`} />
    </div>
  );
}
