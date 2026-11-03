/* Star background for every page: <canvas class="sky" data-sky="quiet|full" aria-hidden="true">.
   "full"  : three.js flight through seven galaxies (wide screens with WebGL), otherwise a flat Canvas 2D version.
   "quiet" : a few slow stars on Canvas 2D, paused while the tab is hidden.
   Reduced motion renders still frames. Public API for scroll-driven pages: window.StaveSky. */
(function () {
  "use strict";

  var THREE_SRC = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js";
  var N = 7;
  var script = document.currentScript;
  var base = script && script.src ? script.src.replace(/[^\/]*$/, "") : "assets/";
  var qs = new URLSearchParams(location.search);

  function seeded(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function webglAvailable() {
    try {
      var c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
    } catch (e) { return false; }
  }

  function ensureStyles() {
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) if (/universe\.css(\?|$)/.test(links[i].getAttribute("href") || "")) return;
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = base + "universe.css";
    document.head.appendChild(l);
  }

  function freshCanvas(old) {
    var c = document.createElement("canvas");
    c.className = old.className;
    c.setAttribute("aria-hidden", "true");
    c.setAttribute("data-sky", old.getAttribute("data-sky") || "quiet");
    old.parentNode.replaceChild(c, old);
    return c;
  }

  /* ---------- Canvas 2D: quiet drift, or flat scroll-driven version of the full sky ---------- */
  var TINT = ["#dceeb1", "#ffe9b0", "#b8f3e4", "#f3c8ff", "#dceeb1", "#ffe0c0", "#ffffff"];

  function create2D(cv, o) {
    var ctx = cv.getContext("2d");
    if (!ctx) return null;
    var full = !!o.full, reduce = !!o.reduce, light = !!o.light;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, target = 0, pos = 0, raf = 0, last = 0, disposed = false, paused = false, drift = 0, acc = 0;
    var r = seeded(full ? 11 : 23);
    var count = full ? (light ? 140 : 260) : (light ? 36 : 64);
    var stars = [], i;
    for (i = 0; i < count; i++) {
      stars.push(full
        ? { x: r(), y: r() * N, d: 0.15 + r() * 0.85, s: 0.4 + r() * 1.3, a: 0.35 + r() * 0.65 }
        : { x: r(), y: r(), s: 0.5 + r() * 1.1, a: 0.18 + r() * 0.42, v: 0.4 + r() * 0.6, lime: r() < 0.08 });
    }
    var cons = [];
    if (full) {
      for (var s = 0; s < N; s++) {
        var rr = seeded(50 + s), nodes = [], x = (s === 0 || s === 4) ? 0.5 : 0.12;
        for (var j = 0; j < 7; j++) { x += 0.08 + rr() * 0.05; nodes.push([x, 0.5 + (Math.round(rr() * 6 - 3) * 0.012)]); }
        cons.push(nodes);
      }
    }

    function size() {
      W = cv.clientWidth || window.innerWidth; H = cv.clientHeight || window.innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawFull() {
      ctx.clearRect(0, 0, W, H);
      var g, gy, gx, rad, grad;
      for (g = 0; g < N; g++) {
        gy = (g - pos) * H * 0.8 + H * 0.5; gx = W * (g % 3 === 0 ? 0.72 : g % 3 === 1 ? 0.5 : 0.3);
        if (gy < -H || gy > 2 * H) continue;
        rad = Math.min(W, H) * 0.55;
        grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, rad);
        grad.addColorStop(0, TINT[g] + "55"); grad.addColorStop(0.45, "#6c7cff22"); grad.addColorStop(1, "#04050d00");
        ctx.fillStyle = grad; ctx.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
      }
      ctx.fillStyle = "#eef0ff";
      for (var k = 0; k < stars.length; k++) {
        var st = stars[k], span = H * N * st.d;
        var yy = ((((st.y - pos) * H * st.d) % span) + span) % span;
        if (yy > H) continue;
        ctx.globalAlpha = st.a;
        ctx.beginPath(); ctx.arc(st.x * W, yy, st.s, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (var c = 0; c < N; c++) {
        var cy = (c - pos) * H + H * 0.5;
        if (cy < -H * 0.5 || cy > H * 1.5) continue;
        ctx.strokeStyle = "rgba(238,240,255,.14)"; ctx.lineWidth = 1;
        for (var l = -2; l <= 2; l++) { ctx.beginPath(); ctx.moveTo(W * 0.05, cy + l * 9); ctx.lineTo(W * 0.95, cy + l * 9); ctx.stroke(); }
        var nd = cons[c];
        ctx.strokeStyle = "rgba(238,240,255,.6)"; ctx.lineWidth = 1.4; ctx.beginPath();
        nd.forEach(function (p, q) { var px = p[0] * W, py = cy + (p[1] - 0.5) * H * 4; if (q) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
        ctx.stroke();
        nd.forEach(function (p, q) {
          var px = p[0] * W, py = cy + (p[1] - 0.5) * H * 4, rg = ctx.createRadialGradient(px, py, 0, px, py, 16);
          rg.addColorStop(0, q % 3 === 0 ? "#dceeb1" : "#ffffff"); rg.addColorStop(0.25, "#dceeb188"); rg.addColorStop(1, "#dceeb100");
          ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(px, py, 16, 0, 6.2832); ctx.fill();
        });
      }
    }

    function drawQuiet() {
      ctx.clearRect(0, 0, W, H);
      for (var k = 0; k < stars.length; k++) {
        var st = stars[k];
        var x = (((st.x * W + drift * st.v) % W) + W) % W;
        ctx.globalAlpha = st.a;
        ctx.fillStyle = st.lime ? "#dceeb1" : "#eef0ff";
        ctx.beginPath(); ctx.arc(x, st.y * H, st.s, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    var draw = full ? drawFull : drawQuiet;

    function frame(now) {
      raf = 0;
      if (disposed || paused) return;
      var dt = Math.min(0.1, (now - last) / 1000 || 0.016); last = now;
      if (full) {
        pos += (target - pos) * (1 - Math.exp(-dt * 4));
        if (Math.abs(target - pos) < 0.001) pos = target;
        draw();
        if (pos !== target) raf = requestAnimationFrame(frame);
      } else {
        acc += dt;
        drift += dt * 3;
        if (acc >= 1 / 24) { acc = 0; draw(); }
        raf = requestAnimationFrame(frame);
      }
    }
    function kick() { if (!raf && !disposed && !paused) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    function onResize() { size(); draw(); }
    window.addEventListener("resize", onResize);
    size();

    return {
      kind: "canvas2d",
      setProgress: function (p) {
        if (!full) return;
        target = Math.max(0, Math.min(N - 1, p));
        if (reduce) { pos = target; draw(); } else kick();
      },
      pulse: function () {},
      start: function () { draw(); if (!full && !reduce) kick(); },
      pause: function () { paused = true; if (raf) { cancelAnimationFrame(raf); raf = 0; } },
      resume: function () { if (!paused) return; paused = false; if (!full && !reduce) kick(); else if (pos !== target) kick(); },
      dispose: function () {
        disposed = true; cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
      }
    };
  }

  /* ---------- three.js: seven galaxies along a flight path ---------- */
  var CENTERS = [[0, 0, 0], [46, 8, -70], [-40, -10, -145], [36, -6, -220], [-38, 12, -295], [40, 4, -370], [0, 0, -445]];
  var SIDE = [1, 0, 0, 0, 1, 0, 0];
  var PALETTE = [
    ["#dceeb1", "#6c7cff"], ["#ffe9b0", "#7a6cff"], ["#b8f3e4", "#4a7cff"], ["#f3c8ff", "#6f7cff"],
    ["#dceeb1", "#4fd6c4"], ["#ffe0c0", "#c58bd6"], ["#ffffff", "#dceeb1"]
  ];
  var VERT = [
    "attribute float aSize; attribute float aPhase; attribute vec3 aColor;",
    "uniform float uTime; uniform float uScale; uniform float uMotion; uniform float uPulse;",
    "varying vec3 vColor; varying float vTw;",
    "void main(){",
    "  vColor = aColor;",
    "  vTw = 0.78 + 0.22 * sin(uTime * uMotion * (1.2 + aPhase * 0.8) + aPhase * 40.0);",
    "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
    "  float s = aSize * (1.0 + uPulse * 0.8);",
    "  gl_PointSize = clamp(s * uScale / -mv.z, 1.5, 72.0);",
    "  gl_Position = projectionMatrix * mv;",
    "}"
  ].join("\n");
  var FRAG = [
    "precision highp float;",
    "varying vec3 vColor; varying float vTw; uniform float uPulse; uniform float uAlpha;",
    "void main(){",
    "  float d = length(gl_PointCoord - 0.5) * 2.0;",
    "  if (d > 1.0) discard;",
    "  float core = smoothstep(0.45, 0.0, d);",
    "  float glow = exp(-d * d * 4.5) * 0.55;",
    "  float a = (core + glow) * vTw * uAlpha * (1.0 + uPulse * 0.6);",
    "  gl_FragColor = vec4(vColor, a);",
    "}"
  ].join("\n");

  function create3D(cv, o) {
    var THREE = window.THREE;
    var reduce = !!o.reduce, quality = o.quality || 1, onLost = o.onLost || function () {};
    THREE.ColorManagement.enabled = false;

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, alpha: true, powerPreference: "high-performance" });
    } catch (e) { return null; }
    var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 900);
    var common = { uTime: { value: 0 }, uScale: { value: 900 }, uMotion: { value: reduce ? 0 : 1 } };
    var materials = [], disposables = [], galaxies = [];

    function makeMaterial(alpha) {
      var m = new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime: common.uTime, uScale: common.uScale, uMotion: common.uMotion, uPulse: { value: 0 }, uAlpha: { value: alpha } }
      });
      materials.push(m);
      return m;
    }
    function points(pos, col, size, phase, mat) {
      var g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
      g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
      g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
      var p = new THREE.Points(g, mat);
      p.frustumCulled = false;
      disposables.push(g);
      return p;
    }

    (function () {
      var n = Math.round(5000 * quality), r = seeded(7);
      var pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), ph = new Float32Array(n);
      var tint = [new THREE.Color("#ffffff"), new THREE.Color("#b9c6ff"), new THREE.Color("#ffe9c4")];
      for (var i = 0; i < n; i++) {
        pos[i * 3] = (r() - 0.5) * 220; pos[i * 3 + 1] = (r() - 0.5) * 130; pos[i * 3 + 2] = 50 - r() * 560;
        var c = tint[Math.floor(r() * 3)];
        col[i * 3] = c.r * 0.8; col[i * 3 + 1] = c.g * 0.8; col[i * 3 + 2] = c.b * 0.8;
        size[i] = 0.1 + Math.pow(r(), 3) * 0.55; ph[i] = r();
      }
      scene.add(points(pos, col, size, ph, makeMaterial(0.9)));
    })();

    function buildGalaxy(idx) {
      var r = seeded(100 + idx * 31);
      var group = new THREE.Group();
      var c = CENTERS[idx];
      group.position.set(c[0], c[1], c[2]);
      var pal = PALETTE[idx];
      var inner = new THREE.Color(pal[0]), outer = new THREE.Color(pal[1]);

      var n = Math.round(4200 * quality), arms = 2 + (idx % 3), R = 17 + (idx % 2) * 3;
      var pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), ph = new Float32Array(n);
      var tmp = new THREE.Color();
      for (var i = 0; i < n; i++) {
        var bulge = i < n * 0.18;
        var rad = bulge ? Math.pow(r(), 1.8) * R * 0.28 : Math.pow(r(), 0.65) * R;
        var ang = (i % arms) / arms * Math.PI * 2 + rad * 0.34 + (r() - 0.5) * (bulge ? 6.3 : 0.55);
        pos[i * 3] = Math.cos(ang) * rad;
        pos[i * 3 + 1] = (r() - 0.5) * (bulge ? 3 : 0.9) * (1.2 - rad / R * 0.6);
        pos[i * 3 + 2] = Math.sin(ang) * rad;
        tmp.copy(inner).lerp(outer, Math.min(1, rad / R));
        var k = bulge ? 0.95 : 0.55 + (1 - rad / R) * 0.4;
        col[i * 3] = tmp.r * k; col[i * 3 + 1] = tmp.g * k; col[i * 3 + 2] = tmp.b * k;
        size[i] = 0.07 + r() * 0.16; ph[i] = r();
      }
      var disc = points(pos, col, size, ph, makeMaterial(0.55));
      var discGroup = new THREE.Group();
      discGroup.rotation.set(1.05, 0, 0.25 - idx * 0.07);
      discGroup.add(disc);
      group.add(discGroup);

      var lineMat = new THREE.LineBasicMaterial({ color: 0xaab4ff, transparent: true, opacity: 0.13, depthWrite: false, blending: THREE.AdditiveBlending });
      var edgeMat = new THREE.LineBasicMaterial({ color: 0xeef0ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
      var branchMat = new THREE.LineBasicMaterial({ color: 0x4fd6c4, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
      materials.push(lineMat, edgeMat, branchMat);
      var con = new THREE.Group();
      con.rotation.y = (idx % 2 ? 1 : -1) * 0.38;
      con.rotation.z = (r() - 0.5) * 0.12;
      if (SIDE[idx] === 1) con.position.x = 14;
      else if (idx === 1 || idx === 6) con.position.y = 6;
      var sp = 0.95, half = 26;
      var sv = [];
      for (var l = 0; l < 5; l++) { var y = (l - 2) * sp; sv.push(-half, y, 0, half, y, 0); }
      function lines(arr, mat) {
        var g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(arr), 3));
        disposables.push(g);
        con.add(new THREE.LineSegments(g, mat));
      }
      lines(sv, lineMat);

      var mainNodes = [], x = -21;
      for (var m = 0; m < 8; m++) {
        x += 4.2 + r() * 1.6;
        mainNodes.push([x - 4, Math.round((r() * 6 - 3)) * sp * 0.5, (r() - 0.5) * 2]);
      }
      var ev = [];
      for (var e = 0; e < mainNodes.length - 1; e++) ev.push.apply(ev, mainNodes[e].concat(mainNodes[e + 1]));
      lines(ev, edgeMat);
      var fork = mainNodes[3], bn = [fork];
      for (var b = 1; b <= 3; b++) bn.push([fork[0] + b * 4.4, fork[1] - 3.2 - (b === 2 ? 0.8 : 0), (r() - 0.5) * 2]);
      var bv = [];
      for (var q = 0; q < bn.length - 1; q++) bv.push.apply(bv, bn[q].concat(bn[q + 1]));
      lines(bv, branchMat);

      var all = mainNodes.concat(bn.slice(1));
      var sn = all.length;
      var spos = new Float32Array(sn * 3), scol = new Float32Array(sn * 3), ssz = new Float32Array(sn), sph = new Float32Array(sn);
      var cMain = new THREE.Color("#ffffff"), cLime = new THREE.Color(pal[0]), cTeal = new THREE.Color("#4fd6c4");
      all.forEach(function (nd, j) {
        spos[j * 3] = nd[0]; spos[j * 3 + 1] = nd[1]; spos[j * 3 + 2] = nd[2];
        var cc = j >= mainNodes.length ? cTeal : (j % 3 === 0 ? cLime : cMain);
        scol[j * 3] = cc.r; scol[j * 3 + 1] = cc.g; scol[j * 3 + 2] = cc.b;
        ssz[j] = 0.9 + r() * 0.7; sph[j] = r();
      });
      var starMat = makeMaterial(1);
      con.add(points(spos, scol, ssz, sph, starMat));
      group.add(con);

      scene.add(group);
      galaxies.push({ group: group, disc: discGroup, starMat: starMat, mat: disc.material });
    }
    for (var gi = 0; gi < N; gi++) buildGalaxy(gi);

    var camPts = [], lookPts = [];
    for (var s = 0; s < N; s++) {
      var c = CENTERS[s];
      camPts.push(new THREE.Vector3(c[0], c[1] + 1.5, c[2] + 18));
      lookPts.push(new THREE.Vector3(c[0] - SIDE[s] * 7, c[1], c[2]));
    }
    var camCurve = new THREE.CatmullRomCurve3(camPts, false, "catmullrom", 0.5);
    var lookCurve = new THREE.CatmullRomCurve3(lookPts, false, "catmullrom", 0.5);
    var ease = window.gsap ? window.gsap.parseEase("power2.inOut") : function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
    var vp = new THREE.Vector3(), vl = new THREE.Vector3();
    var target = 0, pos = 0, raf = 0, last = 0, disposed = false, running = false, paused = false, t0 = 0;

    function place(p) {
      var i = Math.min(N - 2, Math.floor(p)), u = p - i;
      var t = (i + ease(Math.max(0, Math.min(1, u)))) / (N - 1);
      camCurve.getPoint(Math.min(1, t), vp);
      lookCurve.getPoint(Math.min(1, t), vl);
      camera.position.copy(vp);
      camera.lookAt(vl);
      for (var g = 0; g < N; g++) galaxies[g].group.visible = Math.abs(g - p) < 1.7;
    }
    function size() {
      var w = cv.clientWidth || window.innerWidth, h = cv.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      common.uScale.value = (h * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    }
    function draw() { place(pos); renderer.render(scene, camera); }
    function frame(now) {
      if (disposed || paused) { raf = 0; return; }
      raf = requestAnimationFrame(frame);
      var dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      pos += (target - pos) * (1 - Math.exp(-dt * 3.6));
      if (Math.abs(target - pos) < 0.0004) pos = target;
      common.uTime.value = (now - t0) / 1000;
      for (var g = 0; g < N; g++) galaxies[g].disc.rotation.y += dt * 0.035 * (g % 2 ? -1 : 1);
      draw();
    }
    function onResize() { size(); draw(); }
    function lost(e) { e.preventDefault(); if (!disposed) { api.dispose(); onLost(); } }
    cv.addEventListener("webglcontextlost", lost, false);
    window.addEventListener("resize", onResize);
    size();

    var api = {
      kind: "webgl",
      setProgress: function (p) { target = Math.max(0, Math.min(N - 1, p)); if (reduce) { pos = target; draw(); } },
      pulse: function (i) {
        var gx = galaxies[Math.round(i)];
        if (!gx || !window.gsap || reduce) return;
        window.gsap.fromTo([gx.starMat.uniforms.uPulse, gx.mat.uniforms.uPulse], { value: 1 }, { value: 0, duration: 1.1, ease: "power2.out", overwrite: true });
      },
      start: function () {
        if (running) return;
        running = true;
        t0 = performance.now();
        if (reduce) draw(); else raf = requestAnimationFrame(function (t) { last = t; frame(t); });
      },
      pause: function () { paused = true; if (raf) { cancelAnimationFrame(raf); raf = 0; } },
      resume: function () {
        if (!paused) return;
        paused = false;
        if (running && !reduce && !raf) raf = requestAnimationFrame(function (t) { last = t; frame(t); });
      },
      dispose: function () {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
        cv.removeEventListener("webglcontextlost", lost, false);
        disposables.forEach(function (d) { d.dispose(); });
        materials.forEach(function (m) { m.dispose(); });
        renderer.dispose();
        try { renderer.forceContextLoss(); } catch (e) { /* context already gone */ }
        scene.clear();
      }
    };
    return api;
  }

  /* ---------- mount ---------- */
  var canvas = null, engine = null, progress = 0, mounted = false;

  function loadThree(done) {
    if (window.THREE) { done(true); return; }
    var s = document.createElement("script");
    s.src = THREE_SRC;
    s.crossOrigin = "anonymous";
    s.onload = function () { done(!!window.THREE); };
    s.onerror = function () { done(false); };
    document.head.appendChild(s);
  }

  function useEngine(e) {
    engine = e;
    if (!e) return;
    document.documentElement.setAttribute("data-sky", e.kind);
    e.start();
    e.setProgress(progress);
    if (document.hidden) e.pause();
  }

  function fallback2D(full) {
    if (engine) engine.dispose();
    canvas = freshCanvas(canvas);
    var narrow = window.innerWidth < 900;
    useEngine(create2D(canvas, { full: full, reduce: reduceMotion(), light: narrow || lowCpu() }));
  }

  function reduceMotion() { return window.matchMedia("(prefers-reduced-motion: reduce)").matches || qs.get("motion") === "off"; }
  function lowCpu() { return (navigator.hardwareConcurrency || 8) <= 2; }

  function mount() {
    canvas = document.querySelector("canvas.sky");
    if (!canvas || mounted) return;
    mounted = true;
    ensureStyles();
    var full = canvas.getAttribute("data-sky") === "full";
    var reduce = reduceMotion();
    var narrow = window.innerWidth < 900;
    var mode = qs.get("mode");
    var want3d = full && (mode === "3d" || (mode !== "2d" && !narrow && webglAvailable()));
    if (want3d) {
      var token = canvas;
      loadThree(function (ok) {
        if (token !== canvas || !mounted) return;
        var e = ok ? create3D(canvas, {
          reduce: reduce,
          quality: qs.get("q") === "low" || lowCpu() ? 0.45 : 1,
          onLost: function () { fallback2D(true); }
        }) : null;
        if (e) useEngine(e); else fallback2D(true);
      });
    } else {
      useEngine(create2D(canvas, { full: full, reduce: reduce, light: narrow || lowCpu() }));
    }
  }

  function unmount() {
    if (engine) engine.dispose();
    engine = null; mounted = false;
  }

  window.StaveSky = {
    get kind() { return engine ? engine.kind : "pending"; },
    setProgress: function (p) { progress = p; if (engine) engine.setProgress(p); },
    pulse: function (i) { if (engine) engine.pulse(i); },
    stats: function () { return { kind: engine ? engine.kind : "pending" }; },
    dispose: unmount
  };

  document.addEventListener("visibilitychange", function () {
    if (!engine) return;
    if (document.hidden) engine.pause(); else engine.resume();
  });
  window.addEventListener("pagehide", unmount);
  window.addEventListener("pageshow", function (e) {
    if (e.persisted && !mounted) {
      var old = document.querySelector("canvas.sky");
      if (old) { canvas = freshCanvas(old); }
      mount();
    }
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
