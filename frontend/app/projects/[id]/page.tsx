"use client";

import { Suspense, use, useCallback, useEffect, useState } from "react";
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
  FileUp,
} from "lucide-react";
import { getPublicProject, getProject, forkProject, ApiError } from "../../../lib/api-client";
import { listCollaborators } from "../../../lib/api-collab";
import { apiErrorMessage } from "../../../lib/error-message";
import type { PublicProject } from "../../../lib/api-client";
import { useAuth } from "../../../context/auth-context";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Avatar } from "../../../components/ui/avatar";
import { StarPrint } from "../../../components/project/star-print";
import { SkyLoading } from "../../../components/project/sky-state";
import { Toast } from "../../../components/ui/toast";
import { CommitHistory } from "../../../components/project/commit-history";
import { BranchList } from "../../../components/project/branch-list";
import { VersionSummary } from "../../../components/project/version-summary";
import { ImportMidiDialog } from "../../../components/project/import-midi-dialog";
import { ProjectPullRequests } from "../../../components/pull-request/project-pull-requests";
import { ContributionsView } from "../../../components/collaboration/contributions-view";
import { formatRelativeTime } from "../../../lib/format-date";
import { tNow } from "../../../lib/i18n";
import { useI18n } from "../../../context/i18n-context";

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

const PENDING_FORK_KEY = "stave_pending_fork";
const PENDING_FORK_TTL_MS = 15 * 60 * 1000;

type TabId = "overview" | "commits" | "branches" | "pulls" | "contributions";

