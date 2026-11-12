/* Page orchestration. Motion personality: LIQUID (slow ease-out entrances, quicker ease-in exits). */
(function () {
  var SYN = window.SYN, ST = window.STAVE, fluid = SYN.fluid, audio = SYN.audio;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasGsap = !!(window.gsap && window.ScrollTrigger);
  var root = document.documentElement;
  var qs = new URLSearchParams(location.search);
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var sections = $$(".blk");
  var live = $("#live");
  function say(msg) { if (live) { live.textContent = ""; setTimeout(function () { live.textContent = msg; }, 30); } }
  var EASE_IN = "power2.in", EASE_OUT = "power3.out";
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  /* ---------- decoration: pitch key, per-element hues ---------- */
  var key = $("#pitchkey");
  SYN.NAMES.forEach(function (n, i) {
    var s = document.createElement("span");
    s.innerHTML = '<i style="background:' + SYN.hex(60 + i) + '"></i>' + n;
    key.appendChild(s);
  });
  var keyEls = $$("span", key);
  $$("#name li").forEach(function (li, i) { li.style.setProperty("--hue", SYN.hex(57 + i * 2.4 | 0)); });
  $$(".tool-list li").forEach(function (li, i) { li.style.setProperty("--hue", SYN.hex(60 + i * 3)); });

  /* ---------- backgrounds: fallback gradients (one layer per block) ---------- */
  var fb = $("#fallback-bg");
  var fbLayers = sections.map(function (_, i) {
    var ch = SYN.CHORDS[SYN.SECTION_CHORD[i]], d = document.createElement("div");
    d.style.background =
      "radial-gradient(60% 55% at 22% 28%," + SYN.css(ch[1], .55) + ",transparent 70%)," +
      "radial-gradient(55% 60% at 80% 35%," + SYN.css(ch[2], .5) + ",transparent 70%)," +
      "radial-gradient(70% 60% at 55% 95%," + SYN.css(ch[3], .5) + ",transparent 70%)," +
      "radial-gradient(40% 40% at 90% 90%," + SYN.css(ch[0] + 12, .4) + ",transparent 70%), #07070d";
    fb.appendChild(d);
    return d;
  });
  var fbCurrent = 0;
  function showFallback(i, instant) {
    if (i === fbCurrent && !instant) return;
    var from = fbLayers[fbCurrent], to = fbLayers[i];
    fbCurrent = i;
    if (!hasGsap || reduce || instant) { fbLayers.forEach(function (l, k) { l.style.opacity = k === i ? 1 : 0; }); return; }
    gsap.to(to, { opacity: 1, duration: 1.4, ease: "power2.out", overwrite: true });
    gsap.to(from, { opacity: 0, duration: 1.4, ease: "power2.out", overwrite: true });
  }

  /* ---------- chords -> shader colours ---------- */
  var activeSection = 0;
  function applyChord(notes, dur) {
    var cols = [notes[0], notes[1], notes[2], notes[3]].map(SYN.color);
    cols.forEach(function (c, k) {
      var tgt = fluid.state.cols[k];
      if (!hasGsap || reduce || !dur) { tgt[0] = c[0]; tgt[1] = c[1]; tgt[2] = c[2]; }
      else gsap.to(tgt, { 0: c[0], 1: c[1], 2: c[2], duration: dur, ease: "power2.out", overwrite: true });
    });
  }
  function sectionChord() { return SYN.CHORDS[SYN.SECTION_CHORD[activeSection]]; }

  /* ---------- background mode: WebGL2 or lite ---------- */
  var lite = matchMedia("(max-width: 899px)");
  var glTried = false, glOk = false;
  function wantGL() { return !lite.matches && !qs.has("lite") && !qs.has("nogl"); }
  function applyMode() {
    if (wantGL()) {
      if (!glTried) {
        glTried = true;
        glOk = fluid.init($("#fluid"), function () { glOk = false; applyMode(); });
      }
    }
    var useGL = wantGL() && glOk && fluid.isReady();
    root.classList.toggle("gl", useGL);
    root.classList.toggle("lite", !useGL);
    if (useGL) {
      fluid.resize();
      applyChord(sectionChord(), 0);
      if (reduce) fluid.renderOnce(); else fluid.start();
    } else {
      fluid.stop();
      showFallback(activeSection, true);
    }
  }
  applyMode();
  lite.addEventListener("change", applyMode);
  addEventListener("resize", function () { if (root.classList.contains("gl")) { fluid.resize(); if (reduce) fluid.renderOnce(); } });
  fluid.state.cols.forEach(function (c, k) { var n = SYN.color(sectionChord()[k]); c[0] = n[0]; c[1] = n[1]; c[2] = n[2]; });

  /* ---------- pointer = a pitch ---------- */
  var lastKey = -1, lastMidi = -1;
  if (!reduce) {
    addEventListener("pointermove", function (e) {
      var x = Math.min(.999, Math.max(0, e.clientX / innerWidth)), y = Math.min(.999, Math.max(0, e.clientY / innerHeight));
      var pc = Math.floor(x * 12), oct = 2 + Math.floor((1 - y) * 4), midi = 12 * (oct + 1) + pc;
      if (root.classList.contains("gl")) fluid.setPointer(x, 1 - y);
      if (pc !== lastKey) {
        if (keyEls[lastKey]) keyEls[lastKey].classList.remove("on");
        keyEls[pc].classList.add("on"); lastKey = pc;
      }
      if (midi !== lastMidi && root.classList.contains("gl")) {
        lastMidi = midi;
        var c = SYN.color(midi), t = fluid.state.ptrCol;
        if (hasGsap) gsap.to(t, { 0: c[0], 1: c[1], 2: c[2], duration: .45, ease: "power2.out", overwrite: true });
        else { t[0] = c[0]; t[1] = c[1]; t[2] = c[2]; }
      }
    }, { passive: true });
  }

  /* ---------- sound preview ---------- */
  var soundBtn = $("#sound"), soundLabel = $("#sound-label");
  if (!audio.supported()) { soundBtn.disabled = true; soundLabel.textContent = "Sound unavailable"; }
  audio.onChord = function (name, notes) { applyChord(notes, .5); };
  audio.onLevel = function (lv) {
    fluid.state.level = lv;
    if (!root.classList.contains("gl")) fb.style.transform = lv > .005 ? "scale(" + (1 + lv * .06).toFixed(4) + ")" : "";
  };
  audio.onStop = function () { applyChord(sectionChord(), 1.2); };
  soundBtn.addEventListener("click", function () {
    var nowOn = audio.toggle();
    soundBtn.setAttribute("aria-pressed", String(!!nowOn));
    soundLabel.textContent = nowOn ? "Sound preview: on" : "Sound preview: off";
    say(nowOn ? "Sound preview on. The background now follows the notes." : "Sound preview off.");
  });

  /* ---------- scroll: stirring, active block, chord, nav ---------- */
  var dots = $$(".dots a");
  function setActive(i) {
    activeSection = i;
    dots.forEach(function (a, k) { if (k === i) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
    if (!audio.isOn()) applyChord(sectionChord(), 1.6);
    if (!root.classList.contains("gl")) showFallback(i);
    else if (reduce) fluid.renderOnce();
  }
  setActive(0);
  if (hasGsap) {
    ScrollTrigger.create({
      start: 0, end: "max",
      onUpdate: function (self) {
        fluid.state.scroll = self.progress;
        fluid.state.vel[1] = Math.max(-.6, Math.min(.6, fluid.state.vel[1] + Math.max(-.5, Math.min(.5, self.getVelocity() / 9000)) * .1));
      }
    });
    sections.forEach(function (sec, i) {
      ScrollTrigger.create({ trigger: sec, start: "top 50%", end: "bottom 50%", onToggle: function (self) { if (self.isActive) setActive(i); } });
    });
  }

  /* ---------- entrances (opacity + transform only; content stays visible if GSAP or motion is off) ---------- */
  var tls = {};
  function makeEntrance(sec, tl) {
    ScrollTrigger.create({
      trigger: sec, start: "top 60%", end: "bottom 40%",
      onEnter: function () { play(sec.id); }, onEnterBack: function () { play(sec.id); },
      onLeave: function () { out(sec.id); }, onLeaveBack: function () { out(sec.id); }
    });
    tls[sec.id] = tl;
  }
  var hooks = {};   // per block: { enter(), leave() }
  function play(id) { var t = tls[id]; if (t) t.timeScale(1).play(); if (hooks[id] && hooks[id].enter) hooks[id].enter(); }
  function out(id) { var t = tls[id]; if (t) t.timeScale(2.4).reverse(); if (hooks[id] && hooks[id].leave) hooks[id].leave(); }

  if (hasGsap && !reduce) {
    sections.forEach(function (sec) {
      if (sec.id === "s2") return;   // special timeline below
      var items = $$("[data-in]", sec);
      if (!items.length) return;
      gsap.set(items, { opacity: 0, y: 30 });
      var tl = gsap.timeline({ paused: true }).to(items, { opacity: 1, y: 0, duration: 1.05, ease: EASE_OUT, stagger: .09 });
      makeEntrance(sec, tl);
    });
  }

  /* ---------- 02 · the name explains itself ---------- */
  (function () {
    var sec = $("#s2");
    if (!hasGsap || reduce) return;
    var title = $("#h2"), note = $(".note", sec);
    var letters = $$("[data-letter]", sec), chs = [];
    letters.forEach(function (li) {
      var cap = $(".cap", li), kids = [].slice.call(cap.childNodes), frag = document.createDocumentFragment(), mine = [];
      kids.forEach(function (n) {
        if (n.nodeType === 3) {
          n.textContent.split("").forEach(function (c) { var s = document.createElement("span"); s.className = "ch"; s.textContent = c; frag.appendChild(s); mine.push(s); });
        } else { frag.appendChild(n); if (n.tagName === "I") mine.push(n); }
      });
      cap.innerHTML = ""; cap.appendChild(frag);
      chs.push({ big: $(".big", li), b: $("b", cap), rest: mine, li: li });
    });
    gsap.set([title, note], { opacity: 0, y: 30 });
    chs.forEach(function (c) { gsap.set(c.big, { opacity: 0, y: 46, scale: .9 }); gsap.set(c.rest, { opacity: 0, x: -8 }); gsap.set(c.b, { opacity: 0 }); });
    var tl = gsap.timeline({ paused: true });
    tl.to(title, { opacity: 1, y: 0, duration: 1, ease: "expo.out" }, 0);
    chs.forEach(function (c, i) {
      var t0 = .35 + i * .55;
      tl.to(c.big, { opacity: 1, y: 0, scale: 1, duration: 1, ease: "expo.out" }, t0)
        .to(c.rest, { opacity: 1, x: 0, duration: .5, ease: EASE_OUT, stagger: .028 }, t0 + .3)
        .to(c.b, { opacity: 1, duration: .3, ease: "power2.out" }, t0 + .3)
        .to(c.big, { scale: 1.07, duration: .35, ease: "power2.out", yoyo: true, repeat: 1 }, t0 + .45);
    });
    tl.to(note, { opacity: 1, y: 0, duration: 1, ease: EASE_OUT }, .75 + chs.length * .55);
    makeEntrance(sec, tl);
  })();

  /* ---------- 03 · history ---------- */
  var song = ST.buildSong(), commits = ST.COMMITS, cur = commits.length - 1, autoplay = null, userTook = false, playing = false;
  (function () {
    var list = $("#commits"), rollHost = $("#roll"), range = $("#range"), playBtn = $("#play"), playIc = $("#play-ic");
    commits.forEach(function (c, i) {
      var li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.setAttribute("aria-pressed", "false");
      b.innerHTML = '<span class="dot" style="--hue:' + SYN.hex(57 + i * 2) + '"></span><span>' + c.msg + '<small>' + c.hash + ' · ' + c.author + ' · ' + c.when + '</small></span>';
      b.addEventListener("click", function () { takeover(); show(i, true); });
      li.appendChild(b); list.appendChild(li);
    });
    function tally(k) {
      var a = 0, d = 0, m = 0;
      song.forEach(function (n) {
        var was = ST.stateAt(n, k - 1), is = ST.stateAt(n, k);
        if (!was && is) a++; else if (was && !is) d++; else if (was && is && n.chg !== null && n.chg > k - 1 && n.chg <= k) m++;
      });
      return [a, d, m];
    }
    function show(k, animate) {
      cur = k;
      $$("button", list).forEach(function (b, i) { b.setAttribute("aria-pressed", String(i === k)); });
      range.value = k;
      var c = commits[k], t = tally(k);
      $("#stage-title").textContent = c.hash + " · " + c.msg;
      $("#tally").innerHTML = '<b class="a">' + t[0] + '</b> added · <b class="d">' + t[1] + '</b> removed · <b class="m">' + t[2] + '</b> velocity changed';
      ST.drawRoll(rollHost, { notes: song, mode: "diff", from: k - 1, to: k, steps: 64, lo: 41, hi: 77, cell: 14, rowH: 9, label: "Piano roll showing the changes in commit " + c.hash + ": " + c.msg });
      if (animate && hasGsap && !reduce) {
        var ch = $$(".n-add, .n-del, .n-mod", rollHost);
        if (ch.length) gsap.from(ch, { opacity: 0, y: -6, duration: .7, ease: EASE_OUT, stagger: .014 });
      }
    }
    function setPlaying(on) {
      playing = on;
      playBtn.setAttribute("aria-label", on ? "Pause" : "Play through the commits");
      playIc.setAttribute("d", on ? "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" : "M7 5v14l12-7z");
    }
    function stopAuto() { if (autoplay) { autoplay.kill(); autoplay = null; } setPlaying(false); }
    function runAuto(from) {
      stopAuto(); setPlaying(true); var k = from;
      show(k, true);
      (function next() {
        autoplay = gsap.delayedCall(1.7, function () {
          if (k >= commits.length - 1) { stopAuto(); return; }
          k++; show(k, true);
          if (k >= commits.length - 1) stopAuto(); else next();
        });
      })();
    }
    function takeover() { userTook = true; stopAuto(); }
    range.addEventListener("input", function () { takeover(); show(+range.value, true); });
    playBtn.addEventListener("click", function () {
      if (!hasGsap) return;
      if (playing) { takeover(); return; }
      userTook = true; runAuto(cur >= commits.length - 1 ? 0 : cur + 1);
    });
    show(cur, false);
    var started = false;
    hooks.s3 = {
      enter: function () { if (hasGsap && !reduce && !started && !userTook) { started = true; gsap.delayedCall(.9, function () { if (!userTook) runAuto(0); }); } },
      leave: function () { if (autoplay) stopAuto(); }
    };
  })();

  /* ---------- 05 · how it works ---------- */
  (function () {
    var N = song;
    ST.drawRoll($("#v0"), { notes: N, mode: "step", to: 0, steps: 64, lo: 41, hi: 77, label: "Draft: the chord frame only" });
    ST.drawRoll($("#v1"), { notes: N, mode: "step", to: 1, steps: 64, lo: 41, hi: 77, label: "Commit: the new bass line shown as added notes" });
    ST.staffGraph($("#v2"), { big: true, current: "f6a2d91" });
    ST.staffGraph($("#v3"), { big: true, showHash: true, current: "5be1f08" });
    var btns = $$("#steps button"), panes = [0, 1, 2, 3].map(function (i) { return $("#pane" + i); }), at = 0, auto = null, taken = false, busy = false;
    function go(i) {
      if (i === at || busy) return;
      var from = panes[at], to = panes[i];
      btns.forEach(function (b, k) { b.setAttribute("aria-pressed", String(k === i)); });
      at = i;
      if (!hasGsap || reduce) { from.hidden = true; to.hidden = false; return; }
      busy = true;
      gsap.to(from, { opacity: 0, duration: .22, ease: EASE_IN, onComplete: function () {
        from.hidden = true; to.hidden = false;
        gsap.fromTo(to, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: .75, ease: EASE_OUT, onComplete: function () { busy = false; } });
        gsap.set(from, { opacity: 1 });
      } });
    }
    function stopAuto() { if (auto) { auto.kill(); auto = null; } }
    function loop() { stopAuto(); auto = gsap.delayedCall(3.4, function () { go((at + 1) % 4); if (!taken) loop(); }); }
    btns.forEach(function (b) { b.addEventListener("click", function () { taken = true; stopAuto(); go(+b.dataset.step); }); });
    hooks.s5 = {
      enter: function () { if (hasGsap && !reduce && !taken) loop(); },
      leave: function () { stopAuto(); }
    };
  })();

  /* ---------- 06 · General MIDI grid ---------- */
  (function () {
    var FAM = ["Piano", "Chromatic percussion", "Organ", "Guitar", "Bass", "Strings", "Ensemble", "Brass", "Reed", "Pipe", "Synth lead", "Synth pad", "Synth effects", "Ethnic", "Percussive", "Sound effects"];
    var host = $("#gm"), read = $("#gm-read"), rows = [];
    FAM.forEach(function (name, r) {
      var row = document.createElement("div"); row.className = "gm-row";
      var b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-pressed", "false");
      b.textContent = name; b.setAttribute("aria-label", name + ", programs " + (r * 8 + 1) + " to " + (r * 8 + 8));
      var cells = document.createElement("div"); cells.className = "cells"; cells.setAttribute("aria-hidden", "true");
      for (var c = 0; c < 8; c++) { var s = document.createElement("span"); s.style.setProperty("--c", SYN.hex(48 + ((r * 8 + c) % 12) + 12 * (r % 3))); cells.appendChild(s); }
      b.addEventListener("click", function () {
        rows.forEach(function (x) { x.row.classList.remove("on"); x.b.setAttribute("aria-pressed", "false"); });
        row.classList.add("on"); b.setAttribute("aria-pressed", "true");
        read.textContent = "Programs " + (r * 8 + 1) + "–" + (r * 8 + 8) + " · " + name;
        if (hasGsap && !reduce) gsap.fromTo($$("span", cells), { scale: 1 }, { scale: 1.3, duration: .3, ease: "power2.out", yoyo: true, repeat: 1, stagger: .035 });
      });
      row.appendChild(b); row.appendChild(cells); host.appendChild(row); rows.push({ row: row, b: b });
    });
  })();

  /* ---------- lifecycle ---------- */
  function refresh() { if (hasGsap) ScrollTrigger.refresh(); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
  addEventListener("load", refresh);
  // make sure the first block plays even if its trigger started already active
  if (hasGsap && !reduce) requestAnimationFrame(function () { if (scrollY < 10) play("s1"); });
  addEventListener("pagehide", function () { audio.stop(); fluid.dispose(); });

  window.__syn = { ready: true, hasGsap: hasGsap, reduce: reduce, mode: function () { return root.classList.contains("gl") ? "webgl2" : "lite"; } };
})();
