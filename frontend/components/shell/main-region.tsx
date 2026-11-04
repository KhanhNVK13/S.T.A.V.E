import type { ReactNode } from "react";

// min-h-0 keeps the flex child shrinkable so nested scroll areas get a definite height.
export function MainRegion({ children }: { children: ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
      {children}
    </main>
  );
}
