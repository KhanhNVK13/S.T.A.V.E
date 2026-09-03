import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Request } from 'express';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import {
  randomUsernameSuffix,
  usernameSeedFromEmail,
} from '../common/utils/username.util';
import type { UserRow } from '../users/user-row.type';

export interface SessionRow {
  id: string;
  user_id: string;
  device_label: string | null;
  ip_address: string | null;
  created_at: string;
  last_active_at: string;
  revoked_at: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly config: ConfigService,
  ) {}

  /**
   * Verifies a password WITHOUT calling auth.signInWithPassword on the
   * shared SUPABASE_ADMIN_CLIENT singleton: that client is reused across
   * every request handled by this process, and signInWithPassword mutates
   * the GoTrueClient's internal session state — leaking one request's user
   * session into every other concurrent request that reuses `this.supabase`
   * for `.from(...)` calls. A stateless raw call to the token endpoint
   * avoids touching any shared client state.
   */
  private async verifyPassword(
    email: string,
    password: string,
  ): Promise<boolean> {
    const url = this.config.getOrThrow<string>('SUPABASE_URL');
    const serviceRoleKey = this.config.getOrThrow<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    return res.ok;
  }

  /**
   * GoTrue's admin.updateUserById(...) invalidates the CALLER's own current
   * session too (verified empirically), which would break BR-10 ("keep only
   * the session that performed the action"). Calling the self-service
   * /auth/v1/user endpoint scoped to the user's own access token updates the
   * password while leaving that same session valid.
   */
  private async selfUpdatePassword(
    accessToken: string,
    newPassword: string,
  ): Promise<void> {
    const url = this.config.getOrThrow<string>('SUPABASE_URL');
    const serviceRoleKey = this.config.getOrThrow<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );
    const res = await fetch(`${url}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: newPassword }),
    });
    if (!res.ok) {
      throw new UnauthorizedException('Could not update password');
    }
  }

  /** UC-01..05 follow-up: upsert public.users after a Supabase Auth session exists. Idempotent. */
  async syncProfile(user: User): Promise<UserRow> {
    const { data: existing } = await this.supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle<UserRow>();

    if (existing) return existing;

    const googleIdentity = user.identities?.find(
      (identity) => identity.provider === 'google',
    );

    const username = await this.generateUniqueUsername(user.email ?? 'user');

    const { data: created, error } = await this.supabase
      .from('users')
      .insert({
        id: user.id,
        email: user.email,
        display_name: username,
        username,
        google_id: googleIdentity?.id ?? null,
      })
      .select('*')
      .single<UserRow>();

    if (error || !created) {
      throw new UnauthorizedException('Could not provision profile');
    }
    return created;
  }

  private async generateUniqueUsername(email: string): Promise<string> {
    const seed = usernameSeedFromEmail(email);
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate =
        attempt === 0 ? seed : `${seed}_${randomUsernameSuffix()}`;
      const { data } = await this.supabase
        .from('users')
        .select('id')
        .eq('username', candidate)
        .maybeSingle();
      if (!data) return candidate;
    }
    return `${seed}_${Date.now()}`;
  }

  /** UC-04/05/07 follow-up: creates a business session row after real login. */
  async registerSession(
    userId: string,
    accessToken: string,
    req: Request,
    deviceLabel?: string,
  ): Promise<{ sessionId: string }> {
    const { data: profile } = await this.supabase
      .from('users')
      .select('status')
      .eq('id', userId)
      .maybeSingle<Pick<UserRow, 'status'>>();

    if (!profile || profile.status !== 'active') {
      await this.supabase.auth.admin.signOut(accessToken, 'global');
      throw new ForbiddenException('Account is not active');
    }

    const { data: session, error } = await this.supabase
      .from('sessions')
      .insert({
        user_id: userId,
        device_label: deviceLabel?.slice(0, 200) ?? this.parseUserAgent(req),
        ip_address: req.ip ?? null,
      })
      .select('id')
      .single<Pick<SessionRow, 'id'>>();

    if (error || !session) {
      throw new UnauthorizedException('Could not create session');
    }
    return { sessionId: session.id };
  }

  private parseUserAgent(req: Request): string {
    const ua = req.headers['user-agent'];
    return typeof ua === 'string' ? ua.slice(0, 200) : 'Unknown device';
  }

  /** UC-84 */
  async listSessions(
    userId: string,
    currentSessionId: string,
  ): Promise<Array<SessionRow & { isCurrent: boolean }>> {
    const { data, error } = await this.supabase
      .from('sessions')
      .select('*')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .order('last_active_at', { ascending: false });

    if (error || !data) return [];
    return (data as SessionRow[]).map((session) => ({
      ...session,
      isCurrent: session.id === currentSessionId,
    }));
  }

  /** UC-85 (and UC-13 logout, called with id = current session). */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle();

    if (error || !data) {
      throw new UnauthorizedException('Session not found');
    }
  }

  /** BR-10: revoke every other business session + Supabase refresh token. */
  async revokeOtherSessions(
    userId: string,
    accessToken: string,
    currentSessionId: string,
  ): Promise<void> {
    await this.supabase
      .from('sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('revoked_at', null)
      .neq('id', currentSessionId);

    await this.supabase.auth.admin.signOut(accessToken, 'others');
  }

  /** UC-16, BR-02, BR-10 */
  async changePassword(
    userId: string,
    email: string,
    currentPassword: string,
    newPassword: string,
    accessToken: string,
    currentSessionId: string,
  ): Promise<void> {
    const verified = await this.verifyPassword(email, currentPassword);
    if (!verified) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    await this.selfUpdatePassword(accessToken, newPassword);

    await this.revokeOtherSessions(userId, accessToken, currentSessionId);
  }

  /** UC-17 */
  async deleteAccount(
    userId: string,
    email: string,
    password: string,
  ): Promise<void> {
    const verified = await this.verifyPassword(email, password);
    if (!verified) {
      throw new UnauthorizedException('Password is incorrect');
    }

    await this.supabase
      .from('sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('revoked_at', null);

    await this.supabase.from('users').delete().eq('id', userId);
    await this.supabase.auth.admin.deleteUser(userId);
  }
}
