(function () {
  var KEY = "stave-in";
  var GUARDED = ["projects", "project", "compare", "merge", "editor", "settings", "home"];
  var NEXT_OK = /^[A-Za-z0-9_-]+\.html(\?[A-Za-z0-9_=&%.\-]*)?(#[A-Za-z0-9_-]*)?$/;

  function page() {
    var seg = location.pathname.split("/").pop();
    return seg || "index.html";
  }
  function read() {
    try { return sessionStorage.getItem(KEY) === "1"; } catch (e) { return false; }
  }
  function write(on) {
    try { if (on) sessionStorage.setItem(KEY, "1"); else sessionStorage.removeItem(KEY); } catch (e) { }
  }

  var params = new URLSearchParams(location.search);
  var as = params.get("as");
  if (as === "in" || as === "out") {
    write(as === "in");
    params.delete("as");
    var q = params.toString();
    try { history.replaceState(null, "", location.pathname + (q ? "?" + q : "") + location.hash); } catch (e) { }
  }

  function isIn() { return read(); }
  function signIn() { write(true); }
  function signOut() {
    write(false);
    location.href = "index.html";
  }
  function next() {
    var n = new URLSearchParams(location.search).get("next");
    return n && NEXT_OK.test(n) && n.indexOf("login.html") !== 0 ? n : "index.html";
  }
  function guard() {
    if (isIn()) return true;
    var here = page() + location.search + location.hash;
    location.replace("login.html?next=" + encodeURIComponent(here));
    return false;
  }

  window.STAVE_SESSION = { isIn: isIn, signIn: signIn, signOut: signOut, next: next, guard: guard };

  var root = document.documentElement;
  root.setAttribute("data-auth", isIn() ? "in" : "out");
  var st = document.createElement("style");
  st.textContent = 'html[data-auth="in"] [data-auth-only="out"], html[data-auth="out"] [data-auth-only="in"] { display: none !important; }';
  document.head.appendChild(st);

  var name = page().replace(/\.html$/, "");
  if (name === "index" && isIn() && params.get("tour") !== "1") {
    location.replace("home.html");
  } else if (GUARDED.indexOf(name) > -1) {
    guard();
  }
})();
