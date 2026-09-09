import type { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-card border border-slate-200 bg-white shadow-card ${className}`}
      {...props}
    />
  );
}
