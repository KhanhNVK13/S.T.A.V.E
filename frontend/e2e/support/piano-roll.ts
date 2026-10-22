import type { Page } from "@playwright/test";

export const KEY_WIDTH = 72;
export const HEADER_H = 34;
export const ROW_H = 22;
export const PPQ = 480;
export const BAR = PPQ * 4;
export const SIXTEENTH = PPQ / 4;

export interface Grid {
  left: number;
  top: number;
  width: number;
  height: number;
  scrollLeft: number;
  scrollTop: number;
  pxPerTick: number;
}

export async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

export async function grid(page: Page): Promise<Grid> {
  const zoomText = await page
    .getByTitle("Thu nhỏ")
    .locator("xpath=following-sibling::span[1]")
    .textContent();
  const zoom = Number((zoomText ?? "100%").replace("%", "")) / 100;
  const box = await page.evaluate(() => {
    const canvas = Array.from(document.querySelectorAll("canvas")).find(
      (c) => (c.parentElement?.parentElement?.scrollHeight ?? 0) > 2000,
    );
    if (!canvas) throw new Error("piano roll canvas not found");
    const container = canvas.parentElement!.parentElement!;
    container.setAttribute("data-e2e-grid", "1");
    const r = canvas.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    };
  });
  return { ...box, pxPerTick: 0.06 * zoom };
}

export async function scrollGrid(
  page: Page,
  target: { pitch?: number; tick?: number },
): Promise<Grid> {
  const g = await grid(page);
  for (const nudge of [1, 0]) {
    await page.evaluate(
      ({ pitch, tick, pxPerTick, rowH, headerH, nudge }) => {
        const container = document.querySelector<HTMLElement>("[data-e2e-grid]")!;
        if (pitch !== undefined) {
          container.scrollTop =
            Math.round(
              Math.max(
                0,
                headerH + (127 - pitch) * rowH + rowH / 2 - container.clientHeight / 2,
              ),
            ) + nudge;
        }
        if (tick !== undefined) {
          container.scrollLeft = Math.round(Math.max(0, tick * pxPerTick - 40)) + nudge;
        }
      },
      { ...target, pxPerTick: g.pxPerTick, rowH: ROW_H, headerH: HEADER_H, nudge },
    );
    await settle(page);
  }
  return grid(page);
}

export function point(g: Grid, tick: number, pitch: number) {
  return {
    x: g.left + KEY_WIDTH + tick * g.pxPerTick - g.scrollLeft,
    y: g.top + HEADER_H + (127 - pitch) * ROW_H + ROW_H / 2 - g.scrollTop,
  };
}

export async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

export const ONE_PIXEL_TICKS = 17;

export async function seekTo(page: Page, tick: number): Promise<void> {
  const g = await scrollGrid(page, { tick });
  const p = point(g, tick, 127);
  await page.mouse.click(p.x + 0.03, g.top + HEADER_H / 2);
}

export async function pickTool(page: Page, name: "Select" | "Draw" | "Erase") {
  await page.getByRole("button", { name, exact: true }).click();
}
