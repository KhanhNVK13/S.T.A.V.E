import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { maskEmail } from '../common/utils/mask-email.util';
import type { UserRow } from '../users/user-row.type';
import type { ListUsersQueryDto } from './dto/list-users-query.dto';

const PERMANENT_BAN = '87600h'; // ~10 years — GoTrue has no infinite ban value.

@Injectable()
export class AdminService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  /** UC-96 */
  async listUsers(query: ListUsersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let builder = this.supabase
      .from('users')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (query.status) {
      builder = builder.eq('status', query.status);
    }
    if (query.search) {
      const term = query.search.trim();
      builder = builder.or(
        `username.ilike.%${term}%,display_name.ilike.%${term}%,email.eq.${term}`,
      );
    }

    const { data, error, count } = await builder;
    if (error) throw new BadRequestException('Could not list users');

    const users = (data ?? []) as UserRow[];
    return {
      total: count ?? users.length,
      page,
      limit,
      users: users.map((user) => ({
        id: user.id,
        displayName: user.display_name,
        username: user.username,
        maskedEmail: maskEmail(user.email),
        status: user.status,
        role: user.role,
        createdAt: user.created_at,
      })),
    };
  }

  private async getTarget(targetId: string): Promise<UserRow> {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('id', targetId)
      .maybeSingle<UserRow>();
    if (error || !data) throw new NotFoundException('User not found');
    return data;
  }

  private assertNotSelfOrAdmin(adminId: string, target: UserRow): void {
    if (target.id === adminId || target.role === 'admin') {
      throw new ForbiddenException(
        'Cannot act on an administrator account or your own account',
      );
    }
  }

  private async revokeAllSessions(userId: string): Promise<void> {
    await this.supabase
      .from('sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('revoked_at', null);
  }

  private async writeAuditLog(
    adminId: string,
    action: string,
    targetId: string,
    reason: string,
  ): Promise<void> {
    await this.supabase.from('admin_audit_log').insert({
      admin_id: adminId,
      action,
      target_type: 'user',
      target_id: targetId,
      reason,
    });
  }

  private async notify(
    userId: string,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.supabase.from('notifications').insert({
      user_id: userId,
      type,
      payload,
    });
  }

  /** UC-97 */
  async suspendUser(
    adminId: string,
    targetId: string,
    reason: string,
  ): Promise<void> {
    const target = await this.getTarget(targetId);
    this.assertNotSelfOrAdmin(adminId, target);
    if (target.status !== 'active') {
      throw new BadRequestException('Account is not active');
    }

    await this.supabase
      .from('users')
      .update({ status: 'suspended' })
      .eq('id', targetId);

    await this.revokeAllSessions(targetId);
    await this.supabase.auth.admin.updateUserById(targetId, {
      ban_duration: PERMANENT_BAN,
    });

    await this.writeAuditLog(adminId, 'suspend_user', targetId, reason);
    await this.notify(targetId, 'account_suspended', { reason });
  }

  /** UC-98 */
  async reactivateUser(
    adminId: string,
    targetId: string,
    reason: string,
  ): Promise<void> {
    const target = await this.getTarget(targetId);
    if (target.status !== 'suspended') {
      throw new BadRequestException('Account is not suspended');
    }

    await this.supabase
      .from('users')
      .update({ status: 'active' })
      .eq('id', targetId);

    await this.supabase.auth.admin.updateUserById(targetId, {
      ban_duration: 'none',
    });

    await this.writeAuditLog(adminId, 'reactivate_user', targetId, reason);
    await this.notify(targetId, 'account_reactivated', { reason });
  }

  /** UC-99 */
  async removeUser(
    adminId: string,
    targetId: string,
    reason: string,
    confirmUsername: string,
  ): Promise<void> {
    const target = await this.getTarget(targetId);
    this.assertNotSelfOrAdmin(adminId, target);
    if (target.username !== confirmUsername) {
      throw new BadRequestException('Username confirmation does not match');
    }

    await this.writeAuditLog(adminId, 'remove_user', targetId, reason);
    await this.revokeAllSessions(targetId);
    await this.supabase.from('users').delete().eq('id', targetId);
    await this.supabase.auth.admin.deleteUser(targetId);
  }
}
