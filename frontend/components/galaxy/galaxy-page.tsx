import type { ReactNode } from "react";
import { StarField } from "./star-field";

/** Khung trang: nền sao Canvas 2D phía sau, nội dung nằm trên. */
export function GalaxyPage({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate min-h-full">
      <StarField />
      <div className="relative z-10 mx-auto max-w-page px-5 py-8">{children}</div>
    </div>
  );
}
