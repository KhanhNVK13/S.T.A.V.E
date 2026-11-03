export type SpaceMode = "full" | "quiet";

interface SceneRequest {
  mode: SpaceMode;
  anchor: number;
}

let request: SceneRequest | null = null;
let progress: number | null = null;
const requestListeners = new Set<() => void>();
const progressListeners = new Set<() => void>();
const pulseListeners = new Set<(i: number) => void>();

export function subscribeRequest(cb: () => void): () => void {
  requestListeners.add(cb);
  return () => requestListeners.delete(cb);
}

export function getRequest(): SceneRequest | null {
  return request;
}

/** Một trang xin cảnh nền riêng (vd. đồ thị nhánh xin "full"); trả về hàm huỷ yêu cầu. */
export function requestSpaceScene(mode: SpaceMode, anchor = 0): () => void {
  const mine: SceneRequest = { mode, anchor };
  request = mine;
  requestListeners.forEach((cb) => cb());
  return () => {
    if (request !== mine) return;
    request = null;
    requestListeners.forEach((cb) => cb());
  };
}

export function setSpaceProgress(p: number | null): void {
  progress = p;
  progressListeners.forEach((cb) => cb());
}

export function getSpaceProgress(): number | null {
  return progress;
}

export function subscribeProgress(cb: () => void): () => void {
  progressListeners.add(cb);
  return () => progressListeners.delete(cb);
}

export function pulseSpace(i: number): void {
  pulseListeners.forEach((cb) => cb(i));
}

export function subscribePulse(cb: (i: number) => void): () => void {
  pulseListeners.add(cb);
  return () => pulseListeners.delete(cb);
}
