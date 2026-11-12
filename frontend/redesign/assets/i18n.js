(function () {
  "use strict";
  var KEY = "stave-lang";
  var LANGS = ["en", "vi"];
  var dicts = window.STAVE_I18N = window.STAVE_I18N || {};
  var qs = new URLSearchParams(location.search);
  var debug = qs.get("i18n") === "debug";
  var lang = "en";
  var used = {};
  var samples = {};

  function store(v) {
    try { if (v === undefined) return localStorage.getItem(KEY); localStorage.setItem(KEY, v); } catch (e) { }
    return null;
  }
  var asked = qs.get("lang");
  if (LANGS.indexOf(asked) > -1) { lang = asked; store(asked); }
  else if (LANGS.indexOf(store()) > -1) lang = store();
  document.documentElement.lang = lang;

  function look(key, l) {
    var d = dicts[l];
    return d && Object.prototype.hasOwnProperty.call(d, key) ? d[key] : undefined;
  }

  function t(key, vars) {
    var k = key;
    if (vars && typeof vars.n === "number") {
      var pk = key + (vars.n === 1 ? ".one" : ".other");
      if (look(pk, "en") !== undefined) k = pk;
    }
    used[k] = 1;
    var s = look(k, lang);
    if (s === undefined) s = look(k, "en");
    if (s === undefined) s = key;
    return vars ? s.replace(/\{(\w+)\}/g, function (m, name) { return vars[name] === undefined ? m : vars[name]; }) : s;
  }

  function all(root, sel) {
    var out = Array.prototype.slice.call(root.querySelectorAll(sel));
    if (root.nodeType === 1 && root.matches(sel)) out.unshift(root);
    return out;
  }

  function varsOf(el) {
    var raw = el.getAttribute("data-i18n-vars");
    if (!raw) return undefined;
    try { return JSON.parse(raw); } catch (e) { return undefined; }
  }

  function apply(root) {
    root = root || document;
    all(root, "[data-i18n]").forEach(function (el) {
      var s = t(el.getAttribute("data-i18n"), varsOf(el));
      if (el.textContent !== s) el.textContent = s;
    });
    all(root, "[data-i18n-html]").forEach(function (el) {
      var s = t(el.getAttribute("data-i18n-html"), varsOf(el));
      if (el.__ih !== s) { el.innerHTML = s; el.__ih = s; }
    });
    all(root, "[data-i18n-attr]").forEach(function (el) {
      var v = varsOf(el);
      el.getAttribute("data-i18n-attr").split(",").forEach(function (pair) {
        var i = pair.indexOf(":");
        if (i < 1) return;
        var name = pair.slice(0, i).trim(), s = t(pair.slice(i + 1).trim(), v);
        if (el.getAttribute(name) !== s) el.setAttribute(name, s);
      });
    });
  }

  function bind(el, key, vars) {
    el.setAttribute("data-i18n", key);
    if (vars) el.setAttribute("data-i18n-vars", JSON.stringify(vars)); else el.removeAttribute("data-i18n-vars");
    el.textContent = t(key, vars);
    return el;
  }

  function switchHTML() {
    return '<div class="lang" role="group" aria-label="' + t("lang.group") + '" data-i18n-attr="aria-label:lang.group">' +
      '<button type="button" data-lang="en" lang="en" aria-label="English" title="English">EN</button>' +
      '<span class="lang-sep" aria-hidden="true"></span>' +
      '<button type="button" data-lang="vi" lang="vi" aria-label="Tiếng Việt" title="Tiếng Việt">VI</button></div>';
  }

  function syncSwitches() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-lang]"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === lang));
    });
  }

  function mountSwitches(root) {
    all(root || document, "[data-lang-switch]").forEach(function (h) {
      if (!h.firstChild) h.innerHTML = switchHTML();
    });
    syncSwitches();
  }

  function setLang(next) {
    if (LANGS.indexOf(next) < 0 || next === lang) { syncSwitches(); return lang; }
    lang = next;
    store(next);
    document.documentElement.lang = next;
    if (qs.get("lang")) {
      var u = new URL(location.href);
      u.searchParams.set("lang", next);
      try { history.replaceState(history.state, "", u.pathname + u.search + u.hash); } catch (e) { }
    }
    apply(document);
    syncSwitches();
    document.dispatchEvent(new CustomEvent("stave:lang", { detail: { lang: next }, bubbles: true }));
    apply(document);
    if (debug) setTimeout(report, 50);
    return lang;
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-lang]") : null;
    if (b) setLang(b.getAttribute("data-lang"));
  });

  function addSamples(list) {
    (list || []).forEach(function (s) { if (s) samples[String(s)] = 1; });
  }

  function hasDiacritic(s) { return /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(s); }

  function suspicious(text) {
    var s = text.replace(/\s+/g, " ").trim();
    if (!/[A-Za-z]{3,}/.test(s) || samples[s] || s.indexOf("@") > -1) return false;
    var stem = s.replace(/…$/, "");
    for (var sm in samples) if (sm.length > 7 && (sm.indexOf(stem) > -1 && stem.length > 7 || s.indexOf(sm) > -1)) return false;
    var en = dicts.en || {}, cur = dicts[lang] || {}, k;
    for (k in en) if (en[k] === s && cur[k] !== s) return true;
    if (lang === "en" || hasDiacritic(s)) return false;
    var words = s.toLowerCase().match(/[a-z’']+/g) || [];
    var stop = { the: 1, and: 1, your: 1, you: 1, are: 1, for: 1, with: 1, this: 1, that: 1, from: 1, into: 1, have: 1, will: 1, can: 1, not: 1, any: 1, each: 1 };
    return words.some(function (w) { return stop[w]; });
  }

  var SKIP = "script,style,template,noscript,svg,[data-i18n],[data-i18n-html],[translate=no],.hash,kbd,.num,code,[data-sample]";

  function untagged() {
    var out = [];
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = walker.nextNode())) {
      var p = n.parentElement;
      if (!p || p.closest(SKIP) || !n.nodeValue.trim()) continue;
      if (suspicious(n.nodeValue)) out.push("<" + p.tagName.toLowerCase() + (p.className && typeof p.className === "string" ? "." + p.className.split(" ")[0] : "") + "> " + n.nodeValue.replace(/\s+/g, " ").trim());
    }
    Array.prototype.forEach.call(document.querySelectorAll("[aria-label],[title],[placeholder],[alt]"), function (el) {
      if (el.closest("[translate=no],[data-sample],svg")) return;
      var map = (el.getAttribute("data-i18n-attr") || "").split(",").map(function (x) { return x.split(":")[0].trim(); });
      ["aria-label", "title", "placeholder", "alt"].forEach(function (a) {
        var v = el.getAttribute(a);
        if (v && map.indexOf(a) < 0 && suspicious(v)) out.push("<" + el.tagName.toLowerCase() + " " + a + "> " + v);
      });
    });
    return out;
  }

  function report() {
    var en = dicts.en || {}, cur = dicts[lang] || {};
    var keys = Object.keys(used);
    var missing = keys.filter(function (k) { return cur[k] === undefined; });
    var parity = Object.keys(en).filter(function (k) { return cur[k] === undefined; });
    var extra = Object.keys(cur).filter(function (k) { return en[k] === undefined; });
    var rep = {
      lang: lang,
      keysUsed: keys.length,
      translated: keys.length - missing.length,
      missing: missing,
      dictionaryMissingFromLang: parity,
      dictionaryExtraInLang: extra,
      untaggedEnglish: untagged()
    };
    console.info("[i18n] lang=" + lang + " keys used=" + rep.keysUsed + " translated=" + rep.translated + " missing=" + missing.length);
    if (missing.length) console.warn("[i18n] missing keys:", missing);
    if (parity.length) console.warn("[i18n] keys in en.js without a " + lang + " entry:", parity);
    if (rep.untaggedEnglish.length) console.warn("[i18n] hand-written English without a key:", rep.untaggedEnglish);
    return rep;
  }

  var css = document.createElement("style");
  css.textContent =
    ".lang{display:inline-flex;align-items:stretch;flex:none;height:28px;border:1px solid var(--line-strong);border-radius:999px;font-size:12.5px;font-weight:600;letter-spacing:.04em}" +
    ".lang button{position:relative;min-width:34px;padding:0 9px;border:0;background:transparent;color:var(--soft);font:inherit}" +
    ".lang button:first-child{border-radius:999px 0 0 999px}" +
    ".lang button:last-child{border-radius:0 999px 999px 0}" +
    ".lang button:hover{color:var(--ink)}" +
    ".lang button[aria-pressed=true]{background:var(--ink);color:var(--ground)}" +
    ".lang button:focus-visible{z-index:1}" +
    ".lang-sep{width:1px;background:var(--line-strong)}" +
    ".side-foot .lang-row{padding:0 8px 8px}";
  document.head.appendChild(css);

  document.addEventListener("DOMContentLoaded", function () {
    mountSwitches();
    apply(document);
    if (debug) setTimeout(report, 700);
  });

  window.STAVE = window.STAVE || {};
  window.STAVE.t = t;
  window.STAVE.setLang = setLang;
  window.STAVE.getLang = function () { return lang; };
  window.STAVE.apply = apply;
  window.STAVE.bind = bind;
  window.STAVE.langSwitchHTML = switchHTML;
  window.STAVE.mountLangSwitches = mountSwitches;
  window.STAVE.addSamples = addSamples;
  window.STAVE.i18nReport = report;
})();
