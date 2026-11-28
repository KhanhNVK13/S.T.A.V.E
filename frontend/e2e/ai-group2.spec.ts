import fs from "node:fs";
import path from "node:path";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { admin } from "./support/auth-links";
import { ensurePlans, httpStatus, person, type Person } from "./support/people";
import { cleanupE2eUsers, loginThroughUi } from "./support/test-user";

const expect = baseExpect.configure({ timeout: 45_000 });

test.use({ viewport: { width: 1440, height: 900 } });

const trackedProjectIds = new Set<string>();
const trackedUserIds = new Set<string>();

function trackPerson(p: Person): Person {
  trackedUserIds.add(p.user.id);
  return p;
}

function trackProject(id: string): string {
  trackedProjectIds.add(id);
  return id;
}

async function shot(page: Page, filename: string): Promise<void> {
  const dir = process.env.AI2_SCREENSHOT_DIR;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, filename), fullPage: false });
}

function encodeMonoWav(samples: Float32Array, sampleRate = 22050): Buffer {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buffer;
}

function buildMelodyWav(sampleRate = 22050): Buffer {
  const freqs = [261.63, 329.63, 392.0, 523.25]; // C4, E4, G4, C5
  const noteSec = 1.0;
  const totalSamples = Math.round(sampleRate * noteSec * freqs.length);
  const samples = new Float32Array(totalSamples);
  for (let n = 0; n < freqs.length; n += 1) {
    const freq = freqs[n];
    const startIdx = Math.round(n * noteSec * sampleRate);
    const len = Math.round(noteSec * sampleRate);
    for (let i = 0; i < len; i += 1) {
      const t = i / sampleRate;
      const env =
        t < 0.03 ? t / 0.03 : t > noteSec - 0.12 ? Math.max(0, (noteSec - t) / 0.12) : 1;
      const wave =
        0.65 * Math.sin(2 * Math.PI * freq * t) +
        0.25 * Math.sin(2 * Math.PI * freq * 2 * t) +
        0.1 * Math.sin(2 * Math.PI * freq * 3 * t);
      samples[startIdx + i] = wave * env * 0.7;
    }
  }
  return encodeMonoWav(samples, sampleRate);
}

function buildSilenceWav(seconds = 3, sampleRate = 22050): Buffer {
  return encodeMonoWav(new Float32Array(Math.round(seconds * sampleRate)), sampleRate);
}

function buildLongToneWav(seconds = 52, sampleRate = 22050): Buffer {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < samples.length; i += 1) {
    const t = i / sampleRate;
    const freq = Math.floor(t) % 2 === 0 ? 440 : 523.25;
    samples[i] = 0.5 * Math.sin(2 * Math.PI * freq * t);
  }
  return encodeMonoWav(samples, sampleRate);
}

async function attachWavSketch(
  owner: Person,
  projectId: string,
  name: string,
  wav: Buffer,
  durationSec: number,
): Promise<{ sketchId: string }> {
  const upload = (await owner.api.call(
    "POST",
    `/projects/${projectId}/audio-sketches/upload-url`,
    { durationSec, sizeBytes: wav.length },
  )) as { sketchId: string; path: string; token: string };

  const { error } = await admin()
    .storage.from("audio-sketches")
    .uploadToSignedUrl(upload.path, upload.token, wav, { contentType: "audio/wav" });
  if (error) throw new Error(`Sketch upload failed: ${error.message}`);

  await owner.api.call("POST", `/projects/${projectId}/audio-sketches`, {
    sketchId: upload.sketchId,
    name,
    durationSec,
    sizeBytes: wav.length,
  });
  return { sketchId: upload.sketchId };
}

interface SnapshotNoteInput {
  id: string;
  trackId: string;
  pitch: number;
  start: number;
  duration: number;
  velocity?: number;
}

interface SnapshotTrackInput {
  id: string;
  name: string;
  instrument: string | null;
  color?: string;
}

function buildSnapshot(
  tempo: number,
  tracks: SnapshotTrackInput[],
  notes: SnapshotNoteInput[],
) {
  return {
    schemaVersion: 3,
    meta: { tempo, timeSignature: [4, 4] as [number, number], ppq: 480 },
    tracks: tracks.map((tr, i) => ({
      id: tr.id,
      name: tr.name,
      order: i,
      color: tr.color ?? "#6366f1",
      muted: false,
      solo: false,
      volume: 0.8,
      pan: 0,
      instrument: tr.instrument,
    })),
    notes: notes.map((n) => ({
      velocity: 90,
      ...n,
    })),
  };
}

function minorLoopNotes(trackId: string, bars = 4): SnapshotNoteInput[] {
  // A minor (A-C-E, F-A-C, D-F-A, E-G-B) — deterministic minor tonality
  const chords = [
    [57, 60, 64, 69],
    [53, 57, 60, 65],
    [50, 53, 57, 62],
    [52, 55, 59, 64],
  ];
  const out: SnapshotNoteInput[] = [];
  for (let b = 0; b < bars; b += 1) {
    const chord = chords[b % chords.length];
    const barStart = b * 1920;
    chord.forEach((pitch, idx) => {
      out.push({
        id: `${trackId}-b${b}-n${idx}`,
        trackId,
        pitch,
        start: barStart + idx * 480,
        duration: 460,
        velocity: 84,
      });
    });
  }
  return out;
}

