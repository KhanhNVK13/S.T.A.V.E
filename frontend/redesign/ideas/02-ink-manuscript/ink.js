/* STAVE · Ink Manuscript — builds the hand-drawn SVG and wires the scroll.
   Modes are decided in <head> (class on <html>):
     anim    >= 900px, motion allowed: strokes scrubbed by scroll, text rises in
     lite    < 900px: final drawings shown, CSS fade only (no GSAP timelines)
     reduced prefers-reduced-motion: everything in its final state            */
(function () {
  "use strict";
  var root = document.documentElement;
  var NS = "http://www.w3.org/2000/svg";
  var S = window.STAVE;
  var rnd = S ? S.rng : function (s) { var a = s; return function () { a = (a * 16807) % 2147483647; return a / 2147483647; }; };

  // If the CDN did not load, degrade to the static final state instead of leaving hidden content.
  if (root.classList.contains("anim") && !(window.gsap && window.ScrollTrigger)) {
    root.classList.remove("anim");
    root.classList.add("reduced");
  }
  var mode = root.classList.contains("anim") ? "anim" : root.classList.contains("lite") ? "lite" : "reduced";

  /* ---------- tiny SVG helpers ---------- */
  function mk(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function stroke(tag, attrs, parent, cls) {            // a drawable ink stroke
    attrs.pathLength = 1;
    var e = mk(tag, attrs, parent);
    e.setAttribute("class", "ink" + (cls ? " " + cls : ""));
    return e;
  }
  function wobbleLine(x1, x2, y, r, amp) {              // hand-ruled line, gentle drift
    var d = "M" + x1 + " " + (y + (r() - .5) * amp), n = 4, i;
    for (i = 1; i <= n; i++) {
      var x = x1 + (x2 - x1) * i / n, px = x1 + (x2 - x1) * (i - .5) / n;
      d += " Q" + px.toFixed(1) + " " + (y + (r() - .5) * amp * 1.6).toFixed(1) + " " + x.toFixed(1) + " " + (y + (r() - .5) * amp).toFixed(1);
    }
    return d;
  }
  function staff(parent, x1, x2, y0, gap, seed, cls) {
    var r = rnd(seed), out = [];
    for (var i = 0; i < 5; i++) out.push(stroke("path", { d: wobbleLine(x1, x2, y0 + i * gap, r, 1.6) }, parent, cls || "thin"));
    return out;
  }
  // diatonic staff step for a MIDI pitch (treble clef, E4 = bottom line)
  var STEP = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  function stepOf(p) { return (Math.floor(p / 12) - 1) * 7 + STEP[p % 12]; }

  function notehead(parent, x, y, hollow, up) {
    var g = mk("g", { class: "nt" }, parent);
    var h = mk("ellipse", { cx: x, cy: y, rx: 10, ry: 7.4, transform: "rotate(-20 " + x + " " + y + ")", class: "head" }, g);
    h.setAttribute("fill", hollow ? "#f3ead6" : "#1d1a16");
    h.setAttribute("stroke", "#1d1a16");
    h.setAttribute("stroke-width", "2.2");
    var stem = null;
    if (up !== null) {
      var sx = up ? x + 9 : x - 9;
      stem = stroke("path", { d: "M" + sx + " " + y + " L" + sx + " " + (up ? y - 40 : y + 40) }, g, "stem");
    }
    return { g: g, head: h, stem: stem };
  }

  /* ---------- 01 · hero staff ---------- */
  var heroDraw = { lines: [], clef: [], bars: [], notes: [] };
  (function () {
    var svg = document.getElementById("hero-staff");
    var Y0 = 110, GAP = 24, X1 = 28, X2 = 616, r = rnd(11);
    heroDraw.lines = staff(svg, X1, X2, Y0, GAP, 5, "");
    // treble clef, one pen movement
    heroDraw.clef.push(stroke("path", { d: "M70 232 C42 236 40 198 64 182 C92 164 98 122 80 96 C68 78 54 98 60 128 C66 160 80 200 84 224 C88 250 60 260 52 244 C46 232 62 222 72 230", "stroke-width": 3.2 }, svg));
    heroDraw.clef.push(stroke("path", { d: "M63 190 C80 200 96 190 90 176 C84 166 66 170 66 184", "stroke-width": 2.6 }, svg));
    var bottom = Y0 + 4 * GAP, song = S ? S.buildSong() : [];
    var mel = song.filter(function (n) { return n.t === 2; });
    var xOf = function (s) { return 130 + s * (440 / 64); };
    [16, 32, 48].forEach(function (s) {
      heroDraw.bars.push(stroke("path", { d: "M" + xOf(s) + " " + Y0 + " L" + xOf(s) + " " + bottom }, svg, "thin"));
    });
    heroDraw.bars.push(stroke("path", { d: "M" + (X2 - 10) + " " + Y0 + " L" + (X2 - 10) + " " + bottom }, svg, "thin"));
    heroDraw.bars.push(stroke("path", { d: "M" + X2 + " " + Y0 + " L" + X2 + " " + bottom, "stroke-width": 4.5 }, svg));
    mel.forEach(function (n) {
      var y = bottom - (stepOf(n.p) - 30) * (GAP / 2);
      var up = y > Y0 + 2 * GAP;
      heroDraw.notes.push(notehead(svg, xOf(n.s) + 8, y, n.d >= 6 && false, up));
    });
  })();

  /* ---------- 02 · the name ---------- */
  var LETTERS = {
    S: "M88 24 C72 2 22 4 22 38 C22 68 82 70 82 102 C82 138 24 138 8 112",
    T: "M6 16 C36 10 66 12 94 16 M50 16 C53 50 47 92 50 134",
    A: "M8 134 L50 8 L92 134 M24 94 C44 90 60 92 77 92",
    V: "M6 10 C20 50 36 96 50 134 C64 96 80 50 94 8",
    E: "M90 16 C62 10 32 12 14 16 C17 52 13 92 12 130 C40 136 66 132 90 130 M16 72 C40 68 60 71 76 72"
  };
  var ROWS = [["S", "ource"], ["T", "racking"], ["A", "nd"], ["V", "ersion Control"], ["E", "nvironment"]];
  var name = { svg: document.getElementById("name-svg"), letters: [], rows: [], start: [], end: [] };
  (function () {
    var layer = document.getElementById("name-letters"), svg = name.svg;
    svg.setAttribute("viewBox", "0 0 640 600");
    ROWS.forEach(function (row, i) {
      var g = mk("g", {}, layer);
      var strokes = LETTERS[row[0]].split(" M").map(function (d, k) { return stroke("path", { d: (k ? "M" : "") + d, "stroke-width": 7 }, g); });
      name.start.push({ x: 8 + i * 126, y: 214, s: 1 });
      var yc = 62 + i * 104;
      name.end.push({ x: 22, y: yc - 30, s: .44 });
      var t = mk("text", { x: 22 + 100 * .44 + 14, y: yc + 16, class: "row", "text-anchor": "start" }, svg);
      t.textContent = row[1];
      name.letters.push({ g: g, strokes: strokes });
      name.rows.push(t);
    });
    var title = mk("title", {}, svg);
    title.textContent = "STAVE: Source Tracking and Version Control Environment";
    svg.insertBefore(title, svg.firstChild);
  })();
  function place(g, p) { g.setAttribute("transform", "translate(" + p.x + " " + p.y + ") scale(" + p.s + ")"); }

  /* ---------- 03 · history ---------- */
  var hist = { lines: [], links: [], notes: [], labels: [] };
  (function () {
    var svg = document.getElementById("history-svg"), SEP = "#7a4a2a";
    var mainY = [76, 64, 70, 58, 64, 52], mainX = function (i) { return 170 + i * 135; };
    var Y1 = 40, Y2 = 168;
    hist.lines = staff(svg, 70, 1170, Y1, 12, 21).concat(staff(svg, 520, 1140, Y2, 12, 33));
    var t1 = mk("text", { x: 8, y: 76, class: "lane" }, svg); t1.textContent = "main";
    var t2 = mk("text", { x: 470, y: 205, class: "lane", "text-anchor": "end" }, svg); t2.textContent = "bridge-alt";
    var commits = S ? S.COMMITS : [];
    var bx = [700, 840], by = [200, 186], mx = 1040, my = 58;
    // branch fork + merge tie
    hist.links.push(stroke("path", { d: "M" + mainX(3) + " " + (mainY[3] + 8) + " C " + (mainX(3) + 60) + " " + (mainY[3] + 70) + ", " + (bx[0] - 90) + " " + by[0] + ", " + (bx[0] - 12) + " " + by[0], stroke: SEP, "stroke-width": 2.6 }, svg));
    hist.links.push(stroke("path", { d: "M" + bx[0] + " " + by[0] + " L" + bx[1] + " " + by[1], stroke: SEP, "stroke-width": 2.6 }, svg));
    hist.links.push(stroke("path", { d: "M" + (bx[1] + 12) + " " + by[1] + " C " + (bx[1] + 120) + " " + by[1] + ", " + (mx - 110) + " " + (my + 40) + ", " + (mx - 12) + " " + (my + 6), stroke: SEP, "stroke-width": 2.6 }, svg));
    hist.links.push(stroke("path", { d: "M" + mainX(5) + " " + (mainY[5] + 2) + " L" + (mx - 12) + " " + (my + 2), "stroke-width": 2.2 }, svg, "thin"));
    for (var i = 0; i < 6; i++) {
      hist.notes.push(notehead(svg, mainX(i), mainY[i], false, mainY[i] > 64));
      var h = mk("text", { x: mainX(i), y: 118, class: "hash", "text-anchor": "middle" }, svg);
      h.textContent = commits[i] ? commits[i].hash : "";
      hist.labels.push(h);
    }
    hist.notes.push(notehead(svg, mx, my, true, false));
    var hm = mk("text", { x: mx, y: 118, class: "hash", "text-anchor": "middle" }, svg); hm.textContent = "5be1f08";
    hist.labels.push(hm);
    ["c19a77d", "08e5b3a"].forEach(function (hh, k) {
      var n = notehead(svg, bx[k], by[k], false, k === 0);
      n.head.setAttribute("stroke", SEP); n.head.setAttribute("fill", SEP);
      if (n.stem) n.stem.setAttribute("stroke", SEP);
      hist.notes.push(n);
      var t = mk("text", { x: bx[k], y: 244, class: "hash", "text-anchor": "middle" }, svg); t.textContent = hh;
      hist.labels.push(t);
    });
    // written list
    var ol = document.getElementById("commit-notes");
    commits.forEach(function (c) {
      var li = document.createElement("li");
      li.innerHTML = '<span class="h">' + c.hash + '</span><span>' + c.msg + '</span><span class="who">' + c.author + " · " + c.when + "</span>";
      ol.appendChild(li);
    });
  })();

  /* ---------- 04 · diff roll (shared data, shared drawRoll) ---------- */
  var roll = { notes: [] };
  (function () {
    var host = document.getElementById("why-roll");
    if (!S) return;
    var svg = S.drawRoll(host, { notes: S.buildSong(), mode: "diff", from: 2, to: 5, steps: 64, lo: 41, hi: 78, cell: 14, rowH: 9, label: "Piano roll comparing two versions: added, removed and velocity-changed notes" });
    roll.notes = [].slice.call(svg.querySelectorAll("rect[data-id]")).sort(function (a, b) { return a.getAttribute("x") - b.getAttribute("x"); });
  })();

  /* ---------- 05 · page illustrations ---------- */
  var pageArt = [];
  (function () {
    document.querySelectorAll(".page-art").forEach(function (svg, idx) {
      var kind = svg.getAttribute("data-art"), els = [], r;
      if (kind === "draft") {
        els = staff(svg, 10, 230, 30, 14, 41);
        [[50, 72], [92, 58], [134, 44], [176, 58]].forEach(function (p) {
          els.push(stroke("ellipse", { cx: p[0], cy: p[1], rx: 9, ry: 6.5, transform: "rotate(-20 " + p[0] + " " + p[1] + ")" }, svg));
        });
        els.push(stroke("path", { d: "M196 100 L226 74 L232 80 L202 106 Z", "stroke-width": 2.2 }, svg, "sepia"));
      } else if (kind === "commit") {
        els = staff(svg, 10, 230, 30, 14, 42);
        [[48, 72, 1], [92, 58, 1], [136, 44, 1], [182, 58, 0]].forEach(function (p) {
          els.push(stroke("ellipse", { cx: p[0], cy: p[1], rx: 9, ry: 6.5, transform: "rotate(-20 " + p[0] + " " + p[1] + ")" }, svg));
          els.push(stroke("path", { d: "M" + (p[0] + 8) + " " + p[1] + " L" + (p[0] + 8) + " " + (p[1] - 32) }, svg));
        });
        els.push(stroke("ellipse", { cx: 182, cy: 58, rx: 20, ry: 16, "stroke-width": 2.2 }, svg, "sepia"));
      } else if (kind === "branch") {
        els = staff(svg, 10, 230, 20, 6, 43).concat(staff(svg, 100, 230, 78, 6, 44));
        els.push(stroke("path", { d: "M66 34 C86 36 86 90 108 92", "stroke-width": 3 }, svg, "sepia"));
        [[34, 34], [66, 34], [124, 92], [168, 92]].forEach(function (p) { els.push(stroke("ellipse", { cx: p[0], cy: p[1], rx: 8, ry: 6, transform: "rotate(-20 " + p[0] + " " + p[1] + ")" }, svg)); });
      } else {
        els = staff(svg, 10, 120, 18, 6, 45).concat(staff(svg, 10, 120, 78, 6, 46)).concat(staff(svg, 150, 230, 48, 6, 47));
        els.push(stroke("path", { d: "M96 34 C130 36 130 62 152 64", "stroke-width": 3 }, svg, "sepia"));
        els.push(stroke("path", { d: "M96 94 C130 92 130 66 152 64", "stroke-width": 3 }, svg, "sepia"));
        els.push(stroke("ellipse", { cx: 196, cy: 64, rx: 11, ry: 8, transform: "rotate(-20 196 64)", "stroke-width": 2.6 }, svg));
      }
      pageArt.push(els);
    });
  })();

  /* ---------- 06 · tools art ---------- */
  var tools = { gm: [], drums: [], wave: [] };
  (function () {
    var gm = document.getElementById("gm-grid");
    for (var row = 0; row < 8; row++) for (var col = 0; col < 16; col++) {
      var d = mk("ellipse", { cx: 12 + col * 19.6, cy: 10 + row * 14.5, rx: 5.2, ry: 4, transform: "rotate(-20 " + (12 + col * 19.6) + " " + (10 + row * 14.5) + ")", class: "gm-dot" }, gm);
      tools.gm.push(d);
    }
    var dr = document.querySelector('[data-art="drums"]');
    tools.drums = staff(dr, 8, 312, 30, 14, 51);
    [30, 70, 110, 150, 190, 230, 270].forEach(function (x, i) {
      var y = i % 2 ? 44 : 72, s = 7;
      tools.drums.push(stroke("path", { d: "M" + (x - s) + " " + (y - s) + " L" + (x + s) + " " + (y + s) + " M" + (x + s) + " " + (y - s) + " L" + (x - s) + " " + (y + s), "stroke-width": 2.6 }, dr));
    });
    var wv = document.querySelector('[data-art="wave"]');
    var d = "M8 60", r = rnd(77);
    for (var x = 8; x <= 312; x += 8) d += " L" + x + " " + (60 - Math.sin((x - 8) / 22) * (10 + 38 * Math.sin((x - 8) / 100 + .3) * Math.sin((x - 8) / 100 + .3)) * (.6 + r() * .4)).toFixed(1);
    tools.wave = [stroke("path", { d: d, "stroke-width": 2.4 }, wv, "sepia")];
  })();

  /* ---------- 07 · signature + final bar ---------- */
  var sign = [];
  (function () {
    var svg = document.getElementById("signature");
    sign.push(stroke("path", { d: "M4 52 C60 6 96 92 150 46 S250 8 300 50 S410 80 470 44", "stroke-width": 3 }, svg, "sepia"));
    sign.push(stroke("path", { d: "M492 18 L492 74", "stroke-width": 2.4 }, svg));
    sign.push(stroke("path", { d: "M510 14 L510 78", "stroke-width": 7 }, svg));
  })();

  /* ---------- paper-bleed filter used by link hovers ---------- */
  (function () {
    var wrap = document.createElementNS(NS, "svg");
    wrap.setAttribute("width", "0"); wrap.setAttribute("height", "0"); wrap.setAttribute("aria-hidden", "true");
    wrap.style.position = "absolute";
    wrap.innerHTML = '<filter id="bleed" x="-20%" y="-40%" width="140%" height="180%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="14"/></filter>';
    document.body.appendChild(wrap);
  })();

  /* ---------- section marker (all modes) ---------- */
  (function () {
    var links = [].slice.call(document.querySelectorAll(".folio-nav a"));
    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.removeAttribute("aria-current"); });
        var a = document.querySelector('.folio-nav a[href="#' + e.target.id + '"]');
        if (a) a.setAttribute("aria-current", "true");
      });
    }, { threshold: .55 });
    document.querySelectorAll(".leaf").forEach(function (s) { io.observe(s); });
  })();

  /* ---------- final-state placement (lite / reduced) ---------- */
  function showFinal() {
    name.letters.forEach(function (l, i) { place(l.g, name.end[i]); });
    mode === "lite" && observeReveals();
  }
  function observeReveals() {
    var items = document.querySelectorAll(".rv, .page");
    if (!("IntersectionObserver" in window)) { items.forEach(function (e) { e.classList.add("in"); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: .15 });
    items.forEach(function (e) { io.observe(e); });
  }

  if (mode !== "anim") { showFinal(); root.setAttribute("data-ready", mode); return; }

  /* ================== ANIM MODE ================== */
  var gsap = window.gsap, ST = window.ScrollTrigger;
  gsap.registerPlugin(ST);

  var OUT = "power2.out";
  function strokesIn(el) { return el.querySelectorAll ? el.querySelectorAll(".ink") : []; }

  // Text/paper rise: entrance ease-out; reversing on leave-back reads as ease-in.
  function risers(sec, extra) {
    var items = sec.querySelectorAll(".rv, .page");
    if (!items.length) return;
    gsap.set(items, { opacity: 0, y: 16 });
    gsap.timeline({ scrollTrigger: { trigger: sec, start: "top 62%", toggleActions: "play none none reverse" } })
      .to(items, { opacity: 1, y: 0, duration: .7, ease: OUT, stagger: .09 });
  }
  // Ink: strokes drawn by scroll while the leaf arrives. Separate trigger from risers().
  function inkScrub(sec, build) {
    var tl = gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: { trigger: sec, start: "top 88%", end: "top 22%", scrub: .5 } });
    build(tl);
    return tl;
  }
  function draw(tl, els, dur, at) {
    tl.to(els, { strokeDashoffset: 0, duration: dur, stagger: dur * .18 }, at);
  }
  function fade(tl, els, dur, at, stagger) {
    tl.fromTo(els, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: dur, stagger: stagger || 0 }, at);
  }

  var secs = {};
  document.querySelectorAll(".leaf").forEach(function (s) { secs[s.id] = s; });
  Object.keys(secs).forEach(function (id) { risers(secs[id]); });

  // 01 — hero draws itself on load (the first screen has no scroll yet to scrub)
  (function () {
    var heads = heroDraw.notes.map(function (n) { return n.head; });
    gsap.set(heads, { opacity: 0 });
    var tl = gsap.timeline({ defaults: { ease: "power2.out" }, delay: .15 });
    tl.to(heroDraw.lines, { strokeDashoffset: 0, duration: 1.1, stagger: .09 }, 0)
      .to(heroDraw.clef, { strokeDashoffset: 0, duration: 1.1, stagger: .3 }, .5)
      .to(heroDraw.bars, { strokeDashoffset: 0, duration: .6, stagger: .08 }, .9)
      .to(heads, { opacity: 1, duration: .35, stagger: .06 }, 1.2)
      .to(heroDraw.notes.map(function (n) { return n.stem; }).filter(Boolean), { strokeDashoffset: 0, duration: .4, stagger: .06 }, 1.3);
  })();

  // 02 — STAVE written in a single pen, then each letter opens into its word
  (function () {
    var sec = secs.s02;
    name.letters.forEach(function (l, i) {
      var st = name.start[i];
      gsap.set(l.g, { svgOrigin: "0 0", x: st.x, y: st.y, scale: st.s });   // single source of truth for the transform
    });
    gsap.set(name.rows, { opacity: 0, x: -10 });
    inkScrub(sec, function (tl) {
      name.letters.forEach(function (l, i) { draw(tl, l.strokes, .9, i * .55); });
    });
    var open = gsap.timeline({ paused: true, defaults: { ease: OUT } });
    name.letters.forEach(function (l, i) {
      var e = name.end[i];
      open.to(l.g, { x: e.x, y: e.y, scale: e.s, duration: .9 }, i * .1)
          .to(name.rows[i], { opacity: 1, x: 0, duration: .6 }, .35 + i * .1);
    });
    ST.create({
      trigger: sec, start: "top 20%",
      onEnter: function () { open.timeScale(1).play(); },
      onLeaveBack: function () { open.timeScale(1.6).reverse(); }
    });
  })();

  // 03 — staff lines, notes and ties written as the leaf arrives
  inkScrub(secs.s03, function (tl) {
    draw(tl, hist.lines, 1, 0);
    draw(tl, hist.notes.map(function (n) { return n.stem; }).filter(Boolean), .4, .6);
    fade(tl, hist.notes.map(function (n) { return n.head; }), .3, .5, .08);
    draw(tl, hist.links, .8, .9);
    fade(tl, hist.labels, .3, 1, .05);
  });

  // 04 — the diff roll inks in left to right
  inkScrub(secs.s04, function (tl) {
    fade(tl, roll.notes, .6, 0, .02);
  });

  // 05 — each page's drawing
  inkScrub(secs.s05, function (tl) {
    pageArt.forEach(function (els, i) { draw(tl, els, .7, i * .4); });
  });

  // 06 — 128 voices, drum notation, waveform
  inkScrub(secs.s06, function (tl) {
    fade(tl, tools.gm, .4, 0, .012);
    draw(tl, tools.drums, .8, .3);
    draw(tl, tools.wave, .8, .6);
  });

  // 07 — signature and the final double bar
  inkScrub(secs.s07, function (tl) { draw(tl, sign, 1, 0); });

  var refresh = function () { ST.refresh(); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
  window.addEventListener("load", refresh);
  root.setAttribute("data-ready", "anim");
})();
