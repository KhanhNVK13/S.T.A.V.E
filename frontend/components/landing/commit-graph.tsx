"use client";

import type { KeyboardEvent } from "react";
import { useT } from "../../context/i18n-context";
import type { SampleCommit } from "./landing-data";

const W = 760;
const H = 232;
const LANE_Y = [58, 122, 188];
const LANE_NAMES = ["main", "bridge-alt", "drums-swing"];
const px = (i: number) => 128 + i * 88;
const MERGE_X = 700;

function Star({ x, y, cls, children }: { x: number; y: number; cls: string; children?: React.ReactNode }) {
  return (
    <g className={cls} transform={`translate(${x} ${y})`}>
      <circle className="halo" r={16} />
      <circle className="core" r={5.5} />
      {children}
    </g>
  );
}

/** Đồ thị commit dạng chòm sao. Chỉ các commit trong `commits` chọn được; sao nhánh/merge chỉ để trang trí. */
export function CommitGraph({
  commits,
  selected,
  onSelect,
}: {
  commits: SampleCommit[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  const t = useT();
  const bX = [px(3) + 78, px(3) + 168];
  const dX = px(2) + 80;

  function onKey(e: KeyboardEvent<SVGGElement>, i: number) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(i);
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const j = Math.max(0, Math.min(commits.length - 1, i + (e.key === "ArrowRight" ? 1 : -1)));
      const next = e.currentTarget.parentElement?.querySelectorAll<SVGGElement>(".cstar")[j];
      next?.focus();
      onSelect(j);
    }
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="group"
      aria-label={t("landing.graphLabel")}
    >
      <defs>
        <radialGradient id="lnd-halo">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      {LANE_NAMES.map((n, i) => (
        <g key={n}>
          <g className="g-staff">
            {[-2, -1, 0, 1, 2].map((l) => (
              <line key={l} x1={100} x2={W - 8} y1={LANE_Y[i] + l * 5} y2={LANE_Y[i] + l * 5} />
            ))}
          </g>
          <text x={4} y={LANE_Y[i] + 4} className="g-lane-label">
            {n}
          </text>
        </g>
      ))}
      <path d={`M${px(0)} ${LANE_Y[0]} H${MERGE_X}`} className="g-edge main" />
      <path
        d={`M${px(3)} ${LANE_Y[0]} C ${px(3) + 40} ${LANE_Y[0]}, ${bX[0] - 40} ${LANE_Y[1]}, ${bX[0]} ${LANE_Y[1]} H${bX[1]}`}
        className="g-edge teal"
      />
      <path
        d={`M${bX[1]} ${LANE_Y[1]} C ${bX[1] + 60} ${LANE_Y[1]}, ${MERGE_X - 60} ${LANE_Y[0]}, ${MERGE_X} ${LANE_Y[0]}`}
        className="g-edge teal dash"
      />
      <path
        d={`M${px(2)} ${LANE_Y[0]} C ${px(2) + 40} ${LANE_Y[0]}, ${dX - 40} ${LANE_Y[2]}, ${dX} ${LANE_Y[2]}`}
        className="g-edge violet"
      />
      <g aria-hidden="true">
        <Star x={bX[0]} y={LANE_Y[1]} cls="dec" />
        <Star x={bX[1]} y={LANE_Y[1]} cls="dec" />
        <Star x={dX} y={LANE_Y[2]} cls="dec violet" />
        <Star x={MERGE_X} y={LANE_Y[0]} cls="dec merge" />
      </g>
      {commits.map((c, i) => (
        <g
          key={c.hash}
          className={`cstar${i === selected ? " on" : ""}`}
          transform={`translate(${px(i)} ${LANE_Y[0]})`}
          tabIndex={i === selected ? 0 : -1}
          role="button"
          aria-pressed={i === selected}
          aria-label={t("landing.commitLabel", { hash: c.hash, msg: c.msg, author: c.author, when: c.when })}
          onClick={() => onSelect(i)}
          onKeyDown={(e) => onKey(e, i)}
        >
          <circle className="halo" r={16} />
          <circle className="core" r={5.5} />
          <circle className="ring" r={13} />
          <circle className="hit" r={22} />
          <text className="g-hash" x={0} y={-26}>
            {c.hash}
          </text>
        </g>
      ))}
    </svg>
  );
}
