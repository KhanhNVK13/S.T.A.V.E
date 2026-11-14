"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell, Compass, FileMusic, Piano, Plus, Sparkles, Users } from "lucide-react";
import { useAuth } from "../../context/auth-context";
import { useI18n } from "../../context/i18n-context";
import {
  getDraftRecovery,
  getUnreadNotificationCount,
  listNotifications,
  listProjects,
  listPublicProjects,
  markAllNotificationsRead,
  type NotificationItem,
  type PublicProject,
} from "../../lib/api-client";
import { getJamEvents } from "../../lib/api-jam";
import { errorSource, renderError, type ErrorSource } from "../../lib/error-message";
import { formatAuthorName } from "../../lib/format-name";
import { formatRelativeTime } from "../../lib/format-date";
import { useApiResource } from "../../lib/use-api-resource";
import { useSpaceScene } from "../space/use-space-scene";
import { SiteCredits } from "../site-footer";
import { NOTIFICATIONS_CHANGED_EVENT } from "../notification-bell";
import { JamCountdownTimer } from "../jam/jam-countdown-timer";
import { Badge } from "../ui/badge";
import { notificationText } from "../../lib/notification-text";
import { Card } from "../ui/card";
import { ProjectPreviewButton } from "../project/preview-button";
import { buttonClass } from "../ui/button";
import { ProjectThumb } from "../ui/project-thumb";
import { RowHeader, RowItem, RowList, RowTime, RowTitle } from "../ui/row-list";

interface HomeProject {
  id: string;
  name: string;
  description: string | null;
  genre: string | null;
  visibility: "private" | "public";
  archived_at: string | null;
  updated_at: string;
}

interface Resume {
  project: HomeProject;
  savedAt: string | null;
}

const RECENT_LIMIT = 5;
const RESUME_CANDIDATES = 3;

const LINK_PRIMARY = buttonClass("primary");
const LINK_SECONDARY = buttonClass("secondary");
const TEXT_LINK = "text-[13px] text-muted underline decoration-border-strong underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground";

async function findResume(candidates: HomeProject[]): Promise<Resume | null> {
  for (const project of candidates) {
    try {
      const recovery = await getDraftRecovery(project.id);
      if (recovery.recovered) return { project, savedAt: recovery.savedAt };
    } catch {
      continue;
    }
  }
  return null;
}

function SectionHead({ id, title, link }: { id: string; title: string; link?: { href: string; label: string; hidden: string } }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h2 id={id} className="text-section">
        {title}
      </h2>
      {link && (
        <Link href={link.href} className={TEXT_LINK}>
          {link.label}
          <span className="sr-only"> {link.hidden}</span>
        </Link>
      )}
    </div>
  );
}

function BlockSkeleton({ height }: { height: string }) {
  return <div aria-hidden="true" className={`${height} animate-pulse rounded-panel border border-border bg-surface/70 motion-reduce:animate-none`} />;
}

