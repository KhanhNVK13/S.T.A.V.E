/* WebGL "staff universe": 7 galaxies along a flight path. Each galaxy is a spiral of
   point-sprite dust plus a constellation of commit stars joined by thin staff lines.
   Bloom is faked with a soft additive sprite (core + glow) in the fragment shader. */
(function () {
  "use strict";

  var N = 7;
  var CENTERS = [[0, 0, 0], [46, 8, -70], [-40, -10, -145], [36, -6, -220], [-38, 12, -295], [40, 4, -370], [0, 0, -445]];
  // +1: galaxy sits on the right of the screen (copy on the left), -1 left, 0 centred
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

  function create(opts) {
    var THREE = window.THREE;
    var host = opts.host;
    var reduce = !!opts.reduce;
    var quality = opts.quality || 1;
    var onLost = opts.onLost || function () {};
    THREE.ColorManagement.enabled = false; // keep raw sRGB values in the custom shader

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" });
    } catch (e) { return null; }
    var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(50, 1, 0.1, 900);
    var common = { uTime: { value: 0 }, uScale: { value: 900 }, uMotion: { value: reduce ? 0 : 1 } };
    var materials = [];
    var disposables = [];

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

    // distant background stars scattered along the whole flight path
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

    var galaxies = [];

    function buildGalaxy(idx) {
      var r = seeded(100 + idx * 31);
      var group = new THREE.Group();
      var c = CENTERS[idx];
      group.position.set(c[0], c[1], c[2]);
      var pal = PALETTE[idx];
      var inner = new THREE.Color(pal[0]), outer = new THREE.Color(pal[1]);

      // spiral dust, tilted disc, rotates slowly
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

      // staff constellation: 5 thin lines plus commit stars on them, joined like a melody
      var lineMat = new THREE.LineBasicMaterial({ color: 0xaab4ff, transparent: true, opacity: 0.13, depthWrite: false, blending: THREE.AdditiveBlending });
      var edgeMat = new THREE.LineBasicMaterial({ color: 0xeef0ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
      var branchMat = new THREE.LineBasicMaterial({ color: 0x4fd6c4, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
      disposables.push(lineMat, edgeMat, branchMat);
      var con = new THREE.Group();
      con.rotation.y = (idx % 2 ? 1 : -1) * 0.38;
      con.rotation.z = (r() - 0.5) * 0.12;
      // keep the constellation clear of the copy: push it right when copy is on the left,
      // and up out of the text band when the block is centred
      if (SIDE[idx] === 1) con.position.x = 14;
      else if (idx === 1 || idx === 6) con.position.y = 6;
      var sp = 0.95, half = 26;
      var sv = [];
      for (var l = 0; l < 5; l++) { var y = (l - 2) * sp; sv.push(-half, y, 0, half, y, 0); }
      var sg = new THREE.BufferGeometry();
      sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(sv), 3));
      disposables.push(sg);
      con.add(new THREE.LineSegments(sg, lineMat));

      var mainNodes = [], x = -21;
      for (var m = 0; m < 8; m++) {
        x += 4.2 + r() * 1.6;
        mainNodes.push([x - 4, Math.round((r() * 6 - 3)) * sp * 0.5, (r() - 0.5) * 2]);
      }
      var ev = [];
      for (var e = 0; e < mainNodes.length - 1; e++) ev.push.apply(ev, mainNodes[e].concat(mainNodes[e + 1]));
      var eg = new THREE.BufferGeometry();
      eg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ev), 3));
      disposables.push(eg);
      con.add(new THREE.LineSegments(eg, edgeMat));
      // one branch forking off the 4th star
      var fork = mainNodes[3], bn = [fork];
      for (var b = 1; b <= 3; b++) bn.push([fork[0] + b * 4.4, fork[1] - 3.2 - (b === 2 ? 0.8 : 0), (r() - 0.5) * 2]);
      var bv = [];
      for (var q = 0; q < bn.length - 1; q++) bv.push.apply(bv, bn[q].concat(bn[q + 1]));
      var bg = new THREE.BufferGeometry();
      bg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(bv), 3));
      disposables.push(bg);
      con.add(new THREE.LineSegments(bg, branchMat));

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

    // camera path: Catmull-Rom through the 7 vantage points, same for the look-at targets
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

    var target = 0, pos = 0, raf = 0, last = 0, disposed = false, running = false, t0 = 0;

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
      var w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      common.uScale.value = (h * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    }

    function draw() {
      place(pos);
      renderer.render(scene, camera);
    }

    function frame(now) {
      if (disposed) return;
      raf = requestAnimationFrame(frame);
      var dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      pos += (target - pos) * (1 - Math.exp(-dt * 3.6)); // glide: critically damped follow
      if (Math.abs(target - pos) < 0.0004) pos = target;
      common.uTime.value = (now - t0) / 1000;
      for (var g = 0; g < N; g++) galaxies[g].disc.rotation.y += dt * 0.035 * (g % 2 ? -1 : 1);
      draw();
    }

    function onResize() { size(); draw(); }
    function lost(e) { e.preventDefault(); if (!disposed) { api.dispose(); onLost(); } }
    renderer.domElement.addEventListener("webglcontextlost", lost, false);
    window.addEventListener("resize", onResize);
    size();

    var api = {
      kind: "webgl",
      setProgress: function (p) { target = Math.max(0, Math.min(N - 1, p)); if (reduce) { pos = target; draw(); } },
      pulse: function (i) {
        var gx = galaxies[i];
        if (!gx || !window.gsap || reduce) return;
        window.gsap.fromTo([gx.starMat.uniforms.uPulse, gx.mat.uniforms.uPulse], { value: 1 }, { value: 0, duration: 1.1, ease: "power2.out", overwrite: true });
      },
      start: function () {
        if (running) return;
        running = true;
        t0 = performance.now();
        if (reduce) draw(); else raf = requestAnimationFrame(frame);
      },
      stats: function () { return { calls: renderer.info.render.calls, points: renderer.info.render.points }; },
      dispose: function () {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
        renderer.domElement.removeEventListener("webglcontextlost", lost, false);
        disposables.forEach(function (d) { d.dispose(); });
        materials.forEach(function (m) { m.dispose(); });
        renderer.dispose();
        try { renderer.forceContextLoss(); } catch (e) { /* already gone */ }
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        scene.clear();
      }
    };
    return api;
  }

  window.Universe3D = { create: create, webglAvailable: webglAvailable };
})();
