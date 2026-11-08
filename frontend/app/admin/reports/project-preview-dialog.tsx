"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ReportPreview } from "@stave/shared-types";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogActions } from "../../../components/ui/dialog";
import { ApiError } from "../../../lib/api-client";
import { getReportPreview } from "../../../lib/admin-reports-api";
import { useI18n } from "../../../context/i18n-context";

type PreviewState =
  | { kind: "loading" }
  | { kind: "ready"; data: ReportPreview }
  | { kind: "closed" }
  | { kind: "missing" }
  | { kind: "error" };

export function ProjectPreviewDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [state, setState] = useState<PreviewState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getReportPreview(projectId)
      .then((data) => {
        if (!cancelled) setState({ kind: "ready", data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) setState({ kind: "closed" });
        else if (err instanceof ApiError && err.status === 404) setState({ kind: "missing" });
        else setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, attempt]);

  function retry() {
    setState({ kind: "loading" });
    setAttempt((n) => n + 1);
  }

  return (
    <Dialog title={t("rpt.previewTitle")} onClose={onClose} className="max-w-lg p-6">
      {state.kind === "loading" && (
        <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-accent" /> {t("ui.loading")}
        </div>
      )}
      {state.kind === "closed" && <p className="py-2 text-sm text-muted">{t("rpt.pvNoOpen")}</p>}
      {state.kind === "missing" && <p className="py-2 text-sm text-muted">{t("rpt.pvMissing")}</p>}
      {state.kind === "error" && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-danger-muted px-3 py-2 text-sm text-danger"
        >
          <span>{t("rpt.pvFail")}</span>
          <Button variant="secondary" onClick={retry}>
            {t("ui.retry")}
          </Button>
        </div>
      )}
      {state.kind === "ready" && <PreviewBody data={state.data} locale={locale} />}
      <div className="mt-5">
        <DialogActions>
          <Button variant="secondary" onClick={onClose} data-autofocus>
            {t("ui.close")}
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  );
}

function PreviewBody({ data, locale }: { data: ReportPreview; locale: string }) {
  const { t } = useI18n();
  const { project } = data;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="break-words text-base font-semibold">{project.name}</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-muted">
          {project.description || t("rpt.pvNoDescription")}
        </p>
      </div>

      <dl className="grid grid-cols-3 gap-3 text-[13px]">
        <div className="min-w-0">
          <dt className="text-xs text-muted">{t("rpt.pvGenre")}</dt>
          <dd className="break-words">{project.genre || t("rpt.pvNoGenre")}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t("rpt.pvTracks")}</dt>
          <dd className="font-mono">{data.trackCount.toLocaleString(locale)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t("rpt.pvNotes")}</dt>
          <dd className="font-mono">{data.noteCount.toLocaleString(locale)}</dd>
        </div>
      </dl>

      {!data.hasCommit ? (
        <p className="text-[13px] text-muted">{t("rpt.pvNoCommit")}</p>
      ) : (
        <section aria-label={t("rpt.pvTrackList")}>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide">{t("rpt.pvTrackList")}</h3>
          {data.tracks.length === 0 ? (
            <p className="text-[13px] text-muted">{t("rpt.pvNoTracks")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
              {data.tracks.map((track, index) => (
                <li key={index} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                  <span className="min-w-0 break-words font-medium">{track.name}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {track.instrument || t("rpt.pvDefaultInstrument")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
