"use client";

import { useEffect, useRef } from "react";
import { hashString, seeded } from "./constellation";
import { readGalaxyPalette, rgba, watchThemeChange } from "./palette";

/**
 * Nền sao Canvas 2D tĩnh, vẽ lại chỉ khi đổi kích thước hoặc theme. Bám theo vùng
 * cuộn của <main> (sticky) nên không bao giờ đè lên header/footer.
 */
export function StarField() {
  const anchorRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    const canvas = canvasRef.current;
    const scroller = anchor?.closest("main") ?? document.documentElement;
    const ctx = canvas?.getContext("2d");
    if (!anchor || !canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function draw() {
      if (!canvas || !ctx) return;
      const width = scroller.clientWidth;
      const height = scroller.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const palette = readGalaxyPalette();
      const glow = ctx.createRadialGradient(width * 0.78, height * 0.18, 0, width * 0.78, height * 0.18, Math.max(width, height) * 0.6);
      glow.addColorStop(0, rgba(palette.active, 0.09));
      glow.addColorStop(1, rgba(palette.active, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      const rand = seeded(hashString("star-field"));
      const count = Math.min(260, Math.round((width * height) / 7000));
      for (let i = 0; i < count; i++) {
        const x = rand() * width;
        const y = rand() * height;
        const radius = 0.4 + rand() * rand() * 1.4;
        ctx.fillStyle = rgba(palette.star, 0.25 + rand() * 0.55);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const observer = new ResizeObserver(draw);
    observer.observe(scroller);
    const unwatch = watchThemeChange(draw);
    draw();
    return () => {
      observer.disconnect();
      unwatch();
    };
  }, []);

  return (
    <div ref={anchorRef} aria-hidden="true" className="pointer-events-none sticky top-0 z-0 h-0">
      <canvas ref={canvasRef} className="absolute left-0 top-0" />
    </div>
  );
}
