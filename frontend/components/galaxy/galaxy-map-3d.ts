import type * as ThreeModule from "three";
import { layoutGalaxy, seeded, type GalaxyItem, type LaidOutConstellation } from "./constellation";
import { easeLevels, type GalaxyEngine } from "./galaxy-engine";
import type { GalaxyPalette, Rgb } from "./palette";

type Three = typeof ThreeModule;

const FOV = 40;

const POINT_VERT = `
attribute float aSize; attribute float aPhase; attribute float aLevel;
uniform float uTime; uniform float uPx;
varying float vLevel; varying float vTw;
void main() {
  vLevel = aLevel;
  vTw = 0.8 + 0.2 * sin(uTime * (1.0 + aPhase) + aPhase * 40.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float s = aSize * (1.0 + aLevel * 0.55);
  gl_PointSize = clamp(s * 2.0 * uPx / -mv.z, 2.0, 96.0);
  gl_Position = projectionMatrix * mv;
}`;

const POINT_FRAG = `
precision highp float;
uniform vec3 uStar; uniform vec3 uActive; uniform float uFocus; uniform float uBase;
varying float vLevel; varying float vTw;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = smoothstep(0.4, 0.0, d);
  float glow = exp(-d * d * 4.5) * 0.5;
  float dim = mix(1.0, mix(0.5, 1.0, vLevel), uFocus);
  gl_FragColor = vec4(mix(uStar, uActive, vLevel), (core + glow) * vTw * dim * uBase);
}`;

const LINE_VERT = `
attribute float aLevel; attribute float aKind;
varying float vLevel; varying float vKind;
void main() {
  vLevel = aLevel; vKind = aKind;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const LINE_FRAG = `
