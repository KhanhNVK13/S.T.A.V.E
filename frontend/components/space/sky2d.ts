import { GALAXY_COUNT as N, seeded, type SkyColors, type SkyEngine } from "./sky-types";
import { rgba } from "./sky-colors";

interface Options {
  host: HTMLElement;
  colors: SkyColors;
  reduce: boolean;
  light?: boolean;
  /** false = chỉ sao + ánh sáng nền rất mờ (trang nội dung), không vẽ chòm sao để khỏi cắt ngang chữ. */
  constellations?: boolean;
}

export function createSky2D(opts: Options): SkyEngine | null {
  const { host, colors, reduce } = opts;
  const showCons = opts.constellations !== false;
  const cv = document.createElement("canvas");
  cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  host.appendChild(cv);
  const ctx = cv.getContext("2d");
  if (!ctx) {
    host.removeChild(cv);
    return null;
  }
  const g2d: CanvasRenderingContext2D = ctx;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0;
  let H = 0;
  let target = 0;
  let pos = 0;
  let raf = 0;
  let disposed = false;
  let last = 0;

  const r = seeded(11);
  const starCount = opts.light ? 140 : 260;
  const stars = Array.from({ length: starCount }, () => ({
    x: r(),
    y: r() * N,
    d: 0.15 + r() * 0.85,
    s: 0.4 + r() * 1.3,
    a: 0.35 + r() * 0.65,
  }));
  const cons = Array.from({ length: N }, (_, s) => {
    const rr = seeded(50 + s);
    let x = s === 0 || s === 4 ? 0.5 : 0.12;
    return Array.from({ length: 7 }, () => {
      x += 0.08 + rr() * 0.05;
      return [x, 0.5 + Math.round(rr() * 6 - 3) * 0.012] as const;
    });
  });
  const glowX = (g: number) => (g % 3 === 0 ? 0.72 : g % 3 === 1 ? 0.5 : 0.3);

  function size() {
    W = host.clientWidth || window.innerWidth;
    H = host.clientHeight || window.innerHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    g2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw() {
    g2d.clearRect(0, 0, W, H);
    for (let g = 0; g < N; g++) {
      const gy = (g - pos) * H * 0.8 + H * 0.5;
      const gx = W * glowX(g);
      if (gy < -H || gy > 2 * H) continue;
      const rad = Math.min(W, H) * 0.55;
      const grad = g2d.createRadialGradient(gx, gy, 0, gx, gy, rad);
      grad.addColorStop(0, rgba(colors.accent, showCons ? 0.2 : 0.1));
      grad.addColorStop(0.45, rgba(colors.accent, showCons ? 0.07 : 0.03));
      grad.addColorStop(1, rgba(colors.accent, 0));
      g2d.fillStyle = grad;
      g2d.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
    }
    g2d.fillStyle = rgba(colors.star, 1);
    for (const st of stars) {
      const span = H * N * st.d;
      const y = (st.y - pos) * H * st.d;
      const yy = ((y % span) + span) % span;
      if (yy > H) continue;
      g2d.globalAlpha = st.a;
      g2d.beginPath();
      g2d.arc(st.x * W, yy, st.s, 0, 6.2832);
      g2d.fill();
    }
    g2d.globalAlpha = 1;
    for (let c = 0; showCons && c < N; c++) {
      const cy = (c - pos) * H + H * 0.5;
      if (cy < -H * 0.5 || cy > H * 1.5) continue;
      g2d.strokeStyle = rgba(colors.star, 0.14);
      g2d.lineWidth = 1;
      for (let l = -2; l <= 2; l++) {
        g2d.beginPath();
        g2d.moveTo(W * 0.05, cy + l * 9);
        g2d.lineTo(W * 0.95, cy + l * 9);
        g2d.stroke();
      }
      const nd = cons[c];
      g2d.strokeStyle = rgba(colors.star, 0.55);
      g2d.lineWidth = 1.4;
      g2d.beginPath();
      nd.forEach((p, k) => {
        const px = p[0] * W;
        const py = cy + (p[1] - 0.5) * H * 4;
        if (k) g2d.lineTo(px, py);
        else g2d.moveTo(px, py);
      });
      g2d.stroke();
      nd.forEach((p, k) => {
        const px = p[0] * W;
        const py = cy + (p[1] - 0.5) * H * 4;
        const rg = g2d.createRadialGradient(px, py, 0, px, py, 16);
        rg.addColorStop(0, rgba(k % 3 === 0 ? colors.accent : colors.star, 1));
        rg.addColorStop(0.25, rgba(colors.accent, 0.5));
        rg.addColorStop(1, rgba(colors.accent, 0));
        g2d.fillStyle = rg;
        g2d.beginPath();
        g2d.arc(px, py, 16, 0, 6.2832);
        g2d.fill();
      });
    }
  }

  function frame(now: number) {
    if (disposed) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    pos += (target - pos) * (1 - Math.exp(-dt * 4));
    if (Math.abs(target - pos) < 0.001) pos = target;
    draw();
    raf = pos !== target ? requestAnimationFrame(frame) : 0;
  }
  function kick() {
    if (raf || disposed) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function onResize() {
    size();
    draw();
  }
  window.addEventListener("resize", onResize);
  size();

  return {
    kind: "canvas2d",
    setProgress(p) {
      target = Math.max(0, Math.min(N - 1, p));
      if (reduce) {
        pos = target;
        draw();
      } else kick();
    },
    pulse() {},
    start() {
      draw();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      cv.remove();
    },
  };
}
