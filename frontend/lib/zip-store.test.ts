import { describe, expect, it } from "vitest";
import { crc32, createZip } from "./zip-store";

const encoder = new TextEncoder();

describe("zip-store", () => {
  it("computes the standard CRC-32 check value", () => {
    expect(crc32(encoder.encode("123456789"))).toBe(0xcbf43926);
  });

  it("writes local headers, a central directory and an end record", () => {
    const zip = createZip([
      { name: "a.txt", data: encoder.encode("hello") },
      { name: "dir/b.bin", data: new Uint8Array([1, 2, 3]) },
    ]);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const endOffset = zip.length - 22;
    expect(view.getUint32(endOffset, true)).toBe(0x06054b50);
    expect(view.getUint16(endOffset + 10, true)).toBe(2);
    const centralOffset = view.getUint32(endOffset + 16, true);
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);
  });

  it("stores UTF-8 names so Vietnamese file names survive", () => {
    const zip = createZip([{ name: "Bản nhạc.mid", data: new Uint8Array([0]) }]);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800);
    const nameLength = view.getUint16(26, true);
    expect(new TextDecoder().decode(zip.slice(30, 30 + nameLength))).toBe("Bản nhạc.mid");
  });
});
