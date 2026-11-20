import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { ConfigService } from '@nestjs/config';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Request } from 'express';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import {
  randomUsernameSuffix,
  usernameSeedFromEmail,
} from '../common/utils/username.util';
import type { UserRow } from '../users/user-row.type';
import { AccountRemovalService } from '../account-removal/account-removal.service';
import {
  buildEmailContent,
  EMAIL_SENDER,
  type EmailSender,
} from '../notifications/email-sender';

export interface SessionRow {
  id: string;
  user_id: string;
  device_label: string | null;
  ip_address: string | null;
  created_at: string;
  last_active_at: string;
  revoked_at: string | null;
}

const REAUTH_WINDOW_SECONDS = 5 * 60;
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCK_MINUTES = 15;

export interface PasswordGrant {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user?: unknown;
}

let warnedMissingAnonKey = false;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly config: ConfigService,
    private readonly accountRemoval: AccountRemovalService,
    @Optional() private readonly activityLog?: ActivityLogService,
    @Optional()
    @Inject(EMAIL_SENDER)
    private readonly emailSender?: EmailSender,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  private authApiKey(): string {
    const anonKey = this.config.get<string>('SUPABASE_ANON_KEY');
    if (anonKey) return anonKey;
    if (!warnedMissingAnonKey) {
      warnedMissingAnonKey = true;
      this.logger.warn(
        'SUPABASE_ANON_KEY is not set; Auth calls fall back to the service-role key',
      );
    }
    return this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');
  }

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
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: this.authApiKey(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    return res.ok;
  }

  /**
   * GoTrue's admin.updateUserById(...) invalidates the CALLER's own current
   * session too (verified empirically), which would break BR-09 ("keep only
   * the session that performed the action"). Calling the self-service
   * /auth/v1/user endpoint scoped to the user's own access token updates the
   * password while leaving that same session valid.
   */
  private async selfUpdatePassword(
    accessToken: string,
    newPassword: string,
  ): Promise<void> {
    const url = this.config.getOrThrow<string>('SUPABASE_URL');
    const res = await fetch(`${url}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        apikey: this.authApiKey(),
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: newPassword }),
    });
    if (!res.ok) {
      throw new UnauthorizedException('Could not update password');
    }
  }

  /**
   * UC-04 / BR-07: password login with a lockout. Five consecutive failed
   * attempts lock the email for 15 minutes; a successful login clears the
   * counter. The password is checked with a stateless call to the token
   * endpoint (never signInWithPassword on the shared client).
   */
  async login(email: string, password: string): Promise<PasswordGrant> {
    const key = email.trim().toLowerCase();
    const { data: attempt, error: readError } = await this.supabase
      .from('login_attempts')
      .select('failed_count, locked_until')
      .eq('email', key)
      .maybeSingle<{ failed_count: number; locked_until: string | null }>();
    if (readError) {
      throw new InternalServerErrorException('Could not check the sign-in');
    }
    const now = Date.now();
    if (
      attempt?.locked_until &&
      new Date(attempt.locked_until).getTime() > now
    ) {
      throw this.lockedException(attempt.locked_until, now);
    }

    const url = this.config.getOrThrow<string>('SUPABASE_URL');
    let res: Response;
    try {
      res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          apikey: this.authApiKey(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: key, password }),
      });
    } catch {
      throw new HttpException(
        {
          message: 'Sign-in service is unavailable',
          code: 'login_unavailable',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (res.ok) {
      if (attempt) {
        const { error } = await this.supabase
          .from('login_attempts')
          .delete()
          .eq('email', key);
        if (error) {
          this.logger.warn(`Could not clear login attempts: ${error.message}`);
        }
      }
      return (await res.json()) as PasswordGrant;
    }

    const body = (await res.json().catch(() => ({}))) as {
      error_code?: string;
      msg?: string;
    };
    if (res.status >= 500) {
      throw new HttpException(
        {
          message: 'Sign-in service is unavailable',
          code: 'login_unavailable',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (body.error_code !== 'invalid_credentials') {
      throw new HttpException(
        {
          message: body.msg ?? 'Sign-in failed',
          code: body.error_code ?? 'login_failed',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const { data, error: recordError } = await this.supabase.rpc(
      'record_failed_login',
      {
        p_email: key,
        p_max_attempts: LOGIN_MAX_ATTEMPTS,
        p_lock_minutes: LOGIN_LOCK_MINUTES,
      },
    );
    const recorded = data as Array<{
      o_failed_count: number;
      o_locked_until: string | null;
    }> | null;
    if (recordError || !recorded?.[0]) {
      throw new InternalServerErrorException('Could not record the sign-in');
    }
    const outcome = recorded[0];
    if (outcome.o_locked_until) {
      throw this.lockedException(outcome.o_locked_until, Date.now());
    }
    throw new HttpException(
      {
        message: 'Invalid login credentials',
        code: 'invalid_credentials',
        remainingAttempts: Math.max(
          LOGIN_MAX_ATTEMPTS - outcome.o_failed_count,
          0,
        ),
      },
      HttpStatus.UNAUTHORIZED,
    );
  }

  private lockedException(lockedUntil: string, now: number): HttpException {
    const retryAfterSec = Math.max(
      Math.ceil((new Date(lockedUntil).getTime() - now) / 1000),
      1,
    );
    return new HttpException(
      {
        message: 'Too many failed sign-in attempts',
        code: 'login_locked',
        retryAfterSec,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
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
      const { data: raced } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle<UserRow>();
      if (raced) return raced;
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
        .ilike('username', candidate.replace(/[\\_%]/g, '\\$&'))
        .limit(1)
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
    void this.activityLog?.record({
      userId,
      action: 'auth.sign_in',
      ip: req.ip ?? null,
    });
    return { sessionId: session.id };
  }

  async resetSessionsAfterRecovery(
    userId: string,
    accessToken: string,
    req: Request,
    deviceLabel?: string,
  ): Promise<{ sessionId: string }> {
    const { error } = await this.supabase
      .from('sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('revoked_at', null);
    if (error) {
      throw new InternalServerErrorException('Could not reset sessions');
    }
    const { error: signOutError } = await this.supabase.auth.admin.signOut(
      accessToken,
      'others',
    );
    if (signOutError) {
      throw new InternalServerErrorException('Could not reset sessions');
    }
    return this.registerSession(userId, accessToken, req, deviceLabel);
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

    if (error) {
      throw new InternalServerErrorException(
        'Session list cannot be retrieved',
      );
    }
    return ((data ?? []) as SessionRow[]).map((session) => ({
      ...session,
      isCurrent: session.id === currentSessionId,
    }));
  }

  /** UC-85 (and UC-13 logout, called with id = current session). */
  async revokeSession(
    userId: string,
    sessionId: string,
    notifyEmail?: string,
  ): Promise<void> {
    const { data, error } = await this.supabase
      .from('sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', userId)
      .is('revoked_at', null)
      .select('id, device_label')
      .maybeSingle<{ id: string; device_label: string | null }>();

    if (error || !data) {
      throw new UnauthorizedException('Session not found or no longer active');
    }

    if (notifyEmail) {
      void this.sendSessionEndedEmail(notifyEmail, data.device_label);
    }
  }

  private async sendSessionEndedEmail(
    email: string,
    deviceLabel: string | null,
  ): Promise<void> {
    if (!this.emailSender?.enabled) return;
    const device = deviceLabel?.trim() || 'Unknown device';
    const title = 'A session on your STAVE account was ended';
    const body = [
      `A session on your STAVE account (${device}) was just ended from another device. If you did not do this, change your password right away.`,
      `Một phiên đăng nhập trên tài khoản STAVE của bạn (${device}) vừa bị kết thúc từ thiết bị khác. Nếu không phải bạn, hãy đổi mật khẩu ngay.`,
    ].join('\n\n');
    try {
      await this.emailSender.send({
        to: email,
        subject: title,
        ...buildEmailContent(title, body),
      });
    } catch (err) {
      this.logger.error(
        `Could not send the session ended email: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** BR-09: revoke every other business session + Supabase refresh token. */
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

  /** UC-16, BR-02, BR-09 */
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
    if (currentPassword === newPassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    await this.selfUpdatePassword(accessToken, newPassword);

    await this.revokeOtherSessions(userId, accessToken, currentSessionId);

    void this.notifications?.notify(userId, 'security.password_changed', {});
    void this.sendPasswordChangedEmail(email);
  }

  private async sendPasswordChangedEmail(email: string): Promise<void> {
    if (!email || !this.emailSender?.enabled) return;
    const title = 'Your STAVE password was changed';
    const body = [
      'The password of your STAVE account was just changed and your other devices were signed out. If you did not do this, reset your password right away.',
      'Mật khẩu tài khoản STAVE của bạn vừa được đổi và các thiết bị khác đã bị đăng xuất. Nếu không phải bạn, hãy đặt lại mật khẩu ngay.',
    ].join('\n\n');
    try {
      await this.emailSender.send({
        to: email,
        subject: title,
        ...buildEmailContent(title, body),
      });
    } catch (err) {
      this.logger.error(
        `Could not send the password changed email: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** UC-17, BR-22 */
  async deleteAccount(
    userId: string,
    email: string,
    password: string,
    reauth?: { user: Pick<User, 'app_metadata'>; accessToken: string },
  ): Promise<void> {
    if (reauth && !this.hasPasswordIdentity(reauth.user)) {
      if (!this.hasRecentOAuthLogin(reauth.accessToken)) {
        throw new UnauthorizedException(
          'Please sign in with Google again to confirm account deletion',
        );
      }
    } else {
      const verified = await this.verifyPassword(email, password);
      if (!verified) {
        throw new UnauthorizedException('Password is incorrect');
      }
    }

    await this.accountRemoval.remove(userId, 'Could not delete account');
  }

  private hasPasswordIdentity(user: Pick<User, 'app_metadata'>): boolean {
    const providers = user.app_metadata?.providers;
    return !Array.isArray(providers) || providers.includes('email');
  }

  private hasRecentOAuthLogin(accessToken: string): boolean {
    try {
      const payload = JSON.parse(
        Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString(
          'utf8',
        ),
      ) as { amr?: { method?: string; timestamp?: number }[] };
      const nowSeconds = Date.now() / 1000;
      return (payload.amr ?? []).some(
        (entry) =>
          entry.method === 'oauth' &&
          typeof entry.timestamp === 'number' &&
          nowSeconds - entry.timestamp >= 0 &&
          nowSeconds - entry.timestamp <= REAUTH_WINDOW_SECONDS,
      );
    } catch {
      return false;
    }
  }
}
