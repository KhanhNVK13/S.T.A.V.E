"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell, Compass, FileMusic, Piano, Plus, Sparkles, Users } from "lucide-react";
import { useAuth } from "../../context/auth-context";
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
import { apiErrorMessage } from "../../lib/error-message";
import { formatAuthorName } from "../../lib/format-name";
import { APP_LOCALE, formatRelativeTime } from "../../lib/format-date";
import { useApiResource } from "../../lib/use-api-resource";
import { useSpaceScene } from "../space/use-space-scene";
import { SiteCredits } from "../site-footer";
import { NOTIFICATIONS_CHANGED_EVENT } from "../notification-bell";
import { JamCountdownTimer } from "../jam/jam-countdown-timer";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
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

const LINK_PRIMARY =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-accent bg-accent px-3 text-[13px] font-semibold text-accent-foreground transition-colors hover:border-accent-hover hover:bg-accent-hover";
const LINK_SECONDARY =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-surface/85 px-3 text-[13px] font-semibold transition-colors hover:border-border-strong hover:bg-surface-subtle";
const TEXT_LINK = "text-[13px] text-muted underline underline-offset-4 hover:text-foreground";

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
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 id={id} className="text-lg font-semibold tracking-tight">
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
  return <div aria-hidden="true" className={`${height} animate-pulse rounded-card border border-border bg-surface/85`} />;
}

function Shortcuts() {
  const items = [
    { href: "/projects/new", label: "Dự án mới", icon: Plus },
    { href: "/explore", label: "Khám phá", icon: Compass },
    { href: "/welcome", label: "Xem giới thiệu", icon: Sparkles },
  ];
  return (
    <nav aria-label="Lối tắt" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex min-h-[52px] items-center gap-3 rounded-card border border-border-strong bg-surface/85 px-4 text-sm font-semibold transition-colors hover:border-accent hover:bg-surface-subtle"
        >
          <Icon className="h-5 w-5 text-accent" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

function FirstProject() {
  return (
    <Card className="flex flex-col items-center px-6 py-12 text-center">
      <FileMusic className="mb-3 h-9 w-9 text-accent" />
      <h2 className="text-xl font-semibold tracking-tight">Bắt đầu bài hát đầu tiên</h2>
      <p className="mt-2 max-w-md text-sm text-muted">
        Một dự án giữ lại mọi phiên bản của bản nhạc. Bắt đầu từ trang trắng hoặc nhập một file MIDI, commit đầu tiên chỉ cách một cú bấm.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link href="/projects/new" className={LINK_PRIMARY}>
          <Plus className="h-3.5 w-3.5" /> Tạo dự án đầu tiên
        </Link>
        <Link href="/explore" className={LINK_SECONDARY}>
          Xem dự án công khai
        </Link>
      </div>
    </Card>
  );
}

function ContinueCard({ resume }: { resume: Resume }) {
  const { project, savedAt } = resume;
  return (
    <Card className="p-4" aria-labelledby="home-continue">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <ProjectThumb id={project.id} className="sm:!w-40 sm:shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 id="home-continue" className="text-xs font-bold uppercase tracking-[0.12em] text-accent">
            Tiếp tục từ chỗ bạn dừng lại
          </h2>
          <p className="mt-1 truncate text-xl font-semibold tracking-tight">
            <Link href={`/projects/${project.id}`} className="hover:underline">
              {project.name}
            </Link>
          </p>
          <p className="mt-1 text-[13px] text-muted">
            Có thay đổi chưa commit
            {savedAt ? ` · bản nháp lưu ${formatRelativeTime(savedAt)}` : ""}
          </p>
        </div>
        <Link
          href={`/projects/${project.id}/edit`}
          aria-label={`Mở Editor cho ${project.name}`}
          className={LINK_PRIMARY}
        >
          <Piano className="h-3.5 w-3.5" /> Mở Editor
        </Link>
      </div>
    </Card>
  );
}

const RECENT_COLS = "md:grid-cols-[minmax(0,1fr)_96px_104px_auto]";

function RecentProjects({ projects }: { projects: HomeProject[] }) {
  return (
    <section aria-labelledby="home-recent">
      <SectionHead
        id="home-recent"
        title="Dự án gần đây"
        link={{ href: "/projects", label: "Xem tất cả", hidden: "dự án" }}
      />
      <RowList cols={RECENT_COLS}>
        <RowHeader>
          <span>Dự án</span>
          <span>Hiển thị</span>
          <span className="text-right">Cập nhật</span>
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
                {project.visibility === "public" ? "Công khai" : "Riêng tư"}
              </Badge>
            </span>
            <RowTime>{formatRelativeTime(project.updated_at)}</RowTime>
            <div className="md:justify-self-end">
              <Link
                href={`/projects/${project.id}/edit`}
                aria-label={`Mở Editor cho ${project.name}`}
                className={LINK_SECONDARY}
              >
                <Piano className="h-3.5 w-3.5" /> Mở Editor
              </Link>
            </div>
          </RowItem>
        ))}
      </RowList>
    </section>
  );
}