function ProjectOverview({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, loading: authLoading } = useAuth();

  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forking, setForking] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importedMessage, setImportedMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  /** UC-65: chủ dự án hoặc cộng tác viên đã CHẤP NHẬN (BR-65: pending chưa có quyền). */
  const [collabInfo, setCollabInfo] = useState<{ projectId: string; accepted: boolean } | null>(null);
  const dismissToast = useCallback(() => setToastMessage(null), []);

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
                ? tNow("project.notFoundPublic")
                : tNow("project.loadFail"),
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
        } catch (ownErr) {
          if (!cancelled) {
            setError(
              ownErr instanceof ApiError && (ownErr.status === 404 || ownErr.status === 403)
                ? tNow("project.notFoundOwned")
                : apiErrorMessage(ownErr, tNow("project.loadFail")),
            );
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

  // UC-65: tab "Đóng góp" chỉ hiện với chủ dự án hoặc cộng tác viên đã
  // CHẤP NHẬN (BR-65: pending chưa có quyền). Không hiện với khách.
  // Pattern giống effect load() bên trên: không setState đồng bộ trong thân
  // effect — chỉ set sau lần await đầu tiên (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    if (authLoading || !user || !data || data.isOwner) return;
    const userId = user.id;

    async function loadCollab() {
      try {
        const items = await listCollaborators(id);
        if (cancelled) return;
        setCollabInfo({
          projectId: id,
          accepted: items.some(
            (item) => item.userId === userId && item.status === "accepted",
          ),
        });
      } catch {
        // Không đọc được danh sách → coi như chưa chấp nhận (tab ẩn,
        // ContributionsView tự hiện lỗi "Thử lại" nếu được mở trực tiếp).
        if (!cancelled) setCollabInfo({ projectId: id, accepted: false });
      }
    }

    void loadCollab();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, data, id]);

  const isCollaborator =
    !!user &&
    !!collabInfo &&
    collabInfo.projectId === id &&
    collabInfo.accepted;

  function switchTab(next: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.push(`/projects/${id}${qs ? `?${qs}` : ""}`);
  }

  async function performFork() {
    setForking(true);
    try {
      const created = await forkProject(id);
      router.push(`/projects/${created.id}/edit`);
    } catch (err) {
      setToastMessage(apiErrorMessage(err, t("project.forkFail")));
      setForking(false);
    }
  }

  function handleFork() {
    if (!user) {
      try {
        window.sessionStorage.setItem(PENDING_FORK_KEY, JSON.stringify({ id, at: Date.now() }));
      } catch {}
      router.push(`/login?redirect=${encodeURIComponent(`/projects/${id}`)}`);
      return;
    }
    void performFork();
  }

  useEffect(() => {
    if (authLoading || !user || !data || data.isOwner) return;
    let pendingId: string | null = null;
    try {
      const raw = window.sessionStorage.getItem(PENDING_FORK_KEY);
      if (raw) {
        window.sessionStorage.removeItem(PENDING_FORK_KEY);
        const parsed = JSON.parse(raw) as { id?: string; at?: number };
        if (typeof parsed.at === "number" && Date.now() - parsed.at < PENDING_FORK_TTL_MS) {
          pendingId = parsed.id ?? null;
        }
      }
    } catch {}
    if (pendingId === id) void Promise.resolve().then(performFork);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, data]);

  if (loading || authLoading) {
    return (
      <div className="mx-auto max-w-page px-5 py-8">
        <SkyLoading label={t("project.loading")} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-page px-5 py-8">
        <div className="rounded-card border border-danger/20 bg-danger-muted p-8 text-center">
          <h1 className="text-lg font-semibold text-danger">{t("project.openFail")}</h1>
          <p role="alert" className="mt-2 text-[13px] text-muted">
            {error ?? t("project.notExist")}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={() => window.location.reload()}>
              {t("ui.retry")}
            </Button>
            <Link href={user ? "/projects" : "/explore"}>
              <Button variant="ghost">{user ? t("project.toMine") : t("project.toExplore")}</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const ownerName = data.owner?.display_name ?? data.owner?.username ?? t("project.user");

  /*
   * Cùng MỘT trang cho mọi người xem (mô hình GitHub) — khác nhau chỉ ở hành
   * động khả dụng. Tab "Commit" chỉ hiện với chủ dự án vì backend cũng chỉ cho
   * chủ dự án đọc lịch sử (đúng SRS: UC-43 actor là User, UC-09 cho Guest chỉ
   * có playback/mô tả/thống kê).
   */
  const tabs: { id: TabId; label: string; visible: boolean; ready: boolean }[] = [
    { id: "overview", label: t("project.tabOverview"), visible: true, ready: true },
    { id: "commits", label: t("project.tabCommits"), visible: data.isOwner, ready: true },
    { id: "branches", label: t("project.tabBranches"), visible: data.isOwner, ready: true },
    { id: "pulls", label: t("project.tabPulls"), visible: !!user && (data.isOwner || data.visibility === "public"), ready: true },
    // UC-65: chỉ chủ dự án hoặc cộng tác viên đã chấp nhận (xem trên, BR-65).
    { id: "contributions", label: t("project.tabContributions"), visible: data.isOwner || isCollaborator, ready: true },
  ];

  const activeTab = tabs.find((tb) => tb.id === tab && tb.visible && tb.ready) ? tab : "overview";

  return (
    <>
      {toastMessage && <Toast message={toastMessage} variant="danger" onDismiss={dismissToast} />}
      {importedMessage && (
        <Toast message={importedMessage} variant="success" onDismiss={() => setImportedMessage(null)} />
      )}
      {importOpen && data.isOwner && (
        <ImportMidiDialog
          projectId={data.id}
          onClose={() => setImportOpen(false)}
          onImported={(message) => {
            setImportOpen(false);
            setImportedMessage(message);
            setRefreshKey((n) => n + 1);
          }}
        />
      )}

      <div className="mx-auto max-w-page px-5 py-8">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-accent">
              <Link href="/" className="hover:underline">
                {t("ui.home")}
              </Link>
              <span className="text-muted">/</span>
              {data.owner ? (
                <Link href={`/creator/${data.owner.id}`} className="hover:underline">
                  {ownerName}
                </Link>
              ) : (
                <span>{ownerName}</span>
              )}
              <span className="text-muted">/</span>
              <span>{data.visibility === "public" ? t("project.public") : t("project.private")}</span>
            </p>
            <h1 className="mb-1 mt-0.5 flex flex-wrap items-center gap-2 text-[26px] font-semibold leading-tight tracking-tight">
              {data.name}
              {data.archivedAt && <Badge variant="warning">{t("project.archived")}</Badge>}
            </h1>
            {data.description && (
              <p className="max-w-3xl text-sm text-muted">{data.description}</p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {data.visibility === "public" && !data.isOwner && (
              <Button variant="secondary" onClick={handleFork} disabled={forking}>
                {forking ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("project.working")}
                  </>
                ) : (
                  <>
                    <GitFork className="h-3.5 w-3.5" /> Fork
                    {data.forkCount !== null && (
                      <span className="font-mono">
                        {data.forkCount.toLocaleString(locale)}
                      </span>
                    )}
                  </>
                )}
              </Button>
            )}

            <Button
              variant="secondary"
              disabled
              title={t("project.previewTitle")}
            >
              <Play className="h-3.5 w-3.5" /> {t("project.preview")}
            </Button>

            {data.isOwner && (
              <>
                {!data.archivedAt && (
                  <Button variant="secondary" onClick={() => setImportOpen(true)}>
                    <FileUp className="h-3.5 w-3.5" /> {t("project.importMidi")}
                  </Button>
                )}
                <Link href={`/projects/${data.id}/settings`}>
                  <Button variant="secondary">
                    <SettingsIcon className="h-3.5 w-3.5" /> {t("project.settings")}
                  </Button>
                </Link>
                <Link href={`/projects/${data.id}/edit`}>
                  <Button>
                    <Piano className="h-3.5 w-3.5" /> {t("project.openEditor")}
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
          {tabs
            .filter((tb) => tb.visible)
            .map((tb) =>
              tb.ready ? (
                <button
                  key={tb.id}
                  onClick={() => switchTab(tb.id)}
                  className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-xs transition-colors ${
                    activeTab === tb.id
                      ? "border-accent font-bold text-foreground"
                      : "border-transparent text-muted hover:text-foreground"
                  }`}
                >
                  {tb.label}
                </button>
              ) : (
                <span
                  key={tb.id}
                  title={t("project.placeholderTab")}
                  className="-mb-px cursor-not-allowed whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-xs text-muted"
                >
                  {tb.label} (PLACEHOLDER)
                </span>
              ),
            )}
        </div>

        {activeTab === "commits" ? (
          <CommitHistory
            // `key` theo nhánh: bấm "Lịch sử" ở nhánh khác phải nạp lại từ đầu,
            // không giữ lựa chọn/trang của nhánh trước.
            key={`${searchParams.get("branch") ?? "default"}-${refreshKey}`}
            projectId={data.id}
            initialBranchId={searchParams.get("branch")}
          />
        ) : activeTab === "branches" ? (
          <BranchList key={refreshKey} projectId={data.id} />
        ) : activeTab === "pulls" ? (
          <ProjectPullRequests projectId={data.id} canCreate={data.isOwner} />
        ) : activeTab === "contributions" ? (
          <ContributionsView
            key={refreshKey}
            projectId={data.id}
            onSelectCommit={(commitId) => {
              // UC-65 (6): mở commit trong lịch sử phiên bản — chuyển tab
              // "Commit" kèm id để CommitHistory focus.
              switchTab("commits");
              void commitId;
            }}
          />
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0">
              <section className="overflow-hidden rounded-card border border-border bg-surface">
                <div className="flex h-[52px] items-center justify-between gap-3 px-3.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <FileMusic className="h-4 w-4 shrink-0 text-muted" />
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs font-bold">{data.name}.mid</p>
                      <p className="text-xs text-muted">
                        {t("project.updated", { when: formatRelativeTime(data.updatedAt) })}
                      </p>
                    </div>
                  </div>
                  {data.isOwner && (
                    <Link href={`/projects/${data.id}/edit`}>
                      <Button variant="secondary">{t("project.openInEditor")}</Button>
                    </Link>
                  )}
                </div>
                {/*
                  Ảnh đại diện tất định theo id — KHÔNG vẽ nốt/waveform giả cho
                  dự án có thật (CLAUDE.md 4.7).
                */}
                <StarPrint id={data.id} size="lg" className="border-t border-border" />
              </section>

              {data.isOwner && <VersionSummary key={refreshKey} projectId={data.id} onOpenTab={switchTab} />}

              <section className="mt-5 border-t border-border pt-4">
                <h2 className="mb-2 text-[13px] font-semibold">{t("project.about")}</h2>
                <p className="text-[13px] leading-relaxed text-muted">
                  {data.description ?? t("project.noDescription")}
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
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
                    {t("project.author")}
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
                      <p className="truncate font-mono text-xs text-muted">
                        @{data.owner.username ?? "unknown"}
                      </p>
                    </div>
                  </Link>
                </div>
              )}

              <div className="grid grid-cols-2 overflow-hidden rounded-card border border-border bg-surface">
                <div className="border-r border-border px-4 py-3">
                  <p className="font-mono text-[17px] font-bold">
                    {data.playCount.toLocaleString(locale)}
                  </p>
                  <p className="text-xs text-muted">{t("project.plays")}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="font-mono text-[17px] font-bold">
                    {data.forkCount !== null ? data.forkCount.toLocaleString(locale) : "—"}
                  </p>
                  <p className="text-xs text-muted">{t("project.forks")}</p>
                </div>
              </div>

              {!user && (
                <div className="rounded-card border border-border bg-surface p-4">
                  <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
                    <CircleUserRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      <Link
                        href={`/login?redirect=${encodeURIComponent(`/projects/${id}`)}`}
                        className="font-semibold text-accent hover:underline"
                      >
                        {t("nav.signIn")}
                      </Link>{" "}
                      {t("project.signInToFork")}
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
  const { t } = useI18n();
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-page px-5 py-8">
          <SkyLoading label={t("project.loading")} />
        </div>
      }
    >
      <ProjectOverview id={id} />
    </Suspense>
  );
}
