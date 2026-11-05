import fs from "node:fs";
import { test } from "@playwright/test";
import { createE2eUser, loginThroughUi, cleanupE2eUsers } from "../e2e/support/test-user";
import { UserApi } from "../e2e/support/api";

const OUT = process.env.MEASURE_OUT!;
fs.mkdirSync(OUT, { recursive: true });
const report: Record<string, unknown> = {};

const tracks = [
  { id: "t1", name: "Lead", color: "#6366f1", instrument: "Acoustic Grand Piano" },
  { id: "t2", name: "Bass", color: "#10b981", instrument: "Electric Bass (finger)" },
  { id: "t3", name: "Pad", color: "#f59e0b", instrument: "String Ensemble 1" },
];
function notes(extra = 0) {
  const out: any[] = [];
  let n = 0;
  for (let bar = 0; bar < 8; bar++) {
    for (let i = 0; i < 4; i++) {
      out.push({ id: `l${n++}`, pitch: 60 + ((bar * 3 + i * 2) % 12), start: bar * 1920 + i * 480, duration: 360, velocity: 70 + ((i * 17 + bar * 5) % 50), trackId: "t1" });
    }
    out.push({ id: `b${n++}`, pitch: 36 + (bar % 5), start: bar * 1920, duration: 1800, velocity: 90, trackId: "t2" });
    out.push({ id: `p${n++}`, pitch: 72 + (bar % 3), start: bar * 1920, duration: 1920, velocity: 60, trackId: "t3" });
  }
  for (let k = 0; k < extra; k++) out.push({ id: `x${k}`, pitch: 64 + k, start: 960 + k * 480, duration: 240, velocity: 100, trackId: "t1" });
  return out;
}

test("measure real editor and pages on test DB", async ({ page, browser }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });

  await cleanupE2eUsers("run").catch(() => {});
  const user = await createE2eUser();
  const api = await UserApi.for(user);
  const { id, branchId } = await api.createProject("Measure project");
  await api.putDraft(id, notes(), tracks);
  const c1 = await api.commit(branchId, "First sketch");
  await api.putDraft(id, notes(4), tracks);
  await api.commit(branchId, "Add counter melody");
  await api.createBranch(id, "variation", c1.id);

  await page.addInitScript(() => localStorage.setItem("stave-lang", "en"));
  await loginThroughUi(page, user);

  const sizes: Array<[number, number]> = [[1366, 768], [1280, 720], [1440, 900], [390, 844]];
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`/projects/${id}/edit`);
    await page.waitForTimeout(6000);
    const m = await page.evaluate(() => {
      const vis = (el: Element) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
      const canvases = Array.from(document.querySelectorAll("canvas")).filter(vis).map((c) => { const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), scrollParent: c.parentElement?.parentElement?.scrollHeight ?? 0 }; });
      const roll = Array.from(document.querySelectorAll("canvas")).find((c) => (c.parentElement?.parentElement?.scrollHeight ?? 0) > 2000);
      const rollBox = roll?.parentElement?.parentElement?.getBoundingClientRect();
      const btns = Array.from(document.querySelectorAll("button, [role=button]")).filter(vis).map((b) => b.getBoundingClientRect()).filter((r) => r.top < 140);
      const rows = Array.from(new Set(btns.map((r) => Math.round(r.top / 8) * 8))).sort((a, b) => a - b);
      const footer = document.querySelector("footer");
      const credit = Array.from(document.querySelectorAll("*")).some((e) => e.children.length === 0 && /GeneralUser|SoundFont|FluidR3/i.test(e.textContent || "") && vis(e));
      const main = document.getElementById("main");
      return {
        viewport: [innerWidth, innerHeight],
        canvases,
        pianoRollViewportHeight: rollBox ? Math.round(rollBox.height) : null,
        pianoRollTop: rollBox ? Math.round(rollBox.top) : null,
        toolbarButtonTopsDistinctRows: rows,
        footerPresent: !!footer && vis(footer),
        creditTextVisible: credit,
        docScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        mainScrollH: main ? [main.scrollHeight, main.clientHeight] : null,
        bodyText: document.body.innerText.slice(0, 300).replace(/\s+/g, " "),
      };
    });
    report[`editor_${w}x${h}`] = m;
    await page.screenshot({ path: `${OUT}/editor-${w}x${h}.png` });
  }

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.evaluate(() => localStorage.setItem("stave-lang", "vi"));
  await page.goto(`/projects/${id}/edit`);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${OUT}/editor-1366x768-vi.png` });

  for (const [name, url] of [["project", `/projects/${id}`], ["projects", "/projects"], ["home", "/"], ["profile", "/profile"], ["explore", "/explore"], ["pulls", "/pull-requests"]] as const) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => localStorage.setItem("stave-lang", "en"));
    await page.goto(url);
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${OUT}/page-${name}-1440.png`, fullPage: false });
  }
  report.errors = errors.slice(0, 25);
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  await cleanupE2eUsers("run").catch(() => {});
});
