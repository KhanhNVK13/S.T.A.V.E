import { Music2 } from "lucide-react";
import { colorFromId } from "../../lib/avatar-color";

const GRADIENTS: Record<string, string> = {
  "bg-blue-100": "from-blue-200 to-blue-100",
  "bg-indigo-100": "from-indigo-200 to-indigo-100",
  "bg-emerald-100": "from-emerald-200 to-emerald-100",
  "bg-amber-100": "from-amber-200 to-amber-100",
  "bg-rose-100": "from-rose-200 to-rose-100",
  "bg-violet-100": "from-violet-200 to-violet-100",
  "bg-cyan-100": "from-cyan-200 to-cyan-100",
  "bg-orange-100": "from-orange-200 to-orange-100",
};

/** Placeholder trực quan tất định theo id project — không phải waveform dữ liệu thật (chưa có gì để biểu diễn). */
export function ProjectThumb({ id }: { id: string }) {
  const { bg, text } = colorFromId(id);
  const gradient = GRADIENTS[bg] ?? "from-slate-200 to-slate-100";
  return (
    <div
      className={`flex h-24 w-full items-center justify-center rounded-lg bg-gradient-to-br ${gradient}`}
    >
      <Music2 className={`h-7 w-7 ${text} opacity-70`} />
    </div>
  );
}
