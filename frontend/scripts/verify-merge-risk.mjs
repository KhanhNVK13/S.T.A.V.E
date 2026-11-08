/**
 * Kiểm chứng tay UC-71 trên dev server thật (http://localhost:3000).
 *
 * Không dùng harness e2e chuẩn vì harness đó cố ý từ chối chạy khi
 * `backend/.env.test` trỏ vào project Supabase production. Script này tạo
 * user tạm qua service-role key của dev env, đăng nhập thật qua UI (để
 * session được tạo đúng cách), tạo 2 cặp nhánh (xung đột / không đụng
 * nhau) và mở hộp "Hợp nhất".
 *
 * Chạy: node frontend/scripts/verify-merge-risk.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";

const FRONTEND = process.env.FRONTEND_URL ?? "http://localhost:3000";
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:3001";

const env = parseEnv(
  readFileSync(new URL("../../backend/.env", import.meta.url), "utf8"),
);
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshSession: false, persistSession: false },
});

const PASSWORD = randomUUID();
const BASE = [
  { id: "c1", pitch: 60, start: 3840 },
  { id: "c2", pitch: 64, start: 13440 },
];

let pass = 0;
let fail = 0;
function check(name, ok, extra = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

function snapshotOf(notes) {
  return {
    schemaVersion: 3,
    meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
    tracks: [
      {
        id: "track-1",
        name: "Track 1",
        order: 0,
        color: "#6366f1",
        muted: false,
        solo: false,
        volume: 0.8,
        pan: 0,
        instrument: null,
      },
    ],
    notes: notes.map((n) => ({
      pitch: 60,
      start: 0,
      duration: 480,
      velocity: 90,
      trackId: "track-1",
      ...n,
    })),
  };
}

async function createUser() {
  const email = `uc71-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@stave-test.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  await admin.from("users").upsert({
    id: data.user.id,
    username: email.split("@")[0],
    display_name: "UC71 Verify",
    email,
  });
  return { id: data.user.id, email, password: PASSWORD };
}

/** Token + session id để gọi API như app thật. */
async function apiSession(user) {
  const tokenRes = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_ANON_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  const tokenJson = await tokenRes.json();
  const token = tokenJson.access_token ?? tokenJson.accessToken;
  if (!token) throw new Error(`token: ${JSON.stringify(tokenJson)}`);

  const res = await fetch(`${BACKEND}/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const sessionJson = await res.json();
  const sessionId = sessionJson.id ?? sessionJson.sessionId;
  if (!sessionId) throw new Error(`session: ${JSON.stringify(sessionJson)}`);
  return { token, sessionId };
}

async function apiCall(auth, method, path, body) {
  const res = await fetch(`${BACKEND}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "X-Session-Id": auth.sessionId,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

/** Chuyển nhánh đang active (để viết draft lên đúng nhánh). */
async function switchBranch(auth, currentBranchId, targetBranchId, projectId) {
  const draft = await apiCall(auth, "GET", `/projects/${projectId}/draft`);
  return apiCall(auth, "POST", "/branches/switch", {
    currentBranchId,
    targetBranchId,
    currentDraft: {
      ...draft,
      notes: (draft.notes ?? []).map((n) => ({ ...n, startTime: n.start })),
    },
  });
}

/** Tạo project + commit gốc + nhánh phụ, rồi theo kịch bản. */
async function makeBranches(auth, conflicting) {
  const project = await apiCall(auth, "POST", "/projects", { name: "UC71 Verify" });
  const mainBranchId = project.branchId;

  await apiCall(auth, "PUT", `/projects/${project.id}/draft`, snapshotOf(BASE));
  await apiCall(auth, "POST", "/commits", {
    branch_id: mainBranchId,
    message: "Base commit",
  });

  const branch = await apiCall(auth, "POST", `/projects/${project.id}/branches`, {
    name: "alt",
  });
  const altBranchId = branch.id ?? branch.branchInfo?.id;

  if (conflicting) {
    // Nhánh đích sửa c1, c2
    await apiCall(auth, "PUT", `/projects/${project.id}/draft`, snapshotOf([
      { id: "c1", pitch: 65, start: 3840 },
      { id: "c2", pitch: 69, start: 13440 },
    ]));
    await apiCall(auth, "POST", "/commits", {
      branch_id: mainBranchId,
      message: "Main change",
    });

    // Nhánh nguồn sửa cùng c1, c2 → xung đột
    await switchBranch(auth, mainBranchId, altBranchId, project.id);
    await apiCall(auth, "PUT", `/projects/${project.id}/draft`, snapshotOf([
      { id: "c1", pitch: 67, start: 3840 },
      { id: "c2", pitch: 71, start: 13440 },
    ]));
    await apiCall(auth, "POST", "/commits", {
      branch_id: altBranchId,
      message: "Alt change",
    });
    await switchBranch(auth, altBranchId, mainBranchId, project.id);
  } else {
    // Hai nhánh thêm nốt riêng, không đụng id nào
    await apiCall(auth, "PUT", `/projects/${project.id}/draft`, snapshotOf([
      ...BASE,
      { id: "m1", pitch: 50, start: 0 },
    ]));
    await apiCall(auth, "POST", "/commits", {
      branch_id: mainBranchId,
      message: "Main change",
    });

    await switchBranch(auth, mainBranchId, altBranchId, project.id);
    await apiCall(auth, "PUT", `/projects/${project.id}/draft`, snapshotOf([
      ...BASE,
      { id: "a1", pitch: 70, start: 1920 },
    ]));
    await apiCall(auth, "POST", "/commits", {
      branch_id: altBranchId,
      message: "Alt notes",
    });
    await switchBranch(auth, altBranchId, mainBranchId, project.id);
  }

  return { projectId: project.id, mainBranchId, altBranchId };
}

async function login(page, user) {
  await page.goto(`${FRONTEND}/login`);
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(user.password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname !== "/login");
  await page.waitForFunction(() =>
    Boolean(window.localStorage.getItem("stave_session_id")),
  );
}

async function openMergeDialog(page, projectId) {
  await page.goto(`${FRONTEND}/projects/${projectId}?tab=branches`);
  await page.getByRole("button", { name: /hợp nhất vào main/i }).click();
  await page.getByRole("alertdialog").waitFor({ state: "visible" });
}

async function run() {
  const browser = await chromium.launch();
  const consoleErrors = [];

  try {
    // ── Kịch bản 1: hai nhánh XUNG ĐỘT ──────────────────────────────
    console.log("\n=== Kịch bản 1: hai nhánh xung đột (cùng sửa c1, c2) ===");
    const user1 = await createUser();
    const auth1 = await apiSession(user1);
    const conflict = await makeBranches(auth1, true);

    const risk1 = await apiCall(
      auth1,
      "GET",
      `/ai/merge-risk?sourceBranchId=${conflict.altBranchId}&targetBranchId=${conflict.mainBranchId}`,
    );
    check("API trả mức rủi ro cao", risk1.level === "high", `level=${risk1.level}`);
    check("API có số xung đột > 0", risk1.metrics.conflictsCount > 0, `conflicts=${risk1.metrics.conflictsCount}`);
    check("API có số chồng chéo > 0", risk1.metrics.overlap > 0, `overlap=${risk1.metrics.overlap}`);

    const page1 = await browser.newPage();
    page1.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    await login(page1, user1);
    await openMergeDialog(page1, conflict.projectId);

    const panel1 = page1.getByTestId("merge-risk-panel");
    await panel1.waitFor({ state: "visible", timeout: 20000 });
    const level1 = await panel1.getAttribute("data-level");
    check("Panel trong hộp Hợp nhất hiện mức cao", level1 === "high", `data-level=${level1}`);

    const text1 = (await panel1.textContent()) ?? "";
    check("Panel hiện nhãn số liệu xung đột", /xung đột/i.test(text1));
    check("Panel hiện nhãn số liệu chồng chéo", /chồng chéo/i.test(text1));
    check(
      "Nút Hợp nhất vẫn bật (cảnh báo không chặn)",
      await page1
        .getByRole("alertdialog")
        .getByRole("button", { name: /^hợp nhất$/i })
        .isEnabled(),
    );
    await page1.screenshot({ path: "frontend/e2e-results/uc71-conflict.png" });

    // ── Kịch bản 2: hai nhánh KHÔNG đụng nhau ────────────────────────
    console.log("\n=== Kịch bản 2: hai nhánh không đụng nhau ===");
    const user2 = await createUser();
    const auth2 = await apiSession(user2);
    const disjoint = await makeBranches(auth2, false);

    const risk2 = await apiCall(
      auth2,
      "GET",
      `/ai/merge-risk?sourceBranchId=${disjoint.altBranchId}&targetBranchId=${disjoint.mainBranchId}`,
    );
    check("API trả mức rủi ro thấp", risk2.level === "low", `level=${risk2.level}`);
    check("API báo 0 xung đột", risk2.metrics.conflictsCount === 0, `conflicts=${risk2.metrics.conflictsCount}`);
    check(
      "Mức thấp có câu giải thích cố định",
      typeof risk2.explanation === "string" && risk2.explanation.length > 0,
      JSON.stringify(risk2.explanation),
    );

    const page2 = await browser.newPage();
    page2.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    await login(page2, user2);
    await openMergeDialog(page2, disjoint.projectId);

    const panel2 = page2.getByTestId("merge-risk-panel");
    await panel2.waitFor({ state: "visible", timeout: 20000 });
    const level2 = await panel2.getAttribute("data-level");
    check("Panel hiện mức thấp", level2 === "low", `data-level=${level2}`);
    const text2 = (await panel2.textContent()) ?? "";
    check(
      "Không có cảnh báo giả ở mức thấp",
      !/rủi ro cao|cảnh báo|nguy hiểm/i.test(text2),
    );
    await page2.screenshot({ path: "frontend/e2e-results/uc71-disjoint.png" });

    // ── Huỷ hộp: không nhánh nào đổi ─────────────────────────────────
    const before = await apiCall(auth2, "GET", `/branches/${disjoint.mainBranchId}`);
    await page2.getByRole("alertdialog").getByRole("button", { name: /^huỷ$/i }).click();
    await page2.waitForTimeout(800);
    const after = await apiCall(auth2, "GET", `/branches/${disjoint.mainBranchId}`);
    check(
      "Huỷ hộp không đổi nhánh đích",
      before.branchInfo.head_commit_id === after.branchInfo.head_commit_id,
    );
    check("Hộp thoại đã đóng", (await page2.getByRole("alertdialog").count()) === 0);

    console.log(
      `\nLỗi console trong trình duyệt: ${consoleErrors.length ? consoleErrors.join(" | ") : "không có"}`,
    );
  } finally {
    await browser.close();
  }

  console.log(`\nKết quả: ${pass} pass, ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error("LỖI:", error);
  process.exit(1);
});
