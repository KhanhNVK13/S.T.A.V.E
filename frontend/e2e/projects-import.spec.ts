import { Midi } from "@tonejs/midi";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { UserApi } from "./support/api";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
  type E2eUser,
} from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });
const BACKEND = "http://localhost:3101";

function buildMidi(spec: { tracks: number; notesPerTrack: number; ppq: number; withEvents?: boolean; padTo?: number }) {
  const midi = new Midi();
  midi.header.fromJSON({
    name: "",
    ppq: spec.ppq,
    meta: [],
    tempos: [{ ticks: 0, bpm: 120 }],
    timeSignatures: [{ ticks: 0, timeSignature: [4, 4] }],
    keySignatures: [],
  });
  for (let t = 0; t < spec.tracks; t += 1) {
    const track = midi.addTrack();
    track.name = `Imported ${t + 1}`;
    for (let i = 0; i < spec.notesPerTrack; i += 1) {
      track.addNote({ midi: 60 + t, ticks: i * spec.ppq, durationTicks: spec.ppq / 2, velocity: 0.8 });
    }
    if (spec.withEvents) {
      track.addCC({ number: 7, ticks: 0, value: 0.5 });
      track.addPitchBend({ ticks: spec.ppq, value: 0.25 });
    }
  }
  const bytes = Buffer.from(midi.toArray());
  return spec.padTo ? Buffer.concat([bytes, Buffer.alloc(spec.padTo - bytes.length)]) : bytes;
}

async function owner() {
  const user = await createE2eUser();
  await createE2eProfile(user, { display_name: "User A" });
  return { user, api: await UserApi.for(user) };
}

async function myProjects(api: UserApi) {
  return (await api.call("GET", "/projects")) as Array<{ id: string; name: string; visibility: string; archived_at: string | null }>;
}

async function openImport(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await page.getByRole("button", { name: "Nhập MIDI" }).click();
  return page.getByRole("dialog", { name: "Nhập file MIDI" });
}

async function chooseFile(page: Page, name: string, buffer: Buffer) {
  await page.getByRole("dialog", { name: "Nhập file MIDI" }).locator('input[type="file"]').setInputFiles({ name, mimeType: "audio/midi", buffer });
}

async function status(call: Promise<unknown>) {
  try {
    await call;
    return 200;
  } catch (error) {
    return Number(/-> (\d+)/.exec(String(error))?.[1] ?? 0);
  }
}

async function shareWith(api: UserApi, projectId: string, who: E2eUser, username: string) {
  await api.call("POST", `/projects/${projectId}/collaborators`, { identifier: username, permissionLevel: "edit" });
  const bApi = await UserApi.for(who);
  const [inv] = (await bApi.call("GET", "/users/me/collaboration-invitations")) as Array<{ id: string }>;
  await bApi.call("POST", `/users/me/collaboration-invitations/${inv.id}/accept`);
  return bApi;
}

