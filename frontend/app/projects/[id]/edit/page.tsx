"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import { RequireAuth } from "../../../../components/require-auth";
import { Button } from "../../../../components/ui/button";
import { getProject } from "../../../../lib/api-client";
import { MidiEditor } from "../../../../components/midi-editor/midi-editor";
import { apiErrorMessage } from "../../../../lib/error-message";

interface Project {
  id: string;
  name: string;
  archived_at: string | null;
}

export default function EditProjectPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getProject(projectId)
      .then((data) => {
        if (!cancelled) setProject(data as Project);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, "Không tải được thông tin dự án."));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, attempt]);

  return (
    <RequireAuth>
      <div className="h-full">
        {error ? (
          <div className="flex h-full items-center justify-center px-4">
            <div
              role="alert"
              className="flex max-w-md flex-col items-center gap-3 rounded-card border border-danger/20 bg-danger-muted p-5 text-center text-sm text-danger"
            >
              <p>{error}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setError(null);
                    setAttempt((n) => n + 1);
                  }}
                >
                  Thử lại
                </Button>
                <Link href={`/projects/${projectId}`}>
                  <Button variant="ghost">Về trang dự án</Button>
                </Link>
              </div>
            </div>
          </div>
        ) : !project ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted">Đang tải dự án…</p>
          </div>
        ) : project.archived_at ? (
          <div className="flex h-full items-center justify-center px-4">
            <div className="flex max-w-md flex-col items-center gap-3 rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">
              <Lock className="h-5 w-5" />
              <p>
                Dự án &quot;{project.name}&quot; đã được lưu trữ nên không mở được trình soạn nhạc.
              </p>
              <Link
                href={`/projects/${projectId}/settings`}
                className="font-semibold text-accent hover:underline"
              >
                Khôi phục trong Cài đặt dự án
              </Link>
            </div>
          </div>
        ) : (
          <MidiEditor projectId={projectId} projectName={project.name} />
        )}
      </div>
    </RequireAuth>
  );
}
