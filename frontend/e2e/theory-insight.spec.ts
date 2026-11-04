import { expect as baseExpect, test, type Page } from "@playwright/test";
import { UserApi, type NoteSeed } from "./support/api";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
} from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });
const BAR = 1920;

function chord(bar: number, pitches: number[], prefix: string): NoteSeed[] {
  return pitches.map((pitch, i) => ({ id: `${prefix}${bar}-${i}`, pitch, start: bar * BAR, duration: BAR }));
}

const PROGRESSION: NoteSeed[] = [
  ...chord(0, [48, 60, 64, 67], "c"),
  ...chord(1, [43, 59, 62, 67], "g"),
  ...chord(2, [45, 57, 60, 64], "a"),
  ...chord(3, [41, 57, 60, 65], "f"),
];

async function song(name: string, notes: NoteSeed[]) {
  const user = await createE2eUser();
  await createE2eProfile(user);
  const api = await UserApi.for(user);
  const project = await api.createProject(name);
  await api.putDraft(project.id, notes);
  return { user, api, ...project };
}

async function openInsight(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}/edit`);
  await page.getByRole("button", { name: /^File$/ }).waitFor();
  await page.getByRole("button", { name: "Panel Insight" }).click();
  const panel = page.locator("aside").filter({ has: page.getByText(/Nhận diện tông, tiến trình hợp âm/) }).last();
  await expect(panel.getByText(/Đang phân tích…|Đang cập nhật…/)).toHaveCount(0);
  return panel;
}

test.describe("Music Theory Insight", () => {
  test.setTimeout(120_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test("Blocked by DFID147, AI-014 names the key and the progression and highlights their bars", async ({ page }) => {
    test.fail(true, "DFID147: selecting an insight moves the playhead but highlights no bars in the grid");
    const s = await song("Theory Song", PROGRESSION);
    await loginThroughUi(page, s.user);
    const panel = await openInsight(page, s.id);
    await expect(panel).toContainText(/Tông: (có vẻ là )?Đô trưởng|C trưởng|C major/);
    await expect(panel).toContainText(/I[–-]V[–-]vi[–-]IV/);
    await expect(panel).toContainText(/1[–-]4/);
    const before = await s.api.draft(s.id);
    await panel.getByRole("button", { name: /Đi tới ô nhịp|Đưa đầu phát tới ô nhịp 1/ }).first().click();
    expect(await s.api.draft(s.id)).toEqual(before);
    await expect(page.locator("[data-insight-highlight], [data-highlight-bars]")).not.toHaveCount(0, { timeout: 5_000 });
  });

  test("AI-015 the analysis refreshes while the user edits and after undo", async ({ page }) => {
    const s = await song("Theory Song", PROGRESSION);
    await loginThroughUi(page, s.user);
    const panel = await openInsight(page, s.id);
    await expect(panel).toContainText(/I[–-]V[–-]vi[–-]IV/);
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Delete");
    await expect(panel).not.toContainText(/I[–-]V[–-]vi[–-]IV/);
    await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
    await expect(panel).toContainText(/I[–-]V[–-]vi[–-]IV/);
  });

  test("AI-016 a dismissed insight stays hidden for this project only", async ({ page }) => {
    const s = await song("Theory Song", PROGRESSION);
    const second = await s.api.createProject("Theory Song 2");
    await s.api.putDraft(second.id, PROGRESSION);
    await loginThroughUi(page, s.user);
    let panel = await openInsight(page, s.id);
    const keyTitle = panel.getByText(/^Tông:/).first();
    await expect(keyTitle).toBeVisible();
    await panel.getByRole("button", { name: /^Bỏ Tông/ }).first().click();
    await expect(panel.getByText(/^Tông:/)).toHaveCount(0);
    await page.reload();
    await page.getByRole("button", { name: /^File$/ }).waitFor();
    panel = await openInsight(page, s.id);
    await expect(panel.getByText(/^Tông:/)).toHaveCount(0);
    await expect(panel).toContainText(/I[–-]V[–-]vi[–-]IV/);
    const other = await openInsight(page, second.id);
    await expect(other.getByText(/^Tông:/).first()).toBeVisible();
  });

  test("AI-017 too few notes give a message instead of a guess", async ({ page }) => {
    const s = await song("Sparse Song", [{ id: "a", pitch: 60, start: 0 }, { id: "b", pitch: 64, start: 480 }]);
    await loginThroughUi(page, s.user);
    const panel = await openInsight(page, s.id);
    await expect(panel).toContainText("Chưa đủ nốt để nhận diện");
    await expect(panel.getByText(/^Tông:/)).toHaveCount(0);
  });

  test("AI-018 music with no recognised pattern gets a plain statement", async ({ page }) => {
    const atonal: NoteSeed[] = Array.from({ length: 48 }, (_, i) => ({
      id: `r${i}`,
      pitch: 60 + (i % 12),
      start: i * 240,
      duration: 240,
    }));
    const s = await song("Atonal Song", atonal);
    await loginThroughUi(page, s.user);
    const panel = await openInsight(page, s.id);
    await expect(panel).toContainText(/Chưa nhận ra mẫu nào|Chưa nhận ra tông nào rõ ràng/);
    await expect(panel).not.toContainText(/Tiến trình: /);
  });

  test("AI-019 ambiguous music is shown as several possibilities", async ({ page }) => {
    const white: NoteSeed[] = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62].flatMap((pitch, i) => [
      { id: `w${i}`, pitch, start: i * 480, duration: 480 },
    ]);
    const s = await song("Ambiguous Song", white);
    await loginThroughUi(page, s.user);
    const panel = await openInsight(page, s.id);
    await expect(panel).toContainText(/Khả năng khác:|có vẻ là/);
  });
});
