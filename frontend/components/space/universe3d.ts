import type * as ThreeNs from "three";
import { GALAXY_COUNT as N, seeded, type SkyColors, type SkyEngine } from "./sky-types";

type Three = typeof ThreeNs;

const CENTERS: [number, number, number][] = [
  [0, 0, 0],
  [46, 8, -70],
  [-40, -10, -145],
  [36, -6, -220],
  [-38, 12, -295],
  [40, 4, -370],
  [0, 0, -445],
];
const SIDE = [1, 0, 0, 0, 1, 0, 0];

const VERT = `
attribute float aSize; attribute float aPhase; attribute vec3 aColor;
uniform float uTime; uniform float uScale; uniform float uMotion; uniform float uPulse;
varying vec3 vColor; varying float vTw;
void main(){
  vColor = aColor;
  vTw = 0.78 + 0.22 * sin(uTime * uMotion * (1.2 + aPhase * 0.8) + aPhase * 40.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float s = aSize * (1.0 + uPulse * 0.8);
  gl_PointSize = clamp(s * uScale / -mv.z, 1.5, 72.0);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
precision highp float;
varying vec3 vColor; varying float vTw; uniform float uPulse; uniform float uAlpha;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = smoothstep(0.45, 0.0, d);
  float glow = exp(-d * d * 4.5) * 0.55;
  float a = (core + glow) * vTw * uAlpha * (1.0 + uPulse * 0.6);
  gl_FragColor = vec4(vColor, a);
}`;

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}

interface Options {
  THREE: Three;
  host: HTMLElement;
  colors: SkyColors;
  reduce: boolean;
  quality: number;
  onLost: () => void;
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export function createUniverse3D(opts: Options): SkyEngine | null {
  const { THREE, host, reduce, quality, onLost } = opts;
  THREE.ColorManagement.enabled = false;

  const accent = new THREE.Color().setRGB(...(opts.colors.accent.map((v) => v / 255) as [number, number, number]));
  const branch = new THREE.Color().setRGB(...(opts.colors.branch.map((v) => v / 255) as [number, number, number]));
  const accentHex = `#${accent.getHexString()}`;
  const PALETTE: [string, string][] = [
    [accentHex, "#6c7cff"],
    ["#ffe9b0", "#7a6cff"],
    ["#b8f3e4", "#4a7cff"],
    ["#f3c8ff", "#6f7cff"],
    [accentHex, `#${branch.getHexString()}`],
    ["#ffe0c0", "#c58bd6"],
    ["#ffffff", accentHex],
  ];

  let renderer: ThreeNs.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 900);
  const common = {
    uTime: { value: 0 },
    uScale: { value: 900 },
    uMotion: { value: reduce ? 0 : 1 },
  };
  const materials: ThreeNs.Material[] = [];
  const disposables: { dispose(): void }[] = [];

