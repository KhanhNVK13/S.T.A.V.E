'use client';

import Link from 'next/link';
import { Play, GitFork, GitBranch, ScrollText, Music2, Eye, Plus, CircleUserRound } from 'lucide-react';
import { useAuth } from '../context/auth-context';
import { getFeaturedContent, FeaturedContent } from '../lib/api-client';
import { useApiResource } from '../lib/use-api-resource';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { ProjectThumb } from '../components/ui/project-thumb';
import { formatRelativeTime } from '../lib/format-date';
import { RowList, RowHeader, RowItem, RowTitle, RowStat, RowTime } from '../components/ui/row-list';

/** Hạng | dự án | thể loại | lượt nghe | fork | cập nhật. */
const COLS = 'md:grid-cols-[34px_minmax(0,1fr)_112px_84px_84px_78px]';

export default function HomePage() {
  const { user } = useAuth();
  // Lỗi tải được bỏ qua có chủ đích — phần đầu trang đã có sẵn nội dung mặc định
  // cho trường hợp `data === null`, không có gì thêm để hiển thị khi hỏng.
  const { data, loading } = useApiResource<FeaturedContent>(() => getFeaturedContent(), []);

  const featured = data?.featured_projects[0] ?? null;
  const featuredOwner =
    featured?.owner.display_name ?? featured?.owner.username ?? 'Người dùng';

  return (
    <div className="mx-auto min-h-full max-w-page px-5 py-8">
      {/* Đầu trang */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-7">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
            Không gian cộng đồng
          </p>
          <h1 className="mb-1 mt-0.5 text-[26px] font-semibold leading-tight tracking-tight">
            {loading ? 'STAVE' : (data?.hero.title ?? 'Âm nhạc đang chuyển động')}
          </h1>
          <p className="max-w-2xl text-sm text-muted">
            {loading
              ? 'Đang tải…'
              : (data?.hero.subtitle ??
                'Theo dõi ý tưởng khi chúng phân nhánh, thay đổi và trở thành bản nhạc hoàn chỉnh.')}
          </p>
        </div>
        <Link href={user ? '/projects/new' : '/register'} className="shrink-0">
          <Button>
            <Plus className="h-3.5 w-3.5" />
            {user ? 'Bắt đầu dự án' : 'Đăng ký miễn phí'}
          </Button>
        </Link>
      </div>

      {/* Dự án nổi bật */}
      {featured && (
        <section className="mb-7 grid overflow-hidden rounded-card border border-border bg-surface md:grid-cols-[minmax(280px,0.75fr)_1.25fr]">
          <div className="flex flex-col p-7">
            <Badge variant="metal">Dự án nổi bật</Badge>
            <h2 className="mb-1.5 mt-3.5 text-[25px] font-semibold leading-tight tracking-tight">
              {featured.name}
            </h2>
            {featured.description && (
              <p className="mb-4 text-sm leading-relaxed text-muted">{featured.description}</p>
            )}

            <div className="flex flex-wrap gap-3.5 text-[11px] text-muted">
              <Link
                href={`/creator/${featured.owner.id}`}
                className="flex items-center gap-1.5 hover:text-accent"
              >
                <CircleUserRound className="h-3.5 w-3.5" /> {featuredOwner}
              </Link>
              <span className="flex items-center gap-1.5">
                <GitFork className="h-3.5 w-3.5" />
                <span className="font-mono">{featured.fork_count.toLocaleString('vi-VN')}</span> fork
              </span>
              <span className="flex items-center gap-1.5">
                <Play className="h-3.5 w-3.5" />
                <span className="font-mono">{featured.play_count.toLocaleString('vi-VN')}</span> lượt nghe
              </span>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Link href={`/projects/${featured.id}`}>
                <Button variant="secondary">
                  <Eye className="h-3.5 w-3.5" /> Xem dự án
                </Button>
              </Link>
            </div>
          </div>

          {/*
            Ảnh đại diện tất định theo id (ProjectThumb) — KHÔNG vẽ waveform/nốt
            giả cho một dự án có thật (CLAUDE.md 4.7: vẽ giả là bịa dữ liệu).
          */}
          <ProjectThumb id={featured.id} size="lg" className="h-full min-h-[220px] rounded-none" />
        </section>
      )}

      {/* Số liệu nền tảng */}
      {data && (
        <div className="mb-7 grid grid-cols-3 overflow-hidden rounded-card border border-border bg-surface">
          <div className="border-r border-border px-5 py-3.5">
            <p className="font-mono text-[17px] font-bold">
              {data.stats.total_projects.toLocaleString('vi-VN')}
            </p>
            <p className="text-[10px] text-muted">Dự án công khai</p>
          </div>
          <div className="border-r border-border px-5 py-3.5">
            <p className="font-mono text-[17px] font-bold">
              {data.stats.total_users.toLocaleString('vi-VN')}
            </p>
            <p className="text-[10px] text-muted">Người dùng</p>
          </div>
          <div className="px-5 py-3.5">
            <p className="font-mono text-[17px] font-bold">
              {data.stats.total_forks.toLocaleString('vi-VN')}
            </p>
            <p className="text-[10px] text-muted">Lượt fork</p>
          </div>
        </div>
      )}

      {/* Thịnh hành */}
      {data && data.trending_projects.length > 0 && (
        <section className="mb-7">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-[17px] font-semibold">Thịnh hành tuần này</h2>
              <p className="mt-1 text-[11px] text-muted">
                Dự án công khai đang được nghe và fork nhiều nhất.
              </p>
            </div>
            <Link href="/rankings" className="text-xs font-semibold text-accent hover:underline">
              Xem tất cả
            </Link>
          </div>

          <RowList>
            <RowHeader cols={COLS}>
              <span>#</span>
              <span>Dự án</span>
              <span>Thể loại</span>
              <span>Lượt nghe</span>
              <span>Fork</span>
              <span className="text-right">Cập nhật</span>
            </RowHeader>

            {data.trending_projects.slice(0, 5).map((project, i) => (
              <RowItem key={project.id} cols={COLS}>
                <span className="font-mono text-[10px] text-muted">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <RowTitle
                  href={`/projects/${project.id}`}
                  name={project.name}
                  meta={project.owner.display_name ?? project.owner.username ?? 'Người dùng'}
                />
                <span>{project.genre && <Badge variant="neutral">{project.genre}</Badge>}</span>
                <RowStat icon={Play} value={project.play_count} title="Lượt nghe" />
                <RowStat icon={GitFork} value={project.fork_count} title="Lượt fork" />
                <RowTime>{formatRelativeTime(project.updated_at)}</RowTime>
              </RowItem>
            ))}
          </RowList>
        </section>
      )}

      {/* Dự án mới */}
      {data && data.featured_projects.length > 1 && (
        <section className="mb-7">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-[17px] font-semibold">Dự án mới</h2>
              <p className="mt-1 text-[11px] text-muted">Vừa được chia sẻ công khai.</p>
            </div>
            <Link href="/explore" className="text-xs font-semibold text-accent hover:underline">
              Khám phá thêm
            </Link>
          </div>

          <RowList>
            {data.featured_projects.slice(1, 6).map((project) => (
              <RowItem key={project.id} cols="md:grid-cols-[minmax(0,1fr)_112px_84px_78px]">
                <RowTitle
                  href={`/projects/${project.id}`}
                  name={project.name}
                  meta={project.owner.display_name ?? project.owner.username ?? 'Người dùng'}
                />
                <span>{project.genre && <Badge variant="neutral">{project.genre}</Badge>}</span>
                <RowStat icon={Play} value={project.play_count} title="Lượt nghe" />
                <RowTime>{formatRelativeTime(project.updated_at)}</RowTime>
              </RowItem>
            ))}
          </RowList>
        </section>
      )}

      {/* Giới thiệu — chỉ hiện với khách chưa đăng nhập; người đã đăng nhập không cần đọc lại */}
      {!user && (
        <section className="mt-9 border-t border-border pt-8">
          <h2 className="mb-5 text-[17px] font-semibold">Vì sao dùng STAVE?</h2>
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <GitBranch className="mb-2.5 h-5 w-5 text-accent" />
              <h3 className="mb-1 text-[13px] font-semibold">Phân nhánh &amp; hợp nhất</h3>
              <p className="text-xs leading-relaxed text-muted">
                Thử nhiều hướng phối khác nhau mà không sợ mất bản gốc, hợp nhất khi đã hài lòng.
              </p>
            </div>
            <div>
              <ScrollText className="mb-2.5 h-5 w-5 text-accent" />
              <h3 className="mb-1 text-[13px] font-semibold">So sánh phiên bản</h3>
              <p className="text-xs leading-relaxed text-muted">
                Xem chính xác nốt nào được thêm, sửa hay xoá giữa hai phiên bản.
              </p>
            </div>
            <div>
              <Music2 className="mb-2.5 h-5 w-5 text-accent" />
              <h3 className="mb-1 text-[13px] font-semibold">Trình soạn nhạc MIDI</h3>
              <p className="text-xs leading-relaxed text-muted">
                Chỉnh sửa MIDI ngay trên trình duyệt, không cần cài đặt phần mềm.
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-5">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">Sẵn sàng bắt đầu?</p>
              <p className="mt-0.5 text-xs text-muted">
                Tham gia cùng cộng đồng sáng tác trên STAVE ngay hôm nay.
              </p>
            </div>
            <Link href="/register">
              <Button>Đăng ký miễn phí</Button>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
