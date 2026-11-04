"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Piano } from "lucide-react";
import type { Branch, BranchHistoryCommit } from "../../lib/api-client";
import { loadProjectGraph } from "../../lib/project-graph";
import { apiErrorMessage } from "../../lib/error-message";
import { Button } from "../ui/button";
import { CommitGraph } from "./commit-graph";
import { SkyLoading } from "./sky-state";
import { useI18n } from "../../context/i18n-context";

interface GraphData {
  branches: Branch[];
  commits: Map<string, BranchHistoryCommit>;
  partial: boolean;
}

export function ProjectHistory({
  projectId,
  canEdit,
  canOpenHistory,
}: {
  projectId: string;
  canEdit: boolean;
  canOpenHistory: boolean;
}) {
  const { t } = useI18n();
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const graph = await loadProjectGraph(projectId);
      setData({ branches: graph.branches, commits: graph.commits, partial: graph.failed });
    } catch (err) {
      setError(apiErrorMessage(err, t("projectPage.historyLoadFail")));
    }
  }, [projectId, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of the commit graph
    void load();
  }, [load]);

  return (
    <section aria-labelledby="project-history-title" className="mb-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="project-history-title" className="text-[15px] font-semibold">
          {t("projectPage.historyTitle")}
        </h2>
        <p className="text-xs text-muted">{t("projectPage.historyLead")}</p>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-danger/20 bg-danger-muted px-4 py-3"
        >
          <p className="text-xs text-danger">{error}</p>
          <Button variant="secondary" onClick={() => void load()}>
            {t("ui.retry")}
          </Button>
        </div>
      ) : !data ? (
        <SkyLoading compact label={t("blist.drawing")} />
      ) : (
        <>
          {data.partial && (
            <p role="alert" className="mb-2 rounded-card border border-danger/20 bg-danger-muted px-4 py-2 text-xs text-danger">
              {t("blist.graphPartial")}
            </p>
          )}
          <CommitGraph
            projectId={projectId}
            branches={data.branches}
            commits={data.commits}
            canOpenHistory={canOpenHistory}
            emptyAction={
              canEdit ? (
                <Link href={`/projects/${projectId}/edit`}>
                  <Button>
                    <Piano className="h-3.5 w-3.5" /> {t("project.openEditor")}
                  </Button>
                </Link>
              ) : undefined
            }
          />
        </>
      )}
    </section>
  );
}
