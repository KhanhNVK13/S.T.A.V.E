/* Sound preview (Web Audio). Off by default; nothing is created until the user presses the button. */
(function () {
  var ctx, master, analyser, buf, timer = 0, raf = 0, step = 0, on = false, level = 0;
  var PROG = ["Am", "F", "C", "G"];
  var api = { onChord: null, onLevel: null };

  function freq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function playChord(name) {
    var notes = window.SYN.CHORDS[name], t = ctx.currentTime;
    notes.forEach(function (m, i) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = i === 0 ? "sine" : "triangle";
      o.frequency.value = freq(m);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(i === 0 ? .26 : .12, t + .06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 2.2);
    });
    if (api.onChord) api.onChord(name, notes);
  }

  function tick() {
    playChord(PROG[step++ % PROG.length]);
  }

  function meter() {
    if (!on) return;
    analyser.getByteTimeDomainData(buf);
    var sum = 0;
    for (var i = 0; i < buf.length; i++) { var v = (buf[i] - 128) / 128; sum += v * v; }
    var rms = Math.sqrt(sum / buf.length);
    var target = Math.min(1, rms * 5);
    level += (target - level) * .25;
    if (api.onLevel) api.onLevel(level);
    raf = requestAnimationFrame(meter);
  }

  function start() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = .0001;
    analyser = ctx.createAnalyser(); analyser.fftSize = 512; buf = new Uint8Array(analyser.fftSize);
    master.connect(analyser); analyser.connect(ctx.destination);
    master.gain.exponentialRampToValueAtTime(.7, ctx.currentTime + .2);
    if (ctx.state === "suspended") ctx.resume();
    on = true; step = 0; tick(); timer = setInterval(tick, 2000); raf = requestAnimationFrame(meter);
    return true;
  }

  function stop() {
    if (!on) return;
    on = false; clearInterval(timer); cancelAnimationFrame(raf);
    var c = ctx, m = master;
    try { m.gain.cancelScheduledValues(c.currentTime); m.gain.setTargetAtTime(.0001, c.currentTime, .05); } catch (e) { }
    setTimeout(function () { try { c.close(); } catch (e) { } }, 300);
    level = 0; if (api.onLevel) api.onLevel(0);
    if (api.onStop) api.onStop();
  }

  api.supported = function () { return !!(window.AudioContext || window.webkitAudioContext); };
  api.isOn = function () { return on; };
  api.toggle = function () { if (on) { stop(); return false; } return start(); };
  api.stop = stop;
  window.SYN.audio = api;
})();
