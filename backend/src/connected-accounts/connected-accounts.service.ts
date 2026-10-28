import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { NotificationsService } from '../notifications/notifications.service';
import type { NotifyConnectedAccountDto } from './dto/notify-connected-account.dto';

interface IdentityLike {
  provider: string;
  identity_data?: { email?: string } | null;
}

@Injectable()
export class ConnectedAccountsService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly notifications: NotificationsService,
  ) {}

  async notify(
    userId: string,
    dto: NotifyConnectedAccountDto,
  ): Promise<{ ok: true }> {
    const { data, error } = await this.supabase.auth.admin.getUserById(userId);
    if (error || !data.user) {
      throw new InternalServerErrorException(
        'Could not verify connected accounts',
      );
    }

    const google = ((data.user.identities ?? []) as IdentityLike[]).find(
      (identity) => identity.provider === 'google',
    );

    if (dto.event === 'connected') {
      if (!google) {
        throw new BadRequestException('No Google account is connected');
      }
      await this.notifications.notify(userId, 'security.google_connected', {
        email: google.identity_data?.email ?? dto.email ?? '',
      });
      return { ok: true };
    }

    if (google) {
      throw new BadRequestException('A Google account is still connected');
    }
    await this.notifications.notify(userId, 'security.google_disconnected', {
      email: dto.email ?? '',
    });
    return { ok: true };
  }
}
