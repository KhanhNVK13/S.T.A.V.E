import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  createSupabaseMock,
  type SupabaseMockOptions,
} from '../test-utils/supabase-mock';
import type { NotificationsService } from '../notifications/notifications.service';
import { ConnectedAccountsService } from './connected-accounts.service';

const userId = '44444444-4444-4444-8444-444444444444';

function makeService(getUserById: SupabaseMockOptions['authAdmin']) {
  const mock = createSupabaseMock([], { authAdmin: getUserById });
  const notify = jest.fn().mockResolvedValue(undefined);
  const service = new ConnectedAccountsService(mock.client, {
    notify,
  } as unknown as NotificationsService);
  return { service, notify };
}

const withIdentities = (identities: unknown[]) => ({
  getUserById: [{ data: { user: { identities } }, error: null }],
});

describe('ConnectedAccountsService.notify', () => {
  it('notifies a connection using the email Supabase reports', async () => {
    const { service, notify } = makeService(
      withIdentities([
        { provider: 'email' },
        { provider: 'google', identity_data: { email: 'real@gmail.com' } },
      ]),
    );
    await service.notify(userId, { event: 'connected', email: 'spoof@x.com' });
    expect(notify).toHaveBeenCalledWith(userId, 'security.google_connected', {
      email: 'real@gmail.com',
    });
  });

  it('refuses to announce a connection that does not exist', async () => {
    const { service, notify } = makeService(
      withIdentities([{ provider: 'email' }]),
    );
    await expect(
      service.notify(userId, { event: 'connected' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(notify).not.toHaveBeenCalled();
  });

  it('notifies a disconnection once no Google identity remains', async () => {
    const { service, notify } = makeService(
      withIdentities([{ provider: 'email' }]),
    );
    await service.notify(userId, {
      event: 'disconnected',
      email: 'old@gmail.com',
    });
    expect(notify).toHaveBeenCalledWith(
      userId,
      'security.google_disconnected',
      { email: 'old@gmail.com' },
    );
  });

  it('refuses to announce a disconnection while Google is still linked', async () => {
    const { service, notify } = makeService(
      withIdentities([
        { provider: 'google', identity_data: { email: 'a@b.c' } },
      ]),
    );
    await expect(
      service.notify(userId, { event: 'disconnected' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(notify).not.toHaveBeenCalled();
  });

  it('reports a failure to read the account', async () => {
    const { service } = makeService({
      getUserById: [{ data: { user: null }, error: { message: 'x' } }],
    });
    await expect(
      service.notify(userId, { event: 'connected' }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
