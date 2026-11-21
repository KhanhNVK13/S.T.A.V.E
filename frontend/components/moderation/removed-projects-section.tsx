"use client";

import { useCallback, useEffect, useState } from "react";
import type { RemovedProject } from "@stave/shared-types";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Toast } from "../ui/toast";
import { AppealDialog } from "./appeal-dialog";
import { listRemovedProjects } from "../../lib/appeals-api";
import { formatDate } from "../../lib/format-date";
import { useI18n } from "../../context/i18n-context";

export function RemovedProjectsSection() {
  const { t } = useI18n();
  const [items, setItems] = useState<RemovedProject[]>([]);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [appealing, setAppealing] = useState<RemovedProject | null>(null);
  const [sent, setSent] = useState(false);
  const dismissToast = useCallback(() => setSent(false), []);

  useEffect(() => {
    let cancelled = false;
    listRemovedProjects()
      .then((rows) => {
        if (cancelled) return;
        setItems(rows);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  if (items.length === 0 && !failed) return null;

  return (
    <section aria-labelledby="removed-projects-title" className="mt-10">
      <h2 id="removed-projects-title" className="text-section mb-1">
        {t("rmv.title")}
      </h2>
      <p className="mb-4 text-sm text-muted">{t("rmv.intro")}</p>

      {failed && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-danger-muted px-3 py-2 text-sm text-danger"
        >
          <span>{t("rmv.loadError")}</span>
          <Button variant="secondary" onClick={() => setReload((n) => n + 1)}>
            {t("ui.retry")}
          </Button>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {items.map((project) => (
          <li key={project.projectId}>
            <Card className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[13px] font-semibold">{project.name}</span>
                <span className="text-xs text-muted">{t("rmv.removedOn", { date: formatDate(project.removedAt) })}</span>
              </div>
              {project.reason && <p className="break-words text-sm text-muted">{t("rmv.reason", { reason: project.reason })}</p>}
              <div className="flex flex-wrap items-center gap-3">
                {project.appealStatus === "pending" && <Badge variant="warning">{t("rmv.pending")}</Badge>}
                {project.appealStatus === "rejected" && <Badge variant="danger">{t("rmv.rejected")}</Badge>}
                {project.canAppeal && (
                  <>
                    <Button variant="secondary" onClick={() => setAppealing(project)}>
                      {t("rmv.appeal")}
                    </Button>
                    <span className="text-xs text-muted">{t("rmv.deadline", { date: formatDate(project.appealDeadline) })}</span>
                  </>
                )}
                {!project.canAppeal && project.appealStatus === null && (
                  <span className="text-xs text-muted">{t("rmv.expired")}</span>
                )}
              </div>
              {project.appealStatus === "rejected" && project.appealNote && (
                <p className="break-words text-xs text-muted">{t("rmv.rejectedNote", { note: project.appealNote })}</p>
              )}
            </Card>
          </li>
        ))}
      </ul>

      {appealing && (
        <AppealDialog
          projectId={appealing.projectId}
          projectName={appealing.name}
          onClose={() => setAppealing(null)}
          onSent={() => {
            setAppealing(null);
            setSent(true);
            setReload((n) => n + 1);
          }}
        />
      )}
      {sent && <Toast message={t("apd.sent")} variant="success" onDismiss={dismissToast} />}
    </section>
  );
}
