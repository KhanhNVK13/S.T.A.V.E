import { expect as baseExpect, test, type Page } from "@playwright/test";
import { deflateSync } from "node:zlib";
import { admin } from "./support/auth-links";
import { ensurePlans, person, type Person } from "./support/people";
import { cleanupE2eUsers, loginThroughUi } from "./support/test-user";

const expect = baseExpect.configure({ timeout: 30_000 });

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

function png(width: number, height: number, pixel: (x: number, y: number) => [number, number, number], padTo?: number): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(width * 3 + 1);
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      row[1 + x * 3] = r;
      row[2 + x * 3] = g;
      row[3 + x * 3] = b;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const head = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
  ]);
  const end = chunk("IEND", Buffer.alloc(0));
  if (!padTo) return Buffer.concat([head, end]);
  const padLen = padTo - head.length - end.length - 12;
  return Buffer.concat([head, chunk("pdNg", Buffer.alloc(padLen)), end]);
}

const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

const sunset = () =>
  png(160, 100, (x, y) => {
    const t = y / 99;
    if (t < 0.4) return [mix(255, 240, t / 0.4), mix(140, 70, t / 0.4), mix(30, 90, t / 0.4)];
    if (t < 0.7) return [mix(240, 120, (t - 0.4) / 0.3), mix(70, 30, (t - 0.4) / 0.3), mix(90, 140, (t - 0.4) / 0.3)];
    return [mix(120, 15, (t - 0.7) / 0.3), mix(30, 20, (t - 0.7) / 0.3), mix(140, 70, (t - 0.7) / 0.3)];
  });

const forest = () =>
  png(160, 100, (x, y) => {
    const band = Math.floor(x / 40);
    const palette: Array<[number, number, number]> = [
      [20, 90, 40],
      [60, 140, 60],
      [110, 80, 40],
      [10, 40, 25],
    ];
    const [r, g, b] = palette[band % palette.length];
    return [Math.min(255, r + (y % 17)), Math.min(255, g + (y % 13)), Math.min(255, b + (y % 11))];
  });

const plainWhite = () => png(64, 64, () => [255, 255, 255]);

const pastelLight = () =>
  png(160, 100, (x) => {
    const band = Math.floor(x / 32);
    const palette: Array<[number, number, number]> = [
      [255, 228, 232],
      [255, 244, 214],
      [220, 240, 255],
      [232, 255, 228],
      [244, 228, 255],
    ];
    return palette[band % palette.length];
  });

interface Plan {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
}

async function subscriber(boss: Person, label: string): Promise<Person> {
  const user = await person(label);
  const plans = (await boss.api.call("GET", "/admin/plans")) as Plan[];
  const plan = plans.find((p) => !p.isDefault && p.isActive)!;
  const checkout = (await user.api.call("POST", "/subscriptions/checkout", { planId: plan.id })) as { orderCode: number };
  await user.api.call("POST", `/dev/fake-payment/${checkout.orderCode}/success`);
  return user;
}

function themeValue(page: Page, key: string): Promise<string> {
  return page.evaluate((k) => document.documentElement.style.getPropertyValue(k), key);
}

async function openPersonalization(page: Page) {
  await page.goto("/profile");
  await page.getByRole("tab", { name: "Cá nhân hoá" }).click();
  await expect(page.getByRole("heading", { name: "Theme từ ảnh" })).toBeVisible();
}

async function drop(page: Page, name: string, mimeType: string, buffer: Buffer) {
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer });
}

async function customThemes(userId: string) {
  const { data } = await admin().from("themes").select("id, type, generated_palette").eq("user_id", userId).eq("type", "custom");
  return data ?? [];
}

function swatches(page: Page) {
  return page.locator('ul[aria-label] li span[title^="--"]');
}

