"use client";

import { useEffect, useState } from "react";
import { GitBranch, GitCommitHorizontal, History } from "lucide-react";
import { getBranchHistory, listProjectBranches } from "../../lib/api-client";
import type { BranchHistoryCommit } from "../../lib/api-client";
import { apiErrorMessage } from "../../lib/error-message";
import { formatRelativeTime } from "../../lib/format-date";

interface Summary {
  defaultBranchName: string;
  branchCount: number;
  commitCount: number;
  latest: BranchHistoryCommit | null;
}

export function VersionSummary({
  projectId,
  onOpenTab,
}: {
  projectId: string;
  onOpenTab: (tab: "commits" | "branches") => void;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const branches = await listProjectBranches(projectId);
        const main = branches.find((b) => b.is_default) ?? branches[0];
        const history = main ? await getBranchHistory(main.id) : null;
        if (cancelled) return;
        const commits = history?.commits ?? [];
        setSummary({
          defaultBranchName: main?.name ?? "main",
          branchCount: branches.length,
          commitCount: commits.length,
          latest: commits[commits.length - 1] ?? null,
        });
      } catch (err) {
        if (!cancelled) setError(apiErrorMessage(err, "Không tải được thông tin phiên bản."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <section className="mt-5 rounded-card border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-semibold">Phiên bản</h2>
        {summary && (
          <div className="flex gap-3 text-xs">
            <button
              type="button"
              onClick={() => onOpenTab("commits")}
              className="flex items-center gap-1 font-semibold text-accent hover:underline"
            >
              <History className="h-3.5 w-3.5" />
              {summary.commitCount} commit
            </button>
            <button
              type="button"
              onClick={() => onOpenTab("branches")}
              className="flex items-center gap-1 font-semibold text-accent hover:underline"
            >
              <GitBranch className="h-3.5 w-3.5" />
              {summary.branchCount} nhánh
            </button>
          </div>
        )}
      </div>
      <div className="px-4 py-3 text-[13px]">
        {error ? (
          <p role="alert" className="text-danger">
            {error}
          </p>
        ) : !summary ? (
          <div className="h-10 animate-pulse rounded-md bg-surface-subtle" />
        ) : summary.latest ? (
          <div className="flex items-start gap-2.5">
            <GitCommitHorizontal className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{summary.latest.message}</p>
              <p className="text-xs text-muted">
                Mới nhất trên <span className="font-mono">{summary.defaultBranchName}</span> ·{" "}
                {summary.latest.author.display_name ?? summary.latest.author.username ?? "Người dùng"} ·{" "}
                <span className="font-mono">{formatRelativeTime(summary.latest.created_at)}</span>
              </p>
            </div>
          </div>
        ) : (
          <p className="text-muted">
            Chưa có phiên bản nào. Mở trình soạn nhạc và bấm Commit Changes để lưu phiên bản đầu
            tiên.
          </p>
        )}
      </div>
    </section>
  );
}
