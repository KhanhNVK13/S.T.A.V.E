import { afterAll, beforeAll } from "vitest";

export function pinTimeZone(zone: string): void {
  let previous: string | undefined;
  beforeAll(() => {
    previous = process.env.TZ;
    process.env.TZ = zone;
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
}

export async function withTimeZone<T>(zone: string, run: () => Promise<T> | T): Promise<T> {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}
