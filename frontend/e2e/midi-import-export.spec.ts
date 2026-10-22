import { readFile } from "node:fs/promises";
import { Midi } from "@tonejs/midi";
import {
  expect as baseExpect,
  test,
  type Download,
  type Page,
} from "@playwright/test";
import { snapshotOf, UserApi } from "./support/api";
import {
  cleanupE2eUsers,
  createE2eProfile,
  createE2eUser,
  loginThroughUi,
} from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });
const quick = { timeout: 5_000 };

interface MidiSpec {
  tracks: number;
  notesPerTrack: number;
  ppq: number;
  withEvents?: boolean;
  trailingBytes?: number;
}

function buildMidi(spec: MidiSpec): Buffer {
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
      track.addNote({
        midi: 60 + t,
        ticks: i * spec.ppq,
        durationTicks: spec.ppq / 2,
        velocity: 0.8,
      });
    }
    if (spec.withEvents) {
      track.addCC({ number: 7, ticks: 0, value: 0.5 });
      track.addPitchBend({ ticks: spec.ppq, value: 0.25 });
    }
  }
  const bytes = Buffer.from(midi.toArray());
  return spec.trailingBytes
    ? Buffer.concat([bytes, Buffer.alloc(spec.trailingBytes)])
    : bytes;
}

async function seedProject(
  page: Page,
  options: { notes?: boolean; twoTracks?: boolean } = {},
) {
  const user = await createE2eUser();
  await createE2eProfile(user);
  const api = await UserApi.for(user);
  const project = await api.createProject(
    options.notes === false ? "Empty Song" : "Test Song",
  );
  const tracks = options.twoTracks
    ? [
        { id: "track-1", name: "Lead", instrument: "Acoustic Grand Piano" },
        { id: "track-2", name: "Bass", instrument: "Violin" },
      ]
    : undefined;
  const snapshot = snapshotOf(
    options.notes === false
      ? []
      : [
          { id: "n1", pitch: 60, start: 0, trackId: "track-1" },
          {
            id: "n2",
            pitch: 48,
            start: 480,
            trackId: options.twoTracks ? "track-2" : "track-1",
          },
        ],
    tracks,
  );
  await api.call("PUT", `/projects/${project.id}/draft`, snapshot);
  if (options.notes !== false) await api.commit(project.branchId, "Verse idea");
  await loginThroughUi(page, user);
  return { user, api, ...project, snapshot };
}

async function openEditor(page: Page, projectId: string): Promise<void> {
  await page.goto(`/projects/${projectId}/edit`);
  await page.getByRole("button", { name: /^File$/ }).waitFor();
  await page.waitForLoadState("networkidle");
}

async function importFile(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles(file);
}

async function chooseExportMidi(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^File$/ }).click();
  await page.getByRole("menuitem", { name: /export midi/i }).click();
}

async function downloaded(download: Download): Promise<Midi> {
  const path = await download.path();
  return new Midi(await readFile(path));
}

async function draftNotes(api: UserApi, projectId: string) {
  return (await api.draft(projectId)).notes;
}

