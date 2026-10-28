const FRAME = 1152;
const YIELD_EVERY_FRAMES = 200;

function toInt16(samples: Float32Array, from: number, to: number): Int16Array {
  const out = new Int16Array(to - from);
  for (let i = from; i < to; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i - from] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/**
 * Mã hoá AudioBuffer thành MP3 (CBR) bằng `@breezystack/lamejs`, tải bằng
 * `import()` động nên thư viện chỉ vào trình duyệt khi người dùng thật sự xuất
 * MP3. Nhường luồng chính định kỳ để hộp xuất không đứng hình với bản dài.
 */
export async function encodeMp3(
  buffer: AudioBuffer,
  kbps = 192,
  onProgress?: (p: number) => void,
): Promise<Blob> {
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const channels = Math.min(2, buffer.numberOfChannels);
  const encoder = new Mp3Encoder(channels, buffer.sampleRate, kbps);
  const left = buffer.getChannelData(0);
  const right = channels === 2 ? buffer.getChannelData(1) : null;

  const chunks: Uint8Array[] = [];
  let frames = 0;
  for (let pos = 0; pos < left.length; pos += FRAME) {
    const end = Math.min(left.length, pos + FRAME);
    const l = toInt16(left, pos, end);
    const data = right ? encoder.encodeBuffer(l, toInt16(right, pos, end)) : encoder.encodeBuffer(l);
    if (data.length > 0) chunks.push(data);
    frames += 1;
    if (frames % YIELD_EVERY_FRAMES === 0) {
      onProgress?.(pos / left.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(tail);
  onProgress?.(1);
  return new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
}
