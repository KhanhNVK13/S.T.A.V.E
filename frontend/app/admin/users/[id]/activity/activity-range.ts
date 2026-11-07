export interface ActivityDateFilters {
  from: string;
  to: string;
}

export interface ActivityRange {
  from: string;
  to: string;
}

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DEFAULT_WINDOW_MS = 30 * 86_400_000;

function localDayEdge(value: string, edge: "start" | "end"): Date | null {
  const match = LOCAL_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date =
    edge === "start"
      ? new Date(year, month - 1, day, 0, 0, 0, 0)
      : new Date(year, month - 1, day, 23, 59, 59, 999);
  const real =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return real ? date : null;
}

export function computeActivityRange(
  filters: ActivityDateFilters,
  now: Date = new Date(),
): ActivityRange | null {
  let to = now;
  if (filters.to !== "") {
    const parsed = localDayEdge(filters.to, "end");
    if (!parsed) return null;
    to = parsed;
  }

  let from: Date;
  if (filters.from !== "") {
    const parsed = localDayEdge(filters.from, "start");
    if (!parsed) return null;
    from = parsed;
  } else {
    from = new Date(to.getTime() - DEFAULT_WINDOW_MS);
  }

  if (from.getTime() > to.getTime()) return null;
  return { from: from.toISOString(), to: to.toISOString() };
}
