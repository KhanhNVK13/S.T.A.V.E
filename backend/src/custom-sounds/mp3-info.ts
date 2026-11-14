import type { WavInfo } from './wav-info';

const MPEG1_L3_BITRATES = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
];
const MPEG2_L3_BITRATES = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160,
];
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};
const MAX_SYNC_SCAN_BYTES = 65536;

interface FrameHeader {
  bitrate: number;
  sampleRate: number;
  samplesPerFrame: number;
  channels: number;
  crcProtected: boolean;
  frameLength: number;
  mpeg1: boolean;
}

function parseFrameHeader(buf: Buffer, at: number): FrameHeader | null {
  if (at + 4 > buf.length) return null;
  if (buf[at] !== 0xff || (buf[at + 1] & 0xe0) !== 0xe0) return null;

  const version = (buf[at + 1] >> 3) & 3;
  const layer = (buf[at + 1] >> 1) & 3;
  const bitrateIndex = (buf[at + 2] >> 4) & 15;
  const sampleRateIndex = (buf[at + 2] >> 2) & 3;
  if (version === 1 || layer !== 1) return null;
  if (bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
    return null;
  }

  const mpeg1 = version === 3;
  const bitrate =
    (mpeg1 ? MPEG1_L3_BITRATES : MPEG2_L3_BITRATES)[bitrateIndex] * 1000;
  const sampleRate = SAMPLE_RATES[version][sampleRateIndex];
  const samplesPerFrame = mpeg1 ? 1152 : 576;
  const padding = (buf[at + 2] >> 1) & 1;
  const frameLength =
    Math.floor(((samplesPerFrame / 8) * bitrate) / sampleRate) + padding;

  return {
    bitrate,
    sampleRate,
    samplesPerFrame,
    channels: ((buf[at + 3] >> 6) & 3) === 3 ? 1 : 2,
    crcProtected: (buf[at + 1] & 1) === 0,
    frameLength,
    mpeg1,
  };
}

function skipId3v2(buf: Buffer): number {
  if (buf.length < 10 || buf.toString('ascii', 0, 3) !== 'ID3') return 0;
  const size =
    ((buf[6] & 0x7f) << 21) |
    ((buf[7] & 0x7f) << 14) |
    ((buf[8] & 0x7f) << 7) |
    (buf[9] & 0x7f);
  const footer = (buf[5] & 0x10) !== 0 ? 10 : 0;
  return 10 + size + footer;
}

export function readMp3Info(buf: Buffer): WavInfo | null {
  const start = skipId3v2(buf);
  const scanEnd = Math.min(buf.length - 4, start + MAX_SYNC_SCAN_BYTES);

  for (let at = start; at <= scanEnd; at++) {
    const header = parseFrameHeader(buf, at);
    if (!header) continue;

    const next = at + header.frameLength;
    if (next + 4 <= buf.length && !parseFrameHeader(buf, next)) continue;

    const { sampleRate, channels } = header;
    const sideInfo = header.mpeg1
      ? channels === 1
        ? 17
        : 32
      : channels === 1
        ? 9
        : 17;
    const xing = at + 4 + (header.crcProtected ? 2 : 0) + sideInfo;
    const marker =
      xing + 12 <= buf.length ? buf.toString('ascii', xing, xing + 4) : '';
    if (
      (marker === 'Xing' || marker === 'Info') &&
      (buf.readUInt32BE(xing + 4) & 1) !== 0
    ) {
      const frames = buf.readUInt32BE(xing + 8);
      const durationSec = (frames * header.samplesPerFrame) / sampleRate;
      return durationSec > 0 ? { durationSec, channels, sampleRate } : null;
    }

    const hasId3v1 =
      buf.length - at >= 128 &&
      buf.toString('ascii', buf.length - 128, buf.length - 125) === 'TAG';
    const audioBytes = buf.length - at - (hasId3v1 ? 128 : 0);
    return {
      durationSec: (audioBytes * 8) / header.bitrate,
      channels,
      sampleRate,
    };
  }

  return null;
}
