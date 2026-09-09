import { colorFromId } from "../../lib/avatar-color";

interface AvatarProps {
  id: string;
  label: string;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "h-5 w-5 text-[10px]",
  md: "h-8 w-8 text-sm",
  lg: "h-14 w-14 text-lg",
};

export function Avatar({ id, label, imageUrl, size = "md" }: AvatarProps) {
  const sizeClass = SIZE_CLASSES[size];

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={label}
        className={`${sizeClass} shrink-0 rounded-full object-cover`}
      />
    );
  }

  const { bg, text } = colorFromId(id);
  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full font-semibold ${bg} ${text}`}
    >
      {label.slice(0, 1).toUpperCase() || "?"}
    </div>
  );
}
