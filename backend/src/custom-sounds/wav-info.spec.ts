import { readWavInfo } from './wav-info';

function makeWav(seconds: number, sampleRate = 44100, channels = 1): Buffer {
  const dataBytes = Math.round(seconds * sampleRate) * channels * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * 2, 28);
  buf.writeUInt16LE(channels * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  return buf;
}

describe('readWavInfo', () => {
  it('reads duration, channels and sample rate', () => {
    const info = readWavInfo(makeWav(2.5, 48000, 2));
    expect(info).not.toBeNull();
    expect(info!.durationSec).toBeCloseTo(2.5, 3);
    expect(info!.channels).toBe(2);
    expect(info!.sampleRate).toBe(48000);
  });

  it('uses the bytes actually present when the data chunk claims more', () => {
    const wav = makeWav(1);
    wav.writeUInt32LE(0x7fffffff, 40);
    expect(readWavInfo(wav)!.durationSec).toBeCloseTo(1, 3);
  });

  it('rejects files that are not WAV', () => {
    expect(
      readWavInfo(
        Buffer.from('ID3\u0003\u0000 not a wav file at all, padding padding'),
      ),
    ).toBeNull();
    expect(readWavInfo(Buffer.alloc(10))).toBeNull();
  });
});
