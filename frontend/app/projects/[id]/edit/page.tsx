"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import { RequireAuth } from "../../../../components/require-auth";
import { Button } from "../../../../components/ui/button";
import { getProject } from "../../../../lib/api-client";
import { SkyLoading } from "../../../../components/project/sky-state";
import { MidiEditor } from "../../../../components/midi-editor/midi-editor";
import { errorSource, renderError, type ErrorSource } from "../../../../lib/error-message";
import { useI18n } from "../../../../context/i18n-context";

interface Project {
  id: string;
  name: string;
  archived_at: string | null;
}

export default function EditProjectPage() {
  const { t } = useI18n();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<ErrorSource | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getProject(projectId)
      .then((data) => {
        if (!cancelled) setProject(data as Project);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorSource(err, "ed.page.loadFail"));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, attempt]);

  return (
    <RequireAuth>
      <div className="h-full">
        {error ? (
          <div className="flex h-full items-center justify-center px-4">
            <div
              role="alert"
              className="flex max-w-md flex-col items-center gap-3 rounded-card border border-danger/20 bg-danger-muted p-5 text-center text-sm text-danger"
            >
              <p>{renderError(error)}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setError(null);
                    setAttempt((n) => n + 1);
                  }}
                >
                  {t("ed.page.retry")}
                </Button>
                <Link href={`/projects/${projectId}`}>
                  <Button variant="ghost">{t("ed.page.backToProject")}</Button>
                </Link>
              </div>
            </div>
          </div>
        ) : !project ? (
          <div className="flex h-full items-center justify-center px-4">
            <SkyLoading label={t("ed.page.loading")} />
          </div>
        ) : project.archived_at ? (
          <div className="flex h-full items-center justify-center px-4">
            <div className="flex max-w-md flex-col items-center gap-3 rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">
              <Lock className="h-5 w-5" />
              <p>{t("ed.page.archived", { name: project.name })}</p>
              <Link
                href={`/projects/${projectId}/settings`}
                className="font-semibold text-accent hover:underline"
              >
                {t("ed.page.restore")}
              </Link>
            </div>
          </div>
        ) : (
          <MidiEditor projectId={projectId} projectName={project.name} />
        )}
      </div>
    </RequireAuth>
  );
}