function majorFastNotes(trackId: string, bars = 4): SnapshotNoteInput[] {
  // C major dense 8th-note pattern
  const scale = [60, 62, 64, 65, 67, 69, 71, 72];
  const out: SnapshotNoteInput[] = [];
  for (let b = 0; b < bars; b += 1) {
    for (let s = 0; s < 8; s += 1) {
      out.push({
        id: `${trackId}-fast-b${b}-s${s}`,
        trackId,
        pitch: scale[(b + s) % scale.length],
        start: b * 1920 + s * 240,
        duration: 200,
        velocity: 108,
      });
    }
  }
  return out;
}

async function waitForFingerprints(projectIds: string[]): Promise<void> {
  const db = admin();
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const { data, error } = await db
      .from("project_musical_fingerprints")
      .select("project_id")
      .in("project_id", projectIds);
    if (error) throw new Error(`Fingerprint lookup failed: ${error.message}`);
    if ((data?.length ?? 0) >= projectIds.length) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for musical fingerprints of ${projectIds.join(", ")}`);
}

async function cleanupTrackedData(): Promise<void> {
  const db = admin();
  const projectIds = [...trackedProjectIds];
  const userIds = [...trackedUserIds];

  if (projectIds.length > 0) {
    await db.from("reports").delete().in("project_id", projectIds);
    await db.from("project_musical_fingerprints").delete().in("project_id", projectIds);
  }
  if (userIds.length > 0) {
    await db.from("reports").delete().in("reporter_id", userIds);
    await db.from("subscriptions").delete().in("user_id", userIds);
    await db.from("transactions").delete().in("user_id", userIds);
  }

  await cleanupE2eUsers();
  trackedProjectIds.clear();
  trackedUserIds.clear();
}

test.describe("AI Group 2 live end-to-end showcase", () => {
  test.setTimeout(300_000);

  test.afterEach(async () => {
    await cleanupTrackedData();
  });

  test("Feature 1 (A2M-01): Basic Pitch live transcription, tuning, validation, Piano Roll insert & Undo/Redo", async ({
    page,
  }) => {
    const owner = trackPerson(await person("A2MOwner"));
    const project = await owner.api.createProject("AI2 Audio2Midi Song");
    trackProject(project.id);

    const baseSnap = buildSnapshot(
      120,
      [{ id: "tr-base", name: "Piano", instrument: "Acoustic Grand Piano" }],
      [{ id: "n-base-1", trackId: "tr-base", pitch: 60, start: 0, duration: 480 }],
    );
    await owner.api.call("PUT", `/projects/${project.id}/draft`, baseSnap);

    const sketch = await attachWavSketch(
      owner,
      project.id,
      "Giai điệu mẫu",
      buildMelodyWav(),
      4,
    );

    await loginThroughUi(page, owner.user);
    await page.goto(`/projects/${project.id}/edit`);
    await page.getByRole("button", { name: /^File$/ }).waitFor({ timeout: 30_000 });

    await page.getByRole("button", { name: /^File$/ }).click();
    await page.getByRole("menuitem", { name: /Audio sketch/i }).click();
    const sketchModal = page.getByRole("dialog", { name: "Audio sketch" });
    await expect(sketchModal).toBeVisible();
    await expect(sketchModal.getByText("Giai điệu mẫu")).toBeVisible();
    await shot(page, "01-a2m-sketch-panel.png");

    await sketchModal.getByTestId(`transcribe-sketch-${sketch.sketchId}`).click();
    const a2mDialog = page.getByRole("dialog", { name: /Chuyển âm thanh sang MIDI/i });
    await expect(a2mDialog).toBeVisible();

    const noteCountEl = a2mDialog.getByTestId("a2m-note-count");
    await expect(noteCountEl).toBeVisible({ timeout: 60_000 });
    const initialCount = Number(await noteCountEl.innerText());
    expect(initialCount).toBeGreaterThan(0);
    await expect(a2mDialog.getByTestId("a2m-analyzed-duration")).toHaveText("4.0s");
    await shot(page, "02-a2m-dialog-ready.png");

    // Tune controls instantaneously (thresholds + quantize + instrument)
    const sliders = a2mDialog.locator('input[type="range"]');
    await sliders.nth(0).fill("0.35");
    await sliders.nth(1).fill("0.2");
    await a2mDialog.getByRole("button", { name: "1/8" }).click();
    await a2mDialog.getByRole("button", { name: "Tắt" }).click();
    await a2mDialog.getByRole("button", { name: "1/16" }).click();
    await a2mDialog.getByLabel("Nhạc cụ").selectOption("Electric Piano 1");
    await shot(page, "03-a2m-tuning-controls.png");

    // Edge case: empty track name validation
    const nameInput = a2mDialog.getByLabel("Tên track");
    await nameInput.fill("   ");
    await a2mDialog.getByRole("button", { name: "Thêm vào Piano Roll" }).click();
    await expect(a2mDialog.getByText("Hãy nhập tên track.")).toBeVisible();
    await shot(page, "04-a2m-empty-name-error.png");

    // Confirm valid track name and verify Piano Roll + TrackPanel update
    await nameInput.fill("Giai điệu ngân nga");
    await a2mDialog.getByRole("button", { name: "Thêm vào Piano Roll" }).click();
    await expect(a2mDialog).toHaveCount(0);
    await expect(page.getByText("Giai điệu ngân nga").first()).toBeVisible();
    await expect(page.getByText(/Đã thêm track "Giai điệu ngân nga"/).first()).toBeVisible();
    await shot(page, "05-a2m-track-added-pianoroll.png");

    // Undo (Ctrl+Z) removes track, Redo (Ctrl+Y) restores it
    await page.keyboard.press("Control+z");
    await expect(page.getByText("Giai điệu ngân nga")).toHaveCount(0);
    await page.keyboard.press("Control+y");
    await expect(page.getByText("Giai điệu ngân nga").first()).toBeVisible();
    await shot(page, "06-a2m-undo-redo.png");
  });

  test("Feature 1 (A2M-02): Edge cases — 0-note silence, >45s audio cap, and 32-track limit", async ({
    page,
  }) => {
    const owner = trackPerson(await person("A2MEdge"));
    const project = await owner.api.createProject("AI2 A2M Edge Cases");
    trackProject(project.id);

    const silence = await attachWavSketch(
      owner,
      project.id,
      "Im lặng 3s",
      buildSilenceWav(3),
      3,
    );
    const longTone = await attachWavSketch(
      owner,
      project.id,
      "Bản thu dài 52s",
      buildLongToneWav(52),
      52,
    );

    await loginThroughUi(page, owner.user);
    await page.goto(`/projects/${project.id}/edit`);
    await page.getByRole("button", { name: /^File$/ }).waitFor({ timeout: 30_000 });

    await page.getByRole("button", { name: /^File$/ }).click();
    await page.getByRole("menuitem", { name: /Audio sketch/i }).click();
    const sketchModal = page.getByRole("dialog", { name: "Audio sketch" });
    await expect(sketchModal.getByText("Im lặng 3s")).toBeVisible();

    // 1. Silence -> 0 notes + disabled confirm
    await sketchModal.getByTestId(`transcribe-sketch-${silence.sketchId}`).click();
    const silenceDialog = page.getByRole("dialog", { name: /Chuyển âm thanh sang MIDI/i });
    await expect(silenceDialog.getByTestId("a2m-note-count")).toHaveText("0", {
      timeout: 60_000,
    });
    await expect(silenceDialog.getByText(/Chưa nhận diện được nốt rõ ràng/)).toBeVisible();
    await expect(
      silenceDialog.getByRole("button", { name: "Thêm vào Piano Roll" }),
    ).toBeDisabled();
    await shot(page, "07-a2m-zero-notes-silence.png");
    await silenceDialog.getByRole("button", { name: "Huỷ" }).click();

    // 2. 52s audio -> capped to 45.0s with warning banner
    await sketchModal.getByTestId(`transcribe-sketch-${longTone.sketchId}`).click();
    const longDialog = page.getByRole("dialog", { name: /Chuyển âm thanh sang MIDI/i });
    await expect(longDialog.getByTestId("a2m-analyzed-duration")).toHaveText("45.0s", {
      timeout: 60_000,
    });
    await expect(longDialog.getByText(/chỉ 45 giây đầu được phân tích/)).toBeVisible();
    await shot(page, "08-a2m-capped-45s.png");
    await longDialog.getByRole("button", { name: "Huỷ" }).click();

    // 3. 32-track limit -> disabled confirm + alert
    const maxTracks: SnapshotTrackInput[] = Array.from({ length: 32 }, (_, idx) => ({
      id: `tr-max-${idx + 1}`,
      name: `Track ${idx + 1}`,
      instrument: "Acoustic Grand Piano",
    }));
    await owner.api.call(
      "PUT",
      `/projects/${project.id}/draft`,
      buildSnapshot(120, maxTracks, [
        { id: "n-max-1", trackId: "tr-max-1", pitch: 60, start: 0, duration: 480 },
      ]),
    );

    await page.reload();
    await page.getByRole("button", { name: /^File$/ }).waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: /^File$/ }).click();
    await page.getByRole("menuitem", { name: /Audio sketch/i }).click();
    await page
      .getByRole("dialog", { name: "Audio sketch" })
      .getByTestId(`transcribe-sketch-${longTone.sketchId}`)
      .click();
    const limitDialog = page.getByRole("dialog", { name: /Chuyển âm thanh sang MIDI/i });
    await expect(limitDialog.getByTestId("a2m-note-count")).toBeVisible({ timeout: 60_000 });
    await expect(limitDialog.getByText(/Dự án đã đạt giới hạn 32 track/)).toBeVisible();
    await expect(
      limitDialog.getByRole("button", { name: "Thêm vào Piano Roll" }),
    ).toBeDisabled();
    await shot(page, "09-a2m-max-32-tracks.png");
  });

  test("Feature 2 (PGV-01): Musical Fingerprinting pgvector similarity, guest/private isolation, and Explore AI search (VI/EN/fallback)", async ({
    page,
    browser,
  }) => {
    const owner = trackPerson(await person("ExploreOwner"));
    const searcher = trackPerson(await person("Searcher"));

    const pubA = await owner.api.createProject("Ballad Piano Am 78");
    trackProject(pubA.id);
    await owner.api.call("PATCH", `/projects/${pubA.id}`, { genre: "Pop", license: "CC-BY" });
    await owner.api.call(
      "PUT",
      `/projects/${pubA.id}/draft`,
      buildSnapshot(
        78,
        [{ id: "tr-a", name: "Main Piano", instrument: "Acoustic Grand Piano" }],
        minorLoopNotes("tr-a", 4),
      ),
    );
    await owner.api.commit(pubA.branchId, "Commit Ballad Piano Am");
    await owner.api.setVisibility(pubA.id, "public");

    const pubB = await owner.api.createProject("Nocturne Keys Am 82");
    trackProject(pubB.id);
    await owner.api.call("PATCH", `/projects/${pubB.id}`, {
      genre: "Classical",
      license: "CC-BY",
    });
    await owner.api.call(
      "PUT",
      `/projects/${pubB.id}/draft`,
      buildSnapshot(
        82,
        [{ id: "tr-b", name: "Warm Keys", instrument: "Electric Piano 1" }],
        minorLoopNotes("tr-b", 4),
      ),
    );
    await owner.api.commit(pubB.branchId, "Commit Nocturne Keys Am");
    await owner.api.setVisibility(pubB.id, "public");

    const pubC = await owner.api.createProject("Hyper Synth Drive 148");
    trackProject(pubC.id);
    await owner.api.call("PATCH", `/projects/${pubC.id}`, {
      genre: "Electronic / EDM",
      license: "CC-BY",
    });
    await owner.api.call(
      "PUT",
      `/projects/${pubC.id}/draft`,
      buildSnapshot(
        148,
        [
          { id: "tr-c1", name: "Square Lead", instrument: "Lead 1 (square)" },
          { id: "tr-c2", name: "Drums", instrument: "Standard Drum Kit" },
        ],
        majorFastNotes("tr-c1", 4),
      ),
    );
    await owner.api.commit(pubC.branchId, "Commit Hyper Synth Drive");
    await owner.api.setVisibility(pubC.id, "public");

    const privD = await owner.api.createProject("Secret Private Demo");
    trackProject(privD.id);
    await owner.api.call(
      "PUT",
      `/projects/${privD.id}/draft`,
      buildSnapshot(
        80,
        [{ id: "tr-d", name: "Private Piano", instrument: "Acoustic Grand Piano" }],
        minorLoopNotes("tr-d", 4),
      ),
    );
    await owner.api.commit(privD.branchId, "Commit Private Demo");

    await waitForFingerprints([pubA.id, pubB.id, pubC.id, privD.id]);

    // Verify API ranking & private isolation directly
    const apiBase = "http://localhost:3101";
    const simRes = await fetch(`${apiBase}/explore/projects/${pubA.id}/similar`);
    expect(simRes.status).toBe(200);
    const simItems = (await simRes.json()) as Array<{
      id: string;
      name: string;
      similarity: number;
    }>;
    const simIds = simItems.map((x) => x.id);
    expect(simIds).toContain(pubB.id);
    expect(simIds).not.toContain(privD.id);
    if (simIds.includes(pubC.id)) {
      expect(simIds.indexOf(pubB.id)).toBeLessThan(simIds.indexOf(pubC.id));
    }

    const privSimRes = await fetch(`${apiBase}/explore/projects/${privD.id}/similar`);
    expect(privSimRes.status).toBe(404);

    // 10. Signed-in user views Public A SimilarProjectsCard
    await loginThroughUi(page, searcher.user);
    await page.goto(`/projects/${pubA.id}`);
    const simCard = page.getByTestId("similar-projects-card");
    await expect(simCard).toBeVisible();
    await expect(simCard.getByText("Nocturne Keys Am 82")).toBeVisible();
    await expect(simCard.getByText("Secret Private Demo")).toHaveCount(0);
    await simCard.scrollIntoViewIfNeeded();
    await shot(page, "10-sim-public-project-matches.png");

    // 11. Guest views Public A (works) + Owner views Private D (card hidden)
    const guestCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const guestPage = await guestCtx.newPage();
    await guestPage.goto(`/projects/${pubA.id}`);
    const guestSimCard = guestPage.getByTestId("similar-projects-card");
    await expect(guestSimCard).toBeVisible();
    await guestSimCard.scrollIntoViewIfNeeded();
    await shot(guestPage, "11-sim-guest-view-and-private-hidden.png");

    // 14. Guest Explore manual musical filters (no AI button for guests)
    await guestPage.goto("/explore?tempoMax=85&mode=minor");
    await expect(guestPage.getByTestId("explore-ai-search-btn")).toHaveCount(0);
    await expect(guestPage.getByText(/<= 85 BPM/)).toBeVisible();
    await expect(guestPage.getByText("Ballad Piano Am 78")).toBeVisible();
    await expect(guestPage.getByText("Hyper Synth Drive 148")).toHaveCount(0);
    await shot(guestPage, "14-explore-guest-manual-filters.png");
    await guestCtx.close();

    // Owner views Private D -> no SimilarProjectsCard
    const ownerCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const ownerPage = await ownerCtx.newPage();
    await loginThroughUi(ownerPage, owner.user);
    await ownerPage.goto(`/projects/${privD.id}`);
    await expect(ownerPage.getByText("Secret Private Demo").first()).toBeVisible();
    await expect(ownerPage.getByTestId("similar-projects-card")).toHaveCount(0);
    await ownerCtx.close();

    // 12. Signed-in VI Natural-Language Explore AI search
    await page.goto("/explore");
    await expect(page.getByRole("complementary")).toBeVisible();
    await expect(page.getByTestId("explore-ai-search-btn")).toBeVisible();
    await page.getByRole("searchbox").fill("nhạc piano buồn chậm dưới 85 BPM");
    await page.getByTestId("explore-ai-search-btn").click();
    const exploreCallout = page.getByTestId("explore-ai-callout");
    await expect(exploreCallout).toBeVisible();
    await expect(exploreCallout.getByRole("status")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText(/<= 8[45] BPM/)).toBeVisible();
    await expect(page.getByText("Ballad Piano Am 78")).toBeVisible();
    await expect(page.getByText("Hyper Synth Drive 148")).toHaveCount(0);
    await shot(page, "12-explore-ai-search-vi.png");

    // 13. Switch to English & test EN Natural-Language Explore AI search
    await page.goto("/explore");
    await expect(page.getByRole("complementary")).toBeVisible();
    await page.getByRole("button", { name: /^EN / }).click();
    await expect(page.getByTestId("explore-ai-search-btn")).toBeVisible();
    await page.getByRole("searchbox").fill("fast electronic major over 135 bpm");
    await page.getByTestId("explore-ai-search-btn").click();
    await expect(exploreCallout).toBeVisible();
    await expect(exploreCallout.getByRole("status")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText(/>= 13[56] BPM/)).toBeVisible();
    await expect(page.getByText("Hyper Synth Drive 148")).toBeVisible();
    await expect(page.getByText("Ballad Piano Am 78")).toHaveCount(0);
    await shot(page, "13-explore-ai-search-en.png");

    // 15. Rule-based fallback display & dismissing callout + clearing filter pill
    await page.getByRole("button", { name: /^VI / }).click();
    await page.goto("/explore");
    await expect(page.getByRole("complementary")).toBeVisible();
    await expect(page.getByTestId("explore-ai-search-btn")).toBeVisible();
    await page.route("**/ai/explore-parse", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          instruments: ["Acoustic Grand Piano"],
          genre: null,
          tempoMin: null,
          tempoMax: 85,
          mode: "minor",
          search: null,
          explanation: "Áp dụng bộ lọc quy tắc: Acoustic Grand Piano, tối đa 85 BPM, giọng thứ.",
          source: "rule",
        }),
      });
    });
    await page.getByRole("searchbox").fill("piano chậm giọng thứ dưới 85 bpm");
    await page.getByTestId("explore-ai-search-btn").click();
    await expect(exploreCallout).toBeVisible();
    await expect(exploreCallout.getByText(/quy tắc nhạc lý cục bộ/i)).toBeVisible();
    await expect(page.getByText(/<= 85 BPM/)).toBeVisible();
    await expect(page.getByText("Ballad Piano Am 78")).toBeVisible();
    await shot(page, "15-explore-fallback-and-chip-clear.png");
    await page.getByRole("button", { name: "Đóng ghi chú bộ lọc" }).click();
    await expect(exploreCallout).toHaveCount(0);
    await page.getByRole("button", { name: "Bỏ lọc tempo tối đa" }).click();
    await expect(page.getByText(/<= 85 BPM/)).toHaveCount(0);
    await page.unroute("**/ai/explore-parse");
  });

  test("Feature 3 (ASK-01): Ask STAVE Free gate, STAVE+ upgrade, live Gemini Function Calling, privacy & fallback", async ({
    page,
    browser,
  }) => {
    await ensurePlans();
    const owner = trackPerson(await person("AskOwner"));
    const collab = trackPerson(await person("AskCollab"));
    const stranger = trackPerson(await person("AskStranger"));

    // Create public project with main + chorus branches + anchored comments
    const project = await owner.api.createProject("Ask STAVE Symphony");
    trackProject(project.id);
    await owner.api.call("PATCH", `/projects/${project.id}`, {
      genre: "Classical",
      license: "CC-BY",
    });
    await owner.api.call(
      "PUT",
      `/projects/${project.id}/draft`,
      buildSnapshot(
        96,
        [{ id: "tr-main", name: "Grand Piano", instrument: "Acoustic Grand Piano" }],
        minorLoopNotes("tr-main", 4),
      ),
    );
    await owner.api.commit(project.branchId, "Base A minor progression");
    await owner.api.setVisibility(project.id, "public");

    // Add collaborator with edit permission and 4 anchored comments (3 on bar 2, 1 on bar 6)
    await owner.api.call("POST", `/projects/${project.id}/collaborators`, {
      identifier: collab.username,
      permissionLevel: "edit",
    });
    const invs = (await collab.api.call(
      "GET",
      "/users/me/collaboration-invitations",
    )) as Array<{ id: string; projectId: string }>;
    const inv = invs.find((i) => i.projectId === project.id);
    if (!inv) throw new Error("Collaboration invitation not found");
    await collab.api.call("POST", `/users/me/collaboration-invitations/${inv.id}/accept`);
    await collab.api.call("POST", `/projects/${project.id}/comments`, {
      bar: 2,
      body: "SECRET_COLLAB_PHRASE_XYZ đoạn hợp âm bar 2 rất rõ",
    });
    await collab.api.call("POST", `/projects/${project.id}/comments`, {
      bar: 2,
      body: "Giữ nguyên tiết tấu piano ở ô nhịp 2",
    });
    await owner.api.call("POST", `/projects/${project.id}/comments`, {
      bar: 2,
      body: "Đồng ý giữ velocity 84 ở ô nhịp 2",
    });
    await collab.api.call("POST", `/projects/${project.id}/comments`, {
      bar: 6,
      body: "Thử nâng nhẹ quãng ở ô nhịp 6",
    });

    // Create branch `chorus` with notes in bars 5..8
    const chorusBranch = await owner.api.createBranch(project.id, "chorus");
    await owner.api.switchTo(project.branchId, chorusBranch.id, project.id);
    const chorusNotes = [
      ...minorLoopNotes("tr-main", 4),
      ...minorLoopNotes("tr-main", 4).map((n, idx) => ({
        ...n,
        id: `chorus-hi-${idx}`,
        pitch: n.pitch + 12,
        start: n.start + 4 * 1920,
      })),
    ];
    await owner.api.call(
      "PUT",
      `/projects/${project.id}/draft`,
      buildSnapshot(
        96,
        [{ id: "tr-main", name: "Grand Piano", instrument: "Acoustic Grand Piano" }],
        chorusNotes,
      ),
    );
    await owner.api.commit(chorusBranch.id, "Add octave chorus in bars 5-8");
    await owner.api.switchTo(chorusBranch.id, project.branchId, project.id);

    // 16. Free user sees Ask STAVE STAVE+ gate & backend enforces 403
    const freeStatus = await httpStatus(
      owner.api.call("POST", "/ai/ask-project", {
        projectId: project.id,
        question: "So sánh các nhánh",
        lang: "vi",
      }),
    );
    expect(freeStatus).toBe(403);

    await loginThroughUi(page, owner.user);
    await page.goto(`/projects/${project.id}`);
    const askCard = page.getByTestId("ask-stave-card");
    await expect(askCard).toBeVisible();
    await expect(page.getByTestId("ask-stave-gate")).toBeVisible();
    await askCard.scrollIntoViewIfNeeded();
    await shot(page, "16-ask-free-user-gate.png");

    // 17. Click Upgrade CTA -> /plans shows STAVE+ plan
    await page.getByRole("link", { name: /Nâng cấp STAVE\+/i }).click();
    await expect(page).toHaveURL(/\/plans/);
    await expect(page.getByText("STAVE+").first()).toBeVisible();
    await shot(page, "17-ask-plans-page.png");

    // Upgrade owner & stranger to STAVE+ via fake payment
    const plans = (await owner.api.call("GET", "/subscription-plans")) as Array<{
      id: string;
      name: string;
      isDefault: boolean;
    }>;
    const paidPlan = plans.find((p) => !p.isDefault && p.name === "STAVE+") ?? plans.find((p) => !p.isDefault)!;
    for (const u of [owner, stranger]) {
      const checkout = (await u.api.call("POST", "/subscriptions/checkout", {
        planId: paidPlan.id,
      })) as { orderCode: number };
      await u.api.call("POST", `/dev/fake-payment/${checkout.orderCode}/success`);
    }

    // 18. STAVE+ live Gemini Function Calling: branch comparison
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByTestId("ask-stave-gate")).toHaveCount(0);
    const qInput = page.getByPlaceholder(/So sánh main/i);
    await qInput.fill("Nhánh chorus khác gì nhánh main?");
    await page.getByTestId("ask-stave-submit").click();
    const askCallout = page.getByTestId("ask-stave-callout");
    await expect(askCallout).toBeVisible();
    await expect(askCallout.getByRole("status")).toHaveCount(0, { timeout: 35_000 });
    const branchAnswer = await askCallout.innerText();
    expect(branchAnswer).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    await expect(page.getByTestId("ask-stave-tools")).toBeVisible();
    await askCard.scrollIntoViewIfNeeded();
    await shot(page, "18-ask-stave-plus-branch-diff.png");

    // 19. STAVE+ live Gemini Function Calling: theory & chords bars 1-4
    await qInput.fill("Giọng và các hợp âm từ ô nhịp 1 đến 4 là gì?");
    await page.getByTestId("ask-stave-submit").click();
    await expect(askCallout.getByRole("status")).toHaveCount(0, { timeout: 35_000 });
    await expect(page.getByTestId("ask-stave-tools").getByText("Nhạc lý & hợp âm")).toBeVisible();
    await askCard.scrollIntoViewIfNeeded();
    await shot(page, "19-ask-stave-plus-theory-bars.png");

    // 20. STAVE+ live Gemini Function Calling: most commented bar (collaborator/owner allowed)
    await page.getByRole("button", { name: "Ô nhịp nhiều bình luận nhất" }).click();
    await expect(askCallout.getByRole("status")).toHaveCount(0, { timeout: 35_000 });
    await expect(askCallout).toContainText("2");
    await expect(page.getByTestId("ask-stave-tools").getByText("Bình luận")).toBeVisible();
    await askCard.scrollIntoViewIfNeeded();
    await shot(page, "20-ask-stave-plus-comments.png");

    // 21. Stranger STAVE+ user CANNOT see private collaborator comments via Ask STAVE
    const strangerCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const strangerPage = await strangerCtx.newPage();
    await loginThroughUi(strangerPage, stranger.user);
    await strangerPage.goto(`/projects/${project.id}`);
    const sCard = strangerPage.getByTestId("ask-stave-card");
    await sCard.scrollIntoViewIfNeeded();
    await sCard.getByPlaceholder(/So sánh main/i).fill("Ô nhịp nào nhiều bình luận nhất và nội dung là gì?");
    await sCard.getByTestId("ask-stave-submit").click();
    const sCallout = sCard.getByTestId("ask-stave-callout");
    await expect(sCallout.getByRole("status")).toHaveCount(0, { timeout: 35_000 });
    const strangerAnswer = await sCallout.innerText();
    expect(strangerAnswer).not.toContain("SECRET_COLLAB_PHRASE_XYZ");
    await shot(strangerPage, "21-ask-public-stranger-comment-privacy.png");
    await strangerCtx.close();

    // 22. Short question validation + rate-limit fallback UI
    await qInput.fill("?");
    await page.getByTestId("ask-stave-submit").click();
    await expect(askCard.getByText("Hãy nhập câu hỏi dài ít nhất 2 ký tự.")).toBeVisible();

    await page.route("**/ai/ask-project", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ answer: null, toolsUsed: [], rateLimited: true }),
      });
    });
    await qInput.fill("Tóm tắt các commit gần nhất");
    await page.getByTestId("ask-stave-submit").click();
    await expect(askCallout.getByText(/chạm giới hạn hỏi đáp/i)).toBeVisible();
    await shot(page, "22-ask-validation-and-fallback.png");
    await page.unroute("**/ai/ask-project");
  });

  test("Feature 4 (TRG-01): Admin Moderation Triage — RBAC 403, high/low priority live AI, PII/UUID scrub & rule fallback", async ({
    page,
  }) => {
    const boss = trackPerson(await person("TriageAdmin", "admin"));
    const owner = trackPerson(await person("TriageOwner"));
    const rep1 = trackPerson(await person("TriageRep1"));
    const rep2 = trackPerson(await person("TriageRep2"));
    const rep3 = trackPerson(await person("TriageRep3"));

    // Create High Priority reported project
    const highProj = await owner.api.createProject("AI2 High Risk Report Song");
    trackProject(highProj.id);
    await owner.api.call("PATCH", `/projects/${highProj.id}`, {
      description: "Contains unauthorized re-upload track",
      genre: "Pop",
      license: "CC-BY",
    });
    await owner.api.call(
      "PUT",
      `/projects/${highProj.id}/draft`,
      buildSnapshot(
        120,
        [{ id: "tr-r1", name: "Piano", instrument: "Acoustic Grand Piano" }],
        minorLoopNotes("tr-r1", 2),
      ),
    );
    await owner.api.commit(highProj.branchId, "Commit reported song");
    await owner.api.setVisibility(highProj.id, "public");

    // Verify non-admin gets 403 on POST /ai/moderation-triage
    const nonAdminStatus = await httpStatus(
      rep1.api.call("POST", "/ai/moderation-triage", {
        projectId: highProj.id,
        status: "open",
        lang: "vi",
      }),
    );
    expect(nonAdminStatus).toBe(403);

    await rep1.api.call("POST", `/projects/${highProj.id}/reports`, {
      reason: "copyright",
      details: "Copied melody bars 1-8 without permission.",
      copyrightClaim: {
        claimantName: "Nguyen Van A",
        claimantRole: "owner",
        workDescription: "Original Acoustic Piano Ballad registered 2025",
        evidence: "Published ISRC VN-2025-00123 and original stem files",
        goodFaith: true,
        accuracy: true,
      },
    });
    await rep2.api.call("POST", `/projects/${highProj.id}/reports`, {
      reason: "harassment",
      details:
        "Contains harassing comment targeting leak@example.com with ref 11111111-2222-4333-8444-555555555555",
    });

    // Create Low Priority spam project
    const lowProj = await owner.api.createProject("AI2 Low Spam Link Song");
    trackProject(lowProj.id);
    await owner.api.call("PATCH", `/projects/${lowProj.id}`, {
      description: "Test description",
      genre: "Lo-Fi",
      license: "CC-BY",
    });
    await owner.api.putDraft(lowProj.id, [{ id: "low-n1" }]);
    await owner.api.commit(lowProj.branchId, "Low spam commit");
    await owner.api.setVisibility(lowProj.id, "public");
    await rep3.api.call("POST", `/projects/${lowProj.id}/reports`, {
      reason: "spam",
      details: "Repeated promotional link in project bio.",
    });

    // 23. Admin opens /admin/reports
    await loginThroughUi(page, boss.user);
    await page.goto("/admin/reports");
    await expect(page.getByText("AI2 High Risk Report Song").first()).toBeVisible();
    await expect(page.getByText("AI2 Low Spam Link Song").first()).toBeVisible();
    const highBtn = page.getByTestId(`triage-ai-btn-${highProj.id}`);
    const lowBtn = page.getByTestId(`triage-ai-btn-${lowProj.id}`);
    await expect(highBtn).toBeVisible();
    await expect(lowBtn).toBeVisible();
    await shot(page, "23-triage-admin-reports-list.png");

    // 24. High priority live AI triage + verify PII/UUID scrubbing
    await highBtn.click();
    const highPanel = page.locator('[data-testid="moderation-triage-panel"]').first();
    await expect(highPanel).toHaveAttribute("data-priority", "high", { timeout: 35_000 });
    await expect(highPanel.getByText("Ưu tiên cao", { exact: true })).toBeVisible();
    await expect(highPanel.getByText("Khiếu nại bản quyền", { exact: true })).toBeVisible();
    await expect(highPanel.getByText("Ngôn từ quấy rối", { exact: true })).toBeVisible();
    await expect(highPanel.getByText(/2 báo cáo · 2 người báo cáo/)).toBeVisible();
    await expect(
      highPanel.getByText(/AI chỉ hỗ trợ phân loại; Quản trị viên đưa ra quyết định cuối cùng/),
    ).toBeVisible();
    const highText = await highPanel.innerText();
    expect(highText).not.toContain("leak@example.com");
    expect(highText).not.toContain("11111111-2222-4333-8444-555555555555");
    await highPanel.scrollIntoViewIfNeeded();
    await shot(page, "24-triage-high-priority-live-ai.png");

    // 25. Low priority live AI triage on spam report
    await lowBtn.click();
    const lowPanel = page.locator('[data-testid="moderation-triage-panel"][data-priority="low"]');
    await expect(lowPanel).toBeVisible({ timeout: 35_000 });
    await expect(lowPanel.getByText("Ưu tiên thấp", { exact: true })).toBeVisible();
    await expect(lowPanel.getByText("Spam / lừa đảo", { exact: true })).toBeVisible();
    await lowPanel.scrollIntoViewIfNeeded();
    await shot(page, "25-triage-low-priority-spam.png");

    // 26. Rule-only fallback when AI fails/returns rule baseline
    await page.route("**/ai/moderation-triage", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          priority: "high",
          categories: ["copyright_claim", "abusive_language"],
          summary: null,
          recommendedCheck: null,
          explanationSource: "rule",
          metrics: {
            reportCount: 2,
            reporterCount: 2,
            hasCopyrightClaim: true,
            reasonCounts: {
              copyright: 1,
              harassment: 1,
              inappropriate: 0,
              spam: 0,
              other: 0,
            },
          },
        }),
      });
    });
    await highPanel.getByRole("button", { name: "Tạo lại" }).click();
    await expect(highPanel.getByTestId("triage-rule-fallback")).toBeVisible();
    await expect(highPanel.getByText("Quy tắc cơ bản")).toBeVisible();
    await highPanel.scrollIntoViewIfNeeded();
    await shot(page, "26-triage-rule-fallback.png");
    await page.unroute("**/ai/moderation-triage");
  });
});
