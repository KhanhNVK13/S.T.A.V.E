import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../../supabase/supabase.constants';
import type { AuthenticatedRequest } from './jwt-auth.guard';

/**
 * Must run after JwtAuthGuard (relies on req.user being set).
 * Validates the X-Session-Id header against public.sessions — this is the
 * layer that actually enforces per-device logout/revoke, since a Supabase
 * access token itself keeps working until its own expiry.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const sessionId = req.headers['x-session-id'];
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      throw new UnauthorizedException('Missing X-Session-Id header');
    }

    const { data: session, error } = await this.supabase
      .from('sessions')
      .select('id, user_id, revoked_at')
      .eq('id', sessionId)
      .maybeSingle();

    if (
      error ||
      !session ||
      session.user_id !== req.user.id ||
      session.revoked_at !== null
    ) {
      throw new UnauthorizedException('Session revoked or not found');
    }

    req.sessionId = sessionId;

    void this.supabase
      .from('sessions')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', sessionId)
      .then(() => undefined);

    return true;
  }
}
