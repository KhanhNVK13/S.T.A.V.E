import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createAvatarUploadUrl = vi.fn();
const confirmAvatar = vi.fn();
const uploadToSignedUrl = vi.fn();

vi.mock("./api-client", () => ({
  createAvatarUploadUrl: (...args: unknown[]) => createAvatarUploadUrl(...args),
  confirmAvatar: (...args: unknown[]) => confirmAvatar(...args),
}));
vi.mock("./supabase-browser", () => ({
  supabase: { storage: { from: () => ({ uploadToSignedUrl: (...args: unknown[]) => uploadToSignedUrl(...args) }) } },
}));

import { AVATAR_MAX_SOURCE_BYTES, AVATAR_SIZE_PX, uploadAvatar, validateAvatarFile } from "./avatar-upload";
import { setLang } from "./i18n";

const fileOf = (type: string, size: number) => ({ type, size }) as File;

describe("FE-LIB-51 avatar-upload validateAvatarFile(file)", () => {
  beforeEach(() => setLang("vi"));

  it.each([
    { id: "UTCID01", type: "image/jpeg" },
    { id: "UTCID02", type: "image/png" },
    { id: "UTCID03", type: "image/webp" },
  ])("$id (N): $type under the size limit → null", ({ type }) => {
    expect(validateAvatarFile(fileOf(type, 1000))).toBeNull();
  });

  it("UTCID04 (A): image/gif → a message about the accepted types", () => {
    expect(validateAvatarFile(fileOf("image/gif", 1000))).toBe("Ảnh đại diện chỉ nhận file JPG, PNG hoặc WebP.");
  });

  it("UTCID05 (B): exactly the source limit → null", () => {
    expect(validateAvatarFile(fileOf("image/png", AVATAR_MAX_SOURCE_BYTES))).toBeNull();
  });

  it("UTCID06 (B): one byte above the source limit → a message about the size", () => {
    expect(validateAvatarFile(fileOf("image/png", AVATAR_MAX_SOURCE_BYTES + 1))).toBe(
      "Ảnh lớn hơn 10 MB nên không dùng được. Hãy chọn ảnh nhỏ hơn.",
    );
  });
});

describe("FE-LIB-52 avatar-upload uploadAvatar(file)", () => {
  const drawImage = vi.fn();
  const canvases: HTMLCanvasElement[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    canvases.length = 0;
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() })),
    );
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") return realCreate(tag);
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage }),
        toBlob: (cb: (b: Blob | null) => void, type: string) => cb(new Blob(["x"], { type })),
      } as unknown as HTMLCanvasElement;
      canvases.push(canvas);
      return canvas;
    }) as typeof document.createElement);
    createAvatarUploadUrl.mockResolvedValue({ path: "u/f.webp", token: "tok" });
    uploadToSignedUrl.mockResolvedValue({ error: null });
    confirmAvatar.mockResolvedValue({ avatar_url: "https://cdn/x.webp" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("UTCID01 (N): the picture is cropped to a centred square and resized to 256 x 256", async () => {
    await uploadAvatar(fileOf("image/png", 1000));
    expect(AVATAR_SIZE_PX).toBe(256);
    expect([canvases[0].width, canvases[0].height]).toEqual([256, 256]);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 100, 0, 600, 600, 0, 0, 256, 256);
  });

  it("UTCID02 (N): the resized WebP is uploaded to the signed address and the saved address returned", async () => {
    await expect(uploadAvatar(fileOf("image/png", 1000))).resolves.toBe("https://cdn/x.webp");
    expect(createAvatarUploadUrl).toHaveBeenCalledWith("image/webp");
    expect(uploadToSignedUrl).toHaveBeenCalledWith("u/f.webp", "tok", expect.any(Blob), { contentType: "image/webp" });
    expect(confirmAvatar).toHaveBeenCalledWith("u/f.webp");
  });

  it("UTCID03 (A): a failed upload is reported and the avatar is not confirmed", async () => {
    uploadToSignedUrl.mockResolvedValue({ error: { message: "x" } });
    await expect(uploadAvatar(fileOf("image/png", 1000))).rejects.toThrow("upload-failed");
    expect(confirmAvatar).not.toHaveBeenCalled();
  });
});
