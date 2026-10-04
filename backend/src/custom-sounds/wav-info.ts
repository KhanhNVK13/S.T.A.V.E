export interface WavInfo {
  durationSec: number;
  channels: number;
  sampleRate: number;
}

export function readWavInfo(buf: Buffer): WavInfo | null {
  if (buf.length < 44) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF') return null;
  if (buf.toString('ascii', 8, 12) !== 'WAVE') return null;

  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let byteRate = 0;

  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (id === 'fmt ') {
      if (body + 16 > buf.length) return null;
      channels = buf.readUInt16LE(body + 2);
      sampleRate = buf.readUInt32LE(body + 4);
      byteRate = buf.readUInt32LE(body + 8);
    } else if (id === 'data') {
      if (!byteRate || !channels || !sampleRate) return null;
      const dataBytes = Math.min(size, buf.length - body);
      return { durationSec: dataBytes / byteRate, channels, sampleRate };
    }

    offset = body + size + (size % 2);
  }

  return null;
}