function ExplorePicks({ items }: { items: PublicProject[] }) {
  const [note, setNote] = useState(false);
  return (
    <section aria-labelledby="home-picks">
      <SectionHead
        id="home-picks"
        title="Gợi ý từ Khám phá"
        link={{ href: "/explore", label: "Mở Khám phá", hidden: "để xem thêm dự án công khai" }}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((p) => (
          <Card key={p.id} className="flex flex-col gap-1.5 p-3.5">
            <ProjectThumb id={p.id} className="mb-1.5" />
            <h3 className="truncate text-[15px] font-semibold">
              <Link href={`/projects/${p.id}`} className="hover:text-accent hover:underline">
                {p.name}
              </Link>
            </h3>
            <p className="truncate text-xs text-muted">
              {formatAuthorName(p.owner)}
              {p.genre ? ` · ${p.genre}` : ""}
            </p>
            <p className="font-mono text-xs text-muted">
              {p.play_count.toLocaleString(APP_LOCALE)} lượt nghe · {p.fork_count.toLocaleString(APP_LOCALE)} fork
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                aria-disabled="true"
                aria-label={`Nghe thử ${p.name} (PLACEHOLDER, chưa xây)`}
                onClick={() => setNote(true)}
                className="inline-flex h-8 items-center rounded-md border border-border bg-surface/85 px-3 text-[13px] font-semibold text-muted hover:bg-surface-subtle"
              >
                Nghe thử
              </button>
              <Badge variant="warning">PLACEHOLDER</Badge>
            </div>
          </Card>
        ))}
      </div>
      <p role="status" className="mt-3 min-h-[1.25rem] text-[13px] text-muted">
        {note ? "PLACEHOLDER: nghe thử ngay trên Home chưa được xây. Mở dự án để nghe bản đầy đủ." : ""}
      </p>
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function readAll() {
    setBusy(true);
    setError(null);
    try {
      await markAllNotificationsRead();
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err, "Không đánh dấu được các thông báo."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4" aria-labelledby="home-notes">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="home-notes" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          Thông báo
          <span
            aria-live="polite"
            className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-xs font-bold ${
              count > 0 ? "bg-accent text-accent-foreground" : "bg-surface-subtle text-muted"
            }`}
          >
            {count}
            <span className="sr-only"> chưa đọc</span>
          </span>
        </h2>
        {count > 0 && (
          <button type="button" onClick={() => void readAll()} disabled={busy} className={`${TEXT_LINK} disabled:opacity-50`}>
            Đánh dấu đã đọc
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mb-2 text-xs text-danger">
          {error}
        </p>
      )}
      {items.length > 0 ? (
        <ul className="flex flex-col">
          {items.map((n) => (
            <li key={n.id} className="flex gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0">
              <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
              <span className="min-w-0">
                <Link href="/notifications" className="block text-[13px] font-semibold leading-snug hover:underline">
                  {n.payload.title ?? "Thông báo"}
                </Link>
                <span className="font-mono text-xs text-muted">{formatRelativeTime(n.created_at)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">
          {count > 0
            ? "Có thông báo chưa đọc, hãy mở trang Thông báo để xem."
            : "Không có thông báo mới. Lời mời, pull request và lượt sao sẽ hiện ở đây."}
        </p>
      )}
      <div className="mt-3">
        <Link href="/notifications" className={TEXT_LINK}>
          Mở trang Thông báo
        </Link>
      </div>
    </Card>
  );
}

function JamBanner({ id, name, description, endsAt, people }: { id: string; name: string; description: string | null; endsAt: string | null; people: number }) {
  return (
    <Card className="p-4" aria-labelledby="home-jam">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Community Jam đang diễn ra</p>
      <h2 id="home-jam" className="mt-1.5 text-lg font-semibold tracking-tight">
        {name}
      </h2>
      {description && <p className="mt-1.5 line-clamp-3 text-[13px] text-muted">{description}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <JamCountdownTimer endsAt={endsAt} />
        <span className="flex items-center gap-1.5 text-[13px] text-muted">
          <Users className="h-3.5 w-3.5" />
          {people > 0 ? `${people} người đang có mặt` : "Chờ người tham gia"}
        </span>
      </div>
      <div className="mt-4">
        <Link href={`/jam/${id}`} className={LINK_PRIMARY}>
          Tham gia ngay
        </Link>
      </div>
    </Card>
  );
}

export function Home() {
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
    if (isNew) status = "Hãy tạo dự án đầu tiên để bắt đầu sáng tác.";
    else if (resume.data) status = `Bạn có thay đổi chưa commit ở “${resume.data.project.name}”.`;
    else if (hasProjects) status = "Mọi thay đổi của bạn đã được commit.";
  }

  return (
    <div className="mx-auto max-w-page px-5 py-8">
      <div className="mb-6 min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight">
          {isNew ? "Chào mừng đến STAVE" : "Chào mừng trở lại"}
          {name ? `, ${name}` : ""}
        </h1>
        {status && <p className="mt-1 max-w-[64ch] text-sm text-muted">{status}</p>}
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
              <p>Không tải được danh sách dự án.</p>
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className={LINK_SECONDARY}>
                Thử lại
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
            <Card className="p-4">
              <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold tracking-tight">
                <Bell className="h-4 w-4 text-muted" /> Thông báo
              </h2>
              <p className="text-[13px] text-muted">Không tải được thông báo.</p>
              <Link href="/notifications" className={`${TEXT_LINK} mt-2 inline-block`}>
                Mở trang Thông báo
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
        <nav aria-label="Chân trang" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/welcome" className="hover:text-foreground hover:underline">
            Xem giới thiệu
          </Link>
          <Link href="/explore" className="hover:text-foreground hover:underline">
            Khám phá
          </Link>
          <Link href="/rankings" className="hover:text-foreground hover:underline">
            Bảng xếp hạng
          </Link>
        </nav>
        <SiteCredits className="text-xs" />
      </footer>
    </div>
  );
}
