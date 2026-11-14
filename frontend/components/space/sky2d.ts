import { GALAXY_COUNT as N, seeded, type SkyColors, type SkyEngine } from "./sky-types";
import { rgba } from "./sky-colors";

interface Options {
  host: HTMLElement;
  colors: SkyColors;
  reduce: boolean;
  light?: boolean;
  /** false = bầu trời tĩnh lặng cho trang nội dung: chỉ sao trôi chậm, không vẽ chòm sao để khỏi cắt ngang chữ. */
  constellations?: boolean;
  /** true = vẽ một khung hình rồi đứng yên (trình soạn nhạc, giảm chuyển động). */
  still?: boolean;
}

type Rgb = [number, number, number];

interface QuietStar {
  x: number;
  y: number;
  size: number;
  alpha: number;
  depth: number;
  speed: number;
  phase: number;
  twinkle: number;
  color: string;
}

const QUIET_FPS = 24;
const DRIFT_PX_PER_SEC = 5;
const QUIET_AREA_PER_STAR = 5200;

export function createSky2D(opts: Options): SkyEngine | null {
  const { host, colors, reduce } = opts;
  const full = opts.constellations !== false;
  const still = reduce || opts.still === true;
  const cv = document.createElement("canvas");
  cv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  host.appendChild(cv);
  const ctx = cv.getContext("2d");
  if (!ctx) {
    host.removeChild(cv);
    return null;
  }
  const g2d: CanvasRenderingContext2D = ctx;
  const dpr = Math.min(window.devicePixelRatio || 1, full ? 2 : 1.5);
  let W = 0;
  let H = 0;
  let target = 0;
  let pos = 0;
  let raf = 0;
  let disposed = false;
  let paused = false;
  let last = 0;
  let drift = 0;
  let clock = 0;
  let acc = 0;

  const r = seeded(full ? 11 : 23);
  const fullStars = full
    ? Array.from({ length: opts.light ? 140 : 260 }, () => ({
        x: r(),
        y: r() * N,
        d: 0.15 + r() * 0.85,
        s: 0.4 + r() * 1.3,
        a: 0.35 + r() * 0.65,
      }))
    : [];
  const cons = full
    ? Array.from({ length: N }, (_, s) => {
        const rr = seeded(50 + s);
        let x = s === 0 || s === 4 ? 0.5 : 0.12;
        return Array.from({ length: 7 }, () => {
          x += 0.08 + rr() * 0.05;
          return [x, 0.5 + Math.round(rr() * 6 - 3) * 0.012] as const;
        });
      })
    : [];
  const glowX = (g: number) => (g % 3 === 0 ? 0.72 : g % 3 === 1 ? 0.5 : 0.3);
  const glowTint = (g: number): Rgb => (g % 3 === 0 ? colors.accent : g % 3 === 1 ? colors.violet : colors.branch);

  let quietStars: QuietStar[] = [];

  function buildQuietStars() {
    const rq = seeded(23);
    const wanted = Math.round((W * H) / QUIET_AREA_PER_STAR);
    const count = Math.max(40, Math.min(opts.light ? 150 : 340, wanted));
    quietStars = Array.from({ length: count }, () => {
      const depth = 0.25 + rq() * 0.75;
      const tint = rq();
      const big = rq() < 0.07;
      return {
        x: rq(),
        y: rq(),
        size: big ? 1.3 + rq() * 0.7 : 0.35 + depth * 0.85 * rq() + 0.2,
        alpha: 0.2 + depth * 0.55 * (0.5 + rq() * 0.5),
        depth,
        speed: 0.35 + depth * 0.65,
        phase: rq() * 6.2832,
        twinkle: rq() < 0.35 ? 0.4 + rq() * 0.9 : 0,
        color: rgba(tint < 0.09 ? colors.accent : tint < 0.14 ? colors.branch : tint < 0.18 ? colors.violet : colors.star, 1),
      };
    });
  }

  function size() {
    W = host.clientWidth || window.innerWidth;
    H = host.clientHeight || window.innerHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    g2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!full) buildQuietStars();
  }

  function drawQuiet() {
    g2d.clearRect(0, 0, W, H);
    const lift = pos * H * 0.5;
    for (const st of quietStars) {
      const x = (((st.x * W + drift * st.speed) % W) + W) % W;
      const y = (((st.y * H - lift * st.depth) % H) + H) % H;
      const tw = st.twinkle ? 0.72 + 0.28 * Math.sin(clock * st.twinkle + st.phase) : 1;
      g2d.globalAlpha = st.alpha * tw;
      g2d.fillStyle = st.color;
      if (st.size < 0.8) {
        g2d.fillRect(x, y, st.size * 1.6, st.size * 1.6);
      } else {
        g2d.beginPath();
        g2d.arc(x, y, st.size, 0, 6.2832);
        g2d.fill();
        if (st.size > 1.3) {
          g2d.globalAlpha = st.alpha * tw * 0.16;
          g2d.beginPath();
          g2d.arc(x, y, st.size * 3.2, 0, 6.2832);
          g2d.fill();
        }
      }
    }
    g2d.globalAlpha = 1;
  }

  function drawFull() {
    g2d.clearRect(0, 0, W, H);
    for (let g = 0; g < N; g++) {
      const gy = (g - pos) * H * 0.8 + H * 0.5;
      const gx = W * glowX(g);
      if (gy < -H || gy > 2 * H) continue;
      const rad = Math.min(W, H) * 0.55;
      const tint = glowTint(g);
      const grad = g2d.createRadialGradient(gx, gy, 0, gx, gy, rad);
      grad.addColorStop(0, rgba(tint, 0.2));
      grad.addColorStop(0.45, rgba(tint, 0.06));
      grad.addColorStop(1, rgba(tint, 0));
      g2d.fillStyle = grad;
      g2d.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
    }
    g2d.fillStyle = rgba(colors.star, 1);
    for (const st of fullStars) {
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
    for (let c = 0; c < N; c++) {
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

  const draw = full ? drawFull : drawQuiet;

  function settle(dt: number) {
    pos += (target - pos) * (1 - Math.exp(-dt * 4));
    if (Math.abs(target - pos) < 0.001) pos = target;
  }

  function frame(now: number) {
    raf = 0;
    if (disposed || paused) return;
    const dt = Math.min(0.1, (now - last) / 1000 || 0.016);
    last = now;
    settle(dt);
    if (full || still) {
      draw();
      if (pos !== target) raf = requestAnimationFrame(frame);
      return;
    }
    drift += dt * DRIFT_PX_PER_SEC;
    clock += dt;
    acc += dt;
    if (acc >= 1 / QUIET_FPS) {
      acc = 0;
      draw();
    }
    raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (raf || disposed || paused) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function onResize() {
    size();
    draw();
  }
  function onVisibility() {
    if (document.hidden) {
      paused = true;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      return;
    }
    if (!paused) return;
    paused = false;
    if ((!full && !still) || pos !== target) kick();
  }
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibility);
  size();

  return {
    kind: "canvas2d",
    setProgress(p) {
      target = full ? Math.max(0, Math.min(N - 1, p)) : Math.max(0, p);
      if (reduce) {
        pos = target;
        draw();
      } else kick();
    },
    pulse() {},
    start() {
      paused = document.hidden;
      draw();
      if (!full && !still) kick();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      cv.remove();
    },
  };
}
