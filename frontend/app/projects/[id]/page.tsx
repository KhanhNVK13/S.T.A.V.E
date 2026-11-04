"use client";

import { Suspense, use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  GitFork,
  Play,
  Loader2,
  Piano,
  CircleUserRound,
  Settings as SettingsIcon,
  FileUp,
} from "lucide-react";
import { getPublicProject, getProject, forkProject, ApiError } from "../../../lib/api-client";
import { listCollaborators } from "../../../lib/api-collab";
import type { CollaboratorItem } from "@stave/shared-types";
import { apiErrorMessage } from "../../../lib/error-message";
import type { PublicProject } from "../../../lib/api-client";
import { useAuth } from "../../../context/auth-context";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Avatar } from "../../../components/ui/avatar";
import { ProjectHistory } from "../../../components/project/project-history";
import { Tabs } from "../../../components/ui/tabs";
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
  const [collabInfo, setCollabInfo] = useState<{ projectId: string; items: CollaboratorItem[] } | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    if (authLoading || !user || !data) return;

    async function loadCollab() {
      try {
        const items = await listCollaborators(id);
        if (!cancelled) setCollabInfo({ projectId: id, items });
      } catch {
        if (!cancelled) setCollabInfo({ projectId: id, items: [] });
      }
    }

    void loadCollab();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, data, id]);

  const accepted = useMemo(
    () => (collabInfo && collabInfo.projectId === id ? collabInfo.items.filter((c) => c.status === "accepted") : []),
    [collabInfo, id],
  );
  const isCollaborator = !!user && accepted.some((c) => c.userId === user.id);
  const collaborators = accepted.filter((c) => c.userId !== data?.owner?.id);

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

  const tabs: { id: TabId; label: string; visible: boolean }[] = [
    { id: "overview", label: t("project.tabOverview"), visible: true },
    { id: "commits", label: t("project.tabCommits"), visible: data.isOwner },
    { id: "branches", label: t("project.tabBranches"), visible: data.isOwner },
    { id: "pulls", label: t("project.tabPulls"), visible: !!user && (data.isOwner || data.visibility === "public") },
    { id: "contributions", label: t("project.tabContributions"), visible: data.isOwner || isCollaborator },
  ];
  const visibleTabs = tabs.filter((tb) => tb.visible);
  const activeTab = visibleTabs.some((tb) => tb.id === tab) ? tab : "overview";

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
            <nav
              aria-label={t("ui.breadcrumb")}
              className="flex flex-wrap items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-accent"
            >
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
            </nav>
            <h1 className="mb-1 mt-1 break-words text-[28px] font-semibold leading-tight tracking-[-0.02em]">
              {data.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <Badge variant={data.visibility === "public" ? "info" : "neutral"}>
                {data.visibility === "public" ? t("project.public") : t("project.private")}
              </Badge>
              {data.archivedAt && <Badge variant="warning">{t("project.archived")}</Badge>}
              {data.genre && <Badge variant="neutral">{data.genre}</Badge>}
              <span>{t("project.updated", { when: formatRelativeTime(data.updatedAt) })}</span>
            </div>
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
                    <GitFork className="h-3.5 w-3.5" /> {t("project.fork")}
                    {data.forkCount !== null && (
                      <span className="font-mono">{data.forkCount.toLocaleString(locale)}</span>
                    )}
                  </>
                )}
              </Button>
            )}

            <Button variant="secondary" disabled title={t("project.previewTitle")}>
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

        <div className="mb-5">
          <Tabs
            tabs={visibleTabs.map(({ id: tabId, label }) => ({ id: tabId, label }))}
            active={activeTab}
            onChange={(next) => switchTab(next as TabId)}
          />
        </div>

        {activeTab === "commits" ? (
          <CommitHistory
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
            onSelectCommit={() => switchTab("commits")}
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0">
              {(data.isOwner || isCollaborator) && (
                <ProjectHistory
                  key={refreshKey}
                  projectId={data.id}
                  canEdit={data.isOwner && !data.archivedAt}
                  canOpenHistory={data.isOwner}
                />
              )}

              {data.isOwner && <VersionSummary key={refreshKey} projectId={data.id} onOpenTab={switchTab} />}

              <section className={data.isOwner || isCollaborator ? "mt-6 border-t border-border pt-4" : ""}>
                <h2 className="mb-2 text-[15px] font-semibold">{t("project.about")}</h2>
                <p className="max-w-3xl text-[13px] leading-relaxed text-muted">
                  {data.description ?? t("project.noDescription")}
                </p>

                {data.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {data.tags.map((tag) => (
                      <Link key={tag} href={`/explore?tag=${encodeURIComponent(tag)}`}>
                        <Badge variant="neutral">#{tag}</Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <aside className="flex flex-col gap-4">
              {data.owner && (
                <div className="rounded-card border border-border bg-surface p-4">
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
                    {t("project.author")}
                  </h3>
                  <Link href={`/creator/${data.owner.id}`} className="flex items-center gap-3 hover:text-accent">
                    <Avatar id={data.owner.id} label={ownerName} imageUrl={data.owner.avatar_url} />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold">{ownerName}</p>
                      <p className="truncate font-mono text-xs text-muted">@{data.owner.username ?? "unknown"}</p>
                    </div>
                  </Link>
                </div>
              )}

              {collaborators.length > 0 && (
                <div className="rounded-card border border-border bg-surface p-4">
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">
                    {t("projectPage.collaborators")}
                  </h3>
                  <ul className="flex flex-col gap-2.5">
                    {collaborators.map((c) => {
                      const name = c.user.displayName ?? c.user.username ?? t("project.user");
                      return (
                        <li key={c.id}>
                          <Link href={`/creator/${c.user.id}`} className="flex items-center gap-2.5 hover:text-accent">
                            <Avatar id={c.user.id} label={name} imageUrl={c.user.avatarUrl} size="sm" />
                            <span className="truncate text-[13px]">{name}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-2 overflow-hidden rounded-card border border-border bg-surface">
                <div className="border-r border-border px-4 py-3">
                  <p className="font-mono text-[17px] font-bold">{data.playCount.toLocaleString(locale)}</p>
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
