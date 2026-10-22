import { requireTestEnv } from "./env";
import type { E2eUser } from "./test-user";

const BACKEND = "http://localhost:3101";

export interface NoteSeed {
  id: string;
  pitch?: number;
  start?: number;
  duration?: number;
  velocity?: number;
  trackId?: string;
}

export interface TrackSeed {
  id: string;
  name?: string;
  color?: string;
  instrument?: string;
}

export function snapshotOf(notes: NoteSeed[], tracks?: TrackSeed[]) {
  return {
    schemaVersion: 3,
    meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
    tracks: (tracks ?? [{ id: "track-1", name: "Track 1" }]).map((t, i) => ({
      id: t.id,
      name: t.name ?? `Track ${i + 1}`,
      order: i,
      color: t.color ?? "#6366f1",
      muted: false,
      solo: false,
      volume: 0.8,
      pan: 0,
      instrument: t.instrument ?? null,
    })),
    notes: notes.map((n) => ({
      pitch: 60,
      start: 0,
      duration: 480,
      velocity: 90,
      trackId: "track-1",
      ...n,
    })),
  };
}

export class UserApi {
  private constructor(
    private readonly token: string,
    private readonly sessionId: string,
  ) {}

  static async for(user: E2eUser): Promise<UserApi> {
    const env = requireTestEnv();
    const res = await fetch(
      `${env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: user.email, password: user.password }),
      },
    );
    if (!res.ok) throw new Error(`API sign-in failed (${res.status})`);
    const token = ((await res.json()) as { access_token: string }).access_token;
    const api = new UserApi(token, "");
    await api.call("POST", "/auth/sync-profile", undefined, true);
    const session = (await api.call(
      "POST",
      "/auth/sessions",
      { deviceLabel: "e2e-api" },
      true,
    )) as { sessionId: string };
    return new UserApi(token, session.sessionId);
  }

  async call(
    method: string,
    path: string,
    body?: unknown,
    noSession = false,
  ): Promise<unknown> {
    const res = await fetch(`${BACKEND}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(noSession ? {} : { "X-Session-Id": this.sessionId }),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
    return text ? JSON.parse(text) : null;
  }

  async createProject(name: string): Promise<{ id: string; branchId: string }> {
    const project = (await this.call("POST", "/projects", { name })) as {
      id: string;
    };
    const branches = (await this.call(
      "GET",
      `/projects/${project.id}/branches`,
    )) as Array<{ id: string; is_default: boolean }>;
    const main = branches.find((b) => b.is_default) ?? branches[0];
    return { id: project.id, branchId: main.id };
  }

  async putDraft(
    projectId: string,
    notes: NoteSeed[],
    tracks?: TrackSeed[],
  ): Promise<void> {
    await this.call(
      "PUT",
      `/projects/${projectId}/draft`,
      snapshotOf(notes, tracks),
    );
  }

  async restore(commitId: string, branchId: string): Promise<{ id: string }> {
    return (await this.call("POST", `/commits/${commitId}/restore`, {
      branch_id: branchId,
    })) as { id: string };
  }

  async commit(
    branchId: string,
    message: string,
  ): Promise<{ id: string; message: string }> {
    return (await this.call("POST", "/commits", {
      branch_id: branchId,
      message,
    })) as { id: string; message: string };
  }

  async tag(commitId: string, tag: string): Promise<void> {
    await this.call("POST", `/commits/${commitId}/tag`, { tag });
  }

  async createBranch(
    projectId: string,
    name: string,
    startCommitId?: string,
  ): Promise<{ id: string }> {
    return (await this.call("POST", `/projects/${projectId}/branches`, {
      name,
      ...(startCommitId ? { startCommitId } : {}),
    })) as { id: string };
  }

  async merge(sourceBranchId: string, targetBranchId: string): Promise<void> {
    await this.call("POST", "/branches/merge", {
      sourceBranchId,
      targetBranchId,
    });
  }

  async draft(projectId: string): Promise<{
    notes: Array<{ id: string; start: number; pitch: number }>;
  }> {
    return (await this.call("GET", `/projects/${projectId}/draft`)) as {
      notes: Array<{ id: string; start: number; pitch: number }>;
    };
  }

  async archive(projectId: string): Promise<void> {
    await this.call("PATCH", `/projects/${projectId}/archive`);
  }

  async setVisibility(projectId: string, visibility: string): Promise<void> {
    await this.call("PATCH", `/projects/${projectId}/visibility`, {
      visibility,
    });
  }

  async branches(
    projectId: string,
  ): Promise<
    Array<{ id: string; name: string; is_default: boolean; is_active: boolean }>
  > {
    return (await this.call(
      "GET",
      `/projects/${projectId}/branches`,
    )) as Array<{
      id: string;
      name: string;
      is_default: boolean;
      is_active: boolean;
    }>;
  }

  async switchTo(
    currentBranchId: string,
    targetBranchId: string,
    projectId: string,
  ) {
    const draft = (await this.call("GET", `/projects/${projectId}/draft`)) as {
      notes: Array<Record<string, unknown>>;
    } & Record<string, unknown>;
    await this.call("POST", "/branches/switch", {
      currentBranchId,
      targetBranchId,
      currentDraft: {
        ...draft,
        notes: draft.notes.map((n) => ({ ...n, startTime: n.start })),
      },
    });
  }

  /**
   * Creates a commit that exists only on `branchId` by making it the active
   * branch, writing the draft, committing, and returning to `mainBranchId`.
   */
  async commitOnBranch(
    projectId: string,
    mainBranchId: string,
    branchId: string,
    notes: NoteSeed[],
    message: string,
  ): Promise<{ id: string }> {
    await this.switchTo(mainBranchId, branchId, projectId);
    await this.putDraft(projectId, notes);
    const commit = await this.commit(branchId, message);
    await this.switchTo(branchId, mainBranchId, projectId);
    return commit;
  }

  async commitSnapshot(commitId: string): Promise<{
    notes: Array<{ id: string; pitch: number; trackId: string }>;
  }> {
    const row = (await this.call("GET", `/commits/${commitId}`)) as {
      snapshot: {
        notes: Array<{ id: string; pitch: number; trackId: string }>;
      };
    };
    return row.snapshot;
  }

  async head(branchId: string): Promise<{ id: string; message: string }> {
    const details = (await this.call("GET", `/branches/${branchId}`)) as {
      branchInfo: { head_commit_id: string };
    };
    const commit = (await this.call(
      "GET",
      `/commits/${details.branchInfo.head_commit_id}`,
    )) as { id: string; message: string };
    return { id: commit.id, message: commit.message };
  }

  async branchNames(projectId: string): Promise<string[]> {
    return (await this.branches(projectId)).map((b) => b.name);
  }

  async history(
    branchId: string,
  ): Promise<Array<{ id: string; message: string }>> {
    const body = (await this.call("GET", `/commits?branch_id=${branchId}`)) as {
      items: Array<{ id: string; message: string }>;
    };
    return body.items;
  }
}
