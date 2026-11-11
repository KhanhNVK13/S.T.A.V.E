"use client";

import { useCallback, useMemo, useState } from "react";
import type { CommentItem } from "@stave/shared-types";
import { getComments } from "./api-comments";
import { tNow } from "./i18n";
import { useApiResource } from "./use-api-resource";

export interface ProjectCommentsState {
  items: CommentItem[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useProjectComments(projectId: string): ProjectCommentsState {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  const { data, loading, error } = useApiResource(
    () => getComments(projectId),
    [projectId, tick],
    tNow("cm.loadFail"),
  );
  const items = useMemo(() => data ?? [], [data]);
  return { items, loading, error, refresh };
}
