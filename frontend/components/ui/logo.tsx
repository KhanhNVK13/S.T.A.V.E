import Link from "next/link";

export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} aria-label={compact ? "STAVE" : undefined} className="flex items-center gap-2.5 rounded-md">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" className="shrink-0">
        <rect x=".5" y=".5" width="27" height="27" rx="6.5" className="fill-background stroke-foreground/40" />
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x="4" y={6.4 + i * 3.7} width="20" height="1.3" className="fill-foreground/55" />
        ))}
        <ellipse cx="14" cy="13.8" rx="4.2" ry="3.1" transform="rotate(-20 14 13.8)" className="fill-accent" />
        <path d="M17.7 12.6V5.2" strokeWidth="1.5" fill="none" className="stroke-accent" />
      </svg>
      {!compact && (
        <span translate="no" className="font-display text-[18px] font-extrabold tracking-[-0.02em]">
          STAVE
        </span>
      )}
    </Link>
  );
}
