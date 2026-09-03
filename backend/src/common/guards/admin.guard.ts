import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../../supabase/supabase.constants';
import type { AuthenticatedRequest } from './jwt-auth.guard';

/** Must run after JwtAuthGuard. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const { data, error } = await this.supabase
      .from('users')
      .select('role')
      .eq('id', req.user.id)
      .maybeSingle();

    if (error || !data || data.role !== 'admin') {
      throw new ForbiddenException('Admin privileges required');
    }

    return true;
  }
}
