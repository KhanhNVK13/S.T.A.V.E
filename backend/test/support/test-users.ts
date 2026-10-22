import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { testAdminClient } from './test-admin-client';

export const TEST_EMAIL_DOMAIN = 'stave-test.invalid';
export const TEST_PASSWORD = 'Test-Password-123!';

const runTag = process.env.TEST_RUN_TAG || randomBytes(3).toString('hex');

export interface TestUser {
  id: string;
  email: string;
  password: string;
  accessToken: string;
  sessionId: string;
  headers: { Authorization: string; 'X-Session-Id': string };
}

export interface CreateTestUserOptions {
  admin?: boolean;
}

async function signIn(email: string, password: string): Promise<string> {
  const response = await fetch(
    `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY as string,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    },
  );
  if (!response.ok) {
    throw new Error(`Test sign-in failed (${response.status}).`);
  }
  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}

export async function createTestUser(
  app: INestApplication,
  options: CreateTestUserOptions = {},
): Promise<TestUser> {
  const admin = testAdminClient();
  const email = `it-${runTag}-${randomBytes(4).toString('hex')}@${TEST_EMAIL_DOMAIN}`;

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error || !created.user) {
    throw new Error(`Could not create test auth user: ${error?.message}`);
  }

  const accessToken = await signIn(email, TEST_PASSWORD);
  const bearer = { Authorization: `Bearer ${accessToken}` };

  await request(app.getHttpServer())
    .post('/auth/sync-profile')
    .set(bearer)
    .expect(201);

  if (options.admin) {
    const { error: roleError } = await admin
      .from('users')
      .update({ role: 'admin' })
      .eq('id', created.user.id);
    if (roleError) {
      throw new Error(`Could not promote test user: ${roleError.message}`);
    }
  }

  const session = await request(app.getHttpServer())
    .post('/auth/sessions')
    .set(bearer)
    .send({ deviceLabel: 'integration-test' })
    .expect(201);
  const sessionId = (session.body as { sessionId: string }).sessionId;

  return {
    id: created.user.id,
    email,
    password: TEST_PASSWORD,
    accessToken,
    sessionId,
    headers: { ...bearer, 'X-Session-Id': sessionId },
  };
}

async function expectOk(
  step: string,
  result: PromiseLike<{ error: { message: string } | null }>,
): Promise<void> {
  const { error } = await result;
  if (error) throw new Error(`Cleanup failed at ${step}: ${error.message}`);
}

async function purgeUser(userId: string): Promise<void> {
  const admin = testAdminClient();
  const { data: projects, error } = await admin
    .from('projects')
    .select('id')
    .eq('owner_id', userId);
  if (error)
    throw new Error(`Cleanup failed at projects lookup: ${error.message}`);
  const projectIds = (projects ?? []).map((project) => project.id as string);

  if (projectIds.length > 0) {
    await expectOk(
      'commit_tags',
      admin.from('commit_tags').delete().in('project_id', projectIds),
    );
    await expectOk(
      'projects',
      admin.from('projects').delete().in('id', projectIds),
    );
  }
  await expectOk(
    'admin_audit_log',
    admin.from('admin_audit_log').delete().eq('admin_id', userId),
  );
  await expectOk('users', admin.from('users').delete().eq('id', userId));
  await expectOk('auth user', admin.auth.admin.deleteUser(userId));
}

export async function cleanupTestUsers(
  scope: 'run' | 'all' = 'run',
): Promise<void> {
  const admin = testAdminClient();
  const prefix = scope === 'run' ? `it-${runTag}-` : 'it-';
  const suffix = `@${TEST_EMAIL_DOMAIN}`;

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error(`Cleanup lookup failed: ${error.message}`);
    const matches = data.users.filter(
      (user) => user.email?.startsWith(prefix) && user.email.endsWith(suffix),
    );
    for (const user of matches) {
      await purgeUser(user.id);
    }
    if (data.users.length < 1000) break;
  }
}
