import { layoutGalaxy, type GalaxyItem, type LaidOutConstellation } from "./constellation";
import { easeLevels, type GalaxyEngine } from "./galaxy-engine";
import { rgba, type GalaxyPalette } from "./palette";

export function createGalaxy2D(
  host: HTMLElement,
  initial: GalaxyPalette,
  animate: boolean,
): GalaxyEngine | null {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  host.appendChild(canvas);

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let palette = initial;
  let items: GalaxyItem[] = [];
  let layout: LaidOutConstellation[] = [];
  let levels: number[] = [];
  let targets: number[] = [];
  let activeId: string | null = null;
  let width = 0;
  let height = 0;
  let raf = 0;
  let last = 0;
  let disposed = false;

  function relayout() {
    layout = layoutGalaxy(items, width / Math.max(1, height));
    levels = layout.map((_, i) => levels[i] ?? 0);
    targets = layout.map((c) => (c.id === activeId ? 1 : 0));
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const unit = height / 2;
    const focus = targets.some((t) => t === 1) ? 1 : 0;
    layout.forEach((con, index) => {
      const level = levels[index];
      const dim = focus ? 0.55 + 0.45 * level : 1;
      const px = (x: number) => width / 2 + x * unit;
      const py = (y: number) => height / 2 - y * unit;

      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(palette.link, 0.16 * dim * (1 + level));
      con.staffY.forEach((sy) => {
        ctx.beginPath();
        ctx.moveTo(px(con.cx - con.staffHalf), py(sy));
        ctx.lineTo(px(con.cx + con.staffHalf), py(sy));
        ctx.stroke();
      });

      const mix = level > 0 ? palette.active : palette.link;
      ctx.strokeStyle = rgba(mix, Math.min(1, (0.5 + level * 0.5) * dim));
      ctx.lineWidth = 1 + level * 0.6;
      ctx.beginPath();
      con.links.forEach(([a, b]) => {
        ctx.moveTo(px(con.stars[a].x), py(con.stars[a].y));
        ctx.lineTo(px(con.stars[b].x), py(con.stars[b].y));
      });
      ctx.stroke();

      con.stars.forEach((star) => {
        const radius = star.size * unit * (1 + level * 0.55);
        const color = level > 0.5 ? palette.active : palette.star;
        const glow = ctx.createRadialGradient(px(star.x), py(star.y), 0, px(star.x), py(star.y), radius * 3.2);
        glow.addColorStop(0, rgba(color, 0.55 * dim));
        glow.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px(star.x), py(star.y), radius * 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rgba(color, Math.min(1, dim));
        ctx.beginPath();
        ctx.arc(px(star.x), py(star.y), Math.max(1.1, radius * 0.7), 0, Math.PI * 2);
        ctx.fill();
      });
    });
  }

  function frame(now: number) {
    raf = 0;
    if (disposed) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    const moving = easeLevels(levels, targets, dt);
    draw();
    if (moving) raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (animate) {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    } else {
      levels = targets.slice();
      draw();
    }
  }

  function resize() {
    width = host.clientWidth;
    height = host.clientHeight;
    if (!width || !height) return;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    relayout();
    levels = targets.slice();
    draw();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  return {
    setItems(next) {
      items = next;
      relayout();
      levels = targets.slice();
      draw();
    },
    setActive(id) {
      activeId = id;
      targets = layout.map((c) => (c.id === id ? 1 : 0));
      kick();
    },
    setPalette(next) {
      palette = next;
      draw();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.remove();
    },
  };
}
