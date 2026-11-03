"use client";

import { useEffect, useRef } from "react";
import type { GalaxyItem } from "./constellation";
import type { GalaxyEngine } from "./galaxy-engine";
import { readGalaxyPalette, watchThemeChange } from "./palette";

interface GalaxyMapProps {
  items: GalaxyItem[];
  activeId: string | null;
  className?: string;
}

const WIDE = "(min-width: 900px)";
const REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * Bản đồ thiên hà trang trí: mỗi dự án là một chòm sao. Three.js chỉ được tải khi
 * màn >= 900px, có WebGL và không bật giảm chuyển động; còn lại dùng Canvas 2D.
 */
export function GalaxyMap({ items, activeId, className = "" }: GalaxyMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GalaxyEngine | null>(null);
  const itemsRef = useRef(items);
  const activeRef = useRef(activeId);

  useEffect(() => {
    itemsRef.current = items;
    engineRef.current?.setItems(items);
  }, [items]);

  useEffect(() => {
    activeRef.current = activeId;
    engineRef.current?.setActive(activeId);
  }, [activeId]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const wide = window.matchMedia(WIDE);
    const reduced = window.matchMedia(REDUCED);
    let generation = 0;
    let flat = false;
    let unwatchTheme = () => {};

    function teardown() {
      generation++;
      unwatchTheme();
      unwatchTheme = () => {};
      engineRef.current?.dispose();
      engineRef.current = null;
    }

    async function mount() {
      teardown();
      const current = generation;
      if (!wide.matches || !host) return;
      const palette = readGalaxyPalette();
      let engine: GalaxyEngine | null = null;

      const fallback = async () => {
        const { createGalaxy2D } = await import("./galaxy-map-2d");
        return createGalaxy2D(host, palette, !reduced.matches);
      };

      if (!reduced.matches && !flat) {
        const { webglAvailable, createGalaxy3D } = await import("./galaxy-map-3d");
        if (current !== generation) return;
        if (webglAvailable()) {
          const THREE = await import("three");
          if (current !== generation) return;
          engine = createGalaxy3D(THREE, host, palette, () => {
            engineRef.current = null;
            flat = true;
            void mount();
          });
        }
      }
      if (!engine) {
        engine = await fallback();
        if (current !== generation) {
          engine?.dispose();
          return;
        }
      }
      if (!engine) return;
      engineRef.current = engine;
      engine.setItems(itemsRef.current);
      engine.setActive(activeRef.current);
      unwatchTheme = watchThemeChange(() => engine?.setPalette(readGalaxyPalette()));
    }

    const onChange = () => void mount();
    wide.addEventListener("change", onChange);
    reduced.addEventListener("change", onChange);
    void mount();

    return () => {
      wide.removeEventListener("change", onChange);
      reduced.removeEventListener("change", onChange);
      teardown();
    };
  }, []);

  return <div ref={hostRef} aria-hidden="true" className={`relative ${className}`} />;
}
