import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Request } from 'express';
import { SUPABASE_ADMIN_CLIENT } from '../../supabase/supabase.constants';

export interface AuthenticatedRequest extends Request {
  user: User;
  accessToken: string;
  sessionId?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = authHeader.slice('Bearer '.length);

    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    req.user = data.user;
    req.accessToken = token;
    return true;
  }
}
