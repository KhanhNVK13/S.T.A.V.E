/**
 * Stateful in-memory stand-in for the Supabase client.
 *
 * Purpose: run the REAL Nest controllers + guards + services over REAL HTTP
 * (supertest) without a database. Nothing here talks to Supabase — the
 * tables live in memory for the lifetime of the process.
 *
 * It understands the small slice of the PostgREST surface STAVE uses:
 *   from(table).select(cols).eq/in/is/order/range/single/maybeSingle
 *   from(table).insert/update/delete/upsert(payload)
 *   rpc('create_commit_atomic', args)
 *   auth.getUser(token)
 * plus embedded joins written as `alias:table!fk_constraint(cols)`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface Table {
  [column: string]: unknown;
}

export interface FakeDb {
  client: SupabaseClient;
  tables: Record<string, Table[]>;
  /** Every mutation, in order — used to print a readable trail in evidence. */
  log: string[];
}

const JOIN_RE = /(\w+):(\w+)!(?:[\w]+\()?([\w, ]*)\)?/g;

interface Join {
  alias: string;
  table: string;
  columns: string[];
}

function parseJoins(columns?: string): Join[] {
  if (!columns) return [];
  const joins: Join[] = [];
  JOIN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = JOIN_RE.exec(columns)) !== null) {
    joins.push({
      alias: match[1],
      table: match[2],
      columns: match[3]
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
    });
  }
  return joins;
}

/** Strips the embedded-join clauses, leaving the plain column list. */
function baseColumns(columns?: string): string[] {
  if (!columns) return [];
  const withoutJoins = columns.replace(JOIN_RE, '');
  return withoutJoins
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

function project(row: Table, columns: string[]): Table {
  if (columns.length === 0) return { ...row };
  const out: Table = {};
  for (const column of columns) {
    if (column === '*') {
      Object.assign(out, row);
      continue;
    }
    if (column in row) out[column] = row[column];
  }
  return out;
}

function matches(row: Table, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([column, value]) => {
    if (value === null) return row[column] === null || row[column] === undefined;
    return row[column] === value;
  });
}

