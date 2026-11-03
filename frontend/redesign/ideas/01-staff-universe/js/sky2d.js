/* Canvas 2D fallback: used when WebGL is missing, the screen is under 900px, or ?mode=2d.
   Parallax star layers plus one flat staff constellation per section. Redraws only while the
   scroll position is still gliding, so it is nearly free when idle. */
(function () {
  "use strict";
  var N = 7;
  var TINT = ["#dceeb1", "#ffe9b0", "#b8f3e4", "#f3c8ff", "#dceeb1", "#ffe0c0", "#ffffff"];

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

  function create(opts) {
    var host = opts.host, reduce = !!opts.reduce, light = !!opts.light;
    var cv = document.createElement("canvas");
    host.appendChild(cv);
    var ctx = cv.getContext("2d");
    if (!ctx) { host.removeChild(cv); return null; }
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, target = 0, pos = 0, raf = 0, disposed = false, last = 0, pulses = [];
    var r = seeded(11);
    var starCount = light ? 140 : 260;
    var stars = [];
    for (var i = 0; i < starCount; i++) stars.push({ x: r(), y: r() * N, d: 0.15 + r() * 0.85, s: 0.4 + r() * 1.3, a: 0.35 + r() * 0.65 });
    var cons = [];
    for (var s = 0; s < N; s++) {
      var rr = seeded(50 + s), nodes = [], x = (s === 0 || s === 4) ? 0.5 : 0.12;
      for (var j = 0; j < 7; j++) { x += 0.08 + rr() * 0.05; nodes.push([x, 0.5 + (Math.round(rr() * 6 - 3) * 0.012)]); }
      cons.push(nodes);
    }

    function size() {
      W = host.clientWidth || window.innerWidth; H = host.clientHeight || window.innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = "100%"; cv.style.height = "100%";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      // galaxy glows (one soft blob per section, parallax 0.8)
      for (var g = 0; g < N; g++) {
        var gy = (g - pos) * H * 0.8 + H * 0.5, gx = W * (g % 3 === 0 ? 0.72 : g % 3 === 1 ? 0.5 : 0.3);
        if (gy < -H || gy > 2 * H) continue;
        var rad = Math.min(W, H) * 0.55;
        var grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, rad);
        grad.addColorStop(0, TINT[g] + "55"); grad.addColorStop(0.45, "#6c7cff22"); grad.addColorStop(1, "#04050d00");
        ctx.fillStyle = grad; ctx.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
      }
      // parallax stars
      for (var i = 0; i < stars.length; i++) {
        var st = stars[i];
        var y = (st.y - pos) * H * st.d, yy = ((y % (H * N * st.d)) + H * N * st.d) % (H * N * st.d);
        if (yy > H) continue;
        ctx.globalAlpha = st.a; ctx.fillStyle = "#eef0ff";
        ctx.beginPath(); ctx.arc(st.x * W, yy, st.s, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // staff constellations at depth 1
      for (var c = 0; c < N; c++) {
        var cy = (c - pos) * H + H * 0.5;
        if (cy < -H * 0.5 || cy > H * 1.5) continue;
        ctx.strokeStyle = "rgba(238,240,255,.14)"; ctx.lineWidth = 1;
        for (var l = -2; l <= 2; l++) { ctx.beginPath(); ctx.moveTo(W * 0.05, cy + l * 9); ctx.lineTo(W * 0.95, cy + l * 9); ctx.stroke(); }
        var nd = cons[c];
        ctx.strokeStyle = "rgba(238,240,255,.6)"; ctx.lineWidth = 1.4; ctx.beginPath();
        nd.forEach(function (p, k) { var px = p[0] * W, py = cy + (p[1] - 0.5) * H * 4; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
        ctx.stroke();
        nd.forEach(function (p, k) {
          var px = p[0] * W, py = cy + (p[1] - 0.5) * H * 4, rg = ctx.createRadialGradient(px, py, 0, px, py, 16);
          rg.addColorStop(0, k % 3 === 0 ? "#dceeb1" : "#ffffff"); rg.addColorStop(0.25, "#dceeb188"); rg.addColorStop(1, "#dceeb100");
          ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(px, py, 16, 0, 6.2832); ctx.fill();
        });
      }
    }

    function frame(now) {
      if (disposed) return;
      var dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
      pos += (target - pos) * (1 - Math.exp(-dt * 4));
      if (Math.abs(target - pos) < 0.001) pos = target;
      draw();
      if (pos !== target) raf = requestAnimationFrame(frame); else raf = 0;
    }
    function kick() { if (!raf && !disposed) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    function onResize() { size(); draw(); }
    window.addEventListener("resize", onResize);
    size();

    return {
      kind: "canvas2d",
      setProgress: function (p) { target = Math.max(0, Math.min(N - 1, p)); if (reduce) { pos = target; draw(); } else kick(); },
      pulse: function () { /* no-op in the light path */ },
      start: function () { draw(); },
      stats: function () { return {}; },
      dispose: function () {
        disposed = true; cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
        if (cv.parentNode) cv.parentNode.removeChild(cv);
      }
    };
  }

  window.Sky2D = { create: create };
})();
