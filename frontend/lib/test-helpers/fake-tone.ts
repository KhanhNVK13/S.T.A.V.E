/**
 * Fake "tone" module for unit tests (jsdom has no Web Audio API).
 * Usage: vi.mock("tone", () => import("./test-helpers/fake-tone"));
 * Every node created is recorded in `__state.created` so tests can inspect
 * wiring (connect), scheduled automation (param calls) and disposal.
 */
import { vi } from "vitest";

type AnyNode = FakeNode;

export const __state = {
  created: [] as AnyNode[],
  offlineCalls: [] as { duration: number; channels: number; sampleRate: number }[],
  /** AudioBuffer-like object returned by Offline().get() */
  renderedBuffer: null as unknown,
  sampleRate: 44100,
  decodeAudioData: vi.fn(async (_: ArrayBuffer) => ({ duration: 1, length: 44100 }) as unknown as AudioBuffer),
  reset() {
    this.created = [];
    this.offlineCalls = [];
    this.renderedBuffer = null;
    this.sampleRate = 44100;
    this.decodeAudioData = vi.fn(async () => ({ duration: 1, length: 44100 }) as unknown as AudioBuffer);
  },
  of<T extends AnyNode>(kind: string): T[] {
    return this.created.filter((n) => n.kind === kind) as T[];
  },
};

export class FakeParam {
  calls: [string, ...number[]][] = [];
  constructor(public value: number = 0) {}
  private rec(name: string, ...args: number[]) {
    this.calls.push([name, ...args]);
    return this;
  }
  setValueAtTime(v: number, t: number) { return this.rec("setValueAtTime", v, t); }
  linearRampToValueAtTime(v: number, t: number) { return this.rec("linearRampToValueAtTime", v, t); }
  exponentialRampToValueAtTime(v: number, t: number) { return this.rec("exponentialRampToValueAtTime", v, t); }
  setTargetAtTime(v: number, t: number, c: number) { return this.rec("setTargetAtTime", v, t, c); }
  cancelAndHoldAtTime(t: number) { return this.rec("cancelAndHoldAtTime", t); }
}

export class FakeNode {
  kind = "Node";
  connections: unknown[] = [];
  disposed = false;
  args: unknown[];
  constructor(...args: unknown[]) {
    this.args = args;
    __state.created.push(this);
  }
  connect(node: unknown) {
    this.connections.push(node);
    return this; // Tone.js returns `this` from connect()
  }
  toDestination() {
    this.connections.push("destination");
    return this;
  }
  dispose() {
    this.disposed = true;
    return this;
  }
}

export class Filter extends FakeNode {
  kind = "Filter";
  frequency = new FakeParam(typeof this.args[0] === "number" ? (this.args[0] as number) : 0);
}
export class Panner extends FakeNode {
  kind = "Panner";
  pan = new FakeParam((this.args[0] as number) ?? 0);
}
export class Gain extends FakeNode {
  kind = "Gain";
  gain = new FakeParam((this.args[0] as number) ?? 1);
}
export class Limiter extends FakeNode {
  kind = "Limiter";
}
export class Synth extends FakeNode {
  kind = "Synth";
}
export class PolySynth extends FakeNode {
  kind = "PolySynth";
  triggerAttackRelease = vi.fn();
}
export class Sampler extends FakeNode {
  kind = "Sampler";
  added: [string, unknown][] = [];
  triggerAttackRelease = vi.fn();
  add(note: string, buffer: unknown) {
    this.added.push([note, buffer]);
    return this;
  }
}
export class ToneBufferSource extends FakeNode {
  kind = "ToneBufferSource";
  onended: (() => void) | null = null;
  start = vi.fn();
}
export class NoiseSynth extends FakeNode {
  kind = "NoiseSynth";
}
export class Context extends FakeNode {
  kind = "Context";
}

export function getContext() {
  return {
    sampleRate: __state.sampleRate,
    rawContext: { decodeAudioData: (b: ArrayBuffer) => __state.decodeAudioData(b) },
    dispose() {},
  };
}
export function setContext() {}
export async function start() {}
export function now() {
  return 0;
}

export async function Offline(
  cb: () => unknown,
  duration: number,
  channels = 2,
  sampleRate = 44100,
) {
  __state.offlineCalls.push({ duration, channels, sampleRate });
  await cb();
  const buffer = __state.renderedBuffer;
  return { get: () => buffer };
}

export namespace Unit {
  export type Note = string;
}