function Shortcuts() {
  const { t } = useI18n();
  const items = [
    { href: "/projects/new", label: t("nav.newProject"), icon: Plus },
    { href: "/explore", label: t("nav.explore"), icon: Compass },
    { href: "/welcome", label: t("home.tour"), icon: Sparkles },
  ];
  return (
    <nav aria-label={t("home.shortcuts")} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="group flex min-h-[54px] items-center gap-3 rounded-card border border-border-strong bg-surface/50 px-4 text-sm font-medium transition-colors hover:border-foreground hover:bg-foreground/[0.06]"
        >
          <Icon aria-hidden="true" className="h-5 w-5 text-accent" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

function FirstProject() {
  const { t } = useI18n();
  return (
    <Card className="relative flex flex-col items-center overflow-hidden !rounded-panel px-6 py-14 text-center">
      <div aria-hidden="true" className="staff-rule pointer-events-none absolute inset-x-0 top-[58px]" />
      <span className="relative mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border-strong bg-background">
        <FileMusic aria-hidden="true" className="h-5 w-5 text-accent" />
      </span>
      <h2 className="text-section">{t("home.firstTitle")}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
        {t("home.firstBody")}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link href="/projects/new" className={LINK_PRIMARY}>
          <Plus className="h-3.5 w-3.5" /> {t("home.firstCreate")}
        </Link>
        <Link href="/explore" className={LINK_SECONDARY}>
          {t("home.viewPublic")}
        </Link>
      </div>
    </Card>
  );
}

function ContinueCard({ resume }: { resume: Resume }) {
  const { t } = useI18n();
  const { project, savedAt } = resume;
  return (
    <Card className="!rounded-panel p-5 sm:p-6" aria-labelledby="home-continue">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <ProjectThumb id={project.id} className="sm:!w-44 sm:shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 id="home-continue" className="eyebrow">
            {t("home.continue")}
          </h2>
          <p className="mt-1.5 truncate text-2xl tracking-[-0.025em]">
            <Link href={`/projects/${project.id}`} className="underline-offset-4 hover:underline">
              {project.name}
            </Link>
          </p>
          <p className="mt-1 text-[13px] text-muted">
            {t("home.uncommitted")}
            {savedAt ? t("home.draftSaved", { when: formatRelativeTime(savedAt) }) : ""}
          </p>
        </div>
        <Link
          href={`/projects/${project.id}/edit`}
          aria-label={t("home.openEditorFor", { name: project.name })}
          className={LINK_PRIMARY}
        >
          <Piano className="h-3.5 w-3.5" /> {t("home.openEditor")}
        </Link>
      </div>
    </Card>
  );
}

const RECENT_COLS = "md:grid-cols-[minmax(0,1fr)_96px_104px_auto]";

function RecentProjects({ projects }: { projects: HomeProject[] }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="home-recent">
      <SectionHead
        id="home-recent"
        title={t("home.recent")}
        link={{ href: "/projects", label: t("home.seeAll"), hidden: t("home.seeAllHidden") }}
      />
      <RowList cols={RECENT_COLS}>
        <RowHeader>
          <span>{t("home.colProject")}</span>
          <span>{t("home.colVisibility")}</span>
          <span className="text-right">{t("home.colUpdated")}</span>
          <span />
        </RowHeader>
        {projects.map((project) => (
          <RowItem key={project.id}>
            <RowTitle
              href={`/projects/${project.id}`}
              name={project.name}
              meta={project.genre ?? project.description ?? undefined}
              leading={<ProjectThumb id={project.id} size="sm" />}
            />
            <span>
              <Badge variant={project.visibility === "public" ? "info" : "neutral"}>
                {project.visibility === "public" ? t("common.public") : t("common.private")}
              </Badge>
            </span>
            <RowTime>{formatRelativeTime(project.updated_at)}</RowTime>
            <div className="md:justify-self-end">
              <Link
                href={`/projects/${project.id}/edit`}
                aria-label={t("home.openEditorFor", { name: project.name })}
                className={LINK_SECONDARY}
              >
                <Piano className="h-3.5 w-3.5" /> {t("home.openEditor")}
              </Link>
            </div>
          </RowItem>
        ))}
      </RowList>
    </section>
  );
}

function ExplorePicks({ items }: { items: PublicProject[] }) {
  const { t, locale } = useI18n();
  return (
    <section aria-labelledby="home-picks">
      <SectionHead
        id="home-picks"
        title={t("home.picks")}
        link={{ href: "/explore", label: t("home.openExplore"), hidden: t("home.openExploreHidden") }}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((p) => (
          <Card key={p.id} className="flex flex-col gap-1.5 !rounded-panel p-4">
            <ProjectThumb id={p.id} className="mb-2 !h-28" />
            <h3 className="truncate text-lg font-medium tracking-[-0.015em]">
              <Link href={`/projects/${p.id}`} className="underline-offset-4 hover:text-accent hover:underline">
                {p.name}
              </Link>
            </h3>
            <p className="truncate text-xs text-muted">
              {formatAuthorName(p.owner)}
              {p.genre ? ` · ${p.genre}` : ""}
            </p>
            <p className="font-mono text-xs tabular-nums text-muted">
              {t("home.playsForks", { plays: p.play_count.toLocaleString(locale), forks: p.fork_count.toLocaleString(locale) })}
            </p>
            <div className="mt-1.5">
              <ProjectPreviewButton projectId={p.id} projectName={p.name} compact />
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

function Notifications({
  items,
  count,
  onChanged,
}: {
  items: NotificationItem[];
  count: number;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorSource | null>(null);

  async function readAll() {
    setBusy(true);
    setError(null);
    try {
      await markAllNotificationsRead();
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
      onChanged();
    } catch (err) {
      setError(errorSource(err, "home.markFail"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="!rounded-panel p-5" aria-labelledby="home-notes">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="home-notes" className="text-section flex items-center gap-2">
          {t("home.notifications")}
          <span
            aria-live="polite"
            className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-xs font-semibold tracking-normal tabular-nums ${
              count > 0 ? "bg-accent text-accent-foreground" : "bg-foreground/10 text-muted"
            }`}
          >
            {count}
            <span className="sr-only">{t("home.unread")}</span>
          </span>
        </h2>
        {count > 0 && (
          <button type="button" onClick={() => void readAll()} disabled={busy} className={`${TEXT_LINK} disabled:opacity-50`}>
            {t("home.markRead")}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mb-2 text-xs text-danger">
          {renderError(error)}
        </p>
      )}
      {items.length > 0 ? (
        <ul className="flex flex-col">
          {items.map((n) => (
            <li key={n.id} className="flex gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0">
              <span aria-hidden="true" className="star-dot mt-1.5 text-accent" />
              <span className="min-w-0">
                <Link href="/notifications" className="block text-[13px] font-semibold leading-snug hover:underline">
                  {notificationText(n, t).title ?? t("home.notifFallback")}
                </Link>
                <span className="font-mono text-xs text-muted">{formatRelativeTime(n.created_at)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">
          {count > 0
            ? t("home.notifUnreadHint")
            : t("home.notifEmpty")}
        </p>
      )}
      <div className="mt-3">
        <Link href="/notifications" className={TEXT_LINK}>
          {t("home.openNotifications")}
        </Link>
      </div>
    </Card>
  );
}

function JamBanner({ id, name, description, endsAt, people }: { id: string; name: string; description: string | null; endsAt: string | null; people: number }) {
  const { t } = useI18n();
  return (
    <Card className="!rounded-panel p-5" aria-labelledby="home-jam">
      <p className="eyebrow">{t("home.jamLive")}</p>
      <h2 id="home-jam" className="text-section mt-2">
        {name}
      </h2>
      {description && <p className="mt-1.5 line-clamp-3 text-[13px] text-muted">{description}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <JamCountdownTimer endsAt={endsAt} />
        <span className="flex items-center gap-1.5 text-[13px] text-muted">
          <Users className="h-3.5 w-3.5" />
          {people > 0 ? t("home.jamPeople", { n: people }) : t("home.jamWaiting")}
        </span>
      </div>
      <div className="mt-4">
        <Link href={`/jam/${id}`} className={LINK_PRIMARY}>
          {t("home.jamJoin")}
        </Link>
      </div>
    </Card>
  );
}

export function Home() {
  const { t } = useI18n();
  useSpaceScene("quiet", 0);
  const { user, profile } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [notesAttempt, setNotesAttempt] = useState(0);

  const projects = useApiResource<HomeProject[]>(
    async () => ((await listProjects()) as HomeProject[]).filter((p) => !p.archived_at),
    [attempt],
  );
  const sorted = (projects.data ?? [])
    .slice()
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  const candidates = sorted.slice(0, RESUME_CANDIDATES);
  const candidateKey = candidates.map((p) => p.id).join(",");
  const resume = useApiResource<Resume | null>(() => findResume(candidates), [candidateKey]);

  const unread = useApiResource(() => listNotifications({ filter: "unread" }), [notesAttempt]);
  const unreadCount = useApiResource(() => getUnreadNotificationCount(), [notesAttempt]);
  const picks = useApiResource(() => listPublicProjects({ sort: "popular", limit: 3 }), []);
  const jam = useApiResource(() => getJamEvents("active"), []);

  const name = profile?.display_name ?? user?.email?.split("@")[0] ?? "";
  const hasProjects = sorted.length > 0;
  const isNew = !projects.loading && !projects.error && !hasProjects;
  const count = unreadCount.data ?? unread.data?.items.length ?? 0;
  const activeJam = jam.data?.[0] ?? null;
  const pickItems = picks.data?.items ?? [];

  let status = "";
  if (!projects.loading) {
    if (isNew) status = t("home.statusNew");
    else if (resume.data) status = t("home.statusUncommitted", { name: resume.data.project.name });
    else if (hasProjects) status = t("home.statusClean");
  }

  return (
    <div className="mx-auto max-w-page px-5 py-9 sm:px-8 lg:px-10">
      <div className="mb-7 min-w-0">
        <h1 className="text-title">
          {isNew ? t("home.welcomeNew") : t("home.welcomeBack")}
          {name ? `, ${name}` : ""}
        </h1>
        {status && <p className="mt-2 max-w-[64ch] text-[15px] text-muted">{status}</p>}
      </div>

      <div className="mb-8">
        <Shortcuts />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
          {projects.loading && (
            <>
              <BlockSkeleton height="h-32" />
              <BlockSkeleton height="h-64" />
            </>
          )}

          {projects.error && !projects.loading && (
            <div role="alert" className="flex flex-col items-start gap-3 rounded-card border border-danger/30 bg-danger-muted p-4 text-sm text-danger">
              <p>{t("home.projectsFail")}</p>
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className={LINK_SECONDARY}>
                {t("ui.retry")}
              </button>
            </div>
          )}

          {isNew && <FirstProject />}

          {!projects.loading && resume.data && <ContinueCard resume={resume.data} />}

          {!projects.loading && hasProjects && <RecentProjects projects={sorted.slice(0, RECENT_LIMIT)} />}

          {pickItems.length > 0 && <ExplorePicks items={pickItems} />}
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
          {unread.loading && unreadCount.loading ? (
            <BlockSkeleton height="h-40" />
          ) : unread.error && unreadCount.error ? (
            <Card className="!rounded-panel p-5">
              <h2 className="text-section mb-2 flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted" /> {t("home.notifications")}
              </h2>
              <p className="text-[13px] text-muted">{t("home.notifLoadFail")}</p>
              <Link href="/notifications" className={`${TEXT_LINK} mt-2 inline-block`}>
                {t("home.openNotifications")}
              </Link>
            </Card>
          ) : (
            <Notifications
              items={(unread.data?.items ?? []).slice(0, 4)}
              count={count}
              onChanged={() => setNotesAttempt((n) => n + 1)}
            />
          )}

          {activeJam && (
            <JamBanner
              id={activeJam.id}
              name={activeJam.name}
              description={activeJam.description}
              endsAt={activeJam.scheduled_end_at}
              people={activeJam.currentParticipantCount}
            />
          )}
        </div>
      </div>

      <footer className="mt-14 flex flex-col gap-4 border-t border-border pt-5 text-[13px] text-muted">
        <nav aria-label={t("home.footerNav")} className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/welcome" className="hover:text-foreground hover:underline">
            {t("home.tour")}
          </Link>
          <Link href="/explore" className="hover:text-foreground hover:underline">
            {t("nav.explore")}
          </Link>
          <Link href="/rankings" className="hover:text-foreground hover:underline">
            {t("nav.rankings")}
          </Link>
        </nav>
        <SiteCredits className="text-xs" />
      </footer>
    </div>
  );
}
