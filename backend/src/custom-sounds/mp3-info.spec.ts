import { readMp3Info } from './mp3-info';

function cbrFrames(count: number, withXing = false): Buffer {
  const frameLength = 417;
  const buf = Buffer.alloc(count * frameLength);
  for (let i = 0; i < count; i++) {
    const at = i * frameLength;
    buf[at] = 0xff;
    buf[at + 1] = 0xfb;
    buf[at + 2] = 0x90;
    buf[at + 3] = 0x00;
  }
  if (withXing) {
    buf.write('Xing', 4 + 32, 'ascii');
    buf.writeUInt32BE(1, 4 + 32 + 4);
    buf.writeUInt32BE(100, 4 + 32 + 8);
  }
  return buf;
}

describe('readMp3Info', () => {
  it('estimates the duration of a constant bitrate file', () => {
    const info = readMp3Info(cbrFrames(77));
    expect(info?.sampleRate).toBe(44100);
    expect(info?.channels).toBe(2);
    expect(info?.durationSec).toBeCloseTo(2.0068, 3);
  });

  it('reads the frame count of a Xing header', () => {
    const info = readMp3Info(cbrFrames(77, true));
    expect(info?.durationSec).toBeCloseTo((100 * 1152) / 44100, 5);
  });

  it('rejects bytes that are not MP3', () => {
    expect(readMp3Info(Buffer.from('not audio at all'))).toBeNull();
    expect(readMp3Info(Buffer.alloc(100))).toBeNull();
  });
});
