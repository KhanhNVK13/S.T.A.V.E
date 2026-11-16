"use client";

import Link from "next/link";
import { Piano } from "lucide-react";
import { listSharedProjects } from "../../lib/api-collab";
import { formatRelativeTime } from "../../lib/format-date";
import { useApiResource } from "../../lib/use-api-resource";
import { useI18n } from "../../context/i18n-context";
import { Badge } from "../ui/badge";
import { buttonClass } from "../ui/button";
import { ProjectThumb } from "../ui/project-thumb";
import { RowHeader, RowItem, RowList, RowTime, RowTitle } from "../ui/row-list";

const COLS = "md:grid-cols-[minmax(0,1fr)_120px_96px_auto]";

export function SharedProjects() {
  const { t } = useI18n();
  const { data, loading, error } = useApiResource(() => listSharedProjects(), [], t("projects.sharedLoadFail"));
  const projects = data ?? [];

  if (loading || (!error && projects.length === 0)) return null;

  return (
    <section aria-labelledby="shared-projects-title" className="mt-10">
      <h2 id="shared-projects-title" className="text-section">
        {t("projects.sharedTitle")}
      </h2>
      <p className="mb-3 mt-1 text-[13px] text-muted">{t("projects.sharedHint")}</p>

      {error ? (
        <p role="alert" className="rounded-card border border-danger/20 bg-danger-muted p-4 text-sm text-danger">
          {error}
        </p>
      ) : (
        <RowList cols={COLS}>
          <RowHeader>
            <span>{t("projects.colProject")}</span>
            <span>{t("projects.colAccess")}</span>
            <span className="text-right">{t("projects.colUpdated")}</span>
            <span />
          </RowHeader>
          {projects.map((project) => (
            <RowItem key={project.id}>
              <RowTitle
                href={`/projects/${project.id}`}
                name={project.name}
                meta={project.description ?? undefined}
                leading={<ProjectThumb id={project.id} size="sm" />}
              />
              <span>
                <Badge variant={project.viewer_access === "edit" ? "success" : "neutral"}>
                  {project.viewer_access === "edit" ? t("projects.sharedEdit") : t("projects.sharedView")}
                </Badge>
              </span>
              <RowTime>{formatRelativeTime(project.updated_at)}</RowTime>
              <div className="flex items-center gap-1.5 md:justify-end">
                {project.viewer_access === "edit" && !project.archived_at && (
                  <Link href={`/projects/${project.id}/edit`} className={buttonClass("secondary")}>
                    <Piano className="h-3.5 w-3.5" /> {t("home.openEditor")}
                  </Link>
                )}
              </div>
            </RowItem>
          ))}
        </RowList>
      )}
    </section>
  );
}
