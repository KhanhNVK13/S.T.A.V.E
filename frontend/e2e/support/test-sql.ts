import { execFileSync } from "node:child_process";
import { isLocalTarget, requireTestEnv } from "./env";

const IMAGE = "public.ecr.aws/supabase/postgres:17.6.1.165";

export const LOCAL_DB_CONTAINER = "supabase_db_stave-local";

export function testSql(statement: string): string {
  if (isLocalTarget) {
    return execFileSync(
      "docker",
      ["exec", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-tA", "-c", statement],
      { encoding: "utf8" },
    ).trim();
  }
  const env = requireTestEnv();
  const { TEST_DB_PROJECT_REF, TEST_DB_PASSWORD, TEST_DB_POOLER_HOST } = env;
  if (!TEST_DB_PROJECT_REF || !TEST_DB_PASSWORD || !TEST_DB_POOLER_HOST) {
    throw new Error(
      "TEST_DB_PROJECT_REF, TEST_DB_PASSWORD and TEST_DB_POOLER_HOST must be set in backend/.env.test",
    );
  }
  const conn = `host=${TEST_DB_POOLER_HOST} port=5432 user=postgres.${TEST_DB_PROJECT_REF} dbname=postgres sslmode=require`;
  return execFileSync(
    "docker",
    ["run", "--rm", "-e", "PGPASSWORD", IMAGE, "psql", conn, "-tA", "-c", statement],
    {
      env: { ...process.env, PGPASSWORD: TEST_DB_PASSWORD },
      encoding: "utf8",
    },
  ).trim();
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export type SentColumn = "confirmation_sent_at" | "recovery_sent_at";

export function ageLink(
  email: string,
  column: SentColumn,
  minutes: number,
): void {
  testSql(
    `update auth.users set ${column} = now() - interval '${Math.floor(minutes)} minutes' where email = ${quote(email)}`,
  );
}
