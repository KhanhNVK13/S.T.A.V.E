/* Staff Universe: page logic. Motion personality "Glide": every entrance is a slow
   ease-out rise (opacity + translateY), every exit a short ease-in fade. Only transform and
   opacity are animated. One scroll trigger drives the camera; separate triggers (callbacks
   only, no scrub/toggleActions mix) drive the entrances. */
(function () {
  "use strict";
  var root = document.documentElement;
  var qs = new URLSearchParams(location.search);
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches || qs.get("motion") === "off";
  var gsap = window.gsap, ST = window.ScrollTrigger;
  var S = window.STAVE;
  var NS = "http://www.w3.org/2000/svg";

  /* every string this script writes into the page */
  var TEXT = {
    graphLabel: function () { return S.t("index.graphLabel"); },
    lanes: ["main", "bridge-alt", "drums-swing"],
    commitLabel: function (c) { return S.t("index.commitLabel", { hash: c.hash, msg: c.msg, author: c.author, when: c.when }); },
    meta: function (c) { return c.author + " · " + c.when + " · " + S.ago(c.ago); },
    rollLabel: function (from, to) { return S.t("index.rollLabel", { from: from ? from.hash : S.t("index.empty"), to: to.hash }); },
    ellipsis: "…"
  };
  var sections = Array.prototype.slice.call(document.querySelectorAll(".scene"));
  var dots = Array.prototype.slice.call(document.querySelectorAll(".dots a"));

  function svgEl(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /* ---------- sky (assets/sky.js owns the canvas) ---------- */
  function setSky(p) { if (window.StaveSky) window.StaveSky.setProgress(p); }
  function pulseSky(i) { if (window.StaveSky) window.StaveSky.pulse(i); }

  /* ---------- static content builders ---------- */
  var COMMITS = S.COMMITS, SONG = S.buildSong();

  // 02 · staff lines behind the name
  (function () {
    var g = document.getElementById("name-staff-lines");
    for (var i = 0; i < 5; i++) svgEl("line", { x1: 0, x2: 1000, y1: 8 + i * 11, y2: 8 + i * 11 }, g);
  })();

  // 03 · commit-star graph from the real COMMITS array
  var graph = (function () {
    var host = document.getElementById("graph");
    var W = 760, H = 232, laneY = [58, 122, 188];
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "group", "aria-label": TEXT.graphLabel() });
    var defs = svgEl("defs", {}, svg);
    var rg = svgEl("radialGradient", { id: "halo" }, defs);
    svgEl("stop", { offset: "0", "stop-color": "#dceeb1", "stop-opacity": ".95" }, rg);
    svgEl("stop", { offset: ".35", "stop-color": "#dceeb1", "stop-opacity": ".35" }, rg);
    svgEl("stop", { offset: "1", "stop-color": "#dceeb1", "stop-opacity": "0" }, rg);
    var names = TEXT.lanes;
    names.forEach(function (n, i) {
      var g = svgEl("g", { class: "g-staff" }, svg);
      for (var l = -2; l <= 2; l++) svgEl("line", { x1: 100, x2: W - 8, y1: laneY[i] + l * 5, y2: laneY[i] + l * 5 }, g);
      svgEl("text", { x: 4, y: laneY[i] + 4, class: "g-lane-label" }, svg).textContent = n;
    });
    var px = function (i) { return 128 + i * 88; };
    // edges
    var mainX = COMMITS.map(function (c, i) { return px(i); });
    var mergeX = 700;
    var d = "M" + mainX[0] + " " + laneY[0] + " H" + mergeX;
    svgEl("path", { d: d, class: "g-edge main" }, svg);
    var bX = [px(3) + 78, px(3) + 168];
    svgEl("path", { d: "M" + mainX[3] + " " + laneY[0] + " C " + (mainX[3] + 40) + " " + laneY[0] + ", " + (bX[0] - 40) + " " + laneY[1] + ", " + bX[0] + " " + laneY[1] + " H" + bX[1], class: "g-edge teal" }, svg);
    svgEl("path", { d: "M" + bX[1] + " " + laneY[1] + " C " + (bX[1] + 60) + " " + laneY[1] + ", " + (mergeX - 60) + " " + laneY[0] + ", " + mergeX + " " + laneY[0], class: "g-edge teal dash" }, svg);
    var dX = px(2) + 80;
    svgEl("path", { d: "M" + mainX[2] + " " + laneY[0] + " C " + (mainX[2] + 40) + " " + laneY[0] + ", " + (dX - 40) + " " + laneY[2] + ", " + dX + " " + laneY[2], class: "g-edge violet" }, svg);

    function star(x, y, cls, extra) {
      var g = svgEl("g", { class: cls, transform: "translate(" + x + " " + y + ")" }, svg);
      svgEl("circle", { class: "halo", r: 16 }, g);
      svgEl("circle", { class: "core", r: 5.5 }, g);
      return g;
    }
    // decorative branch stars (aria-hidden)
    [[bX[0], 1, "teal"], [bX[1], 1, "teal"], [dX, 2, "violet"]].forEach(function (b) {
      var g = star(b[0], laneY[b[1]], "dec " + (b[2] === "violet" ? "violet" : ""));
      g.setAttribute("aria-hidden", "true");
    });
    var mg = star(mergeX, laneY[0], "dec merge"); mg.setAttribute("aria-hidden", "true");

    // interactive commit stars
    var nodes = COMMITS.map(function (c, i) {
      var g = star(px(i), laneY[0], "cstar");
      svgEl("circle", { class: "ring", r: 13 }, g);
      svgEl("circle", { class: "hit", r: 22 }, g);
      g.setAttribute("tabindex", i === 3 ? "0" : "-1");
      g.setAttribute("role", "button");
      g.setAttribute("aria-pressed", "false");
      g.setAttribute("aria-label", TEXT.commitLabel(c));
      svgEl("text", { class: "g-hash", x: 0, y: -26 }, g).textContent = c.hash;
      return g;
    });
    host.appendChild(svg);
    return { nodes: nodes, svg: svg };
  })();

  var sel = -1;
  function select(k, fromUser) {
    if (k === sel) return;
    sel = k;
    graph.nodes.forEach(function (n, i) {
      n.classList.toggle("on", i === k);
      n.setAttribute("aria-pressed", String(i === k));
      n.setAttribute("tabindex", i === k ? "0" : "-1");
    });
    var c = COMMITS[k];
    document.getElementById("d-hash").textContent = c.hash;
    document.getElementById("d-meta").textContent = TEXT.meta(c);
    document.getElementById("d-msg").textContent = c.msg;
    var svg = S.drawRoll(document.getElementById("roll"), {
      notes: SONG, mode: "diff", from: k - 1, to: k, steps: 64, lo: 40, hi: 79, cell: 10, rowH: 5, gutter: 30,
      label: TEXT.rollLabel(k > 0 ? COMMITS[k - 1] : null, c)
    });
    document.getElementById("t-add").textContent = svg.querySelectorAll(".n-add").length;
    document.getElementById("t-del").textContent = svg.querySelectorAll(".n-del").length;
    document.getElementById("t-mod").textContent = svg.querySelectorAll(".n-mod").length;
    if (fromUser) {
      pulseSky(2);
      if (gsap && !reduce) gsap.fromTo(svg, { opacity: 0.35 }, { opacity: 1, duration: 0.6, ease: "power2.out", overwrite: true });
    }
  }
  graph.nodes.forEach(function (n, i) {
    n.addEventListener("click", function () { select(i, true); });
    n.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(i, true); }
      else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        var j = Math.max(0, Math.min(graph.nodes.length - 1, i + (e.key === "ArrowRight" ? 1 : -1)));
        graph.nodes[j].focus(); select(j, true);
      }
    });
  });
  select(3, false);

  document.addEventListener("stave:lang", function () {
    graph.svg.setAttribute("aria-label", TEXT.graphLabel());
    graph.nodes.forEach(function (n, i) { n.setAttribute("aria-label", TEXT.commitLabel(COMMITS[i])); });
    var k = sel;
    sel = -1;
    select(k, false);
  });

  // 04 · clean version chain
  (function () {
    var ol = document.getElementById("chain");
    COMMITS.slice(0, 5).forEach(function (c) {
      var li = document.createElement("li");
      li.innerHTML = '<span class="st"></span><span></span><span class="when"></span>';
      li.children[1].textContent = c.msg.length > 38 ? c.msg.slice(0, 36) + TEXT.ellipsis : c.msg;
      li.children[2].textContent = c.when;
      ol.appendChild(li);
    });
  })();

  // 06 · 128 instrument dots, waveform bars
  (function () {
    var gm = document.getElementById("gm"), w = document.getElementById("wave"), i;
    for (var rw = 0; rw < 8; rw++) { var row = document.createElement("div"); row.className = "gmrow"; for (i = 0; i < 16; i++) row.appendChild(document.createElement("i")); gm.appendChild(row); }
    var rnd = S.rng(5);
    for (i = 0; i < 44; i++) { var b = document.createElement("i"); b.style.transform = "scaleY(" + (0.12 + Math.abs(Math.sin(i * 0.5)) * rnd() * 0.88).toFixed(2) + ")"; w.appendChild(b); }
  })();

  /* ---------- one wheel gesture = one block ----------
     Scroll-snap alone can snap back on small wheel ticks, so a gentle intent handler steps to the
     neighbouring block. Disabled when snapping is off (short or narrow screens); keyboard,
     scrollbar and touch keep their native behaviour. */
  (function () {
    var lockedUntil = 0, lastWheel = 0;
    function current() { var y = window.scrollY + window.innerHeight / 2, k = 0; sections.forEach(function (s, i) { if (s.offsetTop <= y) k = i; }); return k; }
    window.addEventListener("wheel", function (e) {
      if (e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX) || getComputedStyle(root).scrollSnapType === "none") return;
      var now = performance.now(), gap = now - lastWheel; lastWheel = now;
      e.preventDefault();
      if (now < lockedUntil || gap < 120 && now < lockedUntil + 600) { if (gap < 120) lockedUntil = Math.max(lockedUntil, now + 120); return; }
      if (Math.abs(e.deltaY) < 4) return;
      var next = Math.max(0, Math.min(sections.length - 1, current() + (e.deltaY > 0 ? 1 : -1)));
      lockedUntil = now + 800;
      window.scrollTo({ top: sections[next].offsetTop, behavior: reduce ? "auto" : "smooth" });
    }, { passive: false });
  })();

  /* ---------- reduced motion, or GSAP missing: everything is shown in its final state ---------- */
  function setActive(i) {
    dots.forEach(function (d, n) { if (n === i) d.setAttribute("aria-current", "true"); else d.removeAttribute("aria-current"); });
  }
  if (reduce) root.classList.add("rm");
  if (!gsap || !ST || reduce) {
    if (!gsap || !ST) root.classList.remove("js");
    // keep the sky in step with the section in view without any flight
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { var i = sections.indexOf(e.target); setSky(i); setActive(i); } });
      }, { threshold: 0.55 });
      sections.forEach(function (s) { io.observe(s); });
    }
    return;
  }

  /* ---------- Glide motion ---------- */
  root.classList.add("js");
  gsap.registerPlugin(ST);
  gsap.defaults({ overwrite: "auto" });
  var IN = { duration: 0.8, ease: "power2.out" };
  var OUT = { duration: 0.32, ease: "power2.in" };

  // camera: one trigger across all seven blocks (progress callback only)
  ST.create({
    trigger: document.getElementById("main"), start: "top top", end: "bottom bottom",
    onUpdate: function (self) { setSky(self.progress * (sections.length - 1)); }
  });

  var entrances = {
    s2: function (sec) {
      var cols = sec.querySelectorAll(".col"), dotsEl = sec.querySelectorAll(".dot"), ltr = sec.querySelectorAll(".ltr"), word = sec.querySelectorAll(".word");
      var staff = sec.querySelector(".name-staff"), tag = sec.querySelector(".tagline");
      var mid = sec.querySelector(".name-row").getBoundingClientRect(); var cx = mid.left + mid.width / 2;
      var tl = gsap.timeline();
      // five stars start gathered in the middle...
      dotsEl.forEach(function (d, i) { var r = cols[i].getBoundingClientRect(); gsap.set(d, { x: cx - (r.left + r.width / 2), opacity: 0, scale: 0.4 }); });
      gsap.set(ltr, { opacity: 0, scale: 0.6 });
      gsap.set(word, { opacity: 0, y: 14 });
      gsap.set(staff, { opacity: 0 });
      gsap.set(tag, { opacity: 0, y: 14 });
      tl.to(dotsEl, { opacity: 1, scale: 1, duration: 0.7, stagger: 0.06, ease: "power2.out" })
        // ...drift apart along the staff...
        .to(dotsEl, { x: 0, duration: 1.1, ease: "power3.out" }, "+=0.1")
        .to(staff, { opacity: 1, duration: 0.8, ease: "power2.out" }, "<0.2")
        // ...each star opens into its letter...
        .to(dotsEl, { opacity: 0, scale: 0.2, duration: 0.5, stagger: 0.08, ease: "power2.in" }, "+=0.1")
        .to(ltr, { opacity: 1, scale: 1, duration: 0.8, stagger: 0.08, ease: "power2.out" }, "<0.15")
        // ...and the letters unfold into the full words.
        .to(word, { opacity: 1, y: 0, duration: 0.8, stagger: 0.12, ease: "power2.out" }, "-=0.2")
        .to(tag, { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" }, "-=0.3");
      return tl;
    },
    s3: function (sec) {
      // SVG groups keep their translate() attribute, so they fade only (opacity)
      var st = sec.querySelectorAll(".cstar, .dec"), edges = sec.querySelectorAll(".g-edge");
      gsap.fromTo(edges, { opacity: 0 }, { opacity: 1, duration: 1, ease: "power2.out", stagger: 0.1 });
      gsap.fromTo(st, { opacity: 0 }, { opacity: 1, duration: 0.7, ease: "power2.out", stagger: 0.09, delay: 0.2 });
    },
    s5: function (sec) {
      var line = sec.querySelector(".rail-line");
      gsap.fromTo(line, { scaleX: 0 }, { scaleX: 1, duration: 1.4, ease: "power2.out" });
      gsap.fromTo(sec.querySelectorAll(".step"), { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.8, ease: "power2.out", stagger: 0.28, delay: 0.15 });
    },
    s6: function (sec) {
      gsap.fromTo(sec.querySelectorAll(".tile"), { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.8, ease: "power2.out", stagger: 0.14, delay: 0.1 });
      // 128 dots light up row by row (8 tweens, not 128), the waveform as one piece
      gsap.fromTo(sec.querySelectorAll(".gmrow"), { opacity: 0 }, { opacity: 1, duration: 0.8, ease: "power2.out", stagger: 0.09, delay: 0.3 });
      gsap.fromTo(sec.querySelector(".wave"), { opacity: 0 }, { opacity: 1, duration: 0.8, ease: "power2.out", delay: 0.5 });
      gsap.fromTo(sec.querySelectorAll(".pads span"), { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.6, ease: "power2.out", stagger: 0.05, delay: 0.4 });
    }
  };
  // hidden-by-default children need an explicit initial state so exits can re-run
  document.querySelectorAll(".s-tools .gmrow, .s-tools .pads span, .s-tools .wave, .s-how .step, .s-hist .g-edge, .s-hist .cstar, .s-hist .dec").forEach(function (e) { e.style.opacity = 0; });

  function enter(i) {
    var sec = sections[i], id = sec.id;
    setActive(i);
    var rv = sec.querySelectorAll("[data-rv]");
    if (rv.length) gsap.killTweensOf(rv);
    var custom = entrances[id];
    if (rv.length) gsap.fromTo(rv, { opacity: 0, y: 24 }, Object.assign({ opacity: 1, y: 0, stagger: 0.1, delay: 0.05, clearProps: "transform" }, IN));
    if (custom) custom(sec);
  }
  function exit(i) {
    var sec = sections[i];
    var lift = sec.querySelectorAll("[data-rv], .step, .tile, .name-staff, .tagline, .dot, .ltr, .word");
    var fade = sec.querySelectorAll(".cstar, .dec, .g-edge, .gmrow, .pads span, .wave");
    if (lift.length) { gsap.killTweensOf(lift); gsap.to(lift, Object.assign({ opacity: 0, y: -12 }, OUT)); }
    if (fade.length) { gsap.killTweensOf(fade); gsap.to(fade, Object.assign({ opacity: 0 }, OUT)); }
  }
  sections.forEach(function (sec, i) {
    ST.create({
      trigger: sec, start: "top 58%", end: "bottom 42%",
      onEnter: function () { enter(i); }, onEnterBack: function () { enter(i); },
      onLeave: function () { exit(i); }, onLeaveBack: function () { exit(i); }
    });
  });

  // fonts change text metrics, so measure again once they are ready
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ST.refresh(); });
  window.addEventListener("load", function () { ST.refresh(); });
  window.__staveReady = true;
})();
