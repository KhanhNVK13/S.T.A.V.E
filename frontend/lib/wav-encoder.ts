/**
 * Giải mã bản ghi của MediaRecorder và encode lại thành WAV **ngay trong trình
 * duyệt**.
 *
 * BR-56: "The browser-captured recording is converted to WAV before storage".
 * Phải làm ở client vì file upload thẳng lên Supabase Storage bằng signed URL,
 * không đi qua backend (PROJECT_STATE §31) — server không bao giờ thấy file để
 * mà convert.
 *
 * MediaRecorder cho ra webm/opus (Chrome, Firefox) hoặc mp4/aac (Safari); cả
 * hai đều được `decodeAudioData` của chính trình duyệt đó giải mã, không cần
 * thư viện ngoài.
 */

/**
 * Giải mã blob ghi âm thành AudioBuffer.
 *
 * Tách riêng khỏi bước encode để chỉ phải giải mã **một lần**: cùng một buffer
 * vừa dùng vẽ dạng sóng cho màn cắt (UC-54) vừa dùng encode WAV lúc đính kèm
 * (UC-55).
 */
export async function decodeRecording(recorded: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await recorded.arrayBuffer();
  // AudioContext tạm chỉ để giải mã; đóng ngay vì trình duyệt giới hạn số
  // AudioContext đồng thời và mỗi cái giữ tài nguyên phần cứng.
  const context = new AudioContext();
  try {
    return await context.decodeAudioData(arrayBuffer);
  } finally {
    void context.close();
  }
}

/**
 * Tần số lấy mẫu dùng khi lưu. Xem `normalizeForStorage` để biết vì sao.
 */
export const STORAGE_SAMPLE_RATE = 44100;

/**
 * Hạ về **1 kênh, 44.1 kHz** trước khi encode WAV.
 *
 * Vì sao phải hạ (mâu thuẫn có thật trong BR-56 bản gốc): BR-56 cùng lúc cho
 * phép bản ghi dài **3 phút**, giới hạn dung lượng, và bắt lưu **WAV**. WAV là
 * PCM không nén nên stereo 48 kHz 16-bit tốn ~187 KB/s ⇒ 3 phút ≈ **34MB** —
 * vượt cả giới hạn 10MB ban đầu lẫn mức 20MB đã nâng.
 *
 * Vì sao chọn mono 44.1 kHz (chốt 16/09/2026): micro laptop/tai nghe gần như
 * luôn là nguồn **mono**, nên thu stereo chỉ nhân đôi dung lượng để lưu một
 * kênh trùng lặp, không thêm thông tin nào. Bỏ kênh thừa và giữ 44.1 kHz (mức
 * CD) cho ~86 KB/s ⇒ 3 phút ≈ **15,5MB**, vừa khít giới hạn 20MB mà chất lượng
 * vẫn ở mức cao nhất có ý nghĩa với một nguồn micro đơn.
 */
export async function normalizeForStorage(buffer: AudioBuffer): Promise<AudioBuffer> {
  if (buffer.numberOfChannels === 1 && buffer.sampleRate <= STORAGE_SAMPLE_RATE) {
    return buffer;
  }
  const frameCount = Math.max(
    1,
    Math.ceil(buffer.duration * STORAGE_SAMPLE_RATE),
  );
  // OfflineAudioContext tự lo cả downmix về mono lẫn resample — không cần tự
  // viết bộ lọc, và kết quả khớp với cách chính trình duyệt đó phát lại.
  const offline = new OfflineAudioContext(1, frameCount, STORAGE_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  return offline.startRendering();
}

/**
 * Encode AudioBuffer thành WAV PCM 16-bit little-endian — định dạng mọi trình
 * duyệt đều phát được.
 *
 * Luôn encode TOÀN BỘ bản ghi, không cắt theo trim: UC-54 POST-2 yêu cầu giữ
 * nguyên bản ghi gốc để còn chỉnh lại hoặc bỏ cắt sau này; điểm cắt lưu riêng
 * ở 2 cột `trim_start_sec`/`trim_end_sec`.
 */
export function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;

  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  function writeString(offset: number, text: string) {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // độ dài khối fmt
  view.setUint16(20, 1, true); // 1 = PCM không nén
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numChannels; c++) {
      // Kẹp về [-1, 1] trước khi nhân: mẫu vượt biên mà không kẹp sẽ tràn số
      // nguyên 16-bit và biến thành tiếng rè rất to.
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

/**
 * Rút gọn bản ghi thành `bucketCount` giá trị biên độ [0..1] để vẽ dạng sóng.
 * Lấy biên độ lớn nhất trong mỗi đoạn (peak) thay vì trung bình — trung bình
 * làm sóng trông phẳng lì, không nhìn ra được đoạn im lặng cần cắt.
 */
export function computeWaveformPeaks(
  buffer: AudioBuffer,
  bucketCount: number,
): number[] {
  const data = buffer.getChannelData(0);
  const samplesPerBucket = Math.max(1, Math.floor(data.length / bucketCount));
  const peaks: number[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const start = i * samplesPerBucket;
    const end = Math.min(data.length, start + samplesPerBucket);
    let peak = 0;
    for (let j = start; j < end; j++) {
      const value = Math.abs(data[j]);
      if (value > peak) peak = value;
    }
    peaks.push(peak);
  }

  return peaks;
}
