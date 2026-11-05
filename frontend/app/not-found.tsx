import type { Metadata } from "next";
import { NotFoundView } from "../components/status-page";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return <NotFoundView />;
}
