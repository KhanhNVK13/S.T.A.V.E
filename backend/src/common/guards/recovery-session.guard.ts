import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './jwt-auth.guard';

export const RECOVERY_MAX_AGE_SECONDS = 10 * 60;
const RECOVERY_METHODS = new Set(['recovery', 'otp']);

interface AmrEntry {
  method?: unknown;
  timestamp?: unknown;
}

/**
 * Chỉ cho token vừa đăng nhập bằng liên kết khôi phục mật khẩu. Chạy SAU
 * `JwtAuthGuard` (đã xác thực chữ ký qua Supabase), nên ở đây chỉ đọc claim.
 */
@Injectable()
export class RecoverySessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!this.isFreshRecoveryToken(req.accessToken)) {
      throw new ForbiddenException(
        'Không thể thực hiện thao tác này. Vui lòng dùng lại liên kết khôi phục mật khẩu.',
      );
    }
    return true;
  }

  private isFreshRecoveryToken(token: string | undefined): boolean {
    const amr = this.readAmr(token);
    const nowSeconds = Date.now() / 1000;
    return amr.some(
      (entry) =>
        typeof entry.method === 'string' &&
        RECOVERY_METHODS.has(entry.method) &&
        typeof entry.timestamp === 'number' &&
        entry.timestamp <= nowSeconds + 60 &&
        nowSeconds - entry.timestamp <= RECOVERY_MAX_AGE_SECONDS,
    );
  }

  private readAmr(token: string | undefined): AmrEntry[] {
    const payload = token?.split('.')[1];
    if (!payload) return [];
    try {
      const claims = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as { amr?: unknown };
      return Array.isArray(claims.amr)
        ? claims.amr.filter(
            (entry): entry is AmrEntry =>
              typeof entry === 'object' && entry !== null,
          )
        : [];
    } catch {
      return [];
    }
  }
}
