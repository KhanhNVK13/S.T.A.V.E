/**
 * /projects/[id]/edit — MIDI Editor page
 * Replaces the old metadata form with the full MIDI Editor (Mảng 3).
 */
"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { RequireAuth } from "../../../../components/require-auth";
import { MidiEditor } from "../../../../components/midi-editor/midi-editor";
import { getProject, ApiError } from "../../../../lib/api-client";

interface Project {
  id: string;
  name: string;
  description: string | null;
  genre: string | null;
  archived_at: string | null;
}

export default function MidiEditorPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const p = (await getProject(projectId)) as Project;
        setProject(p);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Không tải được project");
      }
    })();
  }, [projectId]);

  return (
    <RequireAuth>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "calc(100vh - 56px)", // subtract site header height
          overflow: "hidden",
          background: "#09090b",
        }}
      >
        {/* Slim top bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 16px",
            height: 40,
            background: "#0f0f11",
            borderBottom: "1px solid #1a1a1f",
            flexShrink: 0,
          }}
        >
          <Link
            href="/projects"
            style={{
              fontSize: 12,
              color: "#71717a",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            ← Dự án
          </Link>
          <span style={{ fontSize: 12, color: "#27272a" }}>/</span>
          <span
            style={{
              fontSize: 12,
              color: "#a1a1aa",
              fontWeight: 500,
            }}
          >
            {project?.name ?? "…"}
          </span>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          <Link
            href={`/projects/${projectId}/settings`}
            style={{
              fontSize: 11,
              color: "#52525b",
              textDecoration: "none",
              padding: "2px 8px",
              border: "1px solid #27272a",
              borderRadius: 4,
            }}
          >
            Project Settings
          </Link>
        </div>

        {/* Error state */}
        {error && (
          <div
            style={{
              padding: 24,
              color: "#ef4444",
              fontSize: 14,
              textAlign: "center",
            }}
          >
            {error}
          </div>
        )}

        {/* MIDI Editor — takes all remaining height */}
        {!error && project && (
          <MidiEditor projectId={projectId} projectName={project.name} />
        )}

        {!error && !project && (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#52525b",
              fontSize: 14,
            }}
          >
            Đang tải…
          </div>
        )}
      </div>
    </RequireAuth>
  );
}
