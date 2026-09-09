'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../context/auth-context';
import { getFeaturedContent, FeaturedContent } from '../lib/api-client';

export default function HomePage() {
  const { user } = useAuth();
  const [data, setData] = useState<FeaturedContent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFeatured() {
      try {
        const result = await getFeaturedContent();
        setData(result);
      } catch {
        // Silently fail - show placeholder content
      } finally {
        setLoading(false);
      }
    }
    void fetchFeatured();
  }, []);

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#1F2126] to-[#0F2A5C] px-4 py-24 text-white">
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
            <Link
              href={user ? '/projects' : '/register'}
              className="rounded-lg bg-[#1D4ED8] px-8 py-3 text-lg font-semibold text-white transition-colors hover:bg-[#1E40AF]"
            >
              {loading ? '...' : (data?.hero.cta_primary.label ?? 'Bắt đầu sáng tạo')}
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
        <section className="border-b border-[#E3E4E8] py-8">
          <div className="mx-auto flex max-w-5xl justify-center gap-8 sm:gap-16">
            <div className="text-center">
              <p className="text-3xl font-bold text-[#1F2126]">{data.stats.total_projects.toLocaleString()}</p>
              <p className="text-sm text-[#8A8D93]">Dự án công khai</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-[#1F2126]">{data.stats.total_users.toLocaleString()}</p>
              <p className="text-sm text-[#8A8D93]">Người dùng</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-[#1F2126]">{data.stats.total_forks.toLocaleString()}</p>
              <p className="text-sm text-[#8A8D93]">Lượt fork</p>
            </div>
          </div>
        </section>
      )}

      {/* Trending Projects */}
      {data && data.trending_projects.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-12">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-[#1F2126]">🔥 Dự án thịnh hành</h2>
            <Link href="/rankings" className="text-sm font-medium text-[#1D4ED8] hover:underline">
              Xem tất cả →
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.trending_projects.slice(0, 6).map((project) => (
              <Link
                key={project.id}
                href={`/explore/${project.id}`}
                className="group block rounded-lg border border-[#E3E4E8] bg-white p-4 transition-all hover:border-[#1D4ED8] hover:shadow-md"
              >
                <h3 className="mb-2 truncate font-semibold text-[#1F2126] group-hover:text-[#1D4ED8]">
                  {project.name}
                </h3>
                <div className="flex items-center gap-2 text-xs text-[#8A8D93]">
                  <span>🎵 {project.play_count.toLocaleString()}</span>
                  <span>🍴 {project.fork_count.toLocaleString()}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recent Projects */}
      {data && data.featured_projects.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-12">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-[#1F2126]">✨ Dự án mới</h2>
            <Link href="/explore" className="text-sm font-medium text-[#1D4ED8] hover:underline">
              Khám phá thêm →
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.featured_projects.slice(0, 6).map((project) => (
              <Link
                key={project.id}
                href={`/explore/${project.id}`}
                className="group block rounded-lg border border-[#E3E4E8] bg-white p-4 transition-all hover:border-[#1D4ED8] hover:shadow-md"
              >
                <h3 className="mb-2 truncate font-semibold text-[#1F2126] group-hover:text-[#1D4ED8]">
                  {project.name}
                </h3>
                {project.genre && (
                  <span className="mb-2 inline-block rounded-full bg-[#1D4ED8]/10 px-2 py-0.5 text-xs font-medium text-[#1D4ED8]">
                    {project.genre}
                  </span>
                )}
                <div className="mt-2 flex items-center gap-2 text-xs text-[#8A8D93]">
                  <span>@{project.owner.username ?? 'unknown'}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Features */}
      <section className="bg-[#F7F7F5] py-16">
        <div className="mx-auto max-w-5xl px-4">
          <h2 className="mb-8 text-center text-2xl font-bold text-[#1F2126]">
            Tại sao chọn STAVE?
          </h2>

          <div className="grid gap-8 md:grid-cols-3">
            <div className="text-center">
              <div className="mb-4 text-4xl">🌿</div>
              <h3 className="mb-2 text-lg font-semibold text-[#1F2126]">
                Branching & Merge
              </h3>
              <p className="text-sm text-[#8A8D93]">
                Thử nghiệm nhiều hướng phối khác nhau mà không sợ mất bản gốc. Merge khi đã hài lòng.
              </p>
            </div>

            <div className="text-center">
              <div className="mb-4 text-4xl">📜</div>
              <h3 className="mb-2 text-lg font-semibold text-[#1F2126]">
                Version Diffing
              </h3>
              <p className="text-sm text-[#8A8D93]">
                So sánh trực quan các phiên bản. Xem chính xác note nào đã thêm, sửa, xoá.
              </p>
            </div>

            <div className="text-center">
              <div className="mb-4 text-4xl">🎵</div>
              <h3 className="mb-2 text-lg font-semibold text-[#1F2126]">
                MIDI Editor
              </h3>
              <p className="text-sm text-[#8A8D93]">
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
            <h2 className="text-2xl font-bold text-[#1F2126]">
              Sẵn sàng bắt đầu?
            </h2>
            <p className="mt-2 text-[#8A8D93]">
              Tham gia cùng cộng đồng sáng tác ngay hôm nay.
            </p>
            <Link
              href="/register"
              className="mt-6 inline-block rounded-lg bg-[#1D4ED8] px-8 py-3 text-lg font-semibold text-white transition-colors hover:bg-[#1E40AF]"
            >
              Đăng ký miễn phí
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