precision highp float;
uniform vec3 uLink; uniform vec3 uActive; uniform float uFocus;
varying float vLevel; varying float vKind;
void main() {
  float base = mix(0.16, 0.5, vKind);
  float dim = mix(1.0, mix(0.55, 1.0, vLevel), uFocus);
  gl_FragColor = vec4(mix(uLink, uActive, vLevel * vKind), base * (1.0 + vLevel * 0.9) * dim);
}`;

export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function vec(THREE: Three, rgb: Rgb) {
  return new THREE.Vector3(rgb.r, rgb.g, rgb.b);
}

export function createGalaxy3D(
  THREE: Three,
  host: HTMLElement,
  initial: GalaxyPalette,
  onLost: () => void,
): GalaxyEngine | null {
  let renderer: ThreeModule.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
  } catch {
    return null;
  }
  THREE.ColorManagement.enabled = false;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 40);
  const distance = 1 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  camera.position.set(0, 0, distance);

  const time = { value: 0 };
  const px = { value: 800 };
  const focus = { value: 0 };
  const uniformsFor = (base: number) => ({
    uTime: time,
    uPx: px,
    uFocus: focus,
    uBase: { value: base },
    uStar: { value: vec(THREE, initial.star) },
    uActive: { value: vec(THREE, initial.active) },
    uLink: { value: vec(THREE, initial.link) },
  });
  const starMaterial = new THREE.ShaderMaterial({
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    uniforms: uniformsFor(1),
    transparent: true,
    depthWrite: false,
  });
  const dustMaterial = new THREE.ShaderMaterial({
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    uniforms: { ...uniformsFor(0.5), uFocus: { value: 0 } },
    transparent: true,
    depthWrite: false,
  });
  const lineMaterial = new THREE.ShaderMaterial({
    vertexShader: LINE_VERT,
    fragmentShader: LINE_FRAG,
    uniforms: uniformsFor(1),
    transparent: true,
    depthWrite: false,
  });

  let items: GalaxyItem[] = [];
  let layout: LaidOutConstellation[] = [];
  let levels: number[] = [];
  let targets: number[] = [];
  let activeId: string | null = null;
  let focusTarget = 0;
  let starGroups: number[] = [];
  let lineGroups: number[] = [];
  let starLevel: ThreeModule.BufferAttribute | null = null;
  let lineLevel: ThreeModule.BufferAttribute | null = null;
  let built: ThreeModule.Object3D[] = [];
  let aspect = 1;
  let raf = 0;
  let last = 0;
  let t0 = performance.now();
  let disposed = false;
  let visible = true;
  const sway = { x: 0, y: 0 };
  const swayTarget = { x: 0, y: 0 };

  function clearBuilt() {
    built.forEach((object) => {
      scene.remove(object);
      (object as ThreeModule.Points).geometry.dispose();
    });
    built = [];
  }

  function rebuild() {
    clearBuilt();
    layout = layoutGalaxy(items, aspect);
    levels = layout.map((_, i) => levels[i] ?? 0);
    targets = layout.map((c) => (c.id === activeId ? 1 : 0));
    focusTarget = targets.includes(1) ? 1 : 0;
    focus.value = focusTarget;

    const starCount = layout.reduce((n, c) => n + c.stars.length, 0);
    const sPos = new Float32Array(starCount * 3);
    const sSize = new Float32Array(starCount);
    const sPhase = new Float32Array(starCount);
    starGroups = [];
    let si = 0;
    const lPos: number[] = [];
    const lKind: number[] = [];
    lineGroups = [];
    layout.forEach((con, g) => {
      con.stars.forEach((star) => {
        sPos.set([star.x, star.y, star.z], si * 3);
        sSize[si] = star.size * 4.2;
        sPhase[si] = star.phase;
        starGroups.push(g);
        si++;
      });
      con.staffY.forEach((y) => {
        lPos.push(con.cx - con.staffHalf, y, 0, con.cx + con.staffHalf, y, 0);
        lKind.push(0, 0);
        lineGroups.push(g, g);
      });
      con.links.forEach(([a, b]) => {
        const from = con.stars[a];
        const to = con.stars[b];
        lPos.push(from.x, from.y, from.z, to.x, to.y, to.z);
        lKind.push(1, 1);
        lineGroups.push(g, g);
      });
    });

    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
    starGeometry.setAttribute("aSize", new THREE.BufferAttribute(sSize, 1));
    starGeometry.setAttribute("aPhase", new THREE.BufferAttribute(sPhase, 1));
    starLevel = new THREE.BufferAttribute(new Float32Array(starCount), 1);
    starLevel.setUsage(THREE.DynamicDrawUsage);
    starGeometry.setAttribute("aLevel", starLevel);

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(lPos), 3));
    lineGeometry.setAttribute("aKind", new THREE.BufferAttribute(new Float32Array(lKind), 1));
    lineLevel = new THREE.BufferAttribute(new Float32Array(lineGroups.length), 1);
    lineLevel.setUsage(THREE.DynamicDrawUsage);
    lineGeometry.setAttribute("aLevel", lineLevel);

    const rand = seeded(7);
    const dustCount = 420;
    const dPos = new Float32Array(dustCount * 3);
    const dSize = new Float32Array(dustCount);
    const dPhase = new Float32Array(dustCount);
    for (let i = 0; i < dustCount; i++) {
      dPos.set([(rand() * 2 - 1) * aspect * 1.15, rand() * 2.3 - 1.15, -0.2 - rand() * 1.4], i * 3);
      dSize[i] = 0.004 + rand() * rand() * 0.012;
      dPhase[i] = rand();
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute("position", new THREE.BufferAttribute(dPos, 3));
    dustGeometry.setAttribute("aSize", new THREE.BufferAttribute(dSize, 1));
    dustGeometry.setAttribute("aPhase", new THREE.BufferAttribute(dPhase, 1));
    dustGeometry.setAttribute("aLevel", new THREE.BufferAttribute(new Float32Array(dustCount), 1));

    const dust = new THREE.Points(dustGeometry, dustMaterial);
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    const stars = new THREE.Points(starGeometry, starMaterial);
    [dust, lines, stars].forEach((object) => {
      object.frustumCulled = false;
      scene.add(object);
    });
    built = [dust, lines, stars];
    writeLevels();
  }

  function writeLevels() {
    if (starLevel) {
      starGroups.forEach((g, i) => starLevel!.setX(i, levels[g] ?? 0));
      starLevel.needsUpdate = true;
    }
    if (lineLevel) {
      lineGroups.forEach((g, i) => lineLevel!.setX(i, levels[g] ?? 0));
      lineLevel.needsUpdate = true;
    }
  }

  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    px.value = (h * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    if (Math.abs(w / h - aspect) > 0.01) {
      aspect = w / h;
      rebuild();
    }
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    if (disposed || !visible) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    time.value = (now - t0) / 1000;
    if (easeLevels(levels, targets, dt)) writeLevels();
    focus.value += (focusTarget - focus.value) * (1 - Math.exp(-dt * 5));
    const k = 1 - Math.exp(-dt * 2.2);
    const active = layout.findIndex((c) => c.id === activeId);
    swayTarget.x = Math.sin(time.value * 0.15) * 0.03 + (active >= 0 ? layout[active].cx * 0.06 : 0);
    swayTarget.y = Math.cos(time.value * 0.11) * 0.02 + (active >= 0 ? layout[active].cy * 0.06 : 0);
    sway.x += (swayTarget.x - sway.x) * k;
    sway.y += (swayTarget.y - sway.y) * k;
    camera.position.set(sway.x, sway.y, distance);
    camera.lookAt(sway.x * 0.4, sway.y * 0.4, 0);
    renderer.render(scene, camera);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && !document.hidden;
  });
  intersection.observe(host);
  const onVisibility = () => {
    visible = !document.hidden;
  };
  document.addEventListener("visibilitychange", onVisibility);

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    observer.disconnect();
    intersection.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
    clearBuilt();
    starMaterial.dispose();
    dustMaterial.dispose();
    lineMaterial.dispose();
    renderer.dispose();
    try {
      renderer.forceContextLoss();
    } catch {
      /* context already gone */
    }
    renderer.domElement.remove();
  };
  function onContextLost(event: Event) {
    event.preventDefault();
    dispose();
    onLost();
  }
  renderer.domElement.addEventListener("webglcontextlost", onContextLost, false);

  resize();
  t0 = performance.now();
  raf = requestAnimationFrame(frame);

  return {
    setItems(next) {
      items = next;
      rebuild();
    },
    setActive(id) {
      activeId = id;
      targets = layout.map((c) => (c.id === id ? 1 : 0));
      focusTarget = targets.includes(1) ? 1 : 0;
    },
    setPalette(palette) {
      for (const material of [starMaterial, dustMaterial, lineMaterial]) {
        material.uniforms.uStar.value = vec(THREE, palette.star);
        material.uniforms.uActive.value = vec(THREE, palette.active);
        material.uniforms.uLink.value = vec(THREE, palette.link);
      }
    },
    dispose,
  };
}
