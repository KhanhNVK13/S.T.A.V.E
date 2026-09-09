import Link from "next/link";
import { AudioLines } from "lucide-react";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-600 text-white">
        <AudioLines className="h-4.5 w-4.5" />
      </span>
      <span className="text-lg font-bold tracking-widest text-slate-900">STAVE</span>
    </Link>
  );
}
