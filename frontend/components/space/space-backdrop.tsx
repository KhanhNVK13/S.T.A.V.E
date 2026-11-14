"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { isLandingPath } from "../landing/landing-paths";
import { isEditorPath } from "../shell/nav-items";
import { useAccessibility } from "../../context/accessibility-context";
import { readSkyColors } from "./sky-colors";
import { createSky2D } from "./sky2d";
import type { SkyEngine } from "./sky-types";
import {
  getRequest,
  getSpaceProgress,
  subscribeProgress,
  subscribePulse,
  subscribeRequest,
  type SpaceMode,
} from "./space-store";

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

function routeScene(pathname: string): { mode: SpaceMode; anchor: number } {
  if (isLandingPath(pathname)) return { mode: "full", anchor: 0 };
  return { mode: "quiet", anchor: 0 };
}

/**
 * Nền vũ trụ phía sau mọi trang (preset "space"). "full" = cảnh three.js (chỉ
 * khi màn >= 900px, có WebGL, không giảm chuyển động); mọi trường hợp còn lại
 * và các trang thường dùng Canvas 2D rất nhẹ.
 */
export function SpaceBackdrop() {
  const pathname = usePathname();
  const request = useSyncExternalStore(subscribeRequest, getRequest, () => null);
  const wide = useMedia("(min-width: 900px)");
  const { stillBackground } = useAccessibility();
  const reduce = useMedia("(prefers-reduced-motion: reduce)") || stillBackground;
  const [lost, setLost] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const applyRef = useRef<() => void>(() => undefined);

  const scene = request ?? routeScene(pathname);
  const want3d = scene.mode === "full" && wide && !reduce && !lost;
  const anchorRef = useRef(scene.anchor);
  const quiet = scene.mode === "quiet";
  const still = isEditorPath(pathname);
  const landing = isLandingPath(pathname);

  useEffect(() => {
    anchorRef.current = scene.anchor;
    applyRef.current();
  }, [scene.anchor]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let engine: SkyEngine | null = null;
    const offs: (() => void)[] = [];

    async function boot(host: HTMLElement) {
      const colors = readSkyColors();
      if (want3d) {
        try {
          const [THREE, mod] = await Promise.all([import("three"), import("./universe3d")]);
          if (cancelled) return;
          if (mod.webglAvailable()) {
            const lowCpu = (navigator.hardwareConcurrency || 8) <= 2;
            engine = mod.createUniverse3D({
              THREE,
              host,
              colors,
              reduce: false,
              quality: lowCpu ? 0.45 : 1,
              onLost: () => setLost(true),
            });
          }
        } catch {
          engine = null;
        }
      }
      if (cancelled) {
        engine?.dispose();
        return;
      }
      const lowCpu = (navigator.hardwareConcurrency || 8) <= 2;
      const constellations = !quiet && landing;
      engine ??= createSky2D({ host, colors, reduce, light: !wide || lowCpu, constellations, still });
      if (!engine) return;
      const e = engine;
      const flat = e.kind === "canvas2d" && !constellations;
      const follow = landing || (!reduce && !still);
      let lift = 0;
      const apply = () => {
        const anchor = anchorRef.current;
        const progress = follow ? (getSpaceProgress() ?? anchor) : anchor;
        e.setProgress(flat ? progress - anchor + lift : progress);
      };
      applyRef.current = apply;
      host.dataset.sky = e.kind;
      e.start();
      apply();
      offs.push(subscribeProgress(apply));
      offs.push(subscribePulse((i) => e.pulse(i)));

      const main = document.getElementById("main");
      if (quiet && main && follow) {
        let queued = false;
        const onScroll = () => {
          if (queued) return;
          queued = true;
          requestAnimationFrame(() => {
            queued = false;
            lift = Math.min(1, main.scrollTop / (main.clientHeight || 1)) * 0.35;
            apply();
          });
        };
        main.addEventListener("scroll", onScroll, { passive: true });
        offs.push(() => main.removeEventListener("scroll", onScroll));
      }
    }
    void boot(host);

    return () => {
      cancelled = true;
      offs.forEach((off) => off());
      engine?.dispose();
      applyRef.current = () => undefined;
      delete host.dataset.sky;
    };
  }, [want3d, reduce, wide, quiet, still, landing]);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      data-space-backdrop={want3d ? "full" : "quiet"}
      className="pointer-events-none fixed inset-0 -z-10"
      style={{
        opacity: landing ? 1 : want3d ? 0.6 : 0.85,
        background:
          "radial-gradient(ellipse at 70% 40%, var(--surface-subtle) 0%, transparent 60%), var(--background)",
      }}
    />
  );
}
