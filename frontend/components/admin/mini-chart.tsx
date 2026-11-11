"use client";

export interface MiniChartPoint {
  label: string;
  value: number;
}

export interface MiniChartSeries {
  name: string;
  tone: "accent" | "success";
  points: MiniChartPoint[];
}

const TONE_CLASS = {
  accent: "bg-accent",
  success: "bg-success",
} as const;

export function MiniChart({
  title,
  series,
  tableLabel,
  labelHeader,
}: {
  title: string;
  series: MiniChartSeries[];
  tableLabel: string;
  labelHeader: string;
}) {
  const labels = series[0]?.points.map((point) => point.label) ?? [];
  const max = Math.max(1, ...series.flatMap((entry) => entry.points.map((point) => point.value)));
  const summary = `${title}: ${series
    .map((entry) => `${entry.name} ${entry.points.reduce((sum, point) => sum + point.value, 0)}`)
    .join(", ")}`;

  return (
    <figure className="flex flex-col gap-3">
      <figcaption className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <span className="font-semibold text-foreground">{title}</span>
        {series.map((entry) => (
          <span key={entry.name} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${TONE_CLASS[entry.tone]}`} />
            {entry.name}
          </span>
        ))}
      </figcaption>

      <div role="img" aria-label={summary} className="flex h-28 items-end gap-1">
        {labels.map((label, index) => (
          <div key={label + index} className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5">
            {series.map((entry) => {
              const value = entry.points[index]?.value ?? 0;
              return (
                <div
                  key={entry.name}
                  title={`${label} · ${entry.name}: ${value}`}
                  className={`w-full max-w-3 rounded-t-sm ${TONE_CLASS[entry.tone]}`}
                  style={{ height: `${value === 0 ? 2 : Math.max(4, (value / max) * 100)}%`, opacity: value === 0 ? 0.25 : 1 }}
                />
              );
            })}
          </div>
        ))}
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted hover:text-foreground">{tableLabel}</summary>
        <div className="mt-2 max-h-56 overflow-auto rounded-card border border-border">
          <table className="w-full text-left">
            <caption className="sr-only">{title}</caption>
            <thead className="bg-surface-subtle text-muted">
              <tr>
                <th scope="col" className="px-2.5 py-1.5 font-semibold">
                  {labelHeader}
                </th>
                {series.map((entry) => (
                  <th key={entry.name} scope="col" className="px-2.5 py-1.5 text-right font-semibold">
                    {entry.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((label, index) => (
                <tr key={label + index} className="border-t border-border">
                  <th scope="row" className="px-2.5 py-1.5 font-normal text-muted">
                    {label}
                  </th>
                  {series.map((entry) => (
                    <td key={entry.name} className="px-2.5 py-1.5 text-right font-mono tabular-nums">
                      {entry.points[index]?.value ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
