import type { INestApplication } from '@nestjs/common';
import { asUser } from './test-api';
import type { TestUser } from './test-users';

export interface TestNote {
  id: string;
  trackId: string;
  pitch: number;
  start: number;
  duration: number;
  velocity: number;
}

export interface TestTrack {
  id: string;
  name: string;
  order: number;
  color: string;
  muted: boolean;
  solo: boolean;
  volume: number;
  pan: number;
  instrument: string | null;
}

export interface TestSnapshot {
  schemaVersion: number;
  meta: { tempo: number; timeSignature: [number, number]; ppq: number };
  tracks: TestTrack[];
  notes: TestNote[];
}

export function track(
  id: string,
  order = 0,
  name = `Track ${order + 1}`,
): TestTrack {
  return {
    id,
    name,
    order,
    color: '#6366f1',
    muted: false,
    solo: false,
    volume: 0.8,
    pan: 0,
    instrument: null,
  };
}

export function note(id: string, overrides: Partial<TestNote> = {}): TestNote {
  return {
    id,
    trackId: 'track-1',
    pitch: 60,
    start: 0,
    duration: 480,
    velocity: 90,
    ...overrides,
  };
}

export function snapshot(
  notes: TestNote[] = [],
  tracks: TestTrack[] = [track('track-1', 0)],
): TestSnapshot {
  return {
    schemaVersion: 3,
    meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
    tracks,
    notes,
  };
}

export async function putDraft(
  app: INestApplication,
  user: TestUser,
  projectId: string,
  body: TestSnapshot,
): Promise<void> {
  await asUser(app, user)
    .put(`/projects/${projectId}/draft`)
    .send(body)
    .expect(200);
}

export async function defaultBranchId(
  app: INestApplication,
  user: TestUser,
  projectId: string,
): Promise<string> {
  const response = await asUser(app, user)
    .get(`/projects/${projectId}/branches`)
    .expect(200);
  const branches = response.body as Array<{ id: string; is_default: boolean }>;
  const main = branches.find((branch) => branch.is_default) ?? branches[0];
  return main.id;
}

export async function commitDraft(
  app: INestApplication,
  user: TestUser,
  branchId: string,
  message: string,
): Promise<{ id: string; message: string }> {
  const response = await asUser(app, user)
    .post('/commits')
    .send({ branch_id: branchId, message })
    .expect(201);
  return response.body as { id: string; message: string };
}
