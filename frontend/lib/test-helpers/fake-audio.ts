/** Minimal AudioBuffer stand-in for jsdom (no Web Audio API). */
export function makeAudioBuffer(channels: number[][] | Float32Array[], sampleRate = 44100): AudioBuffer {
  const data = channels.map((c) => (c instanceof Float32Array ? c : Float32Array.from(c)));
  const length = data[0]?.length ?? 0;
  return {
    numberOfChannels: data.length,
    sampleRate,
    length,
    duration: length / sampleRate,
    getChannelData: (c: number) => data[c],
  } as unknown as AudioBuffer;
}

/** Reads a Blob as a DataView (jsdom Blob supports arrayBuffer()). */
export async function blobView(blob: Blob): Promise<DataView> {
  return new DataView(await readBlob(blob));
}

/** jsdom's Blob has no arrayBuffer(); FileReader is supported. */
export function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

export function readAscii(view: DataView, offset: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}