  function makeMaterial(alpha: number) {
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: common.uTime,
        uScale: common.uScale,
        uMotion: common.uMotion,
        uPulse: { value: 0 },
        uAlpha: { value: alpha },
      },
    });
    materials.push(m);
    return m;
  }

  function points(pos: Float32Array, col: Float32Array, size: Float32Array, phase: Float32Array, mat: ThreeNs.ShaderMaterial) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    const p = new THREE.Points(g, mat);
    p.frustumCulled = false;
    disposables.push(g);
    return p;
  }

  function lineSegments(verts: number[], mat: ThreeNs.Material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
    disposables.push(g);
    return new THREE.LineSegments(g, mat);
  }

  (function backgroundStars() {
    const n = Math.round(5000 * quality);
    const r = seeded(7);
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const ph = new Float32Array(n);
    const tint = [new THREE.Color("#ffffff"), new THREE.Color("#b9c6ff"), new THREE.Color("#ffe9c4")];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * 220;
      pos[i * 3 + 1] = (r() - 0.5) * 130;
      pos[i * 3 + 2] = 50 - r() * 560;
      const c = tint[Math.floor(r() * 3)];
      col[i * 3] = c.r * 0.8;
      col[i * 3 + 1] = c.g * 0.8;
      col[i * 3 + 2] = c.b * 0.8;
      size[i] = 0.1 + Math.pow(r(), 3) * 0.55;
      ph[i] = r();
    }
    scene.add(points(pos, col, size, ph, makeMaterial(0.9)));
  })();

  interface Galaxy {
    group: ThreeNs.Group;
    disc: ThreeNs.Group;
    starMat: ThreeNs.ShaderMaterial;
    discMat: ThreeNs.ShaderMaterial;
    pulse: number;
  }
  const galaxies: Galaxy[] = [];

  function buildGalaxy(idx: number) {
    const r = seeded(100 + idx * 31);
    const group = new THREE.Group();
    const c = CENTERS[idx];
    group.position.set(c[0], c[1], c[2]);
    const pal = PALETTE[idx];
    const inner = new THREE.Color(pal[0]);
    const outer = new THREE.Color(pal[1]);

    const n = Math.round(4200 * quality);
    const arms = 2 + (idx % 3);
    const R = 17 + (idx % 2) * 3;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const ph = new Float32Array(n);
    const tmp = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const bulge = i < n * 0.18;
      const rad = bulge ? Math.pow(r(), 1.8) * R * 0.28 : Math.pow(r(), 0.65) * R;
      const ang = ((i % arms) / arms) * Math.PI * 2 + rad * 0.34 + (r() - 0.5) * (bulge ? 6.3 : 0.55);
      pos[i * 3] = Math.cos(ang) * rad;
      pos[i * 3 + 1] = (r() - 0.5) * (bulge ? 3 : 0.9) * (1.2 - (rad / R) * 0.6);
      pos[i * 3 + 2] = Math.sin(ang) * rad;
      tmp.copy(inner).lerp(outer, Math.min(1, rad / R));
      const k = bulge ? 0.95 : 0.55 + (1 - rad / R) * 0.4;
      col[i * 3] = tmp.r * k;
      col[i * 3 + 1] = tmp.g * k;
      col[i * 3 + 2] = tmp.b * k;
      size[i] = 0.07 + r() * 0.16;
      ph[i] = r();
    }
    const discMat = makeMaterial(0.55);
    const disc = points(pos, col, size, ph, discMat);
    const discGroup = new THREE.Group();
    discGroup.rotation.set(1.05, 0, 0.25 - idx * 0.07);
    discGroup.add(disc);
    group.add(discGroup);

    const mk = (color: number, opacity: number) => {
      const m = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      disposables.push(m);
      return m;
    };
    const lineMat = mk(0xaab4ff, 0.13);
    const edgeMat = mk(0xeef0ff, 0.5);
    const branchMat = mk(branch.getHex(), 0.5);
    const con = new THREE.Group();
    con.rotation.y = (idx % 2 ? 1 : -1) * 0.38;
    con.rotation.z = (r() - 0.5) * 0.12;
    if (SIDE[idx] === 1) con.position.x = 14;
    else if (idx === 1 || idx === 6) con.position.y = 6;
    const sp = 0.95;
    const half = 26;
    const sv: number[] = [];
    for (let l = 0; l < 5; l++) {
      const y = (l - 2) * sp;
      sv.push(-half, y, 0, half, y, 0);
    }
    con.add(lineSegments(sv, lineMat));

    const mainNodes: number[][] = [];
    let x = -21;
    for (let m = 0; m < 8; m++) {
      x += 4.2 + r() * 1.6;
      mainNodes.push([x - 4, Math.round(r() * 6 - 3) * sp * 0.5, (r() - 0.5) * 2]);
    }
    const ev: number[] = [];
    for (let e = 0; e < mainNodes.length - 1; e++) ev.push(...mainNodes[e], ...mainNodes[e + 1]);
    con.add(lineSegments(ev, edgeMat));
    const fork = mainNodes[3];
    const bn: number[][] = [fork];
    for (let b = 1; b <= 3; b++) bn.push([fork[0] + b * 4.4, fork[1] - 3.2 - (b === 2 ? 0.8 : 0), (r() - 0.5) * 2]);
    const bv: number[] = [];
    for (let q = 0; q < bn.length - 1; q++) bv.push(...bn[q], ...bn[q + 1]);
    con.add(lineSegments(bv, branchMat));

    const all = mainNodes.concat(bn.slice(1));
    const sn = all.length;
    const spos = new Float32Array(sn * 3);
    const scol = new Float32Array(sn * 3);
    const ssz = new Float32Array(sn);
    const sph = new Float32Array(sn);
    const cMain = new THREE.Color("#ffffff");
    const cAcc = new THREE.Color(pal[0]);
    all.forEach((nd, j) => {
      spos.set(nd, j * 3);
      const cc = j >= mainNodes.length ? branch : j % 3 === 0 ? cAcc : cMain;
      scol[j * 3] = cc.r;
      scol[j * 3 + 1] = cc.g;
      scol[j * 3 + 2] = cc.b;
      ssz[j] = 0.9 + r() * 0.7;
      sph[j] = r();
    });
    const starMat = makeMaterial(1);
    con.add(points(spos, scol, ssz, sph, starMat));
    group.add(con);
    scene.add(group);
    galaxies.push({ group, disc: discGroup, starMat, discMat, pulse: 0 });
  }
  for (let gi = 0; gi < N; gi++) buildGalaxy(gi);

  const camPts: ThreeNs.Vector3[] = [];
  const lookPts: ThreeNs.Vector3[] = [];
  for (let s = 0; s < N; s++) {
    const c = CENTERS[s];
    camPts.push(new THREE.Vector3(c[0], c[1] + 1.5, c[2] + 18));
    lookPts.push(new THREE.Vector3(c[0] - SIDE[s] * 7, c[1], c[2]));
  }
  const camCurve = new THREE.CatmullRomCurve3(camPts, false, "catmullrom", 0.5);
  const lookCurve = new THREE.CatmullRomCurve3(lookPts, false, "catmullrom", 0.5);
  const vp = new THREE.Vector3();
  const vl = new THREE.Vector3();

  let target = 0;
  let pos = 0;
  let raf = 0;
  let last = 0;
  let disposed = false;
  let running = false;
  let t0 = 0;

  function place(p: number) {
    const i = Math.min(N - 2, Math.floor(p));
    const u = p - i;
    const t = (i + easeInOut(Math.max(0, Math.min(1, u)))) / (N - 1);
    camCurve.getPoint(Math.min(1, t), vp);
    lookCurve.getPoint(Math.min(1, t), vl);
    camera.position.copy(vp);
    camera.lookAt(vl);
    for (let g = 0; g < N; g++) galaxies[g].group.visible = Math.abs(g - p) < 1.7;
  }

  function size() {
    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    common.uScale.value = (h * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  }

  function draw() {
    place(pos);
    renderer.render(scene, camera);
  }

  function frame(now: number) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    pos += (target - pos) * (1 - Math.exp(-dt * 3.6));
    if (Math.abs(target - pos) < 0.0004) pos = target;
    common.uTime.value = (now - t0) / 1000;
    for (let g = 0; g < N; g++) {
      const gx = galaxies[g];
      gx.disc.rotation.y += dt * 0.035 * (g % 2 ? -1 : 1);
      if (gx.pulse > 0.001) {
        gx.pulse *= Math.exp(-dt * 2.4);
        gx.starMat.uniforms.uPulse.value = gx.pulse;
        gx.discMat.uniforms.uPulse.value = gx.pulse;
      } else if (gx.pulse !== 0) {
        gx.pulse = 0;
        gx.starMat.uniforms.uPulse.value = 0;
        gx.discMat.uniforms.uPulse.value = 0;
      }
    }
    draw();
  }

  function onResize() {
    size();
    draw();
  }
  const lost = (e: Event) => {
    e.preventDefault();
    if (!disposed) {
      api.dispose();
      onLost();
    }
  };
  renderer.domElement.addEventListener("webglcontextlost", lost, false);
  window.addEventListener("resize", onResize);
  size();

  const api: SkyEngine = {
    kind: "webgl",
    setProgress(p) {
      target = Math.max(0, Math.min(N - 1, p));
      if (reduce) {
        pos = target;
        draw();
      }
    },
    pulse(i) {
      if (reduce || !galaxies[i]) return;
      galaxies[i].pulse = 1;
    },
    start() {
      if (running) return;
      running = true;
      t0 = performance.now();
      if (reduce) draw();
      else raf = requestAnimationFrame(frame);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("webglcontextlost", lost, false);
      disposables.forEach((d) => d.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      try {
        renderer.forceContextLoss();
      } catch {
        /* ngữ cảnh đã mất */
      }
      renderer.domElement.remove();
      scene.clear();
    },
  };
  return api;
}
