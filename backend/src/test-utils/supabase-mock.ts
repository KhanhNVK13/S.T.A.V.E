import type { SupabaseClient } from '@supabase/supabase-js';

export interface QueryResult {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

const CHAIN_METHODS = [
  'select',
  'insert',
  'update',
  'delete',
  'upsert',
  'eq',
  'neq',
  'is',
  'in',
  'not',
  'or',
  'ilike',
  'like',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'overlaps',
  'order',
  'range',
  'limit',
  'returns',
] as const;

const TERMINAL_METHODS = ['single', 'maybeSingle'] as const;

const STORAGE_METHODS = [
  'createSignedUploadUrl',
  'createSignedUrl',
  'download',
  'list',
  'remove',
  'upload',
] as const;

const AUTH_ADMIN_METHODS = [
  'updateUserById',
  'deleteUser',
  'signOut',
  'listUsers',
  'createUser',
  'getUserById',
] as const;

export interface SupabaseMockOptions {
  /**
   * Results for `.rpc(name, args)` calls, keyed by RPC name. An array gives one
   * result per call in order; a single object is reused for every call.
   */
  rpc?: Record<string, QueryResult | QueryResult[]>;
  /**
   * Results for `.storage.from(bucket).<method>()`, keyed by bucket name then
   * by method name.
   */
  storage?: Record<string, Record<string, QueryResult | QueryResult[]>>;
  /** Result for `.auth.getUser(token)`. */
  getUser?: QueryResult;
  /** Results for `.auth.admin.<method>()`, keyed by method name. */
  authAdmin?: Record<string, QueryResult | QueryResult[]>;
  /**
   * Per-table result queues, keyed by table name. When a table is listed here
   * its queries draw from that queue instead of the shared one, so a test does
   * not have to count every call in the service in order.
   */
  tables?: Record<string, QueryResult[]>;
}

/**
 * Deny-by-default mock of the Supabase client.
 *
 * Every surface that reaches the real database (table queries, RPC, storage,
 * auth admin) draws from an explicit queue. A surface that is not configured
 * throws instead of returning null, so a test can never pass by accident
 * because a call silently produced no data, and can never reach production.
 */
export interface SupabaseMock {
  /**
   * The mock client. Typed as `SupabaseClient` so a test can hand it straight
   * to a service constructor without casting it.
   */
  client: SupabaseClient;
  /** Builder for the shared queue — use it when a test does not use per-table queues. */
  builder: Record<string, jest.Mock>;
  /** Builders for tables configured through `options.tables`, keyed by table name. */
  builders: Record<string, Record<string, jest.Mock>>;
  rpc: jest.Mock;
  storage: { from: jest.Mock };
  auth: {
    getUser: jest.Mock;
    admin: Record<string, jest.Mock>;
  };
  /** Add one more result to the shared queue. */
  pushResult: (result: QueryResult) => void;
}

function makeBuilder(queue: QueryResult[]): Record<string, jest.Mock> {
  const builder: Record<string, jest.Mock> = {};

  for (const method of CHAIN_METHODS) {
    builder[method] = jest.fn(() => builder);
  }

  builder.select = jest.fn(() => builder);

  for (const method of TERMINAL_METHODS) {
    builder[method] = jest.fn(() => settled(take, queue, method));
  }

  builder.then = jest.fn(
    (
      resolve: (value: QueryResult) => unknown,
      reject: (reason?: unknown) => unknown,
    ) => settled(take, queue, 'await').then(resolve, reject),
  );

  return builder;
}

/**
 * Runs `read` and always returns a promise: a fulfilled one with the result,
 * or a rejected one when the mock has no result left. Every failure mode of
 * the mock therefore looks the same to the caller.
 */
function settled(
  read: (queue: QueryResult[], method: string) => QueryResult,
  queue: QueryResult[],
  method: string,
): Promise<QueryResult> {
  try {
    return Promise.resolve(read(queue, method));
  } catch (error) {
    return Promise.reject(asError(error));
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function take(queue: QueryResult[], method: string): QueryResult {
  const result = queue.shift();
  if (!result) {
    throw new Error(
      `Supabase mock ran out of results for a table query (${method}). ` +
        `Push one more result before this call, list the table in options.tables, ` +
        `or the test is missing a case.`,
    );
  }
  return result;
}

function takeFrom(
  configured: QueryResult | QueryResult[] | undefined,
  source: string,
  method: string,
): QueryResult {
  if (configured === undefined) {
    throw new Error(
      `Supabase mock has no result configured for ${source} (${method}).`,
    );
  }
  if (Array.isArray(configured)) {
    if (configured.length === 0) {
      throw new Error(
        `Supabase mock ran out of results for ${source} (${method}).`,
      );
    }
    return configured.shift() as QueryResult;
  }
  return configured;
}

export function createSupabaseMock(
  results: QueryResult[] = [],
  options: SupabaseMockOptions = {},
): SupabaseMock {
  const queue = [...results];
  const rpcQueues = new Map<string, QueryResult[]>();
  const storageQueues = new Map<string, Map<string, QueryResult[]>>();
  const authAdminQueues = new Map<string, QueryResult[]>();
  const builders: Record<string, Record<string, jest.Mock>> = {};

  for (const [table, tableResults] of Object.entries(options.tables ?? {})) {
    builders[table] = makeBuilder([...tableResults]);
  }

  const sharedBuilder = makeBuilder(queue);

  const client = {
    from: jest.fn((table?: string) =>
      table && builders[table] ? builders[table] : sharedBuilder,
    ),
    rpc: jest.fn((name: string) => {
      if (!rpcQueues.has(name)) {
        const configured = options.rpc?.[name];
        if (configured === undefined) {
          return Promise.reject(
            new Error(
              `Supabase mock has no result configured for an RPC call (${name}).`,
            ),
          );
        }
        rpcQueues.set(
          name,
          Array.isArray(configured) ? [...configured] : [configured],
        );
      }
      try {
        return Promise.resolve(
          takeFrom(rpcQueues.get(name), 'an RPC call', name),
        );
      } catch (error) {
        return Promise.reject(asError(error));
      }
    }),
    storage: {
      from: jest.fn((bucket: string) => {
        if (!storageQueues.has(bucket)) {
          const byMethod = new Map<string, QueryResult[]>();
          for (const [method, value] of Object.entries(
            options.storage?.[bucket] ?? {},
          )) {
            byMethod.set(method, Array.isArray(value) ? [...value] : [value]);
          }
          storageQueues.set(bucket, byMethod);
        }
        const byMethod = storageQueues.get(bucket) as Map<
          string,
          QueryResult[]
        >;

        const bucketApi: Record<string, jest.Mock> = {};
        for (const method of STORAGE_METHODS) {
          bucketApi[method] = jest.fn(() => {
            const pending = byMethod.get(method);
            if (!pending) {
              return Promise.reject(
                new Error(
                  `Supabase mock has no result configured for storage.${bucket}.${method}.`,
                ),
              );
            }
            if (pending.length === 0) {
              return Promise.reject(
                new Error(
                  `Supabase mock ran out of results for storage.${bucket}.${method}.`,
                ),
              );
            }
            return Promise.resolve(pending.shift() as QueryResult);
          });
        }
        return bucketApi;
      }),
    },
    auth: {
      getUser: jest.fn(() => {
        if (!options.getUser) {
          return Promise.reject(
            new Error(
              'Supabase mock has no result configured for auth.getUser.',
            ),
          );
        }
        return Promise.resolve(options.getUser);
      }),
      admin: (() => {
        const admin: Record<string, jest.Mock> = {};
        for (const method of AUTH_ADMIN_METHODS) {
          admin[method] = jest.fn(() => {
            if (!authAdminQueues.has(method)) {
              const configured = options.authAdmin?.[method];
              if (configured === undefined) {
                return Promise.reject(
                  new Error(
                    `Supabase mock has no result configured for an auth admin call (${method}).`,
                  ),
                );
              }
              authAdminQueues.set(
                method,
                Array.isArray(configured) ? [...configured] : [configured],
              );
            }
            try {
              return Promise.resolve(
                takeFrom(
                  authAdminQueues.get(method),
                  'an auth admin call',
                  method,
                ),
              );
            } catch (error) {
              return Promise.reject(asError(error));
            }
          });
        }
        return admin;
      })(),
    },
  };

  return {
    client: client as unknown as SupabaseClient,
    builder: sharedBuilder,
    builders,
    rpc: client.rpc,
    storage: client.storage,
    auth: { getUser: client.auth.getUser, admin: client.auth.admin },
    pushResult: (result: QueryResult) => queue.push(result),
  };
}

/**
 * Shape of a mocked Supabase response, mirroring what `supabase-js` returns.
 */
export interface MockResponse {
  data?: any;
  error?: any;
  count?: number;
}

/**
 * Mocked call record, so a test can assert WHAT was written to the DB
 * (payload of `upsert`/`insert`/`update`) instead of only the return value.
 */
export interface MockCall {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  payload?: any;
  filters: Record<string, unknown>;
  columns?: string;
  order?: { column: string; ascending: boolean };
  range?: [number, number];
  inFilter?: { column: string; values: unknown[] };
}

/** A recorded `rpc(fnName, params)` call. */
export interface MockRpcCall {
  fnName: string;
  params?: any;
}

export type MockResponseMap = Record<string, MockResponse[]>;

const matchesFilters = (
  row: any,
  filters: Record<string, unknown>,
): boolean => {
  if (!row || typeof row !== 'object') return false;
  return Object.entries(filters).every(([col, val]) => row[col] === val);
};

const toSingle = (response: MockResponse): MockResponse => {
  if (!response || !Array.isArray(response.data)) return response;
  return { ...response, data: response.data[0] ?? null };
};

export const createMockSupabaseClient = (
  mockResponses: MockResponse[] | MockResponseMap = [],
) => {
  let globalIndex = 0;
  const calls: MockCall[] = [];
  const rpcCalls: MockRpcCall[] = [];

  const isPerTable = !Array.isArray(mockResponses);
  const queues = isPerTable ? mockResponses : ({} as MockResponseMap);

  const nextResponse = (table: string): MockResponse => {
    if (isPerTable) {
      const queue = queues[table];
      if (!queue || queue.length === 0) return { data: null, error: null };
      return queue.shift()!;
    }
    const list = mockResponses;
    if (globalIndex >= list.length) return { data: null, error: null };
    return list[globalIndex++];
  };

  const makeBuilder = (table: string) => {
    const filters: Record<string, unknown> = {};
    const inFilters: { column: string; values: unknown[] }[] = [];
    let lastOrder: { column: string; ascending: boolean } | undefined;
    let lastRange: [number, number] | undefined;
    let selectCall: MockCall | undefined;

    const resolve = (): MockResponse => {
      const response = nextResponse(table);
      if (!response || response.data == null) return response;
      if (Array.isArray(response.data)) {
        return {
          ...response,
          data: response.data.filter(
            (row) =>
              matchesFilters(row, filters) &&
              inFilters.every((f) => f.values.includes(row[f.column])),
          ),
        };
      }
      return matchesFilters(response.data, filters)
        ? response
        : { ...response, data: null };
    };

    const patchLastSelect = () => {
      if (!selectCall) return;
      selectCall.order = lastOrder;
      selectCall.range = lastRange;
      selectCall.inFilter =
        inFilters.length > 0
          ? { column: inFilters[0].column, values: inFilters[0].values }
          : undefined;
    };

    const builder: any = {
      select: (columns?: string) => {
        const call: MockCall = {
          table,
          op: 'select',
          filters,
          columns,
        };
        selectCall = call;
        calls.push(call);
        return builder;
      },
      insert: (payload: any) => {
        calls.push({ table, op: 'insert', payload, filters });
        return builder;
      },
      update: (payload: any) => {
        calls.push({ table, op: 'update', payload, filters });
        return builder;
      },
      delete: () => {
        calls.push({ table, op: 'delete', filters });
        return builder;
      },
      upsert: (payload: any) => {
        calls.push({ table, op: 'upsert', payload, filters });
        return builder;
      },
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return builder;
      },
      in: (col: string, values: unknown[]) => {
        inFilters.push({ column: col, values });
        patchLastSelect();
        return builder;
      },
      order: (column: string, opts?: { ascending?: boolean }) => {
        lastOrder = { column, ascending: opts?.ascending ?? true };
        patchLastSelect();
        return builder;
      },
      range: (from: number, to: number) => {
        lastRange = [from, to];
        patchLastSelect();
        return builder;
      },
      single: () => Promise.resolve(toSingle(resolve())),
      maybeSingle: () => Promise.resolve(toSingle(resolve())),
      then: (
        onFulfilled?: (value: MockResponse) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(resolve()).then(onFulfilled, onRejected),
    };

    return builder;
  };

  const client = {
    from: (table: string) => makeBuilder(table),
    rpc: (fnName: string, params?: any) => {
      rpcCalls.push({ fnName, params });
      return Promise.resolve(nextResponse('rpc'));
    },
  };

  return {
    client: client as unknown as SupabaseClient,
    builder: client,
    calls,
    rpcCalls,
  };
};
