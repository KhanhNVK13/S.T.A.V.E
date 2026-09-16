"use client";

import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  GitFork,
  Play,
  Loader2,
  FileMusic,
  Piano,
  CircleUserRound,
  Settings as SettingsIcon,
} from "lucide-react";
import { getPublicProject, getProject, ApiError } from "../../../lib/api-client";
import type { PublicProject } from "../../../lib/api-client";
import { useAuth } from "../../../context/auth-context";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Avatar } from "../../../components/ui/avatar";
import { ProjectThumb } from "../../../components/ui/project-thumb";
import { Toast } from "../../../components/ui/toast";
import { CommitHistory } from "../../../components/project/commit-history";
import { BranchList } from "../../../components/project/branch-list";
import { formatRelativeTime } from "../../../lib/format-date";

interface Props {
  params: Promise<{ id: string }>;
}

/** Hình dạng trả về của `GET /projects/:id` (chỉ chủ dự án gọi được). */
interface OwnedProject {
  id: string;
  name: string;
  description: string | null;
  genre: string | null;
  visibility: "public" | "private";
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  play_count: number;
}

/** Dữ liệu dùng chung cho trang, gộp từ 2 nguồn API khác nhau. */
interface OverviewData {
  id: string;
  name: string;
  description: string | null;
  genre: string | null;
  visibility: "public" | "private";
  archivedAt: string | null;
  updatedAt: string;
  playCount: number;
  /** Chỉ API công khai trả về; API của chủ dự án không có. */
  forkCount: number | null;
  tags: string[];
  owner: PublicProject["owner"] | null;
  isOwner: boolean;
}

type TabId = "overview" | "commits" | "branches" | "pulls";

