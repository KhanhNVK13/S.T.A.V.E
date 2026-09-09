'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getPublicProject, PublicProject } from '../../../lib/api-client';
import { useAuth } from '../../../context/auth-context';

interface Props {
  params: Promise<{ id: string }>;
}

export default function PublicProjectPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [project, setProject] = useState<PublicProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forking, setForking] = useState(false);

  useEffect(() => {
    async function fetchProject() {
      setLoading(true);
      setError(null);
      try {
        const data = await getPublicProject(id);
        setProject(data);
      } catch {
        setError('Không tìm thấy dự án này hoặc dự án không còn công khai.');
      } finally {
        setLoading(false);
      }
    }
    void fetchProject();
  }, [id]);

  async function handleFork() {
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(`/explore/${id}`)}`);
      return;
    }
    // TODO: Implement fork logic when that module is ready
    setForking(true);
    // Placeholder - will be implemented with Fork module
    setTimeout(() => {
      setForking(false);
      alert('Tính năng fork sẽ sớm ra mắt!');
    }, 1000);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="animate-pulse">
          <div className="mb-2 h-8 w-2/3 rounded bg-[#F7F7F5]" />
          <div className="mb-6 h-4 w-1/3 rounded bg-[#F7F7F5]" />
          <div className="mb-4 h-32 rounded-lg bg-[#F7F7F5]" />
          <div className="h-4 w-full rounded bg-[#F7F7F5]" />
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-lg border border-[#B3242E]/20 bg-[#B3242E]/5 p-8 text-center">
          <h1 className="text-xl font-semibold text-[#B3242E]">Không tìm thấy</h1>
          <p className="mt-2 text-[#8A8D93]">{error ?? 'Dự án này không tồn tại.'}</p>
          <Link
            href="/explore"
            className="mt-4 inline-block rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white hover:bg-[#1E40AF]"
          >
            Quay lại Khám phá
          </Link>
        </div>
      </div>
    );
  }

  const ownerInitials = project.owner.display_name?.[0] ?? project.owner.username?.[0] ?? '?';

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-[#8A8D93]">
        <Link href="/explore" className="hover:text-[#1D4ED8]">
          Khám phá
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[#1F2126]">{project.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-[#1F2126]">{project.name}</h1>
            {project.genre && (
              <span className="mt-2 inline-block rounded-full bg-[#1D4ED8]/10 px-3 py-1 text-sm font-medium text-[#1D4ED8]">
                {project.genre}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Owner info */}
      <div className="mb-6 flex items-center gap-4">
        <Link
          href={`/creator/${project.owner.id}`}
          className="flex items-center gap-3 rounded-lg border border-[#E3E4E8] bg-white p-3 transition-colors hover:border-[#1D4ED8]"
        >
          {project.owner.avatar_url ? (
            <img
              src={project.owner.avatar_url}
              alt={project.owner.display_name ?? project.owner.username ?? ''}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1D4ED8] text-lg font-semibold text-white">
              {ownerInitials.toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-medium text-[#1F2126]">
              {project.owner.display_name ?? project.owner.username}
            </p>
            <p className="text-xs text-[#8A8D93]">
              @{project.owner.username ?? 'unknown'}
            </p>
          </div>
        </Link>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-[#E3E4E8] bg-white p-4 text-center">
          <p className="text-2xl font-bold text-[#1F2126]">{project.play_count.toLocaleString()}</p>
          <p className="text-sm text-[#8A8D93]">Lượt nghe</p>
        </div>
        <div className="rounded-lg border border-[#E3E4E8] bg-white p-4 text-center">
          <p className="text-2xl font-bold text-[#1F2126]">{project.fork_count.toLocaleString()}</p>
          <p className="text-sm text-[#8A8D93]">Lượt fork</p>
        </div>
        <div className="rounded-lg border border-[#E3E4E8] bg-white p-4 text-center">
          <p className="text-2xl font-bold text-[#1F2126]">{project.like_count.toLocaleString()}</p>
          <p className="text-sm text-[#8A8D93]">Lượt thích</p>
        </div>
      </div>

      {/* Description */}
      {project.description && (
        <div className="mb-6">
          <h2 className="mb-2 text-lg font-semibold text-[#1F2126]">Mô tả</h2>
          <p className="whitespace-pre-wrap text-[#1F2126]">{project.description}</p>
        </div>
      )}

      {/* Tags */}
      {project.tags.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-lg font-semibold text-[#1F2126]">Tags</h2>
          <div className="flex flex-wrap gap-2">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[#F7F7F5] px-3 py-1 text-sm text-[#8A8D93]"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Playback placeholder */}
      <div className="mb-6">
        <h2 className="mb-2 text-lg font-semibold text-[#1F2126]">Nghe thử</h2>
        <div className="rounded-lg border border-[#E3E4E8] bg-white p-6">
          <div className="flex flex-col items-center gap-4">
            <button
              className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1D4ED8] text-white transition-transform hover:scale-105"
              aria-label="Phát nhạc"
            >
              <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
            <p className="text-sm text-[#8A8D93]">
              Tính năng phát nhạc sẽ sớm ra mắt
            </p>
          </div>
        </div>
      </div>

      {/* Fork button */}
      <div className="flex gap-4">
        <button
          onClick={handleFork}
          disabled={forking}
          className="flex items-center gap-2 rounded-lg bg-[#1D4ED8] px-6 py-3 font-medium text-white transition-colors hover:bg-[#1E40AF] disabled:opacity-50"
        >
          {forking ? (
            <>
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Đang xử lý...
            </>
          ) : (
            <>
              <span>🍴</span>
              Fork / Remix dự án này
            </>
          )}
        </button>
      </div>

      {!user && !authLoading && (
        <p className="mt-2 text-sm text-[#8A8D93]">
          <Link href={`/login?redirect=${encodeURIComponent(`/explore/${id}`)}`} className="text-[#1D4ED8] hover:underline">
            Đăng nhập
          </Link>
          {' '}để fork dự án này về workspace của bạn.
        </p>
      )}
    </div>
  );
}
