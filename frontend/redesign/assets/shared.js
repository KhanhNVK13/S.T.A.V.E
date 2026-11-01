(function () {
  var NS = "http://www.w3.org/2000/svg";

  var ICONS = {
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6z"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    play: '<path d="M7 5v14l12-7z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M18 10c0 5-8 3-12 7"/>',
    commit: '<circle cx="12" cy="12" r="3"/><path d="M3 12h6M15 12h6"/>',
    merge: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="14" r="2"/><path d="M6 7v10M6 9c0 6 6 3 10 5"/>',
    compare: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M13 6h-2a3 3 0 0 0-3 3v7M11 18h2a3 3 0 0 0 3-3V8"/>',
    back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    fork: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6 7v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7M12 12v5"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    undo: '<path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3"/>',
    redo: '<path d="m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    cursor: '<path d="m5 3 14 8-6 2-2 6z"/>',
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
    eraser: '<path d="m7 21-4-4 11-11 7 7-7 8zM11 21h10"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5M12 17h.01"/>',
    arrow: '<path d="M7 17 17 7M8 7h9v9"/>'
  };

  function ic(name, cls) {
    return '<svg class="icon ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + "</svg>";
  }

  function mark(size) {
    var s = size || 28;
    var lines = "";
    for (var i = 0; i < 5; i++) lines += '<rect x="4" y="' + (6.4 + i * 3.7) + '" width="20" height="1.3" fill="#ffffff" opacity=".55"/>';
    return '<svg class="mark" width="' + s + '" height="' + s + '" viewBox="0 0 28 28" aria-hidden="true"><rect width="28" height="28" rx="7" fill="#000000"/>' + lines + '<ellipse cx="14" cy="13.8" rx="4.2" ry="3.1" transform="rotate(-20 14 13.8)" fill="#dceeb1"/><path d="M17.7 12.6V5.2" stroke="#dceeb1" stroke-width="1.5" fill="none"/></svg>';
  }

  function mountShell(active) {
    var host = document.getElementById("shell");
    if (!host) return;
    try { sessionStorage.setItem("stave-in", "1"); } catch { }
    var items = [
      ["projects", "folder", "My projects", "projects.html", "4"],
      ["explore", "compass", "Explore", "explore.html", ""],
      ["rankings", "trophy", "Rankings", "rankings.html", ""],
      ["notifications", "bell", "Notifications", "projects.html#notifications", "3"]
    ];
    var recent = [
      ["Rainy Saigon Night", "project.html"],
      ["Morning bossa", "project.html"],
      ["Intro for the November EP", "project.html"]
    ];
    var nav = items.map(function (it) {
      return '<a href="' + it[3] + '"' + (it[0] === active ? ' aria-current="page"' : "") + ">" + ic(it[1]) + it[2] + (it[4] ? '<span class="count">' + it[4] + "</span>" : "") + "</a>";
    }).join("");
    var rec = recent.map(function (r) {
      return '<a href="' + r[1] + '">' + ic("music") + r[0] + "</a>";
    }).join("");
    host.className = "side";
    host.setAttribute("aria-label", "Main navigation");
    host.innerHTML =
      '<a class="switcher" href="index.html">' + mark() + '<span translate="no">STAVE<small>Khanh’s workspace</small></span></a>' +
      '<button class="pal-btn" id="pal-open" type="button" aria-keyshortcuts="Control+K Meta+K">' + ic("search") + 'Quick find<kbd>Ctrl K</kbd></button>' +
      '<nav class="nav">' + nav + '<div class="nav-label">Recent projects</div>' + rec + "</nav>" +
      '<div class="side-foot nav"><a href="help.html"' + (active === "help" ? ' aria-current="page"' : "") + '>' + ic("help") + 'Help and glossary</a><a href="settings.html">' + ic("sliders") + 'Settings</a>' +
      '<a class="user" href="settings.html"><span class="avatar">K</span><span>Khanh<br><small style="color:var(--soft)">khanh@stave.app</small></span></a></div>';
    mountPalette();
    var btn = document.getElementById("menu-btn");
    if (btn) {
      btn.addEventListener("click", function () {
        var open = host.getAttribute("data-open") === "true";
        host.setAttribute("data-open", open ? "false" : "true");
        btn.setAttribute("aria-expanded", open ? "false" : "true");
      });
    }
  }

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var COMMITS = [
    { hash: "e41b9a0", msg: "Chord frame Am – F – C – G", author: "Khanh", when: "Oct 12", ago: "2 weeks ago" },
    { hash: "7c03d5e", msg: "Add a root-note bass line", author: "Khanh", when: "Oct 14", ago: "2 weeks ago" },
    { hash: "b92af61", msg: "Verse melody, bars 1–2", author: "Minh Anh", when: "Oct 18", ago: "12 days ago" },
    { hash: "3fd81c7", msg: "Melody bars 3–4, remove duplicate notes on the C chord", author: "Minh Anh", when: "Oct 21", ago: "9 days ago" },
    { hash: "a58e204", msg: "Shift bass back half a beat for swing", author: "Khanh", when: "Oct 26", ago: "4 days ago" },
    { hash: "d70c9b3", msg: "Normalize velocity for pad and melody", author: "Khanh", when: "Oct 29", ago: "yesterday" }
  ];

  function buildSong() {
    var notes = [];
    var id = 0;
    function add(track, s, d, p, born, extra) {
      var n = { id: id++, t: track, s: s, d: d, p: p, born: born, died: null, chg: null };
      if (extra) for (var k in extra) n[k] = extra[k];
      notes.push(n);
      return n;
    }
    var chords = [[57, 60, 64], [57, 60, 65], [55, 60, 64], [55, 59, 62]];
    var roots = [45, 41, 48, 43];
    chords.forEach(function (ch, bar) {
      ch.forEach(function (p) {
        var n = add(0, bar * 16, 16, p, 0);
        if (bar === 2 && p === 64) n.died = 3;
        if (bar < 2) n.chg = 5;
      });
    });
    roots.forEach(function (r, bar) {
      var shifted = bar === 1 || bar === 2;
      var steps = [[0, 6, r], [8, 4, r], [12, 4, r + 7]];
      steps.forEach(function (st) {
        if (!shifted) {
          add(1, bar * 16 + st[0], st[1], st[2], 1);
        } else {
          add(1, bar * 16 + st[0], st[1], st[2], 1, { died: 4 });
          add(1, bar * 16 + st[0] + 2, Math.max(2, st[1] - 2), st[2], 4);
        }
      });
    });
    var mel = [
      [[0, 4, 72], [4, 2, 74], [6, 2, 76], [8, 6, 72]],
      [[16, 4, 69], [20, 4, 72], [24, 8, 71]],
      [[32, 4, 72], [36, 2, 76], [38, 2, 77], [40, 6, 76]],
      [[48, 6, 74], [54, 2, 72], [56, 8, 69]]
    ];
    mel.forEach(function (bar, i) {
      bar.forEach(function (n) {
        var born = i < 2 ? 2 : 3;
        var o = add(2, n[0], n[1], n[2], born);
        if (i === 1) o.chg = 5;
      });
    });
    return notes;
  }

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function stateAt(n, k) {
    return n.born <= k && (n.died === null || n.died > k);
  }

  function drawRoll(host, opts) {
    var o = opts || {};
    var steps = o.steps || 64;
    var lo = o.lo || 40;
    var hi = o.hi || 79;
    var cell = o.cell || 14;
    var rowH = o.rowH || 9;
    var gutter = o.gutter === undefined ? 34 : o.gutter;
    var W = gutter + steps * cell;
    var H = (hi - lo + 1) * rowH + 18;
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, class: "roll", role: "img", "aria-label": o.label || "Piano roll" });
    var black = { 1: 1, 3: 1, 6: 1, 8: 1, 10: 1 };
    for (var p = hi; p >= lo; p--) {
      var y = 18 + (hi - p) * rowH;
      var pc = p % 12;
      if (black[pc]) el("rect", { x: gutter, y: y, width: W - gutter, height: rowH, class: "row-b" }, svg);
      if (pc === 0) {
        el("rect", { x: gutter, y: y, width: W - gutter, height: rowH, class: "row-c" }, svg);
        var t = el("text", { x: gutter - 6, y: y + rowH - 1, "text-anchor": "end", class: "lbl" }, svg);
        t.textContent = "C" + (Math.floor(p / 12) - 1);
      }
    }
    for (var s = 0; s <= steps; s += 4) {
      var x = gutter + s * cell;
      el("line", { x1: x, x2: x, y1: s % 16 === 0 ? 2 : 18, y2: H, class: s % 16 === 0 ? "bar" : "beat" }, svg);
      if (s % 16 === 0 && s < steps) {
        var bl = el("text", { x: x + 5, y: 12, class: "lbl" }, svg);
        bl.textContent = String(s / 16 + 1);
      }
    }
    var from = o.from;
    var to = o.to;
    (o.notes || []).forEach(function (n) {
      var cls = null;
      if (o.cls) {
        cls = o.cls(n);
      } else if (o.mode === "diff") {
        var a = stateAt(n, from);
        var b = stateAt(n, to);
        if (a && b) cls = n.chg !== null && n.chg > from && n.chg <= to ? "n-mod" : "n-dim";
        else if (b) cls = "n-add";
        else if (a) cls = "n-del";
      } else {
        var alive = stateAt(n, to);
        var ghost = n.died === to;
        if (alive) {
          if (n.born === to && to > 0) cls = "n-add";
          else if (n.chg === to) cls = "n-mod";
          else cls = "n-keep";
        } else if (ghost) cls = "n-del";
      }
      if (!cls) return;
      var yy = 18 + (hi - n.p) * rowH + 1;
      var r = el("rect", { x: gutter + n.s * cell + 1, y: yy, width: Math.max(4, n.d * cell - 2), height: rowH - 2, rx: 2, class: cls }, svg);
      r.dataset.id = n.id;
    });
    host.innerHTML = "";
    host.appendChild(svg);
    return svg;
  }

  function thumb(seed) {
    var r = rng(seed);
    var out = '<svg viewBox="0 0 84 46" preserveAspectRatio="none" aria-hidden="true">';
    var bars = 4 + Math.floor(r() * 3);
    var x = 4;
    for (var i = 0; i < 17; i++) {
      var w = 2 + Math.floor(r() * 7);
      var y = 5 + Math.floor(r() * 32);
      if (x + w > 80) break;
      out += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="3" rx="1" fill="#121212" opacity="' + (0.35 + r() * 0.65).toFixed(2) + '"/>';
      x += w + 1 + Math.floor(r() * 3);
    }
    for (var b = 1; b < bars; b++) out += '<line x1="' + (b * 84 / bars).toFixed(1) + '" x2="' + (b * 84 / bars).toFixed(1) + '" y1="0" y2="46" stroke="#000000" opacity=".1"/>';
    return out + "</svg>";
  }

  function staffThumb(branches, merged, seed) {
    var sd = seed || 0, lanes = Math.max(1, Math.min(3, branches));
    var cols = ["#121212", "#0f7b6c", "#7b3f7a"];
    var main = 4 + (sd % 3);
    var step = 68 / (main - 1);
    var fork = 1 + (sd % (main - 2));
    var mainY = lanes === 1 ? 23 : 10;
    var out = '<svg viewBox="0 0 84 46" aria-hidden="true">';
    for (var l = 0; l < lanes; l++) {
      var y = lanes === 1 ? 23 : 10 + l * (26 / (lanes - 1));
      out += '<line x1="4" x2="80" y1="' + y + '" y2="' + y + '" stroke="#000" stroke-opacity=".18"/>';
      var xs = [];
      if (l === 0) { for (var i = 0; i < main; i++) xs.push(8 + i * step); }
      else {
        var n = 1 + ((sd + l) % 3);
        for (var k = 0; k < n; k++) xs.push(Math.min(76, 8 + (fork + k + l - 1) * step + 4));
      }
      xs.forEach(function (x, idx) {
        var hollow = merged && l === 0 && idx === xs.length - 1;
        out += '<circle cx="' + x.toFixed(1) + '" cy="' + y + '" r="3.2" fill="' + (hollow ? "#fff" : cols[l]) + '" stroke="' + cols[l] + '" stroke-width="1.5"/>';
      });
      if (l > 0) {
        var fx = 8 + fork * step, bx = xs[0];
        out += '<path d="M' + fx.toFixed(1) + " " + mainY + " C " + ((fx + bx) / 2).toFixed(1) + " " + mainY + ", " + ((fx + bx) / 2).toFixed(1) + " " + y + ", " + bx.toFixed(1) + " " + y + '" fill="none" stroke="' + cols[l] + '" stroke-width="1.5"/>';
      }
    }
    return out + "</svg>";
  }

  function staffGraph(host, opts) {
    var o = opts || {};
    var laneH = 66;
    var lanes = [
      { name: "main", color: "#000000" },
      { name: "bridge-alt", color: "#0f7b6c" },
      { name: "drums-swing", color: "#7b3f7a" }
    ];
    var left = o.big ? 150 : 118;
    var step = 112;
    var W = left + 7 * step + 40;
    var H = lanes.length * laneH + 14;
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, class: "graph", role: "img", "aria-label": "Branch graph: main, bridge-alt, drums-swing" });
    lanes.forEach(function (ln, i) {
      var y0 = 12 + i * laneH + 14;
      for (var l = 0; l < 5; l++) {
        el("line", { x1: left - 14, x2: W - 10, y1: y0 + l * 6, y2: y0 + l * 6, stroke: "#000000", "stroke-opacity": ".16", "stroke-width": 1 }, svg);
      }
      var t = el("text", { x: 0, y: y0 + 16, "font-size": o.big ? 17 : 13, "font-weight": 600, fill: ln.color, "font-family": "Onest, system-ui, sans-serif" }, svg);
      t.textContent = ln.name;
      ln.mid = y0 + 12;
    });
    function pos(lane, col) { return { x: left + col * step, y: lanes[lane].mid }; }
    var commits = [
      { lane: 0, col: 0, h: "e41b9a0" }, { lane: 0, col: 1, h: "7c03d5e" }, { lane: 0, col: 2, h: "b92af61" },
      { lane: 0, col: 3, h: "3fd81c7" }, { lane: 0, col: 4, h: "a58e204" }, { lane: 0, col: 5, h: "d70c9b3" },
      { lane: 0, col: 6.4, h: "5be1f08", merge: true },
      { lane: 1, col: 3.7, h: "c19a77d" }, { lane: 1, col: 4.9, h: "08e5b3a" },
      { lane: 2, col: 2.8, h: "f6a2d91", live: true }
    ];
    function curve(a, b, color, dash) {
      var mx = (a.x + b.x) / 2;
      el("path", { d: "M" + a.x + " " + a.y + " C " + mx + " " + a.y + ", " + mx + " " + b.y + ", " + b.x + " " + b.y, fill: "none", stroke: color, "stroke-width": 2.2, "stroke-dasharray": dash || "" }, svg);
    }
    for (var i = 0; i < 5; i++) {
      var a = pos(0, i), b = pos(0, i + 1);
      el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: "#000000", "stroke-width": 2.2 }, svg);
    }
    el("line", { x1: pos(0, 5).x, y1: pos(0, 5).y, x2: pos(0, 6.4).x, y2: pos(0, 6.4).y, stroke: "#000000", "stroke-width": 2.2 }, svg);
    curve(pos(0, 3), pos(1, 3.7), "#0f7b6c");
    el("line", { x1: pos(1, 3.7).x, y1: pos(1, 3.7).y, x2: pos(1, 4.9).x, y2: pos(1, 4.9).y, stroke: "#0f7b6c", "stroke-width": 2.2 }, svg);
    curve(pos(1, 4.9), pos(0, 6.4), "#0f7b6c", "5 4");
    curve(pos(0, 2), pos(2, 2.8), "#7b3f7a");
    commits.forEach(function (c) {
      var p = pos(c.lane, c.col);
      var col = lanes[c.lane].color;
      var g = el("g", { transform: "translate(" + p.x + " " + p.y + ")", role: "img", "aria-label": c.h }, svg);
      el("title", {}, g).textContent = c.h;
      el("line", { x1: 6, y1: -2, x2: 6, y2: -26, stroke: col, "stroke-width": 1.8 }, g);
      el("ellipse", { rx: 7, ry: 5, transform: "rotate(-20)", fill: c.merge ? "#ffffff" : col, stroke: col, "stroke-width": 2 }, g);
      if (o.showHash) var ht = el("text", { x: 0, y: 24, "text-anchor": "middle", "font-size": 12.5, fill: "#4d4d4a", "font-family": "ui-monospace, Consolas, monospace" }, g);
      if (ht) ht.textContent = c.h;
      if (o.current && c.h === o.current) {
        el("circle", { r: 13, fill: "none", stroke: "#0f7b6c", "stroke-width": 2 }, g);
      }
    });
    host.innerHTML = "";
    host.appendChild(svg);
  }

  function mountPalette() {
    if (document.getElementById("palette")) return;
    var items = [
      ["My projects", "projects.html", "Trang"],
      ["Explore", "explore.html", "Trang"],
      ["Rankings", "rankings.html", "Trang"],
      ["Rainy Saigon Night", "project.html", "Projects"],
      ["Morning bossa", "project.html", "Projects"],
      ["Intro for the November EP", "project.html", "Projects"],
      ["Open the editor", "editor.html", "Actions"],
      ["Compare two versions", "compare.html", "Actions"],
      ["Merge branch", "merge.html", "Actions"],
      ["Help and glossary", "help.html", "Trang"],
      ["Settings", "settings.html", "Trang"]
    ];
    var d = document.createElement("dialog");
    d.id = "palette";
    d.className = "palette";
    d.setAttribute("aria-label", "Quick find");
    d.innerHTML = '<input id="pal-in" class="pal-in" name="q" type="search" autocomplete="off" spellcheck="false" role="combobox" aria-controls="pal-list" aria-expanded="false" placeholder="Find a page, project or action…" aria-label="Quick find"><ul id="pal-list" class="pal-list" role="listbox"></ul><p class="pal-hint">↑ ↓ to choose · Enter to open · Esc to close</p>';
    document.body.appendChild(d);
    var inp = d.querySelector("#pal-in"), ul = d.querySelector("#pal-list"), cur = 0, shown = [];
    function draw() {
      var q = inp.value.trim().toLowerCase();
      shown = items.filter(function (i) { return !q || i[0].toLowerCase().indexOf(q) > -1; });
      cur = Math.min(cur, Math.max(0, shown.length - 1));
      ul.innerHTML = shown.length ? "" : '<li class="pal-empty">No results for “' + inp.value.replace(/</g, "&lt;") + '”. Try a project name or “compare”.</li>';
      shown.forEach(function (i, n) {
        var li = document.createElement("li");
        li.setAttribute("role", "option");
        li.id = "pal-o" + n;
        li.setAttribute("aria-selected", String(n === cur));
        li.innerHTML = "<span>" + i[0] + "</span><small>" + i[2] + "</small>";
        li.addEventListener("click", function () { location.href = i[1]; });
        ul.appendChild(li);
      });
      inp.setAttribute("aria-activedescendant", shown.length ? "pal-o" + cur : "");
      inp.setAttribute("aria-expanded", String(shown.length > 0));
    }
    inp.addEventListener("input", function () { cur = 0; draw(); });
    inp.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); cur = Math.min(shown.length - 1, cur + 1); draw(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); cur = Math.max(0, cur - 1); draw(); }
      else if (e.key === "Enter" && shown[cur]) { location.href = shown[cur][1]; }
    });
    var prevFocus = null;
    function open() { prevFocus = document.activeElement; inp.value = ""; cur = 0; draw(); if (!d.open) d.showModal(); inp.focus(); }
    d.addEventListener("close", function () { if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus(); });
    d.addEventListener("click", function (e) { if (e.target === d) d.close(); });
    document.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (d.open) d.close(); else open(); }
    });
    var trig = document.getElementById("pal-open");
    if (trig) trig.addEventListener("click", open);
  }

  var PUBLIC_PROJECTS = [
    ["Rainy Saigon Night", "dem-sai-gon-mua.mid", "Lo-fi", "92 BPM · Am", "minhanh", 214, 31, 18, "yesterday", 3, true],
    ["Morning bossa", "bossa-sang.mid", "Jazz", "118 BPM · Dm", "hoangvu", 187, 24, 42, "2 days ago", 2, true],
    ["Off-beat Nocturne", "nocturne-b.mid", "Classical", "64 BPM · C#m", "trungduc", 163, 9, 27, "3 days ago", 1, false],
    ["Neon Highway", "neon-highway.mid", "Electronic", "128 BPM · Fm", "thanhtri", 151, 40, 55, "4 days ago", 3, true],
    ["RPG theme", "rpg-theme.mid", "Film score", "100 BPM · Em", "haipham", 129, 17, 33, "5 days ago", 2, false],
    ["Rainy afternoon in Hanoi", "chieu-mua-hn.mid", "Lo-fi", "84 BPM · Gm", "minhanh", 118, 22, 14, "1 week ago", 2, true],
    ["Swing drums in 7/8", "swing-78.mid", "Jazz", "140 BPM · Bb", "hoangvu", 96, 11, 21, "1 week ago", 1, false],
    ["Night arpeggio", "arp-night.mid", "Electronic", "122 BPM · Am", "khanh", 74, 6, 12, "2 weeks ago", 2, false]
  ];

  function loggedIn() {
    try { return sessionStorage.getItem("stave-in") === "1"; } catch { return false; }
  }

  function mountPublicHeader(active) {
    var host = document.getElementById("pubtop");
    if (!host) return;
    var links = [["explore", "Explore", "explore.html"], ["rankings", "Rankings", "rankings.html"], ["help", "Help", "help.html"]];
    host.setAttribute("role", "banner");
    host.innerHTML = '<a class="pub-brand" href="index.html" translate="no" aria-label="STAVE, home">' + mark(28) + 'STAVE</a><nav class="pub-links" aria-label="Main">' +
      links.map(function (l) { return '<a href="' + l[2] + '"' + (l[0] === active ? ' aria-current="page"' : "") + ">" + l[1] + "</a>"; }).join("") +
      (loggedIn() ? '<a class="btn btn-primary btn-sm" href="projects.html">My projects</a>' : '<a class="btn btn-quiet btn-sm" href="login.html">Sign in</a>') + "</nav>";
    mountPalette();
  }

  window.STAVE = {
    ic: ic, mark: mark, mountShell: mountShell, rng: rng,
    mountPalette: mountPalette, mountPublicHeader: mountPublicHeader, PUBLIC_PROJECTS: PUBLIC_PROJECTS, COMMITS: COMMITS, buildSong: buildSong, drawRoll: drawRoll, thumb: thumb, staffThumb: staffThumb, staffGraph: staffGraph, stateAt: stateAt
  };
})();
