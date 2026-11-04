"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "../../context/theme-context";
import { isLandingPath } from "../landing/landing-paths";
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
  if (pathname === "/explore") return { mode: "full", anchor: 1 };
  return { mode: "quiet", anchor: 0 };
}

/**
 * Nền vũ trụ phía sau mọi trang (preset "space"). "full" = cảnh three.js (chỉ
 * khi màn >= 900px, có WebGL, không giảm chuyển động); mọi trường hợp còn lại
 * và các trang thường dùng Canvas 2D rất nhẹ.
 */
export function SpaceBackdrop() {
  const { activePreset } = useTheme();
  const pathname = usePathname();
  const request = useSyncExternalStore(subscribeRequest, getRequest, () => null);
  const wide = useMedia("(min-width: 900px)");
  const reduce = useMedia("(prefers-reduced-motion: reduce)");
  const [lost, setLost] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SkyEngine | null>(null);

  const enabled = activePreset === "space";
  const scene = request ?? routeScene(pathname);
  const want3d = enabled && scene.mode === "full" && wide && !reduce && !lost;
  const anchorRef = useRef(scene.anchor);
  const quiet = scene.mode === "quiet";

  useEffect(() => {
    anchorRef.current = scene.anchor;
    engineRef.current?.setProgress(getSpaceProgress() ?? scene.anchor);
  }, [scene.anchor]);

  useEffect(() => {
    const host = hostRef.current;
    if (!enabled || !host) return;
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
      engine ??= createSky2D({ host, colors, reduce, light: !wide || quiet, constellations: !quiet });
      if (!engine) return;
      const e = engine;
      engineRef.current = e;
      host.dataset.sky = e.kind;
      e.start();
      e.setProgress(getSpaceProgress() ?? anchorRef.current);
      offs.push(subscribeProgress(() => e.setProgress(getSpaceProgress() ?? anchorRef.current)));
      offs.push(subscribePulse((i) => e.pulse(i)));

      const main = document.getElementById("main");
      if (quiet && main && !reduce) {
        let queued = false;
        const onScroll = () => {
          if (queued) return;
          queued = true;
          requestAnimationFrame(() => {
            queued = false;
            const h = main.clientHeight || 1;
            e.setProgress((getSpaceProgress() ?? anchorRef.current) + Math.min(1, main.scrollTop / h) * 0.35);
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
      engineRef.current = null;
      delete host.dataset.sky;
    };
  }, [enabled, want3d, reduce, wide, quiet]);

  if (!enabled) return null;
  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      data-space-backdrop={want3d ? "full" : "quiet"}
      className="pointer-events-none fixed inset-0 -z-10"
      style={{
        opacity: isLandingPath(pathname) ? 1 : 0.6,
        background:
          "radial-gradient(ellipse at 70% 40%, var(--surface-subtle) 0%, transparent 60%), var(--background)",
      }}
    />
  );
}