test.describe("Projects and MIDI import", () => {
  test.setTimeout(150_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test("Blocked by DFID137, PRJ-002 creates a project from an imported MIDI file", async ({ page }) => {
    test.fail(true, "DFID137: the New project screen has no option to start from a MIDI file");
    const { user } = await owner();
    await loginThroughUi(page, user);
    await page.goto("/projects/new");
    await page.locator('input[name="name"]').fill("Imported Demo");
    await expect(page.locator('input[type="file"]')).toHaveCount(1, { timeout: 5_000 });
  });

  test("PRJ-010 discarding edits keeps the stored name and description", async ({ page }) => {
    const { user, api } = await owner();
    const project = await api.createProject("Test Song");
    await loginThroughUi(page, user);
    await page.goto(`/projects/${project.id}/settings`);
    await page.locator('input[name="name"]').fill("Should Not Save");
    await page.getByRole("button", { name: "Huỷ thay đổi" }).click();
    await expect(page.locator('input[name="name"]')).toHaveValue("Test Song");
    expect(((await api.call("GET", `/projects/${project.id}`)) as { name: string }).name).toBe("Test Song");
  });

  test("PRJ-018 undoing the archive restores the project with its previous visibility", async ({ page }) => {
    const { user, api } = await owner();
    const project = await api.createProject("Test Song");
    await api.putDraft(project.id, [{ id: "n1" }]);
    await api.commit(project.branchId, "Verse idea");
    await api.setVisibility(project.id, "public");
    await loginThroughUi(page, user);
    await page.goto(`/projects/${project.id}/settings`);
    await page.getByRole("button", { name: "Lưu trữ dự án" }).click();
    await page.getByRole("button", { name: "Xác nhận lưu trữ" }).click();
    await expect(page.getByText("Đã lưu trữ dự án. Bạn có thể khôi phục bất cứ lúc nào.")).toBeVisible();
    await page.getByRole("button", { name: "Hoàn tác" }).click();
    await expect.poll(async () => ((await api.call("GET", `/projects/${project.id}`)) as { archived_at: string | null }).archived_at).toBeNull();
    expect(((await api.call("GET", `/projects/${project.id}`)) as { visibility: string }).visibility).toBe("public");
    const res = await fetch(`${BACKEND}/explore/projects?page=1&limit=50`);
    expect(JSON.stringify(await res.json())).toContain(project.id);
  });

  test("Blocked by DFID138, PRJ-019 archiving a project with collaborators asks for a second confirmation", async ({ page }) => {
    test.fail(true, "DFID138: the archive confirmation does not mention collaborators or open pull requests");
    const { user, api } = await owner();
    const b = await createE2eUser();
    await createE2eProfile(b, { username: `b_${b.id.slice(0, 6)}` });
    const project = await api.createProject("Test Song");
    await api.putDraft(project.id, [{ id: "n1" }]);
    await shareWith(api, project.id, b, `b_${b.id.slice(0, 6)}`);
    await loginThroughUi(page, user);
    await page.goto(`/projects/${project.id}/settings`);
    await page.getByRole("button", { name: "Lưu trữ dự án" }).click();
    await expect(page.getByRole("alertdialog")).toContainText(/cộng tác viên/i, { timeout: 5_000 });
  });

  test("Blocked by DFID138, PRJ-020 archiving the target of an open pull request warns that it will be closed", async ({ page }) => {
    test.fail(true, "DFID138: no warning, and archiving leaves the pull request open");
    const { user, api } = await owner();
    const project = await api.createProject("Test Song");
    await api.putDraft(project.id, [{ id: "n1" }]);
    await api.commit(project.branchId, "Verse idea");
    await api.setVisibility(project.id, "public");
    const b = await createE2eUser();
    await createE2eProfile(b);
    const bApi = await UserApi.for(b);
    const fork = (await bApi.call("POST", `/projects/${project.id}/fork`)) as { id: string };
    const forkMain = (await bApi.branches(fork.id)).find((x) => x.is_default)!.id;
    await bApi.putDraft(fork.id, [{ id: "n1" }, { id: "f1", start: 960 }]);
    await bApi.commit(forkMain, "Fork idea");
    const pr = (await bApi.call("POST", `/projects/${fork.id}/pull-requests`, { sourceBranchId: forkMain, targetBranchId: project.branchId, title: "Idea" })) as { id: string };
    await loginThroughUi(page, user);
    await page.goto(`/projects/${project.id}/settings`);
    await page.getByRole("button", { name: "Lưu trữ dự án" }).click();
    const dialog = page.getByRole("alertdialog");
    const warned = await dialog.getByText(/pull request/i).count();
    await dialog.getByRole("button", { name: "Xác nhận lưu trữ" }).click();
    await expect(page.getByText("Đã lưu trữ dự án. Bạn có thể khôi phục bất cứ lúc nào.")).toBeVisible();
    const detail = (await api.call("GET", `/pull-requests/${pr.id}`)) as { pullRequest: { status: string } };
    expect(warned).toBeGreaterThan(0);
    expect(detail.pullRequest.status).toBe("closed");
  });

  test("PRJ-025 choosing archive in the delete dialog archives instead of deleting", async ({ page }) => {
    const { user, api } = await owner();
    const project = await api.createProject("Test Song");
    await api.putDraft(project.id, [{ id: "n1" }]);
    await api.commit(project.branchId, "Verse idea");
    await loginThroughUi(page, user);
    await page.goto(`/projects/${project.id}/settings`);
    await page.getByRole("button", { name: "Xóa dự án" }).click();
    await page.getByRole("button", { name: "Lưu trữ dự án thay vì xoá" }).click();
    const confirm = page.getByRole("button", { name: "Xác nhận lưu trữ" });
    if (await confirm.isVisible()) await confirm.click();
    await expect.poll(async () => ((await api.call("GET", `/projects/${project.id}`)) as { archived_at: string | null }).archived_at).not.toBeNull();
    expect(await api.history(project.branchId)).toHaveLength(1);
  });

  test("Blocked by DFID161, DFID123, PRJ-029 the dashboard lists own and shared projects, searches, sorts and opens them", async ({ page }) => {
    test.fail(true, "DFID161: archived projects are listed by default; DFID123: shared projects are not listed");
    const { user, api } = await owner();
    const test1 = await api.createProject("Test Song");
    const old = await api.createProject("Old Song");
    await api.archive(old.id);
    const b = await createE2eUser();
    await createE2eProfile(b, { display_name: "User B" });
    const bApi = await UserApi.for(b);
    const shared = await bApi.createProject("B Shared Song");
    const aUsername = `a_${user.id.slice(0, 6)}`;
    await (await import("./support/auth-links")).admin().from("users").update({ username: aUsername }).eq("id", user.id);
    await shareWith(bApi, shared.id, user, aUsername);
    await loginThroughUi(page, user);
    await page.goto("/projects");
    await expect(page.getByText("Test Song")).toBeVisible();
    await page.locator('input[name="q"]').fill("Test");
    await expect(page.locator('main a[href^="/projects/"]').filter({ hasText: "Test Song" })).toBeVisible();
    await page.locator('input[name="q"]').fill("");
    await page.getByRole("combobox", { name: /sắp xếp/i }).selectOption({ index: 1 });
    await page.locator('main a[href^="/projects/"]').filter({ hasText: "Test Song" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/projects/${test1.id}`));
    await page.goto("/projects");
    await expect(page.getByText("Test Song")).toBeVisible();
    expect(await page.getByText("Old Song").count()).toBe(0);
    await expect(page.getByText("B Shared Song")).toBeVisible();
  });

  test("Blocked by DFID139, PRJ-031 the project row menu offers edit, visibility, archive and delete", async ({ page }) => {
    test.fail(true, "DFID139: the dashboard row offers only Archive and a link to Settings");
    const { user, api } = await owner();
    await api.createProject("Test Song");
    await loginThroughUi(page, user);
    await page.goto("/projects");
    await expect(page.locator("main").getByRole("button", { name: "Lưu trữ" }).first()).toBeVisible();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.locator("main").getByRole("button", { name: /^(xoá|xóa)/i }).first()).toBeVisible({ timeout: 5_000 });
  });

  test("Blocked by DFID137, DFID140, EDT-001 imports a valid MIDI file with a summary of dropped data and an initial commit", async ({ page }) => {
    test.fail(true, "DFID140: the summary does not list the dropped pitch bend and control change data; DFID137: import starts from the project page, not from a new project");
    const { user, api } = await owner();
    const project = await api.createProject("import_3tracks");
    await loginThroughUi(page, user);
    const dialog = await openImport(page, project.id);
    await chooseFile(page, "import_3tracks.mid", buildMidi({ tracks: 3, notesPerTrack: 40, ppq: 960, withEvents: true }));
    await expect(dialog).toContainText("3");
    await expect(dialog).toContainText("120");
    await dialog.getByRole("button", { name: "Nhập và commit" }).click();
    await expect(page.getByText(/thành commit đầu tiên của dự án/)).toBeVisible();
    const history = await api.history(project.branchId);
    expect(history).toHaveLength(1);
    const snapshot = (await api.call("GET", `/commits/${history[0].id}`)) as {
      snapshot: { meta: { ppq: number }; tracks: unknown[]; notes: Array<{ id: string; start: number; pitch: number }> } & Record<string, unknown>;
    };
    expect(snapshot.snapshot.tracks).toHaveLength(3);
    expect(snapshot.snapshot.notes).toHaveLength(120);
    expect(new Set(snapshot.snapshot.notes.map((n) => n.id)).size).toBe(120);
    expect(snapshot.snapshot.notes.every((n) => n.id.length > 0)).toBe(true);
    expect(snapshot.snapshot.meta.ppq).toBe(480);
    expect(snapshot.snapshot.notes.filter((n) => n.pitch === 60).map((n) => n.start).sort((x, y) => x - y).slice(0, 3)).toEqual([0, 480, 960]);
    expect(JSON.stringify(snapshot.snapshot)).not.toMatch(/pitchBend|controlChange|"cc"/i);
    const again = await openImport(page, project.id);
    await chooseFile(page, "import_3tracks.mid", buildMidi({ tracks: 3, notesPerTrack: 40, ppq: 960, withEvents: true }));
    await expect(again).toContainText(/pitch bend|control change|bị bỏ|không hỗ trợ/i, { timeout: 5_000 });
  });

  test("Blocked by DFID141, EDT-002 cancelling or removing the chosen file imports nothing", async ({ page }) => {
    test.fail(true, "DFID141: there is no drop zone and the chosen file cannot be removed");
    const { user, api } = await owner();
    const project = await api.createProject("Test Song");
    const before = (await myProjects(api)).length;
    await loginThroughUi(page, user);
    const dialog = await openImport(page, project.id);
    await chooseFile(page, "import_3tracks.mid", buildMidi({ tracks: 3, notesPerTrack: 40, ppq: 960 }));
    await expect(dialog).toContainText("120");
    await dialog.getByRole("button", { name: /^huỷ$/i }).click();
    await expect(dialog).toHaveCount(0);
    expect(await api.history(project.branchId)).toHaveLength(0);
    expect((await myProjects(api)).length).toBe(before);
    const again = await openImport(page, project.id);
    await chooseFile(page, "import_3tracks.mid", buildMidi({ tracks: 3, notesPerTrack: 40, ppq: 960 }));
    await again.getByRole("button", { name: /xoá file|gỡ file|remove/i }).click({ timeout: 5_000 });
    await expect(again.getByRole("button", { name: "Nhập và commit" })).toBeDisabled();
  });

  test("Blocked by DFID142, EDT-006 a MIDI file without notes asks for confirmation before importing", async ({ page }) => {
    test.fail(true, "DFID142: a file without notes is refused outright instead of asking for confirmation");
    const { user, api } = await owner();
    const project = await api.createProject("Test Song");
    await loginThroughUi(page, user);
    const dialog = await openImport(page, project.id);
    await chooseFile(page, "no_notes.mid", buildMidi({ tracks: 1, notesPerTrack: 0, ppq: 480 }));
    await expect(dialog.getByText("File MIDI này không có nốt nào để nhập.")).toBeVisible();
    expect(await api.history(project.branchId)).toHaveLength(0);
    await expect(dialog.getByRole("button", { name: /vẫn nhập|tiếp tục|xác nhận/i })).toBeVisible({ timeout: 5_000 });
  });

  test("EDT-007 a failure while saving the import leaves nothing half imported", async ({ page }) => {
    const { user, api } = await owner();
    const project = await api.createProject("Test Song");
    await loginThroughUi(page, user);
    await page.route(
      (url) => url.href.includes(":3101") && (url.pathname === "/commits" || url.pathname.endsWith("/draft")),
      (route) => (route.request().method() === "GET" ? route.continue() : route.fulfill({ status: 500, body: "{}" })),
    );
    const dialog = await openImport(page, project.id);
    await chooseFile(page, "import_3tracks.mid", buildMidi({ tracks: 3, notesPerTrack: 40, ppq: 960 }));
    await dialog.getByRole("button", { name: "Nhập và commit" }).click();
    await expect(dialog.getByRole("alert").first()).toContainText("Không nhập được file MIDI. Chưa có commit nào được tạo.");
    expect(await api.history(project.branchId)).toHaveLength(0);
    expect((await api.draft(project.id)).notes).toHaveLength(0);
  });

  test("EDT-008 a file of exactly 5 MB and a .midi file are accepted", async ({ page }) => {
    const { user, api } = await owner();
    const big = await api.createProject("Big Song");
    const small = await api.createProject("Small Song");
    await loginThroughUi(page, user);
    let dialog = await openImport(page, big.id);
    await chooseFile(page, "sample_5MB.mid", buildMidi({ tracks: 1, notesPerTrack: 8, ppq: 480, padTo: 5 * 1024 * 1024 }));
    await dialog.getByRole("button", { name: "Nhập và commit" }).click();
    await expect(page.getByText(/thành commit đầu tiên của dự án/)).toBeVisible();
    expect((await api.draft(big.id)).notes).toHaveLength(8);
    dialog = await openImport(page, small.id);
    await chooseFile(page, "small.midi", buildMidi({ tracks: 1, notesPerTrack: 10, ppq: 480 }));
    await dialog.getByRole("button", { name: "Nhập và commit" }).click();
    await expect(page.getByText(/thành commit đầu tiên của dự án/)).toBeVisible();
    expect((await api.draft(small.id)).notes).toHaveLength(10);
    expect(await api.history(small.branchId)).toHaveLength(1);
  });
});