test.describe("MIDI import and export", () => {
  test.setTimeout(120_000);
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test("EDT-003 rejects a file that is not .mid or .midi before parsing", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID076: the import has no file type or size check; a file of another type is handed to the parser and no message is shown",
    );
    const { api, id } = await seedProject(page);
    await openEditor(page, id);
    const before = (await draftNotes(api, id)).length;
    await importFile(page, {
      name: "song.mp3",
      mimeType: "audio/mpeg",
      buffer: Buffer.concat([Buffer.from("ID3"), Buffer.alloc(1_000_000, 7)]),
    });
    await expect(
      page.getByText(/không hỗ trợ|không được hỗ trợ|định dạng|\.mid/i).first(),
    ).toBeVisible(quick);
    expect((await draftNotes(api, id)).length).toBe(before);
  });

  test("EDT-004 rejects a MIDI file larger than 5 MB before parsing", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID076: the import has no file type or size check; a 6 MB file is parsed and imported and no message states the 5 MB limit",
    );
    const { api, id } = await seedProject(page);
    await openEditor(page, id);
    await importFile(page, {
      name: "sample_6MB.mid",
      mimeType: "audio/midi",
      buffer: buildMidi({
        tracks: 1,
        notesPerTrack: 4,
        ppq: 480,
        trailingBytes: 6 * 1024 * 1024,
      }),
    });
    await expect(page.getByText(/5 ?MB/i).first()).toBeVisible(quick);
    await page.waitForTimeout(3_000);
    expect((await draftNotes(api, id)).length).toBe(2);
  });

  test("EDT-005 reports a corrupt .mid file as unreadable and imports nothing", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID077: a corrupt file makes the import fail silently with an unhandled error; the editor shows no message",
    );
    const { api, id } = await seedProject(page);
    await openEditor(page, id);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await importFile(page, {
      name: "corrupt.mid",
      mimeType: "audio/midi",
      buffer: Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 37) % 251)),
    });
    await page.waitForTimeout(1_500);
    expect((await draftNotes(api, id)).length).toBe(2);
    await expect(
      page.getByText(/không đọc được|không thể đọc|không hợp lệ|hỏng/i).first(),
    ).toBeVisible(quick);
    expect(errors).toHaveLength(0);
  });

  test("API: importing a file recorded at 960 PPQ keeps the note positions", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID075: the importer converts time with the file's PPQ but stores the notes under the project's PPQ, so a 960 PPQ file lands at twice the source position",
    );
    const { api, id } = await seedProject(page);
    await openEditor(page, id);
    await importFile(page, {
      name: "import_3tracks.mid",
      mimeType: "audio/midi",
      buffer: buildMidi({
        tracks: 3,
        notesPerTrack: 40,
        ppq: 960,
        withEvents: true,
      }),
    });
    await expect
      .poll(async () => (await draftNotes(api, id)).length, { timeout: 20_000 })
      .toBe(122);
    const notes = await draftNotes(api, id);
    const imported = notes.filter((n) => n.pitch >= 60 && n.id !== "n1");
    const ids = new Set(notes.map((n) => n.id));
    expect(ids.size).toBe(notes.length);
    const starts = imported
      .filter((n) => n.pitch === 60)
      .map((n) => n.start)
      .sort((a, b) => a - b);
    expect(starts.slice(0, 4)).toEqual([0, 480, 960, 1440]);
  });

  test("EDT-091 exports a MIDI file with tracks, notes, tempo, instruments and uncommitted changes", async ({
    page,
  }) => {
    const { api, id, branchId, snapshot } = await seedProject(page, {
      twoTracks: true,
    });
    const historyBefore = (await api.history(branchId)).length;
    await api.call("PUT", `/projects/${id}/draft`, {
      ...snapshot,
      notes: [
        ...snapshot.notes,
        {
          id: "n-uncommitted",
          pitch: 72,
          start: 3840,
          duration: 480,
          velocity: 90,
          trackId: "track-1",
        },
      ],
    });
    await openEditor(page, id);
    const alerts: string[] = [];
    page.on("dialog", (dialog) => {
      alerts.push(dialog.message());
      void dialog.dismiss();
    });
    const pending = page.waitForEvent("download");
    await chooseExportMidi(page);
    const file = await downloaded(await pending);

    expect(alerts).toHaveLength(0);
    expect(file.tracks).toHaveLength(2);
    expect(file.tracks[0].notes.map((n) => n.midi).sort()).toEqual([60, 72]);
    expect(file.tracks[1].notes.map((n) => n.midi)).toEqual([48]);
    const added = file.tracks[0].notes.find((n) => n.midi === 72);
    expect(added?.ticks).toBe(3840);
    expect(file.header.ppq).toBe(480);
    expect(Math.round(file.header.tempos[0].bpm)).toBe(120);
    expect(file.tracks[0].instrument.number).toBe(0);
    expect(file.tracks[1].instrument.number).toBe(40);
    expect((await api.history(branchId)).length).toBe(historyBefore);
    const draft = await draftNotes(api, id);
    expect(draft).toHaveLength(3);
  });

  test("EDT-093 reports a failure while writing the file and downloads nothing", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID078: when writing the file throws, the export fails silently and the editor shows no message",
    );
    const { id } = await seedProject(page, { twoTracks: true });
    await page.addInitScript(() => {
      URL.createObjectURL = () => {
        throw new Error("simulated write failure");
      };
    });
    await openEditor(page, id);
    let downloads = 0;
    page.on("download", () => {
      downloads += 1;
    });
    await chooseExportMidi(page);
    await page.waitForTimeout(1_500);
    expect(downloads).toBe(0);
    await expect(
      page.getByText(/xuất.*(lỗi|thất bại|không được)|không xuất được/i).first(),
    ).toBeVisible(quick);
  });

  test("EDT-094 asks for confirmation before exporting a project without notes", async ({
    page,
  }) => {
    test.fail(
      true,
      "DFID079: exporting a project without notes downloads an empty file at once and never warns",
    );
    const { id } = await seedProject(page, { notes: false });
    await openEditor(page, id);
    const pending = page
      .waitForEvent("download", { timeout: 8_000 })
      .catch(() => null);
    await chooseExportMidi(page);
    await expect(
      page.getByText(/trống|không có note|không có nốt|rỗng/i).first(),
    ).toBeVisible(quick);
    const download = await pending;
    expect(download).toBeNull();
  });
});
