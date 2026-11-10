/**
 * Kiểm tra cấu hình e2e cho UC-71 — CHỈ báo PASS/FAIL, KHÔNG in giá trị
 * key/mật khẩu. Script này không sửa file nào.
 *
 * Chạy: node frontend/scripts/check-e2e-env.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parseEnv } from "node:util";

const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const PROD_REF = "gwbiwweeznbuqfgawywv";
const TEST_REF = "drevszfpovyinzauwuou";

const BACKEND = `${ROOT}backend/.env.test`;
const FRONTEND = `${ROOT}frontend/.env.test.local`;

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, detail = "") {
  pass++;
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function bad(name, detail = "") {
  fail++;
  failures.push(name);
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Đọc file .env thành map, KHÔNG in giá trị. */
function readEnv(path) {
  if (!existsSync(path)) return null;
  try {
    return parseEnv(readFileSync(path, "utf8")) as Record<string, string>;
  } catch {
    return null;
  }
}

// ── 1. File tồn tại + git ignore ─────────────────────────────────────────
console.log("\n[1] File tồn tại và được git ignore");
for (const [label, path] of [
  ["backend/.env.test", BACKEND],
  ["frontend/.env.test.local", FRONTEND],
]) {
  if (!existsSync(path)) {
    bad(`${label} tồn tại`, "không thấy file");
    continue;
  }
  ok(`${label} tồn tại`);
  try {
    const out = execFileSync(
      "git",
      ["check-ignore", "-v", path.replace(/\\/g, "/").replace(`${ROOT.replace(/\\/g, "/")}/`, "")],
      { cwd: ROOT, encoding: "utf8" },
    ).trim();
    ok(`${label} được git ignore`, out.split(":")[0]);
  } catch {
    bad(`${label} được git ignore`, "git check-ignore không khớp");
  }
}

// ── 2. Còn placeholder <...> không? ─────────────────────────────────────
console.log("\n[2] Placeholder dạng <...>");
for (const [label, path] of [
  ["backend/.env.test", BACKEND],
  ["frontend/.env.test.local", FRONTEND],
]) {
  if (!existsSync(path)) continue;
  const text = readFileSync(path, "utf8");
  const names = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=(.*)$/.exec(line);
    if (!m) continue;
    const value = m[2].trim();
    if (/^<.*>$/.test(value) || value.includes("<") || value.includes("...")) {
      names.push(m[1]);
    }
  }
  if (names.length === 0) ok(`${label} không còn placeholder`);
  else bad(`${label} còn placeholder`, `các biến: ${names.join(", ")}`);
}

// ── 3. Backend trỏ đúng project test ───────────────────────────────────
console.log("\n[3] Backend trỏ đúng project test");
const be = readEnv(BACKEND);
const fe = readEnv(FRONTEND);

if (!be) {
  bad("đọc được backend/.env.test");
} else {
  const url = (be.SUPABASE_URL ?? "").trim();
  if (!url) bad("SUPABASE_URL có giá trị", "đang rỗng");
  else if (!url.includes(TEST_REF)) bad("SUPABASE_URL trỏ project test", "ref không khớp test project");
  else ok("SUPABASE_URL trỏ project test");

  const ref = (be.TEST_DB_PROJECT_REF ?? "").trim();
  if (ref === TEST_REF) ok("TEST_DB_PROJECT_REF = test project");
  else if (!ref) bad("TEST_DB_PROJECT_REF = test project", "đang rỗng");
  else if (ref === PROD_REF) bad("TEST_DB_PROJECT_REF = test project", "đang trỏ PRODUCTION — phải đổi");
  else bad("TEST_DB_PROJECT_REF = test project", "ref không khớp test project");

  // Không biến nào chứa production ref
  const prodHits = Object.keys(be).filter((k) =>
    (be[k] ?? "").includes(PROD_REF),
  );
  if (prodHits.length === 0) ok("không biến backend nào chứa production ref");
  else bad("không biến backend nào chứa production ref", `các biến: ${prodHits.join(", ")}`);
}

