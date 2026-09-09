'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GitFork, Play, Loader2, ChevronRight } from 'lucide-react';
import { getPublicProject, PublicProject } from '../../../lib/api-client';
import { useAuth } from '../../../context/auth-context';
import { PageHeader } from '../../../components/ui/page-header';
import { Card } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Avatar } from '../../../components/ui/avatar';
import { ProjectThumb } from '../../../components/ui/project-thumb';

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
      alert('PLACEHOLDER — tính năng fork chưa được xây dựng.');
    }, 1000);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="animate-pulse">
          <div className="mb-2 h-8 w-2/3 rounded bg-slate-100" />
          <div className="mb-6 h-4 w-1/3 rounded bg-slate-100" />
          <div className="mb-4 h-32 rounded-card bg-slate-100" />
          <div className="h-4 w-full rounded bg-slate-100" />
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-card border border-danger-600/20 bg-danger-50 p-8 text-center">
          <h1 className="text-xl font-semibold text-danger-600">Không tìm thấy</h1>
          <p className="mt-2 text-slate-500">{error ?? 'Dự án này không tồn tại.'}</p>
          <Link href="/explore">
            <Button className="mt-4">Quay lại Khám phá</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <PageHeader
        title={project.name}
        breadcrumbs={[{ label: 'Khám phá', href: '/explore' }, { label: project.name }]}
      />
      {project.genre && (
        <div className="-mt-4 mb-6">
          <Badge variant="info">{project.genre}</Badge>
        </div>
      )}

      <div className="mb-6">
        <ProjectThumb id={project.id} />
      </div>

      {/* Owner info */}
      <div className="mb-6">
        <Link href={`/creator/${project.owner.id}`}>
          <Card className="inline-flex items-center gap-3 p-3 transition-colors hover:border-accent-300">
            <Avatar
              id={project.owner.id}
              label={project.owner.display_name ?? project.owner.username ?? '?'}
              imageUrl={project.owner.avatar_url}
              size="md"
            />
            <div>
              <p className="font-medium text-slate-900">
                {project.owner.display_name ?? project.owner.username}
              </p>
              <p className="text-xs text-slate-500">@{project.owner.username ?? 'unknown'}</p>
            </div>
          </Card>
        </Link>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <Card className="p-4 text-center">
          <p className="font-mono text-2xl font-bold text-slate-900">
            {project.play_count.toLocaleString()}
          </p>
          <p className="text-sm text-slate-500">Lượt nghe</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="font-mono text-2xl font-bold text-slate-900">
            {project.fork_count.toLocaleString()}
          </p>
          <p className="text-sm text-slate-500">Lượt fork</p>
        </Card>
      </div>

      {/* Description */}
      {project.description && (
        <div className="mb-6">
          <h2 className="mb-2 text-lg font-semibold text-slate-900">Mô tả</h2>
          <p className="whitespace-pre-wrap text-slate-700">{project.description}</p>
        </div>
      )}

      {/* Tags */}
      {project.tags.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-lg font-semibold text-slate-900">Tags</h2>
          <div className="flex flex-wrap gap-2">
            {project.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-slate-50 px-3 py-1 text-sm text-slate-500">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Playback placeholder */}
      <div className="mb-6">
        <h2 className="mb-2 text-lg font-semibold text-slate-900">Nghe thử</h2>
        <Card className="p-6">
          <div className="flex flex-col items-center gap-3">
            <button
              disabled
              className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-200 text-slate-400"
              aria-label="PLACEHOLDER — phát nhạc"
            >
              <Play className="h-7 w-7" />
            </button>
            <p className="text-sm text-slate-500">PLACEHOLDER — tính năng phát nhạc chưa được xây dựng</p>
          </div>
        </Card>
      </div>

      {/* Fork button */}
      <div className="flex gap-4">
        <Button onClick={() => void handleFork()} disabled={forking} className="gap-2 px-6 py-3">
          {forking ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" /> Đang xử lý...
            </>
          ) : (
            <>
              <GitFork className="h-5 w-5" /> Fork / Remix (PLACEHOLDER)
            </>
          )}
        </Button>
      </div>

      {!user && !authLoading && (
        <p className="mt-3 flex items-center gap-1 text-sm text-slate-500">
          <Link
            href={`/login?redirect=${encodeURIComponent(`/explore/${id}`)}`}
            className="text-accent-600 hover:underline"
          >
            Đăng nhập
          </Link>
          <ChevronRight className="h-3 w-3" /> để fork dự án này về workspace của bạn.
        </p>
      )}
    </div>
  );
}
