import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Đếm lượt theo tài khoản đã đăng nhập (sau `JwtAuthGuard`), không theo IP. */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const userId = (req.user as { id?: string } | undefined)?.id;
    return userId ? Promise.resolve(`user:${userId}`) : super.getTracker(req);
  }
}
