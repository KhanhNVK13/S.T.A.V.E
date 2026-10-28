import { describe, expect, it } from "vitest";
import { encodeMp3 } from "./mp3-encoder";

function fakeBuffer(channels: number, sampleRate: number, seconds: number): AudioBuffer {
  const length = Math.floor(sampleRate * seconds);
  const data = Array.from({ length: channels }, () => {
    const samples = new Float32Array(length);
    for (let i = 0; i < length; i++) samples[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    return samples;
  });
  return {
    numberOfChannels: channels,
    sampleRate,
    length,
    duration: seconds,
    getChannelData: (c: number) => data[c],
  } as unknown as AudioBuffer;
}

async function firstBytes(blob: Blob): Promise<number[]> {
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  return Array.from(new Uint8Array(buffer).slice(0, 2));
}

describe("encodeMp3", () => {
  it("encodes a stereo buffer into a valid MP3 stream smaller than the PCM", async () => {
    const buffer = fakeBuffer(2, 44100, 1);
    const blob = await encodeMp3(buffer, 128);
    expect(blob.type).toBe("audio/mpeg");
    expect(blob.size).toBeGreaterThan(1000);
    expect(blob.size).toBeLessThan(44100 * 2 * 2);
    const [b0, b1] = await firstBytes(blob);
    expect(b0).toBe(0xff);
    expect(b1 & 0xe0).toBe(0xe0);
  });

  it("encodes a mono buffer and reports progress up to 1", async () => {
    const seen: number[] = [];
    const blob = await encodeMp3(fakeBuffer(1, 22050, 1), 96, (p) => seen.push(p));
    expect(blob.size).toBeGreaterThan(500);
    expect(seen[seen.length - 1]).toBe(1);
  });
});
