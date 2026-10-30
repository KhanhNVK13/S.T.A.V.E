import { readWavInfo } from './wav-info';

function makeWav(seconds: number, sampleRate = 44100, channels = 1): Buffer {
  const dataBytes = Math.round(seconds * sampleRate) * channels * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM format
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * 2, 28); // byteRate
  buf.writeUInt16LE(channels * 2, 32); // blockAlign
  buf.writeUInt16LE(16, 34); // bitsPerSample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  return buf;
}

describe('BE-SND-14 readWavInfo(buf)', () => {
  it('UTCID01 reads duration, channels and sample rate for a valid WAV', () => {
    const info = readWavInfo(makeWav(2.5, 48000, 2));
    expect(info).not.toBeNull();
    expect(info!.durationSec).toBeCloseTo(2.5, 3);
    expect(info!.channels).toBe(2);
    expect(info!.sampleRate).toBe(48000);
  });

  it('UTCID02 reads a 44-byte header-only WAV with 0 duration', () => {
    const info = readWavInfo(makeWav(0, 44100, 1));
    expect(info).not.toBeNull();
    expect(info!.durationSec).toBe(0);
    expect(info!.channels).toBe(1);
    expect(info!.sampleRate).toBe(44100);
  });

  it('UTCID03 returns null for buffers shorter than 44 bytes', () => {
    expect(readWavInfo(Buffer.alloc(43))).toBeNull();
  });

  it('UTCID04 returns null for ID3 MP3 files', () => {
    const buf = Buffer.alloc(50);
    buf.write('ID3', 0, 'ascii');
    expect(readWavInfo(buf)).toBeNull();
  });

  it('UTCID05 returns null for non-WAVE RIFF files (e.g. AVI)', () => {
    const wav = makeWav(1);
    wav.write('AVI ', 8, 'ascii');
    expect(readWavInfo(wav)).toBeNull();
  });

  it('UTCID06 handles chunks before fmt (e.g. LIST chunk)', () => {
    const listChunkSize = 8;
    const standard = makeWav(2.5, 48000, 2);
    // allocate extra space for LIST chunk (8 byte header + listChunkSize)
    const listTotal = 8 + listChunkSize;
    const buf = Buffer.alloc(standard.length + listTotal);
    // Copy RIFF header
    standard.copy(buf, 0, 0, 12);
    buf.writeUInt32LE(buf.length - 8, 4);
    // Insert LIST chunk at offset 12
    buf.write('LIST', 12, 'ascii');
    buf.writeUInt32LE(listChunkSize, 16);
    // Copy remaining fmt and data chunks from standard offset 12
    standard.copy(buf, 12 + listTotal, 12);

    const info = readWavInfo(buf);
    expect(info).not.toBeNull();
    expect(info!.durationSec).toBeCloseTo(2.5, 3);
    expect(info!.channels).toBe(2);
    expect(info!.sampleRate).toBe(48000);
  });

  it('UTCID07 handles odd-sized chunk with pad byte before data chunk', () => {
    // Insert an odd-sized 'junk' chunk of 5 bytes between fmt and data
    const sampleRate = 48000;
    const channels = 2;
    const seconds = 2.5;
    const dataBytes = Math.round(seconds * sampleRate) * channels * 2;
    const oddChunkSize = 5;
    const oddChunkPadded = oddChunkSize + 1; // 6 bytes

    const buf = Buffer.alloc(44 + oddChunkPadded + 8 + dataBytes);
    buf.write('RIFF', 0, 'ascii');
    buf.writeUInt32LE(buf.length - 8, 4);
    buf.write('WAVE', 8, 'ascii');
    // fmt chunk at 12
    buf.write('fmt ', 12, 'ascii');
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(channels, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * channels * 2, 28);
    buf.writeUInt16LE(channels * 2, 32);
    buf.writeUInt16LE(16, 34);
    // odd chunk at 36
    buf.write('junk', 36, 'ascii');
    buf.writeUInt32LE(oddChunkSize, 40);
    // data chunk at 36 + 8 + oddChunkPadded = 50
    const dataOffset = 36 + 8 + oddChunkPadded;
    buf.write('data', dataOffset, 'ascii');
    buf.writeUInt32LE(dataBytes, dataOffset + 4);

    const info = readWavInfo(buf);
    expect(info).not.toBeNull();
    expect(info!.durationSec).toBeCloseTo(2.5, 3);
    expect(info!.channels).toBe(2);
    expect(info!.sampleRate).toBe(48000);
  });

  it('UTCID08 returns null if data chunk appears before fmt chunk', () => {
    const buf = Buffer.alloc(64);
    buf.write('RIFF', 0, 'ascii');
    buf.writeUInt32LE(56, 4);
    buf.write('WAVE', 8, 'ascii');
    // data chunk first at 12
    buf.write('data', 12, 'ascii');
    buf.writeUInt32LE(10, 16);
    // fmt chunk after
    buf.write('fmt ', 30, 'ascii');
    buf.writeUInt32LE(16, 34);
    expect(readWavInfo(buf)).toBeNull();
  });

  it('UTCID09 returns null when fmt chunk is truncated (< 16 bytes left)', () => {
    const buf = Buffer.alloc(24);
    buf.write('RIFF', 0, 'ascii');
    buf.writeUInt32LE(16, 4);
    buf.write('WAVE', 8, 'ascii');
    buf.write('fmt ', 12, 'ascii');
    buf.writeUInt32LE(16, 16);
    // Only 4 bytes left in buffer for body
    expect(readWavInfo(buf)).toBeNull();
  });

  it('UTCID10 returns null if there is no data chunk in file', () => {
    const buf = Buffer.alloc(36);
    buf.write('RIFF', 0, 'ascii');
    buf.writeUInt32LE(28, 4);
    buf.write('WAVE', 8, 'ascii');
    buf.write('fmt ', 12, 'ascii');
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(44100, 24);
    buf.writeUInt32LE(44100 * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    expect(readWavInfo(buf)).toBeNull();
  });

  it('UTCID11 returns null when fmt specifies 0 channels', () => {
    const wav = makeWav(1, 44100, 1);
    wav.writeUInt16LE(0, 22); // set channels to 0
    wav.writeUInt32LE(0, 28); // set byteRate to 0
    expect(readWavInfo(wav)).toBeNull();
  });

  it('UTCID12 clamps duration to bytes actually present when data claims more', () => {
    const wav = makeWav(1);
    wav.writeUInt32LE(0x7fffffff, 40);
    const info = readWavInfo(wav);
    expect(info).not.toBeNull();
    expect(info!.durationSec).toBeCloseTo(1, 3);
  });
});
