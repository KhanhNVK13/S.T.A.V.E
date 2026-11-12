/* WebGL2 liquid background. Fragment shader is GLSL ES 3.00 (#version 300 es).
   No three.js: one full-screen triangle, so there is no tone mapping / colour-space pipeline to configure.
   The shader writes display-referred (sRGB) values directly and caps their luminance so white text stays >= 4.5:1. */
(function () {
  var VERT = "#version 300 es\n" +
    "void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }";

  var FRAG = "#version 300 es\n" +
    "precision highp float;\n" +
    "uniform vec2 uRes; uniform float uTime; uniform vec2 uPtr; uniform vec2 uVel; uniform float uScroll; uniform float uLevel;\n" +
    "uniform vec3 uCol[4]; uniform vec3 uPtrCol;\n" +
    "out vec4 outColor;\n" +
    "float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }\n" +
    "float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);\n" +
    "  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }\n" +
    "float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * noise(p); p = p * 2.02 + vec2(17.1, 9.2); a *= 0.5; } return v; }\n" +
    "void main(){\n" +
    "  float m = min(uRes.x, uRes.y);\n" +
    "  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / m;\n" +
    "  vec2 pp = (uPtr * uRes - 0.5 * uRes) / m;\n" +
    "  float t = uTime * 0.06;\n" +
    "  vec2 flow = vec2(0.0, uScroll * 2.4);\n" +
    "  vec2 d = p - pp; float fall = exp(-dot(d, d) * 7.0);\n" +
    "  vec2 swirl = vec2(-d.y, d.x) * fall * 1.4 + uVel * fall * 3.0;\n" +
    "  vec2 q = vec2(fbm(p * 1.6 + flow + vec2(0.0, t)), fbm(p * 1.6 + flow + vec2(5.2, 1.3) - t));\n" +
    "  vec2 r = vec2(fbm(p * 1.6 + 3.0 * q + swirl + vec2(1.7, 9.2) + t * 1.3), fbm(p * 1.6 + 3.0 * q + swirl + vec2(8.3, 2.8) - t));\n" +
    "  float f = fbm(p * 1.6 + 3.0 * r);\n" +
    "  float lv = 1.0 + uLevel * 0.9;\n" +
    "  vec3 col = vec3(0.03, 0.03, 0.06);\n" +
    "  col += uCol[0] * smoothstep(0.20, 0.80, q.x) * 0.55 * lv;\n" +
    "  col += uCol[1] * smoothstep(0.20, 0.80, r.x) * 0.50 * lv;\n" +
    "  col += uCol[2] * smoothstep(0.25, 0.75, r.y) * 0.45 * lv;\n" +
    "  col += uCol[3] * smoothstep(0.30, 0.90, f) * 0.40 * lv;\n" +
    "  col += uPtrCol * fall * (0.6 + f) * 0.9;\n" +
    "  vec2 uv = gl_FragCoord.xy / uRes - 0.5; col *= 1.0 - 0.7 * dot(uv, uv);\n" +
    "  float L = dot(pow(col, vec3(2.2)), vec3(0.2126, 0.7152, 0.0722));\n" +
    "  col *= min(1.0, pow(0.13 / max(L, 1e-4), 1.0 / 2.2));\n" +
    "  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;\n" +
    "  outColor = vec4(col, 1.0);\n" +
    "}";

  var gl, canvas, prog, U = {}, raf = 0, running = false, last = 0, ready = false, onLost = null;
  var S = {
    time: 0, scroll: 0, level: 0, scale: .5,
    ptr: [.5, .5], target: [.5, .5], vel: [0, 0],
    cols: [[.3, .1, .5], [.1, .3, .5], [.5, .2, .2], [.2, .5, .3]], ptrCol: [.2, .2, .3]
  };

  function shader(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { var e = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(e); }
    return s;
  }

  function init(c, lostCb) {
    canvas = c; onLost = lostCb;
    try {
      gl = c.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "high-performance" });
      if (!gl) return false;
      var vs = shader(gl.VERTEX_SHADER, VERT), fs = shader(gl.FRAGMENT_SHADER, FRAG);
      prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      ["uRes", "uTime", "uPtr", "uVel", "uScroll", "uLevel", "uCol", "uPtrCol"].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
      gl.useProgram(prog);
      c.addEventListener("webglcontextlost", function (e) { e.preventDefault(); stop(); ready = false; if (onLost) onLost(); });
      ready = true; resize();
      return true;
    } catch (err) {
      console.warn("[synesthesia] WebGL2 unavailable:", err && err.message);
      dispose();
      return false;
    }
  }

  function resize() {
    if (!ready) return;
    var w = Math.max(2, Math.round(innerWidth * S.scale)), h = Math.max(2, Math.round(innerHeight * S.scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
  }

  function draw(dt) {
    var k = 1 - Math.exp(-dt * 5);
    S.ptr[0] += (S.target[0] - S.ptr[0]) * k;
    S.ptr[1] += (S.target[1] - S.ptr[1]) * k;
    S.vel[0] *= Math.exp(-dt * 3); S.vel[1] *= Math.exp(-dt * 3);
    S.time += dt * (1 + S.level * 1.6);
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uTime, S.time);
    gl.uniform2f(U.uPtr, S.ptr[0], S.ptr[1]);
    gl.uniform2f(U.uVel, S.vel[0], S.vel[1]);
    gl.uniform1f(U.uScroll, S.scroll);
    gl.uniform1f(U.uLevel, S.level);
    gl.uniform3fv(U.uCol, new Float32Array([].concat(S.cols[0], S.cols[1], S.cols[2], S.cols[3])));
    gl.uniform3f(U.uPtrCol, S.ptrCol[0], S.ptrCol[1], S.ptrCol[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now) {
    if (!running) return;
    var dt = Math.min(.05, (now - last) / 1000 || .016); last = now;
    draw(dt);
    raf = requestAnimationFrame(frame);
  }
  function start() { if (!ready || running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  function renderOnce() { if (ready) draw(0); }

  // pointer: x in 0..1 (left to right), y in 0..1 (bottom to top, GL convention)
  function setPointer(x, y) {
    var dx = x - S.target[0], dy = y - S.target[1];
    S.vel[0] = Math.max(-.6, Math.min(.6, S.vel[0] + dx * .6)); S.vel[1] = Math.max(-.6, Math.min(.6, S.vel[1] + dy * .6));
    S.target[0] = x; S.target[1] = y;
  }

  function dispose() {
    stop();
    try {
      if (gl) {
        if (prog) gl.deleteProgram(prog);
        var ext = gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext();
      }
    } catch (e) { }
    prog = null; ready = false;
  }

  document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else if (ready && S.wantRun) start(); });

  window.SYN.fluid = {
    state: S, init: init, resize: resize, start: function () { S.wantRun = true; start(); }, stop: function () { S.wantRun = false; stop(); },
    renderOnce: renderOnce, setPointer: setPointer, dispose: dispose, isReady: function () { return ready; }, FRAG: FRAG
  };
})();
