"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { resolveCssColors } from "../../lib/resolve-css-colors";

interface Star {
  x: number;
  y: number;
  r: number;
  base: number;
  phase: number;
  speed: number;
  accent: boolean;
}

const ROOM_PATH = /^\/jam\/[^/]+$/;

function makeStars(width: number, height: number, count: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 0.5 + Math.random() * 1.1,
      base: 0.4 + Math.random() * 0.6,
      phase: Math.random() * Math.PI * 2,
      speed: 0.25 + Math.random() * 0.6,
      accent: Math.random() < 0.12,
    });
  }
  return stars;
}

/**
 * Nền sao Canvas 2D cho khu Community Jam. Phòng đang chơi (/jam/[id]) đông sao
 * hơn danh sách và trang kết quả. Giảm chuyển động → vẽ đúng một khung tĩnh.
 */
export function JamSky() {
  const pathname = usePathname() ?? "";
  const live = ROOM_PATH.test(pathname);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let colors = resolveCssColors({
      star: "var(--foreground)",
      glow: "var(--accent)",
    });
    let stars: Star[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let running = false;

    function resize() {
      if (!canvas || !ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const density = live ? 9000 : 18000;
      stars = makeStars(width, height, Math.round((width * height) / density));
    }

    function draw(time: number) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      for (const s of stars) {
        const twinkle = motion.matches ? 1 : 0.65 + 0.35 * Math.sin(time * 0.001 * s.speed + s.phase);
        ctx.globalAlpha = s.base * twinkle;
        ctx.fillStyle = s.accent ? colors.glow : colors.star;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function loop(time: number) {
      draw(time);
      frame = requestAnimationFrame(loop);
    }

    function start() {
      if (running || motion.matches || document.hidden) return;
      running = true;
      frame = requestAnimationFrame(loop);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(frame);
    }

    function refresh() {
      stop();
      colors = resolveCssColors({ star: "var(--foreground)", glow: "var(--accent)" });
      resize();
      draw(0);
      start();
    }

    function onVisibility() {
      if (document.hidden) stop();
      else start();
    }

    refresh();
    window.addEventListener("resize", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    motion.addEventListener("change", refresh);
    const themeObserver = new MutationObserver(refresh);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      stop();
      window.removeEventListener("resize", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      motion.removeEventListener("change", refresh);
      themeObserver.disconnect();
    };
  }, [live]);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />;
}
