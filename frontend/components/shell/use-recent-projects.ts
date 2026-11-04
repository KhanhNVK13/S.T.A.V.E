"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { listProjects } from "../../lib/api-client";

export interface RecentProject {
  id: string;
  name: string;
}

interface ProjectRow extends RecentProject {
  archived_at: string | null;
  updated_at: string;
}

const RECENT_LIMIT = 5;
const REFRESH_AFTER_MS = 30_000;

export function useRecentProjects(): RecentProject[] {
  const pathname = usePathname();
  const [state, setState] = useState<{ items: RecentProject[]; at: number }>({ items: [], at: 0 });

  useEffect(() => {
    if (Date.now() - state.at < REFRESH_AFTER_MS) return;
    let cancelled = false;
    listProjects()
      .then((rows) => {
        if (cancelled) return;
        const items = (rows as ProjectRow[])
          .filter((p) => !p.archived_at)
          .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
          .slice(0, RECENT_LIMIT)
          .map(({ id, name }) => ({ id, name }));
        setState({ items, at: Date.now() });
      })
      .catch(() => {
        if (!cancelled) setState({ items: [], at: Date.now() });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chạy lại khi đổi route, có giới hạn tần suất bằng state.at
  }, [pathname]);

  return state.items;
}