test.describe("Theme from an image", () => {
  test.setTimeout(240_000);
  test.beforeAll(async () => {
    await ensurePlans();
  });
  test.afterEach(async () => {
    await cleanupE2eUsers();
  });

  test("SUB-036 builds, applies and saves a theme from an image without storing the image", async ({ page, browser }) => {
    const boss = await person("Boss", "admin");
    const user = await subscriber(boss, "Creator");
    await loginThroughUi(page, user.user);
    await openPersonalization(page);
    const requests: Array<{ url: string; size: number }> = [];
    page.on("request", (req) => requests.push({ url: req.url(), size: req.postDataBuffer()?.length ?? 0 }));
    const base = await themeValue(page, "--background");
    await drop(page, "sunset.jpg", "image/png", sunset());
    await expect(swatches(page)).toHaveCount(10);
    await expect.poll(() => themeValue(page, "--background")).not.toBe(base);
    const preview = await themeValue(page, "--background");
    await page.getByRole("button", { name: "Áp dụng và lưu" }).click();
    await expect.poll(async () => (await customThemes(user.user.id)).length).toBe(1);
    const stored = (await customThemes(user.user.id))[0].generated_palette as Record<string, string>;
    expect(Object.keys(stored)).toHaveLength(10);
    await expect.poll(() => themeValue(page, "--background")).toBe(preview);
    expect(await themeValue(page, "--success")).toBe("");
    expect(await themeValue(page, "--danger")).toBe("");
    expect(await themeValue(page, "--warning")).toBe("");
    expect(requests.filter((r) => /\/storage\/|sunset/i.test(r.url))).toEqual([]);
    expect(requests.filter((r) => r.size > 20_000)).toEqual([]);
    const other = await (await browser.newContext()).newPage();
    await loginThroughUi(other, user.user);
    await expect.poll(() => themeValue(other, "--background")).toBe(preview);
    await other.context().close();
  });

  test("SUB-037 dropping a different image replaces the preview without storing anything", async ({ page, browser }) => {
    const boss = await person("Boss", "admin");
    const user = await subscriber(boss, "Creator");
    await loginThroughUi(page, user.user);
    await openPersonalization(page);
    const base = await themeValue(page, "--background");
    await drop(page, "sunset.jpg", "image/png", sunset());
    await expect(swatches(page)).toHaveCount(10);
    await expect.poll(() => themeValue(page, "--background")).not.toBe(base);
    const first = await themeValue(page, "--background");
    await drop(page, "forest.jpg", "image/png", forest());
    await expect.poll(() => themeValue(page, "--background")).not.toBe(first);
    expect(await customThemes(user.user.id)).toHaveLength(0);
    const other = await (await browser.newContext()).newPage();
    await loginThroughUi(other, user.user);
    await expect(other.getByRole("link", { name: "Dự án của tôi" })).toBeVisible();
    expect(await themeValue(other, "--background")).toBe(base);
    await other.context().close();
  });

  test("SUB-038 returning to a preset theme discards the extracted palette", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const user = await subscriber(boss, "Creator");
    await loginThroughUi(page, user.user);
    await openPersonalization(page);
    await drop(page, "sunset.jpg", "image/png", sunset());
    await expect(swatches(page)).toHaveCount(10);
    await page.getByRole("radio", { name: "Rêu" }).click();
    await page.getByRole("button", { name: "Lưu theme" }).click();
    await expect(page.getByText("Đã lưu giao diện màu.")).toBeVisible();
    await expect(swatches(page)).toHaveCount(0);
    expect(await customThemes(user.user.id)).toHaveLength(0);
    const { data } = await admin().from("users").select("active_theme_id").eq("id", user.user.id).single();
    const { data: row } = await admin().from("themes").select("preset_key").eq("id", data!.active_theme_id as string).single();
    expect(row?.preset_key).toBe("moss");
  });

  test("SUB-039 on the free plan the theme builder is disabled and links to the plans", async ({ page }) => {
    const user = await person("Free");
    await loginThroughUi(page, user.user);
    await openPersonalization(page);
    await expect(page.getByText("Tạo theme từ ảnh là tính năng của gói STAVE+.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Chọn ảnh", exact: true })).toBeDisabled();
    await expect(page.locator('input[type="file"]')).toBeDisabled();
    await expect(swatches(page)).toHaveCount(0);
    await page.getByRole("link", { name: "Xem các gói" }).click();
    await expect(page).toHaveURL(/\/plans/);
  });

  test("SUB-040 a file that is not a supported image type is rejected", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const user = await subscriber(boss, "Creator");
    await loginThroughUi(page, user.user);
    await openPersonalization(page);
    const base = await themeValue(page, "--background");
    await drop(page, "notes.pdf", "application/pdf", Buffer.from("%PDF-1.4\n%%EOF\n"));
    await expect(page.getByRole("alert").filter({ hasText: "Chỉ nhận ảnh PNG, JPEG hoặc WebP" })).toBeVisible();
    await expect(swatches(page)).toHaveCount(0);
    expect(await themeValue(page, "--background")).toBe(base);
  });

  test("SUB-041 an image larger than the accepted size is rejected", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const user = await subscriber(boss, "Creator");
    await loginThroughUi(page, user.user);
    await openPersonalization(page);
    const base = await themeValue(page, "--background");
    await drop(page, "large_image.png", "image/png", png(32, 32, () => [10, 120, 200], 5 * 1024 * 1024 + 4096));
    await expect(page.getByRole("alert").filter({ hasText: "lớn hơn 5 MB" })).toBeVisible();
    await expect(swatches(page)).toHaveCount(0);
    expect(await themeValue(page, "--background")).toBe(base);
  });

  test("SUB-042 a near single-colour image is refused as too little variation", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const user = await subscriber(boss, "Creator");
    await loginThroughUi(page, user.user);
    await openPersonalization(page);
    const base = await themeValue(page, "--background");
    await drop(page, "plain_white.png", "image/png", plainWhite());
    await expect(page.getByRole("alert").filter({ hasText: "không đủ màu" })).toBeVisible();
    await expect(swatches(page)).toHaveCount(0);
    expect(await themeValue(page, "--background")).toBe(base);
    expect(await customThemes(user.user.id)).toHaveLength(0);
  });

  test("SUB-043 when the palette cannot be stored the previous theme is kept", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const user = await subscriber(boss, "Creator");
    await loginThroughUi(page, user.user);
    await expect(page.getByRole("link", { name: "Dự án của tôi" })).toBeVisible();
    await page.route(
      (url) => url.port === "3101" && url.pathname === "/themes/me/custom",
      (route) =>
        route.request().method() === "PUT"
          ? route.fulfill({ status: 500, contentType: "application/json", body: "{}" })
          : route.continue(),
    );
    await openPersonalization(page);
    const base = await themeValue(page, "--background");
    await drop(page, "sunset.jpg", "image/png", sunset());
    await expect(swatches(page)).toHaveCount(10);
    await page.getByRole("button", { name: "Áp dụng và lưu" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Không lưu được theme" })).toBeVisible();
    await expect.poll(() => themeValue(page, "--background")).toBe(base);
    await page.reload();
    await expect.poll(() => themeValue(page, "--background")).toBe(base);
    expect(await customThemes(user.user.id)).toHaveLength(0);
  });

  test("SUB-044 extracted colours that fail the contrast requirements are adjusted before applying", async ({ page }) => {
    const boss = await person("Boss", "admin");
    const user = await subscriber(boss, "Creator");
    await loginThroughUi(page, user.user);
    await openPersonalization(page);
    await drop(page, "pastel_light.png", "image/png", pastelLight());
    await expect(swatches(page)).toHaveCount(10);
    await page.getByRole("button", { name: "Áp dụng và lưu" }).click();
    await expect.poll(async () => (await customThemes(user.user.id)).length).toBe(1);
    await expect.poll(() => themeValue(page, "--background")).not.toBe("");
    const ratios = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      const rgb = (value: string): [number, number, number] => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "#000";
        ctx.fillStyle = value;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return [d[0], d[1], d[2]];
      };
      const lum = ([r, g, b]: [number, number, number]) => {
        const f = (c: number) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const ratio = (a: string, b: string) => {
        const [x, y] = [lum(rgb(a)), lum(rgb(b))];
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      const style = document.documentElement.style;
      const get = (k: string) => style.getPropertyValue(k);
      return {
        fg: ratio(get("--foreground"), get("--background")),
        fgSurface: ratio(get("--foreground"), get("--surface")),
        muted: ratio(get("--muted-foreground"), get("--surface")),
        background: get("--background"),
      };
    });
    expect(ratios.fg).toBeGreaterThanOrEqual(4.5);
    expect(ratios.fgSurface).toBeGreaterThanOrEqual(4.5);
    expect(ratios.muted).toBeGreaterThanOrEqual(4.5);
    const lightness = Number(/oklch\(\s*([\d.]+)/.exec(ratios.background)?.[1] ?? "1");
    expect(lightness).toBeLessThan(0.9);
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--danger"))).toBe("");
  });
});
