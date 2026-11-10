"use client";

import { useParams } from "next/navigation";
import { ActivityView } from "./activity-view";

export default function UserActivityPage() {
  const params = useParams<{ id: string }>();
  return <ActivityView userId={params.id} />;
}
