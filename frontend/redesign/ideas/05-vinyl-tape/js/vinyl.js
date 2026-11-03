/* STAVE · idea 05 · Vinyl and Tape — static demo, no backend.
   Part 1 builds all graphics (always runs). Part 2 adds scroll choreography (big screens, motion allowed). */
(function () {
  "use strict";
  var root = document.documentElement;
  var S = window.STAVE;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var uid = 0;

  /* ---------- graphics ---------- */
  function recSVG(o) {
    o = o || {};
    var id = "arc" + (uid++), c = o.c || "#bfe3c9", g = "";
    for (var r = 40; r < 97; r += 2.6) {
      g += '<circle r="' + r.toFixed(1) + '" fill="none" stroke="rgba(255,255,255,' + (Math.round(r) % 13 < 3 ? ".11" : ".045") + ')" stroke-width=".6"/>';
    }
    var label = '<circle r="37" fill="' + c + '"/><circle r="34" fill="none" stroke="rgba(23,19,16,.25)" stroke-width=".6"/>';
    if (o.text !== false) {
      label += '<defs><path id="' + id + 't" d="M-26 0A26 26 0 0 1 26 0"/><path id="' + id + 'b" d="M-30 0A30 30 0 0 0 30 0"/></defs>' +
        '<text font-family="Unbounded,sans-serif" font-size="4.6" font-weight="700" fill="#171310" letter-spacing=".6"><textPath href="#' + id + 't" startOffset="50%" text-anchor="middle">' + (o.a || "STAVE") + '</textPath></text>' +
        '<text font-family="Onest,sans-serif" font-size="4.2" font-weight="600" fill="#171310" letter-spacing=".5"><textPath href="#' + id + 'b" startOffset="50%" text-anchor="middle">' + (o.b || "") + '</textPath></text>';
      for (var i = -2; i <= 2; i++) label += '<line x1="-13" x2="13" y1="' + i * 3.2 + '" y2="' + i * 3.2 + '" stroke="#171310" stroke-opacity=".55" stroke-width=".7"/>';
      label += '<ellipse cx="5" cy="-3.2" rx="2.4" ry="1.7" fill="#171310"/><path d="M7.2 -3.2V-11" stroke="#171310" stroke-width=".8"/>';
    }
    return '<svg viewBox="-100 -100 200 200" aria-hidden="true"><circle r="99" fill="#0c0a09"/>' + g + label + '<circle r="2.6" fill="#130f0d"/></svg>';
  }
  function armSVG() {
    return '<div class="arm-in"><svg viewBox="0 0 100 240" aria-hidden="true">' +
      '<circle cx="80" cy="20" r="16" fill="#2b241e" stroke="#cfc6b6" stroke-width="2"/><circle cx="80" cy="20" r="5" fill="#cfc6b6"/>' +
      '<path d="M80 20V165L46 214" fill="none" stroke="#cfc6b6" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M28 208l24-8 10 24-22 10z" fill="#171310" stroke="#cfc6b6" stroke-width="2.5" stroke-linejoin="round"/></svg></div>';
  }
  $$("[data-rec]").forEach(function (h) {
    var o = {}; try { o = JSON.parse(h.getAttribute("data-rec")); } catch (e) { }
    h.innerHTML = recSVG(o);
  });
  $$(".arm").forEach(function (a) { a.innerHTML = armSVG(); });

  /* 03 · crate + piano roll */
  var notes = S.buildSong(), commits = S.COMMITS;
  var covers = ["#f3ecdc", "#d7ec9a", "#bfe3c9", "#efd4d4", "#f3c9b6", "#dceeb1"];
  var crate = $(".crate"), host = $("#roll-host"), cur = -1;
  commits.forEach(function (c, k) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "sleeve-btn"; b.setAttribute("aria-pressed", "false");
    b.setAttribute("aria-label", "Commit " + (k + 1) + ": " + c.msg);
    b.innerHTML = '<span class="peek">' + recSVG({ c: covers[(k + 2) % 6], text: false }) + '</span>' +
      '<span class="cover" style="background:' + covers[k % 6] + '"><span class="ix">A' + (k + 1) + '</span>' + S.thumb(k * 7 + 3) + '<span class="hs">' + c.hash + '</span></span>';
    b.style.zIndex = k + 1;
    b.addEventListener("click", function () { select(k, true); });
    crate.appendChild(b);
  });
  function select(k, animate) {
    if (k === cur) return;
    cur = k;
    $$(".sleeve-btn").forEach(function (b, i) { b.setAttribute("aria-pressed", i === k ? "true" : "false"); b.style.zIndex = i === k ? 20 : i + 1; });
    var c = commits[k];
    $("#now-msg").textContent = c.msg;
    $("#now-meta").textContent = c.author + " · " + c.when + " · " + c.hash;
    var draw = function () {
      var svg = S.drawRoll(host, { notes: notes, steps: 64, lo: 41, hi: 78, cell: 14, rowH: 8, gutter: 30, to: k, mode: "plain", label: "Piano roll at commit " + c.hash });
      $("#t-add").textContent = svg.querySelectorAll(".n-add").length;
      $("#t-del").textContent = svg.querySelectorAll(".n-del").length;
      $("#t-mod").textContent = svg.querySelectorAll(".n-mod").length;
      host.classList.remove("swap");
    };
    if (animate && root.classList.contains("anim")) { host.classList.add("swap"); setTimeout(draw, 160); } else draw();
  }
  select(commits.length - 1, false);

  /* 05 · steps (CSS transitions do the motion; reduced motion kills them globally) */
  var tape = $("#tape"), stepBtns = $$("#steps button"), timers = [];
  function setStep(n) {
    stepBtns.forEach(function (b) { if (+b.dataset.step === n) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current"); });
    tape.setAttribute("data-step", n);
    [1, 2, 3, 4].forEach(function (i) {
      var g = $(".s" + i, tape);
      g.classList.toggle("on", i <= n && !(i === 1 && n >= 2));
      g.classList.toggle("gone", i === 1 && n >= 2);
    });
  }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function autoplay() { clearTimers(); setStep(0); [1, 2, 3, 4].forEach(function (n) { timers.push(setTimeout(function () { setStep(n); }, 500 + (n - 1) * 1500)); }); }
  stepBtns.forEach(function (b) { b.addEventListener("click", function () { clearTimers(); setStep(+b.dataset.step); }); });
  setStep(4);

  /* 06 · tool visuals */
  var gm = $("#gm");
  for (var i = 0; i < 128; i++) { var d = document.createElement("i"); d.dataset.o = (0.35 + ((i >> 3) % 4) * 0.2).toFixed(2); d.style.opacity = d.dataset.o; gm.appendChild(d); }
  var dr = $("#drums"), rows = [["Kick", [0, 4, 8, 11, 12]], ["Snare", [4, 12, 15]], ["Hat", [0, 2, 4, 6, 8, 10, 12, 14]]], dh = "";
  rows.forEach(function (r, ri) {
    dh += '<text class="lbl" x="0" y="' + (ri * 26 + 20) + '">' + r[0] + '</text>';
    for (var s = 0; s < 16; s++) dh += '<rect class="' + (r[1].indexOf(s) > -1 ? "hit" : "pad") + '" x="' + (40 + s * 11.5) + '" y="' + (ri * 26 + 8) + '" width="9" height="16" rx="2"/>';
  });
  dh += '<rect class="head" x="38" y="2" width="11" height="80" rx="3"/>';
  dr.innerHTML = dh;
  var rn = S.rng(11), wv = "M0 42", wx;
  for (wx = 4; wx <= 224; wx += 4) wv += "L" + wx + " " + (42 + Math.sin(wx / 9) * 22 * Math.sin(wx / 70 + .4) * (0.5 + rn() * 0.7)).toFixed(1);
  $("#wave").innerHTML = '<path d="' + wv + '"/><text x="0" y="80">kick_01.wav  →  C2</text>';
  var exp = $(".exp");
  [[".mid", "#bfe3c9"], ["WAV", "#d7ec9a"], ["MP3", "#f3ecdc"]].forEach(function (e) {
    var ch = document.createElement("div"); ch.className = "chip"; ch.innerHTML = recSVG({ c: e[1], text: false }) + "<span>" + e[0] + "</span>"; exp.appendChild(ch);
  });

  /* rail: current section (works with or without motion) */
  (function () {
    var links = $$(".rail-list a");
    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var i = +e.target.id.slice(1) - 1;
        links.forEach(function (a, j) { if (i === j) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
      });
    }, { threshold: 0.55 });
    $$(".sec").forEach(function (s) { io.observe(s); });
  })();

  /* ---------- motion ---------- */
  function fallbackStatic() { root.classList.remove("anim"); }
  if (!root.classList.contains("anim")) return;
  window.addEventListener("load", function () { if (!window.gsap || !window.ScrollTrigger) fallbackStatic(); });
  if (!window.gsap || !window.ScrollTrigger) { /* script not ready yet or blocked */ if (document.readyState === "complete") fallbackStatic(); }
  function boot() {
    if (!window.gsap || !window.ScrollTrigger) { fallbackStatic(); return; }
    var gsap = window.gsap, ST = window.ScrollTrigger;
    gsap.registerPlugin(ST);
    gsap.defaults({ ease: "power3.out" });          // one personality: ease-out in, ease-in out
    var secs = $$(".sec");

    /* velocity-driven spin: platters turn steadily, reels/cassette follow scroll speed (and rewind going up) */
    var spinEls = $$("[data-spin]").map(function (el) { return { el: el, base: +el.getAttribute("data-spin"), r: Math.random() * 360, sec: el.closest(".sec") }; });
    var spinUp = { v: 0 }, vel = 0, lastY = window.scrollY, boost = 0;
    gsap.ticker.add(function (t, dt) {
      var y = window.scrollY, dts = Math.max(dt, 1) / 1000;
      vel += ((y - lastY) / dts - vel) * 0.12; lastY = y;
      boost = Math.max(-1500, Math.min(1500, vel)) * 0.22;
      for (var i = 0; i < spinEls.length; i++) {
        var s = spinEls[i];
        if (s.sec && !s.sec.classList.contains("live") && !s.el.closest(".mini")) continue;
        var dir = s.base < 0 ? -1 : 1;
        s.r = (s.r + (s.base * spinUp.v + dir * boost) * dts) % 360;
        s.el.style.transform = "rotate(" + s.r.toFixed(2) + "deg)";
      }
    });

    /* tonearms: drop on load; the rail arm walks inward as the page scrolls (scrub only, no toggleActions) */
    var heroArm = $(".hero-deck .arm"), railArm = $(".mini .arm"), railIn = $(".mini .arm-in");
    gsap.fromTo(railArm, { rotation: -18 }, { rotation: 0, duration: 1.4 });
    gsap.fromTo(railIn, { rotation: 0 }, { rotation: 26, ease: "none", scrollTrigger: { trigger: document.body, start: "top top", end: "bottom bottom", scrub: 0.5 } });
    gsap.fromTo(".rail-fill", { scaleY: 0 }, { scaleY: 1, ease: "none", scrollTrigger: { trigger: document.body, start: "top top", end: "bottom bottom", scrub: 0.5 } });

    function mark() { /* rail current is handled by the IntersectionObserver above */ }

    var hooks = {
      0: { enter: function () {
        gsap.fromTo(heroArm, { rotation: -18 }, { rotation: 0, duration: 1.3, delay: .25 });
        gsap.fromTo(spinUp, { v: 0 }, { v: 1, duration: 1.8, ease: "power2.out", overwrite: true });
      }, leave: function () { gsap.to(heroArm, { rotation: -18, duration: .35, ease: "power2.in" }); } },
      1: { enter: nameIn, leave: function () { if (nameTL) nameTL.kill(); gsap.to(".nm-disc, .nm-word", { opacity: 0, duration: .25, ease: "power2.in", overwrite: true }); } },
      2: { enter: function () { select(commits.length - 1, false); } },
      4: { enter: autoplay, leave: function () { clearTimers(); } },
      5: { enter: function () { gsap.fromTo("#gm i", { opacity: 0 }, { opacity: function (i, el) { return +el.dataset.o; }, duration: .5, stagger: { each: .006, from: "random" }, overwrite: true }); } }
    };

    var nameTL;
    function nameIn() {
      if (nameTL) nameTL.kill();
      var sec = $("#s02"), engL = $$(".eng-l", sec), rowsEl = $$(".nm", sec);
      gsap.set(".nm-disc, .nm-word", { clearProps: "transform" });
      gsap.set(engL, { opacity: 1 });
      nameTL = gsap.timeline({ delay: .35 });
      var li = 0;
      rowsEl.forEach(function (row, i) {
        var disc = $(".nm-disc", row), word = $(".nm-word", row), rec = $(".nm-rec", row), letter = $(".nm-letter", row), at = i * .3;
        var from = { x: 0, y: 0 };
        if (letter) {
          var a = engL[li].getBoundingClientRect(), b = disc.getBoundingClientRect();
          from = { x: a.left + a.width / 2 - (b.left + b.width / 2), y: a.top + a.height / 2 - (b.top + b.height / 2) };
          nameTL.to(engL[li], { opacity: .18, duration: .3, ease: "power2.in" }, at);
          li++;
        }
        nameTL.fromTo(disc, { x: from.x, y: from.y, scale: .5, opacity: 0 }, { x: 0, y: 0, scale: 1, opacity: 1, duration: .75 }, at)
              .fromTo(rec, { rotation: -200 }, { rotation: 0, duration: 1.0 }, at)
              .fromTo(word, { x: -22, opacity: 0 }, { x: 0, opacity: 1, duration: .6 }, at + .45);
      });
    }

    function enter(sec, i, dir) {
      sec.classList.add("live");
      mark(i);
      var items = $$("[data-rv]", sec);
      gsap.fromTo(items, { y: dir > 0 ? 28 : -28, opacity: 0 }, { y: 0, opacity: 1, duration: .85, stagger: .08, overwrite: true });
      if (hooks[i] && hooks[i].enter) hooks[i].enter();
    }
    function leave(sec, i, dir) {
      var items = $$("[data-rv]", sec);
      gsap.to(items, { y: dir * -14, opacity: 0, duration: .3, ease: "power2.in", overwrite: true, onComplete: function () { sec.classList.remove("live"); } });
      if (hooks[i] && hooks[i].leave) hooks[i].leave();
    }
    secs.forEach(function (sec, i) {
      ST.create({ trigger: sec, start: "top 60%", end: "bottom 40%",
        onEnter: function () { enter(sec, i, 1); }, onEnterBack: function () { enter(sec, i, -1); },
        onLeave: function () { leave(sec, i, 1); }, onLeaveBack: function () { leave(sec, i, -1); } });
    });

    var refresh = function () { ST.refresh(); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
    window.addEventListener("load", refresh);
    /* three.js is not used, so there is nothing to dispose; just release the ticker/triggers on exit */
    window.addEventListener("pagehide", function () { ST.getAll().forEach(function (t) { t.kill(); }); });
  }
  if (document.readyState === "complete") boot(); else window.addEventListener("load", boot);
})();
