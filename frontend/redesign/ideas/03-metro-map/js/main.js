(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var S = window.STAVE;
  var root = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var compactMq = window.matchMedia("(max-width: 899px)");
  var compact = compactMq.matches;
  var hasGsap = !!(window.gsap && window.ScrollTrigger);
  var animate = hasGsap && !reduce && !compact;
  var secs = [].slice.call(document.querySelectorAll(".blk"));

  root.classList.add(animate ? "anim" : "static");
  if (compact) root.classList.add("compact");
  compactMq.addEventListener("change", function () { location.reload(); });

  function mk(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* ---------- static pieces that need shared.js ---------- */
  if (S) {
    [].forEach.call(document.querySelectorAll("[data-mark]"), function (h) { h.innerHTML = S.mark(28); });
    [].forEach.call(document.querySelectorAll("[data-ic]"), function (h) { h.innerHTML = S.ic(h.getAttribute("data-ic")); });
    [].forEach.call(document.querySelectorAll("[data-th]"), function (h) {
      var n = +h.getAttribute("data-th");
      h.innerHTML = S.staffThumb(n >= 2 ? 2 : 1, n === 3, n + 2);
    });
  }

  /* ---------- 03 · history: pick a station, see the diff ---------- */
  function initHistory() {
    if (!S) return;
    var list = document.getElementById("stns");
    var notes = S.buildSong();
    var title = document.getElementById("diff-title");
    var sum = document.getElementById("diff-sum");
    var rollHost = document.getElementById("roll");
    var graphHost = document.getElementById("graph");

    function select(k) {
      var c = S.COMMITS[k];
      [].forEach.call(list.querySelectorAll(".stn"), function (b, i) { b.setAttribute("aria-pressed", String(i === k)); });
      S.staffGraph(graphHost, { big: true, current: c.hash });
      S.drawRoll(rollHost, {
        notes: notes, mode: "diff", from: k - 1, to: k, steps: 64, lo: 40, hi: 79, cell: 12, rowH: 7,
        label: "Piano roll comparing " + (k ? S.COMMITS[k - 1].hash : "an empty project") + " with " + c.hash
      });
      var add = 0, del = 0, mod = 0;
      notes.forEach(function (n) {
        var a = S.stateAt(n, k - 1), b = S.stateAt(n, k);
        if (!a && b) add++;
        else if (a && !b) del++;
        else if (a && b && n.chg !== null && n.chg > k - 1 && n.chg <= k) mod++;
      });
      title.textContent = (k ? S.COMMITS[k - 1].hash : "empty") + " → " + c.hash + " · " + c.author + ", " + c.when;
      sum.innerHTML = "";
      [[add, "pill-add", " added"], [del, "pill-del", " removed"], [mod, "pill-mod", " velocity changed"]].forEach(function (p) {
        if (!p[0]) return;
        var s = document.createElement("span");
        s.className = "pill " + p[1];
        s.textContent = p[0] + p[2];
        sum.appendChild(s);
      });
      if (!sum.children.length) {
        var none = document.createElement("span");
        none.className = "pill pill-none";
        none.textContent = "No note changes";
        sum.appendChild(none);
      }
    }

    S.COMMITS.forEach(function (c, i) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "stn";
      b.setAttribute("aria-pressed", "false");
      var dot = document.createElement("span"); dot.className = "stn-dot"; dot.setAttribute("aria-hidden", "true");
      var t = document.createElement("span"); t.className = "stn-t";
      var h = document.createElement("b"); h.textContent = c.hash;
      var m = document.createElement("span"); m.className = "m"; m.textContent = c.msg;
      var sm = document.createElement("small"); sm.textContent = c.author + " · " + c.when;
      t.appendChild(h); t.appendChild(m); t.appendChild(sm);
      b.appendChild(dot); b.appendChild(t);
      b.addEventListener("click", function () { select(i); });
      li.appendChild(b);
      list.appendChild(li);
    });
    select(3);
  }
  initHistory();

  /* ---------- 02 · the name: five lines fan out of one trunk ---------- */
  var LINES = [
    { c: "#0f7b6c", l: "S", st: ["Sketch", "Save", "Source"] },
    { c: "#7b3f7a", l: "T", st: ["Take", "Trace", "Tracking"] },
    { c: "#c2410c", l: "A", st: ["Arrange", "Amend", "and"] },
    { c: "#3b3a8f", l: "V", st: ["Verse", "Variant", "Version Control"] },
    { c: "#4d7c0f", l: "E", st: ["Edit", "Export", "Environment"] }
  ];
  var fanRows = [];
  (function buildFan() {
    var svg = document.getElementById("fan");
    if (!svg) return;
    var xs = [310, 570, 830];
    LINES.forEach(function (ln, i) {
      var y = 52 + i * 84;
      var outer = mk("g", { transform: "translate(0 " + y + ")" }, svg);
      var g = mk("g", {}, outer);
      var line = mk("line", { x1: 60, x2: 960, y1: 0, y2: 0, stroke: ln.c, "stroke-width": 12, "stroke-linecap": "round" }, g);
      var badge = mk("g", {}, g);
      mk("circle", { cx: 50, cy: 0, r: 30, fill: ln.c, class: "badge-c" }, badge);
      mk("text", { x: 50, y: 1, class: "badge-t" }, badge).textContent = ln.l;
      var sts = ln.st.map(function (name, k) {
        var sg = mk("g", {}, g);
        var end = k === 2;
        mk("circle", { cx: xs[k], cy: 0, r: end ? 17 : 12, fill: "#fff", stroke: ln.c, "stroke-width": end ? 8 : 6 }, sg);
        var t = mk("text", { x: xs[k], y: -28, class: "st-t" + (end ? " end" : "") + (name === "and" ? " and" : "") }, sg);
        t.textContent = name;
        return sg;
      });
      fanRows.push({ y: y, line: line, badge: badge, sts: sts, g: g });
    });
  })();

  /* ---------- the metro map ---------- */
  var STOPS = [
    [1260, 140, "01 Welcome"], [340, 240, "02 The name"], [1260, 340, "03 History"], [340, 440, "04 Why save"],
    [1260, 540, "05 How it works"], [340, 640, "06 Toolbox"], [1260, 740, "07 Terminal"]
  ];
  var MAIN = "M1260 50 V140 H440 L340 240 H1160 L1260 340 H440 L340 440 H1160 L1260 540 H440 L340 640 H1160 L1260 740";
  var BRANCHES = [
    { d: "M900 340 L850 290 H650 L600 340", color: "#0f7b6c", sts: [[780, 290], [700, 290]], fork: [900, 340], merge: [600, 340] },
    { d: "M1000 540 L950 490 H770 L720 540", color: "#7b3f7a", sts: [[860, 490]], fork: [1000, 540], merge: [720, 540] }
  ];

  // Cards go on the opposite side of the map to the stop they belong to.
  secs.forEach(function (sec, i) { sec.setAttribute("data-side", STOPS[i][0] > 800 ? "left" : "right"); });
  secs.forEach(function (sec) { if (sec.getAttribute("data-side") === "left") sec.removeAttribute("data-side"); });

  var map = null;
  function buildMap() {
    var svg = document.getElementById("map");
    var ghostG = mk("g", {}, svg);
    var main = mk("path", { d: MAIN, class: "ln", stroke: "#121212", "stroke-width": 11 });
    var L = main.getTotalLength();
    mk("path", { d: MAIN, class: "ghost", "stroke-width": 11 }, ghostG);
    var brG = mk("g", {}, svg);
    var brs = BRANCHES.map(function (b) {
      mk("path", { d: b.d, class: "ghost", "stroke-width": 9 }, ghostG);
      var p = mk("path", { d: b.d, class: "ln", stroke: b.color, "stroke-width": 9 }, brG);
      var bl = p.getTotalLength();
      p.style.strokeDasharray = bl;
      p.style.strokeDashoffset = bl;
      return b;
    });
    svg.appendChild(main);
    main.style.strokeDasharray = L;
    main.style.strokeDashoffset = L;

    function lenAt(x, y) {
      var best = 0, bd = 1e12;
      for (var l = 0; l <= L; l += 2) {
        var p = main.getPointAtLength(l), d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
        if (d < bd) { bd = d; best = l; }
      }
      return best;
    }
    var stopLen = STOPS.map(function (s) { return lenAt(s[0], s[1]); });

    var brData = BRANCHES.map(function (b, bi) {
      var path = brG.children[bi];
      var bl = path.getTotalLength();
      var nodes = b.sts.map(function (s, k) {
        return { el: mk("circle", { cx: s[0], cy: s[1], r: 8, class: "nd", stroke: b.color, opacity: 0 }, svg), at: (k + 1) / (b.sts.length + 1) };
      });
      var f = mk("circle", { cx: b.fork[0], cy: b.fork[1], r: 13, class: "xch", opacity: 0 }, svg);
      var m = mk("circle", { cx: b.merge[0], cy: b.merge[1], r: 13, class: "xch", opacity: 0 }, svg);
      return { path: path, len: bl, a: lenAt(b.fork[0], b.fork[1]), z: lenAt(b.merge[0], b.merge[1]), nodes: nodes, fork: f, merge: m };
    });

    // minor stations: one every ~120 units, away from the big stops
    var minors = [];
    for (var l = 70; l < L - 40; l += 120) {
      var near = stopLen.some(function (sl) { return Math.abs(sl - l) < 46; });
      if (near) continue;
      var p = main.getPointAtLength(l);
      minors.push({ at: l, el: mk("circle", { cx: p.x, cy: p.y, r: 8, class: "nd", opacity: 0 }, svg) });
    }

    var stopEls = STOPS.map(function (s, i) {
      var g = mk("g", { class: "stop", opacity: 1 }, svg);
      mk("circle", { cx: s[0], cy: s[1], r: 17, opacity: 0 }, g);
      // label sits on the outer side of the marker, away from the card
      var rightSide = s[0] > 800;
      var t = mk("text", { x: s[0] + (rightSide ? 30 : -30), y: s[1] - 26, "text-anchor": rightSide ? "start" : "end", opacity: 0 }, g);
      t.textContent = s[2];
      return g;
    });

    // train: head + two cars, following the path
    var train = mk("g", {}, svg);
    var cars = [0, 1, 2].map(function (k) {
      var g = mk("g", {}, train);
      mk("rect", { x: -14, y: -8, width: 28, height: 16, rx: 5, fill: k === 0 ? "#121212" : "#fff", stroke: "#121212", "stroke-width": 3 }, g);
      mk("rect", { x: k === 0 ? 2 : -9, y: -4, width: 7, height: 6, rx: 1.5, fill: k === 0 ? "#dceeb1" : "#121212", opacity: k === 0 ? 1 : .25 }, g);
      if (k) mk("rect", { x: 2, y: -4, width: 7, height: 6, rx: 1.5, fill: "#121212", opacity: .25 }, g);
      return g;
    });

    return { main: main, L: L, stopLen: stopLen, br: brData, minors: minors, stops: stopEls, cars: cars };
  }

  var lastOn = -1;
  function render(f) {
    var m = map;
    var i = Math.min(5, Math.floor(f)), fr = f - i;
    if (f >= 6) { i = 5; fr = 1; }
    var e = fr * fr * (3 - 2 * fr);
    var len = m.stopLen[i] + (m.stopLen[i + 1] - m.stopLen[i]) * e;
    m.main.style.strokeDashoffset = m.L - len;
    m.minors.forEach(function (n) { n.el.setAttribute("opacity", len >= n.at + 4 ? 1 : 0); });
    m.stops.forEach(function (g, k) {
      var vis = len >= m.stopLen[k] - 2 ? 1 : 0;
      g.children[0].setAttribute("opacity", vis);
      g.children[1].setAttribute("opacity", vis);
    });
    m.br.forEach(function (b) {
      var bp = clamp((len - b.a) / (b.z - b.a), 0, 1);
      b.path.style.strokeDashoffset = b.len * (1 - bp);
      b.fork.setAttribute("opacity", bp > 0 ? 1 : 0);
      b.merge.setAttribute("opacity", bp >= 0.99 ? 1 : 0);
      b.nodes.forEach(function (n) { n.el.setAttribute("opacity", bp >= n.at ? 1 : 0); });
    });
    [0, 26, 52].forEach(function (off, k) {
      var pos = clamp(len - off, 0, m.L - 2);
      var p = m.main.getPointAtLength(pos), q = m.main.getPointAtLength(pos + 1.5);
      var a = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
      // keep the cars upright: never read upside down on the leftward runs
      m.cars[k].setAttribute("transform", "translate(" + p.x.toFixed(1) + " " + p.y.toFixed(1) + ") rotate(" + a.toFixed(1) + ")");
    });
  }
  function setOn(i) {
    if (!map || i === lastOn) return;
    lastOn = i;
    map.stops.forEach(function (g, k) { g.classList.toggle("on", k === i); });
    [].forEach.call(document.querySelectorAll(".rail a"), function (a, k) {
      if (k === i) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
  }

  if (!compact) {
    map = buildMap();
  }

  /* ---------- motion ---------- */
  function finalState() {
    if (map) { render(6); }
    setOn(0);
  }

  if (!animate) {
    finalState();
    // plain anchor jumps still update the rail marker
    if (!compact && "IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting) setOn(secs.indexOf(en.target)); });
      }, { threshold: 0.6 });
      secs.forEach(function (s) { io.observe(s); });
    }
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  // Motion personality: calm and deliberate. Entrances ease out, exits ease in,
  // movement is a short upward drift and a fade. Nothing slides or overlaps.
  var IN = { duration: 0.7, ease: "power3.out", stagger: 0.08 };
  var OUT = { duration: 0.28, ease: "power2.in", stagger: 0.02 };

  // 02: five lines fan out of one trunk
  var fan = gsap.timeline({ paused: true });
  fanRows.forEach(function (r, i) {
    fan.fromTo(r.g, { y: 210 - r.y }, { y: 0, duration: 0.9, ease: "power3.out" }, i * 0.06);
    fan.fromTo(r.badge, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power2.out" }, 0.75 + i * 0.05);
    r.sts.forEach(function (st, k) {
      fan.fromTo(st, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, 1.05 + k * 0.28 + i * 0.07);
    });
  });
  // 05: the rail of the stepper draws down, then the stations pop in
  var steps = document.getElementById("steps");
  var stepLine = gsap.timeline({ paused: true });
  stepLine.fromTo(steps, { "--p": 0 }, { "--p": 1, duration: 0.8, ease: "power2.out" }, 0);
  var stepDots = [].slice.call(steps.querySelectorAll(".step-dot"));
  stepLine.fromTo(stepDots, { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: "power3.out", stagger: 0.14 }, 0.1);

  var count = { v: 0 };
  var countEl = document.getElementById("count");
  var countTween = null;

  var extras = {
    1: { on: function () { fan.timeScale(1).play(); }, off: function () { fan.timeScale(1.8).reverse(); } },
    4: { on: function () { stepLine.timeScale(1).play(); }, off: function () { stepLine.timeScale(1.8).reverse(); } },
    5: {
      on: function () {
        if (countTween) countTween.kill();
        countTween = gsap.to(count, { v: 128, duration: 1.1, ease: "power2.out", onUpdate: function () { countEl.textContent = Math.round(count.v); } });
      },
      off: function () {
        if (countTween) countTween.kill();
        count.v = 0; countEl.textContent = "128";
      }
    }
  };

  var state = secs.map(function () { return false; });
  function setActive(i, on) {
    if (state[i] === on) return;
    state[i] = on;
    var els = secs[i].querySelectorAll(".reveal");
    if (on) {
      setOn(i);
      gsap.fromTo(els, { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: IN.duration, ease: IN.ease, stagger: IN.stagger, overwrite: true });
      if (extras[i]) extras[i].on();
    } else {
      gsap.to(els, { opacity: 0, y: -14, duration: OUT.duration, ease: OUT.ease, stagger: OUT.stagger, overwrite: true });
      if (extras[i]) extras[i].off();
    }
  }

  // the train: one scrubbed tween drives the whole map (scrub only, no toggleActions)
  var proxy = { f: 0 };
  render(0);
  gsap.to(proxy, {
    f: 6, ease: "none",
    onUpdate: function () { render(proxy.f); },
    scrollTrigger: { trigger: "#main", start: "top top", end: "bottom bottom", scrub: 0.5 }
  });

  // block visibility (toggle only, no scrub)
  secs.forEach(function (sec, i) {
    ScrollTrigger.create({
      trigger: sec, start: "top 60%", end: "bottom 40%",
      onToggle: function (self) { setActive(i, self.isActive); }
    });
  });

  var refresh = function () { ScrollTrigger.refresh(); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
  window.addEventListener("load", refresh);
})();