// ── 4. Frontend trỏ đúng project + anon key khớp backend ───────────────
console.log("\n[4] Frontend trỏ đúng project test + anon key khớp");
if (!fe) {
  bad("đọc được frontend/.env.test.local");
} else {
  const url = (fe.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!url) bad("NEXT_PUBLIC_SUPABASE_URL có giá trị", "đang rỗng");
  else if (!url.includes(TEST_REF)) bad("NEXT_PUBLIC_SUPABASE_URL trỏ project test", "ref không khớp");
  else ok("NEXT_PUBLIC_SUPABASE_URL trỏ project test");

  const prodHits = Object.keys(fe).filter((k) =>
    (fe[k] ?? "").includes(PROD_REF),
  );
  if (prodHits.length === 0) ok("không biến frontend nào chứa production ref");
  else bad("không biến frontend nào chứa production ref", `các biến: ${prodHits.join(", ")}`);

  const feAnon = (fe.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const beAnon = be ? (be.SUPABASE_ANON_KEY ?? "").trim() : "";
  if (!feAnon) bad("NEXT_PUBLIC_SUPABASE_ANON_KEY có giá trị", "đang rỗng");
  else if (!beAnon) bad("so khớp anon key", "backend thiếu SUPABASE_ANON_KEY để so sánh");
  else if (feAnon === beAnon) ok("anon key frontend == backend (so khớp, không in giá trị)");
  else bad("anon key frontend == backend", "hai giá trị KHÁC nhau");
}

// ── 5. JWT claim ref + role ─────────────────────────────────────────────
console.log("\n[5] Claim ref/role của các key (decode trong bộ nhớ, không in token)");
function decodeClaims(token) {
  if (!token || !token.startsWith("eyJ")) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}
function checkJwt(label, token, expectedRole) {
  if (!token) {
    bad(`${label} có giá trị`, "đang rỗng");
    return;
  }
  const claims = decodeClaims(token);
  if (!claims) {
    ok(`${label} không phải JWT (bỏ qua kiểm tra claim)`, "định dạng khác eyJ");
    return;
  }
  const ref = claims.ref;
  const role = claims.role;
  if (ref === TEST_REF) ok(`${label} claim ref = test project`);
  else if (!ref) ok(`${label} không có claim ref`, "bỏ qua kiểm tra ref");
  else bad(`${label} claim ref = test project`, `ref = ${ref === PROD_REF ? "PRODUCTION" : "không khớp"}`);

  if (role === expectedRole) ok(`${label} claim role = ${expectedRole}`);
  else bad(`${label} claim role = ${expectedRole}`, `role thực tế: ${role ?? "không có"}`);
}
if (be) checkJwt("backend SUPABASE_ANON_KEY", (be.SUPABASE_ANON_KEY ?? "").trim(), "anon");
if (be)
  checkJwt(
    "backend SUPABASE_SERVICE_ROLE_KEY",
    (be.SUPABASE_SERVICE_ROLE_KEY ?? "").trim(),
    "service_role",
  );

// ── 6. TEST_DB_PASSWORD không rỗng ──────────────────────────────────────
console.log("\n[6] TEST_DB_PASSWORD");
if (!be) bad("TEST_DB_PASSWORD có giá trị", "không đọc được file");
else if (!(be.TEST_DB_PASSWORD ?? "").trim()) bad("TEST_DB_PASSWORD có giá trị", "đang rỗng");
else ok("TEST_DB_PASSWORD có giá trị");

// ── 7. Biến bắt buộc còn thiếu/rỗng ─────────────────────────────────────
console.log("\n[7] Biến bắt buộc còn thiếu hoặc rỗng");
// Nguồn: frontend/e2e/support/env.ts + backend code.
const BE_REQUIRED = [
  ["SUPABASE_URL", true],
  ["SUPABASE_SERVICE_ROLE_KEY", true],
  ["SUPABASE_ANON_KEY", true],
  ["TEST_DB_PROJECT_REF", true],
  ["TEST_DB_PASSWORD", true],
  ["PAYOS_CLIENT_ID", false],
  ["PAYOS_API_KEY", false],
  ["PAYOS_CHECKSUM_KEY", false],
  ["TEST_DB_POOLER_HOST", false],
  ["TEST_RUN_TAG", false],
];
for (const [name, required] of BE_REQUIRED) {
  const value = be ? (be[name] ?? "").trim() : "";
  const empty = !value;
  if (empty && required) bad(`${name} (bắt buộc)`, "thiếu hoặc rỗng");
  else if (empty && !required) console.log(`  INFO  ${name} đang rỗng (cố ý bỏ trống)`);
  else ok(`${name} có giá trị`);
}
const FE_REQUIRED = [
  ["NEXT_PUBLIC_SUPABASE_URL", true],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", true],
  ["NEXT_PUBLIC_API_URL", false],
];
for (const [name, required] of FE_REQUIRED) {
  const value = fe ? (fe[name] ?? "").trim() : "";
  const empty = !value;
  if (empty && required) bad(`${name} (bắt buộc)`, "thiếu hoặc rỗng");
  else if (empty && !required) console.log(`  INFO  ${name} đang rỗng (cố ý bỏ trống)`);
  else ok(`${name} có giá trị`);
}

console.log(`\nKết quả: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) {
  console.log(`Các mục FAIL: ${failures.join(" | ")}`);
  process.exit(1);
}
process.exit(0);
