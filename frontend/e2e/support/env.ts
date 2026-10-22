import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

export const PRODUCTION_PROJECT_REF = "gwbiwweeznbuqfgawywv";
export const LOCAL_PROJECT_REF = "local";
export const isLocalTarget = process.env.E2E_TARGET === "local";

type Env = Record<string, string>;

function read(file: string): Env {
  if (!existsSync(file)) {
    throw new Error(
      `Missing ${file}. Copy the matching .example file and fill in the test project values.`,
    );
  }
  return parseEnv(readFileSync(file, "utf8")) as Env;
}

export function loadE2eEnv(): { backend: Env; frontend: Env } {
  const backend = read(
    path.resolve(
      __dirname,
      isLocalTarget
        ? "../../../backend/.env.test.localstack"
        : "../../../backend/.env.test",
    ),
  );
  const frontend = read(
    path.resolve(
      __dirname,
      isLocalTarget
        ? "../../.env.test.localstack"
        : "../../.env.test.local",
    ),
  );

  const ref = backend.TEST_DB_PROJECT_REF;
  if (!ref || ref === PRODUCTION_PROJECT_REF) {
    throw new Error(
      "Refusing to run: TEST_DB_PROJECT_REF is missing or is the production project.",
    );
  }
  if (isLocalTarget) {
    if (ref !== LOCAL_PROJECT_REF) {
      throw new Error("Refusing to run: the local target needs TEST_DB_PROJECT_REF=local.");
    }
    for (const [name, value] of [
      ["backend SUPABASE_URL", backend.SUPABASE_URL],
      ["frontend NEXT_PUBLIC_SUPABASE_URL", frontend.NEXT_PUBLIC_SUPABASE_URL],
    ] as const) {
      if (!value || !/^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(value)) {
        throw new Error(`Refusing to run: ${name} is not a local address.`);
      }
    }
    return { backend, frontend };
  }
  for (const [name, value] of [
    ["backend SUPABASE_URL", backend.SUPABASE_URL],
    ["frontend NEXT_PUBLIC_SUPABASE_URL", frontend.NEXT_PUBLIC_SUPABASE_URL],
  ] as const) {
    if (
      !value ||
      value.includes(PRODUCTION_PROJECT_REF) ||
      !value.includes(ref)
    ) {
      throw new Error(
        `Refusing to run: ${name} does not point at the test project.`,
      );
    }
  }
  return { backend, frontend };
}

export function requireTestEnv(): Env {
  const { backend } = loadE2eEnv();
  return backend;
}