let uuidCounter = 0;
function uuid(): string {
  uuidCounter += 1;
  const hex = uuidCounter.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

export function createInMemorySupabase(
  seed: Record<string, Table[]> = {},
  users: Array<{ id: string; email: string }> = [],
): FakeDb {
  const tables: Record<string, Table[]> = {};
  for (const [name, rows] of Object.entries(seed)) {
    tables[name] = rows.map((row) => ({ ...row }));
  }
  const log: string[] = [];

  const rowsOf = (table: string): Table[] => (tables[table] ??= []);

  const attachJoins = (row: Table, joins: Join[], fkColumn: string): Table => {
    if (joins.length === 0) return row;
    const out: Table = { ...row };
    for (const join of joins) {
      const parentKey = fkColumn;
      const parentValue = row[parentKey];
      // PostgREST embeds join the target table's primary key to the source's
      // FK column. STAVE's target tables all key on `id`.
      const candidates = rowsOf(join.table).filter(
        (candidate) => candidate.id === parentValue,
      );
      out[join.alias] = candidates[0] ?? null;
    }
    return out;
  };

  /**
   * The FK column a table uses to point at another table. STAVE's schema is
   * fixed, so this is a lookup rather than a real catalogue read.
   */
  const fkColumnFor = (table: string): string => {
    if (table === 'commits') return 'branch_id';
    if (table === 'branches') return 'project_id';
    if (table === 'drafts') return 'branch_id';
    if (table === 'commit_tags') return 'commit_id';
    if (table === 'project_collaborators') return 'project_id';
    if (table === 'comments') return 'project_id';
    return 'id';
  };

  const makeBuilder = (table: string) => {
    const filters: Record<string, unknown> = {};
    const inFilters: Array<{ column: string; values: unknown[] }> = [];
    let lastColumns: string | undefined;
    let lastOrder: { column: string; ascending: boolean } | undefined;
    let lastRange: [number, number] | undefined;
    let mode: 'select' | 'insert' | 'update' | 'delete' | 'upsert' =
      'select';
    let payload: unknown;

    const builder: any = {
      select(columns?: string) {
        if (mode === 'select') lastColumns = columns;
        return builder;
      },
      insert(body: unknown) {
        mode = 'insert';
        payload = body;
        return builder;
      },
      update(body: unknown) {
        mode = 'update';
        payload = body;
        return builder;
      },
      upsert(body: unknown) {
        mode = 'upsert';
        payload = body;
        return builder;
      },
      delete() {
        mode = 'delete';
        return builder;
      },
      eq(column: string, value: unknown) {
        filters[column] = value;
        return builder;
      },
      is(column: string, value: unknown) {
        filters[column] = value;
        return builder;
      },
      in(column: string, values: unknown[]) {
        inFilters.push({ column, values });
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        lastOrder = { column, ascending: options?.ascending ?? true };
        return builder;
      },
      range(from: number, to: number) {
        lastRange = [from, to];
        return builder;
      },
      limit() {
        return builder;
      },
      single: async () => {
        const { data, error } = await run();
        if (error) return { data: null, error };
        return { data: data?.[0] ?? null, error: null };
      },
      maybeSingle: async () => {
        const { data, error } = await run();
        if (error) return { data: null, error };
        return { data: data?.[0] ?? null, error: null };
      },
      then: (resolve: any, reject: any) => run().then(resolve, reject),
    };

    async function run(): Promise<{
      data: Table[] | null;
      error: { message: string; code?: string } | null;
      count?: number;
    }> {
      if (mode === 'insert' || mode === 'upsert') {
        const bodies = Array.isArray(payload) ? payload : [payload];
        const inserted: Table[] = [];
        for (const body of bodies) {
          const row: Table = { id: uuid(), ...(body as Table) };
          if (mode === 'upsert') {
            const conflictKey = Object.keys(filters);
            const existing = rowsOf(table).find((candidate) =>
              conflictKey.every((key) => candidate[key] === row[key]),
            );
            if (existing) {
              Object.assign(existing, row, { id: existing.id });
              inserted.push(existing);
              continue;
            }
          }
          rowsOf(table).push(row);
          inserted.push(row);
        }
        log.push(`${mode.toUpperCase()} ${table} -> ${inserted.length} row(s)`);
        return { data: inserted, error: null };
      }

      if (mode === 'update') {
        const body = (payload ?? {}) as Table;
        const targets = rowsOf(table).filter(
          (row) =>
            matches(row, filters) &&
            inFilters.every((f) => f.values.includes(row[f.column])),
        );
        for (const row of targets) Object.assign(row, body);
        log.push(`UPDATE ${table} -> ${targets.length} row(s)`);
        const columns = baseColumns(lastColumns);
        return {
          data: targets.map((row) => project(row, columns)),
          error: null,
        };
      }

      if (mode === 'delete') {
        const keep = rowsOf(table).filter(
          (row) =>
            !(
              matches(row, filters) &&
              inFilters.every((f) => f.values.includes(row[f.column]))
            ),
        );
        const removed = rowsOf(table).length - keep.length;
        tables[table] = keep;
        log.push(`DELETE ${table} -> ${removed} row(s)`);
        return { data: [], error: null };
      }

      // select
      const joins = parseJoins(lastColumns);
      const columns = baseColumns(lastColumns);
      let rows = rowsOf(table).filter(
        (row) =>
          matches(row, filters) &&
          inFilters.every((f) => f.values.includes(row[f.column])),
      );

      if (lastOrder) {
        const { column, ascending } = lastOrder;
        rows = [...rows].sort((a, b) => {
          const left = a[column] as never;
          const right = b[column] as never;
          if (left === right) return 0;
          const result = left > right ? 1 : -1;
          return ascending ? result : -result;
        });
      }

      const count = rows.length;
      if (lastRange) {
        const [from, to] = lastRange;
        rows = rows.slice(from, to + 1);
      }

      const fkColumn = fkColumnFor(table);
      const data = rows.map((row) =>
        project(attachJoins(row, joins, fkColumn), columns),
      );
      log.push(`SELECT ${table} -> ${data.length} row(s)`);
      return { data, error: null, count };
    }

    return builder;
  };

  const client: any = {
    from(table: string) {
      return makeBuilder(table);
    },
    async rpc(name: string, args: Record<string, any> = {}) {
      log.push(`RPC ${name}`);
      if (name === 'create_commit_atomic') {
        const branch = rowsOf('branches').find(
          (row) => row.id === args.p_branch_id,
        );
        if (!branch) {
          return {
            data: null,
            error: { message: 'branch not found', code: 'P0001' },
          };
        }
        const commit: Table = {
          id: uuid(),
          branch_id: args.p_branch_id,
          author_id: args.p_author_id,
          message: args.p_message,
          snapshot: args.p_snapshot,
          parent_commit_id: args.p_parent_commit_id ?? null,
          merged_from_branch_id: args.p_merged_from_branch_id ?? null,
          created_at: new Date().toISOString(),
        };
        rowsOf('commits').push(commit);
        branch.head_commit_id = commit.id;
        // The real function also resets the branch's draft.
        for (const draft of rowsOf('drafts')) {
          if (draft.branch_id === args.p_branch_id) {
            rowsOf('drafts').splice(rowsOf('drafts').indexOf(draft), 1);
          }
        }
        return { data: commit, error: null };
      }
      return { data: null, error: { message: `unknown rpc ${name}` } };
    },
    auth: {
      async getUser(token: string) {
        const found = users.find((user) => user.id === token);
        if (!found) {
          return { data: { user: null }, error: { message: 'invalid token' } };
        }
        return {
          data: {
            user: {
              id: found.id,
              email: found.email,
              app_metadata: { role: 'user' },
              user_metadata: {},
            },
          },
          error: null,
        };
      },
      admin: {
        async updateUserById() {
          return { data: { user: null }, error: null };
        },
      },
    },
    storage: {
      from() {
        return {
          async upload() {
            return { data: null, error: null };
          },
          async remove() {
            return { data: null, error: null };
          },
          async list() {
            return { data: [], error: null };
          },
        };
      },
    },
  };

  return { client: client as SupabaseClient, tables, log };
}
