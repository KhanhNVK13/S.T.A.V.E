import { useId } from "react";

/** Ngôi sao trang trí: màu theo `currentColor` nên đặt bằng class text-*. */
export function StarGlyph({ size, className = "" }: { size: number; className?: string }) {
  const gradient = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="-50 -50 100 100"
      aria-hidden="true"
      className={`block ${className}`}
    >
      <defs>
        <radialGradient id={gradient}>
          <stop offset="0" stopColor="currentColor" stopOpacity="0.9" />
          <stop offset="0.28" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle r="50" fill={`url(#${gradient})`} />
      <path d="M0 -34 L2.6 -2.6 L34 0 L2.6 2.6 L0 34 L-2.6 2.6 L-34 0 L-2.6 -2.6Z" fill="currentColor" opacity="0.95" />
      <circle r="5" fill="currentColor" />
    </svg>
  );
}
