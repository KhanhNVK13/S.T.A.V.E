'use client';

import Link from 'next/link';
import { Flame, Sparkles, Play, GitFork, GitBranch, ScrollText, Music2, AudioLines } from 'lucide-react';
import { useAuth } from '../context/auth-context';
import { getFeaturedContent, FeaturedContent } from '../lib/api-client';
import { useApiResource } from '../lib/use-api-resource';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';

export default function HomePage() {
  const { user } = useAuth();
  // Errors are ignored on purpose — the hero section already has hardcoded placeholder
  // copy for `data === null`, so there's nothing extra to show on failure.
  const { data, loading } = useApiResource<FeaturedContent>(
    () => getFeaturedContent(),
    [],
  );

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 to-accent-900 px-4 py-24 text-white">
        <div className="absolute inset-0 opacity-10">
          <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="white" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative mx-auto max-w-5xl text-center">
          <div className="mb-6 flex justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
              <AudioLines className="h-6 w-6" />
            </span>
          </div>
          <h1 className="text-4xl font-bold sm:text-5xl lg:text-6xl">
            {loading ? 'STAVE' : (data?.hero.title ?? 'Sáng tác nhạc theo phong cách của bạn')}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/80">
            {loading
              ? 'Đang tải...'
              : (data?.hero.subtitle ??
                'Nền tảng quản lý phiên bản cho dự án MIDI. Lưu trữ, phân nhánh, so sánh và hợp nhất các bản nhạc của bạn như cách Git quản lý mã nguồn.')}
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href={user ? '/projects' : '/register'}>
              <Button className="px-8 py-3 text-lg">
                {loading ? '...' : (data?.hero.cta_primary.label ?? 'Bắt đầu sáng tạo')}
              </Button>
            </Link>
            <Link
              href="/explore"
              className="rounded-lg border-2 border-white/30 px-8 py-3 text-lg font-semibold text-white transition-colors hover:border-white/50 hover:bg-white/10"
            >
              {loading ? '...' : (data?.hero.cta_secondary.label ?? 'Khám phá dự án')}
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      {data && (
        <section className="border-b border-slate-200 py-8">
          <div className="mx-auto flex max-w-5xl justify-center gap-8 sm:gap-16">
            <div className="text-center">
              <p className="font-mono text-3xl font-bold text-slate-900">{data.stats.total_projects.toLocaleString()}</p>
              <p className="text-sm text-slate-500">Dự án công khai</p>
            </div>
            <div className="text-center">
              <p className="font-mono text-3xl font-bold text-slate-900">{data.stats.total_users.toLocaleString()}</p>
              <p className="text-sm text-slate-500">Người dùng</p>
            </div>
            <div className="text-center">
              <p className="font-mono text-3xl font-bold text-slate-900">{data.stats.total_forks.toLocaleString()}</p>
              <p className="text-sm text-slate-500">Lượt fork</p>
            </div>
          </div>
        </section>
      )}

      {/* Trending Projects */}
      {data && data.trending_projects.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-12">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
              <Flame className="h-6 w-6 text-warning-600" /> Dự án thịnh hành
            </h2>
            <Link href="/rankings" className="text-sm font-medium text-accent-600 hover:underline">
              Xem tất cả →
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.trending_projects.slice(0, 6).map((project) => (
              <Link key={project.id} href={`/explore/${project.id}`} className="group block">
                <Card className="p-4 transition-all hover:border-accent-300 hover:shadow-md">
                  <h3 className="mb-2 truncate font-semibold text-slate-900 group-hover:text-accent-700">
                    {project.name}
                  </h3>
                  <div className="flex items-center gap-3 font-mono text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Play className="h-3.5 w-3.5" /> {project.play_count.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <GitFork className="h-3.5 w-3.5" /> {project.fork_count.toLocaleString()}
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recent Projects */}
      {data && data.featured_projects.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-12">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
              <Sparkles className="h-6 w-6 text-accent-600" /> Dự án mới
            </h2>
            <Link href="/explore" className="text-sm font-medium text-accent-600 hover:underline">
              Khám phá thêm →
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.featured_projects.slice(0, 6).map((project) => (
              <Link key={project.id} href={`/explore/${project.id}`} className="group block">
                <Card className="p-4 transition-all hover:border-accent-300 hover:shadow-md">
                  <h3 className="mb-2 truncate font-semibold text-slate-900 group-hover:text-accent-700">
                    {project.name}
                  </h3>
                  {project.genre && (
                    <div className="mb-2">
                      <Badge variant="info">{project.genre}</Badge>
                    </div>
                  )}
                  <div className="mt-2 text-xs text-slate-500">@{project.owner.username ?? 'unknown'}</div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Features */}
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="mb-8 text-center text-2xl font-bold text-slate-900">Tại sao chọn STAVE?</h2>

          <div className="grid gap-8 md:grid-cols-3">
            <div className="text-center">
              <div className="mb-4 flex justify-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-50">
                  <GitBranch className="h-6 w-6 text-accent-600" />
                </span>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-slate-900">Branching & Merge</h3>
              <p className="text-sm text-slate-500">
                Thử nghiệm nhiều hướng phối khác nhau mà không sợ mất bản gốc. Merge khi đã hài lòng.
              </p>
            </div>

            <div className="text-center">
              <div className="mb-4 flex justify-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-50">
                  <ScrollText className="h-6 w-6 text-accent-600" />
                </span>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-slate-900">Version Diffing</h3>
              <p className="text-sm text-slate-500">
                So sánh trực quan các phiên bản. Xem chính xác note nào đã thêm, sửa, xoá.
              </p>
            </div>

            <div className="text-center">
              <div className="mb-4 flex justify-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-50">
                  <Music2 className="h-6 w-6 text-accent-600" />
                </span>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-slate-900">MIDI Editor</h3>
              <p className="text-sm text-slate-500">
                Chỉnh sửa MIDI trực tiếp trên trình duyệt với giao diện quen thuộc.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA — only for guests */}
      {!user && (
        <section className="py-16 text-center">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-bold text-slate-900">Sẵn sàng bắt đầu?</h2>
            <p className="mt-2 text-slate-500">Tham gia cùng cộng đồng sáng tác ngay hôm nay.</p>
            <Link href="/register">
              <Button className="mt-6 px-8 py-3 text-lg">Đăng ký miễn phí</Button>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