function ProjectOverview({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, loading: authLoading } = useAuth();

  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forking, setForking] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const tab = (searchParams.get("tab") ?? "overview") as TabId;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Ưu tiên API công khai: chạy được cho cả khách lẫn người đã đăng nhập.
        const pub = await getPublicProject(id);
        if (cancelled) return;
        setData({
          id: pub.id,
          name: pub.name,
          description: pub.description,
          genre: pub.genre,
          visibility: "public",
          archivedAt: pub.archived_at,
          updatedAt: pub.updated_at,
          playCount: pub.play_count,
          forkCount: pub.fork_count,
          tags: pub.tags,
          owner: pub.owner,
          isOwner: !!user && user.id === pub.owner.id,
        });
      } catch (pubErr) {
        // Dự án riêng tư không có ở API công khai — thử API của chủ dự án.
        // `GET /projects/:id` là `getOwned()`: gọi được nghĩa là đúng chủ.
        if (!user) {
          if (!cancelled) {
            setError(
              pubErr instanceof ApiError && pubErr.status === 404
                ? "Không tìm thấy dự án này hoặc dự án không công khai."
                : "Không tải được dự án.",
            );
          }
          return;
        }
        try {
          const owned = (await getProject(id)) as OwnedProject;
          if (cancelled) return;
          setData({
            id: owned.id,
            name: owned.name,
            description: owned.description,
            genre: owned.genre,
            visibility: owned.visibility,
            archivedAt: owned.archived_at,
            updatedAt: owned.updated_at,
            playCount: owned.play_count,
            forkCount: null,
            tags: [],
            owner: profile
              ? {
                  id: profile.id,
                  username: profile.username,
                  display_name: profile.display_name,
                  avatar_url: profile.avatar_url,
                }
              : null,
            isOwner: true,
          });
        } catch {
          if (!cancelled) {
            setError("Không tìm thấy dự án này, hoặc bạn không có quyền xem.");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (!authLoading) void load();
    return () => {
      cancelled = true;
    };
  }, [id, user, profile, authLoading]);

  function switchTab(next: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.push(`/projects/${id}${qs ? `?${qs}` : ""}`);
  }

  function handleFork() {
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(`/projects/${id}`)}`);
      return;
    }
    // TODO: nối vào module Fork khi có (UC-69).
    setForking(true);
    setTimeout(() => {
      setForking(false);
      setToastMessage("PLACEHOLDER — tính năng fork chưa được xây dựng.");
    }, 800);
  }

  if (loading || authLoading) {
    return (
      <div className="mx-auto max-w-page px-5 py-8">
        <div className="animate-pulse">
          <div className="mb-2 h-7 w-2/5 rounded bg-surface-subtle" />
          <div className="mb-6 h-3 w-1/4 rounded bg-surface-subtle" />
          <div className="h-56 rounded-card bg-surface-subtle" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-page px-5 py-8">
        <div className="rounded-card border border-danger/20 bg-danger-muted p-8 text-center">
          <h1 className="text-lg font-semibold text-danger">Không tìm thấy</h1>
          <p className="mt-2 text-[13px] text-muted">{error ?? "Dự án này không tồn tại."}</p>
          <Link href="/explore">
            <Button variant="secondary" className="mt-4">
              Quay lại Khám phá
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const ownerName = data.owner?.display_name ?? data.owner?.username ?? "Người dùng";

  /*
   * Cùng MỘT trang cho mọi người xem (mô hình GitHub) — khác nhau chỉ ở hành
   * động khả dụng. Tab "Commit" chỉ hiện với chủ dự án vì backend cũng chỉ cho
   * chủ dự án đọc lịch sử (đúng SRS: UC-43 actor là User, UC-09 cho Guest chỉ
   * có playback/mô tả/thống kê).
   */
  const tabs: { id: TabId; label: string; visible: boolean; ready: boolean }[] = [
    { id: "overview", label: "Tổng quan", visible: true, ready: true },
    { id: "commits", label: "Commit", visible: data.isOwner, ready: true },
    { id: "branches", label: "Nhánh", visible: data.isOwner, ready: true },
    { id: "pulls", label: "Pull request", visible: data.isOwner, ready: false },
  ];

  const activeTab = tabs.find((t) => t.id === tab && t.visible && t.ready) ? tab : "overview";

  return (
    <>
      {toastMessage && <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />}

      <div className="mx-auto max-w-page px-5 py-8">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
              {data.owner ? (
                <Link href={`/creator/${data.owner.id}`} className="hover:underline">
                  {ownerName}
                </Link>
              ) : (
                <span>{ownerName}</span>
              )}
              <span className="text-muted">/</span>
              <span>{data.visibility === "public" ? "Dự án công khai" : "Dự án riêng tư"}</span>
            </p>
            <h1 className="mb-1 mt-0.5 flex flex-wrap items-center gap-2 text-[26px] font-semibold leading-tight tracking-tight">
              {data.name}
              {data.archivedAt && <Badge variant="warning">Đã lưu trữ</Badge>}
            </h1>
            {data.description && (
              <p className="max-w-3xl text-sm text-muted">{data.description}</p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {data.visibility === "public" && (
              <Button variant="secondary" onClick={handleFork} disabled={forking}>
                {forking ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang xử lý…
                  </>
                ) : (
                  <>
                    <GitFork className="h-3.5 w-3.5" /> Fork (PLACEHOLDER)
                    {data.forkCount !== null && (
                      <span className="font-mono">
                        {data.forkCount.toLocaleString("vi-VN")}
                      </span>
                    )}
                  </>
                )}
              </Button>
            )}

            <Button
              variant="secondary"
              disabled
              title="PLACEHOLDER — tính năng phát nhạc chưa được xây dựng"
            >
              <Play className="h-3.5 w-3.5" /> Nghe thử (PLACEHOLDER)
            </Button>

            {data.isOwner && (
              <>
                <Link href={`/projects/${data.id}/settings`}>
                  <Button variant="secondary">
                    <SettingsIcon className="h-3.5 w-3.5" /> Cài đặt
                  </Button>
                </Link>
                <Link href={`/projects/${data.id}/edit`}>
                  <Button>
                    <Piano className="h-3.5 w-3.5" /> Mở trình soạn nhạc
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
          {tabs
            .filter((t) => t.visible)
            .map((t) =>
              t.ready ? (
                <button
                  key={t.id}
                  onClick={() => switchTab(t.id)}
                  className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-xs transition-colors ${
                    activeTab === t.id
                      ? "border-accent font-bold text-foreground"
                      : "border-transparent text-muted hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ) : (
                <span
                  key={t.id}
                  title="PLACEHOLDER — chưa xây dựng"
                  className="-mb-px cursor-not-allowed whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-xs text-muted opacity-60"
                >
                  {t.label} (PLACEHOLDER)
                </span>
              ),
            )}
        </div>

        {activeTab === "commits" ? (
          <CommitHistory projectId={data.id} />
        ) : activeTab === "branches" ? (
          <BranchList projectId={data.id} />
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0">
              <section className="overflow-hidden rounded-card border border-border bg-surface">
                <div className="flex h-[52px] items-center justify-between gap-3 px-3.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <FileMusic className="h-4 w-4 shrink-0 text-muted" />
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[11px] font-bold">{data.name}.mid</p>
                      <p className="text-[9px] text-muted">
                        Cập nhật {formatRelativeTime(data.updatedAt)}
                      </p>
                    </div>
                  </div>
                  {data.isOwner && (
                    <Link href={`/projects/${data.id}/edit`}>
                      <Button variant="secondary">Mở trong trình soạn nhạc</Button>
                    </Link>
                  )}
                </div>
                {/*
                  Ảnh đại diện tất định theo id — KHÔNG vẽ nốt/waveform giả cho
                  dự án có thật (CLAUDE.md 4.7).
                */}
                <ProjectThumb
                  id={data.id}
                  size="lg"
                  className="h-auto min-h-[240px] rounded-none border-t border-border"
                />
              </section>

              <section className="mt-5 border-t border-border pt-4">
                <h2 className="mb-2 text-[13px] font-semibold">Về dự án này</h2>
                <p className="text-[13px] leading-relaxed text-muted">
                  {data.description ?? "Chưa có mô tả cho dự án này."}
                </p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {data.genre && <Badge variant="neutral">{data.genre}</Badge>}
                  {data.tags.map((tag) => (
                    <Link key={tag} href={`/explore?tag=${encodeURIComponent(tag)}`}>
                      <Badge variant="neutral">#{tag}</Badge>
                    </Link>
                  ))}
                </div>
              </section>
            </div>

            <aside className="flex flex-col gap-4">
              {data.owner && (
                <div className="rounded-card border border-border bg-surface p-4">
                  <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted">
                    Tác giả
                  </h3>
                  <Link
                    href={`/creator/${data.owner.id}`}
                    className="flex items-center gap-3 hover:text-accent"
                  >
                    <Avatar
                      id={data.owner.id}
                      label={ownerName}
                      imageUrl={data.owner.avatar_url}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold">{ownerName}</p>
                      <p className="truncate font-mono text-[10px] text-muted">
                        @{data.owner.username ?? "unknown"}
                      </p>
                    </div>
                  </Link>
                </div>
              )}

              <div className="grid grid-cols-2 overflow-hidden rounded-card border border-border bg-surface">
                <div className="border-r border-border px-4 py-3">
                  <p className="font-mono text-[17px] font-bold">
                    {data.playCount.toLocaleString("vi-VN")}
                  </p>
                  <p className="text-[10px] text-muted">Lượt nghe</p>
                </div>
                <div className="px-4 py-3">
                  <p className="font-mono text-[17px] font-bold">
                    {data.forkCount !== null ? data.forkCount.toLocaleString("vi-VN") : "—"}
                  </p>
                  <p className="text-[10px] text-muted">Lượt fork</p>
                </div>
              </div>

              {!user && (
                <div className="rounded-card border border-border bg-surface p-4">
                  <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted">
                    <CircleUserRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      <Link
                        href={`/login?redirect=${encodeURIComponent(`/projects/${id}`)}`}
                        className="font-semibold text-accent hover:underline"
                      >
                        Đăng nhập
                      </Link>{" "}
                      để fork dự án này về không gian làm việc của bạn.
                    </span>
                  </p>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </>
  );
}

export default function ProjectOverviewPage({ params }: Props) {
  const { id } = use(params);
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-page px-5 py-8">
          <div className="h-7 w-2/5 animate-pulse rounded bg-surface-subtle" />
        </div>
      }
    >
      <ProjectOverview id={id} />
    </Suspense>
  );
}
