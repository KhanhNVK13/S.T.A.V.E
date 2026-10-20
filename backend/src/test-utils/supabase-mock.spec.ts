import { createSupabaseMock } from './supabase-mock';

describe('test-utils/supabase-mock', () => {
  describe('table queries', () => {
    it('serves .single() and .maybeSingle() from the shared queue in call order', async () => {
      const { client, builder } = createSupabaseMock([
        { data: { id: 1 } },
        { data: { id: 2 } },
      ]);

      const first = await client.from('users').select('*').eq('id', 1).single();
      const second = await client
        .from('users')
        .select('*')
        .eq('id', 2)
        .maybeSingle();

      expect(first.data).toEqual({ id: 1 });
      expect(second.data).toEqual({ id: 2 });
      expect(builder.eq).toHaveBeenCalledWith('id', 1);
    });

    it('serves a query awaited without a terminal method', async () => {
      const { client } = createSupabaseMock([{ data: [{ id: 1 }] }]);

      const { data } = await client.from('branches').select('*').eq('id', 1);

      expect(data).toEqual([{ id: 1 }]);
    });

    it('throws instead of returning null when the queue is exhausted', async () => {
      const { client } = createSupabaseMock([]);

      await expect(client.from('users').select('*').single()).rejects.toThrow(
        /ran out of results/,
      );
    });

    it('keeps per-table queues separate from the shared queue', async () => {
      const { client } = createSupabaseMock([{ data: { from: 'shared' } }], {
        tables: { branches: [{ data: { from: 'branches' } }] },
      });

      const branch = await client.from('branches').select('*').single();
      const shared = await client.from('users').select('*').single();

      expect(branch.data).toEqual({ from: 'branches' });
      expect(shared.data).toEqual({ from: 'shared' });
    });
  });

  describe('rpc', () => {
    it('serves a result per call for the named function', async () => {
      const { client, rpc } = createSupabaseMock([], {
        rpc: {
          create_commit_atomic: [
            { data: { id: 'c1' } },
            { data: { id: 'c2' } },
          ],
        },
      });

      const first = await client.rpc('create_commit_atomic', {});
      const second = await client.rpc('create_commit_atomic', {});

      expect(first.data).toEqual({ id: 'c1' });
      expect(second.data).toEqual({ id: 'c2' });
      expect(rpc).toHaveBeenCalledTimes(2);
    });

    it('throws when the RPC is not configured', async () => {
      const { client } = createSupabaseMock();

      await expect(client.rpc('unknown_fn', {})).rejects.toThrow(
        /no result configured for an RPC call/,
      );
    });
  });

  describe('storage', () => {
    it('serves a result per storage method for the bucket', async () => {
      const { client } = createSupabaseMock([], {
        storage: {
          'custom-sounds': {
            createSignedUploadUrl: { data: { signedUrl: 'https://x' } },
            list: [{ data: [{ name: 'a.wav' }] }],
          },
        },
      });

      const upload = await client.storage
        .from('custom-sounds')
        .createSignedUploadUrl('owner/a.wav');
      const list = await client.storage
        .from('custom-sounds')
        .list('owner', { limit: 1000 });

      expect(upload.data).toEqual({ signedUrl: 'https://x' });
      expect(list.data).toEqual([{ name: 'a.wav' }]);
    });

    it('throws when the bucket method is not configured', async () => {
      const { client } = createSupabaseMock([], {
        storage: { 'custom-sounds': {} },
      });

      await expect(
        client.storage.from('custom-sounds').download('a.wav'),
      ).rejects.toThrow(/no result configured for storage/);
    });
  });

  describe('auth', () => {
    it('serves the configured getUser result', async () => {
      const { client } = createSupabaseMock([], {
        getUser: { data: { user: { id: 'u1' } }, error: null },
      });

      const { data } = await client.auth.getUser('token');

      expect(data.user).toEqual({ id: 'u1' });
    });

    it('serves auth.admin methods', async () => {
      const { client } = createSupabaseMock([], {
        authAdmin: { deleteUser: { data: null, error: null } },
      });

      const result = await client.auth.admin.deleteUser('u1');

      expect(result.error).toBeNull();
    });

    it('throws when getUser is not configured', async () => {
      const { client } = createSupabaseMock();

      await expect(client.auth.getUser('token')).rejects.toThrow(
        /no result configured for auth.getUser/,
      );
    });
  });

  it('never touches the network or the real Supabase client', () => {
    const { client } = createSupabaseMock();

    expect(client).not.toBe(undefined);
    expect(Object.keys(client as object).sort()).toEqual([
      'auth',
      'from',
      'rpc',
      'storage',
    ]);
  });
});
