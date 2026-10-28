import * as Tone from "tone";
import type { DraftSnapshot } from "@stave/shared-types";
import { createVoiceCache, disposeVoiceCache, prepareVoices, triggerNotes } from "./tone-synth-engine";

const LOOKAHEAD_SEC = 0.15;
const SCHEDULE_INTERVAL_MS = 50;
const TAIL_SEC = 0.6;

/**
 * Phát một snapshot từ đầu tới hết, ngoài MIDI Editor (màn so sánh phiên bản).
 * Dùng chung các hàm dựng giọng/lên lịch nốt của `tone-synth-engine` nên tiếng
 * giống bản phát trong editor; mỗi lần phát dựng một `Tone.Context` mới trong
 * lúc xử lý cú bấm (xem gotcha "context mặc định của Tone có thể câm" ở
 * CLAUDE.md mục 10 và PROJECT_STATE §23) rồi đóng khi dừng.
 */
export class SnapshotPlayer {
  private session = 0;
  private cache = createVoiceCache();
  private context: Tone.Context | null = null;
  private gain: Tone.Gain | null = null;
  private limiter: Tone.Limiter | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  async play(
    snapshot: DraftSnapshot,
    customBuffers: Map<string, AudioBuffer>,
    onEnd: () => void,
  ): Promise<boolean> {
    this.stop();
    const mine = this.session;
    if (snapshot.notes.length === 0) return false;

    const context = new Tone.Context();
    this.context = context;
    Tone.setContext(context);
    await Tone.start();
    if (this.session !== mine) return true;

    const limiter = new Tone.Limiter(-1).toDestination();
    const gain = new Tone.Gain(1).connect(limiter);
    this.limiter = limiter;
    this.gain = gain;

    const voices = await prepareVoices(snapshot.notes, snapshot.tracks, 0, null, gain, this.cache);
    if (this.session !== mine) return true;

    const { tempo, ppq } = snapshot.meta;
    const secPerTick = 60 / (tempo * ppq);
    const endTick = Math.max(...snapshot.notes.map((n) => n.start + n.duration));
    const startTime = Tone.now() + 0.1;
    let scheduledUpTo = 0;

    const tick = () => {
      if (this.session !== mine) return;
      const now = Tone.now();
      const target = Math.min(endTick, Math.ceil((now + LOOKAHEAD_SEC - startTime) / secPerTick));
      if (target > scheduledUpTo) {
        triggerNotes({
          notes: snapshot.notes,
          tracks: snapshot.tracks,
          ppq,
          bpm: tempo,
          startTime,
          fromTick: scheduledUpTo,
          toTick: target,
          anchorTick: 0,
          voiceByTrack: voices,
          customBuffers,
        });
        scheduledUpTo = target;
      }
      if (now >= startTime + endTick * secPerTick + TAIL_SEC) {
        this.stop();
        onEnd();
        return;
      }
      this.timer = setTimeout(tick, SCHEDULE_INTERVAL_MS);
    };
    tick();
    return true;
  }

  stop(): void {
    this.session += 1;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    disposeVoiceCache(this.cache);
    this.gain?.dispose();
    this.limiter?.dispose();
    this.gain = null;
    this.limiter = null;
    if (this.context) {
      void this.context.dispose();
      this.context = null;
    }
  }
}
