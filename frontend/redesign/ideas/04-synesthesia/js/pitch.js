/* Pitch -> colour mapping (the "synaesthesia" table).
   hue        = pitch class * 30deg   (C = 0deg red ... B = 330deg)
   lightness  = 38% + 6% per octave above octave 2, clamped to 30..62%
   saturation = 78% (constant)
   Used for the background and decoration ONLY. Diff labels keep their semantic colours. */
(function () {
  var NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    var q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    function f(t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < .5) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  }

  function color(midi) {
    var pc = ((midi % 12) + 12) % 12, oct = Math.floor(midi / 12) - 1;
    var l = Math.max(.30, Math.min(.62, .38 + .06 * (oct - 2)));
    return hsl(pc * 30, .78, l);
  }
  function hex(midi) {
    var c = color(midi);
    return "#" + c.map(function (v) { return ("0" + Math.round(v * 255).toString(16)).slice(-2); }).join("");
  }
  function css(midi, a) {
    var c = color(midi);
    return "rgba(" + c.map(function (v) { return Math.round(v * 255); }).join(",") + "," + (a === undefined ? 1 : a) + ")";
  }

  // Chords come from the sample song in shared.js: Am, F(add9), C, G (bass note first)
  var CHORDS = {
    Am: [45, 57, 60, 64], F: [41, 57, 60, 65], C: [48, 55, 60, 64], G: [43, 55, 59, 62]
  };
  // one chord per block
  var SECTION_CHORD = ["Am", "F", "C", "G", "Am", "F", "C"];

  window.SYN = { NAMES: NAMES, color: color, hex: hex, css: css, CHORDS: CHORDS, SECTION_CHORD: SECTION_CHORD };
})();
