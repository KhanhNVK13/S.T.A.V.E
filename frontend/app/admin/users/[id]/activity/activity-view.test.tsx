import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ActivityItem, ActivityPage } from "@stave/shared-types";
import { ActivityView } from "./activity-view";
import { withTimeZone } from "./time-zone";
import { getUserActivity } from "@/lib/admin-activity-api";
import { setLang } from "@/lib/i18n";

vi.mock("@/lib/admin-activity-api", () => ({ getUserActivity: vi.fn() }));

const getActivity = vi.mocked(getUserActivity);
const USER_ID = "22222222-2222-4222-8222-222222222222";

function item(n: number, overrides: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    action: "auth.sign_in",
    targetType: null,
    targetName: null,
    targetDeleted: false,
    occurredAt: "2026-11-01T10:00:00.000001+00:00",
    ipMasked: "203.0.113.*",
    locationApprox: null,
    ...overrides,
  };
}

function page(items: ActivityItem[], nextCursor: string | null = null): ActivityPage {
  return { items, nextCursor };
}

beforeEach(() => {
  setLang("vi");
  getActivity.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("ActivityView", () => {
  it("hiện dòng chú thích vị trí gần đúng và giới hạn của IP", async () => {
    getActivity.mockResolvedValue(page([item(1)]));
    render(<ActivityView userId={USER_ID} />);

    expect(await screen.findByText("Đăng nhập")).toBeTruthy();
    expect(screen.getByText("Vị trí chỉ gần đúng và có thể sai.")).toBeTruthy();
    expect(screen.getByText(/proxy/)).toBeTruthy();
  });

  it("hiện IP đã che, không bao giờ IP đầy đủ", async () => {
    getActivity.mockResolvedValue(page([item(1)]));
    render(<ActivityView userId={USER_ID} />);

    expect(await screen.findByText("203.0.113.*")).toBeTruthy();
    expect(screen.queryByText(/203\.0\.113\.45/)).toBeNull();
  });

  it("trống trong kỳ hiện câu rõ ràng và không phải báo lỗi", async () => {
    getActivity.mockResolvedValue(page([]));
    render(<ActivityView userId={USER_ID} />);

    expect(
      await screen.findByText("Không có hoạt động trong khoảng thời gian này"),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Thử lại")).toBeNull();
  });

  it("lỗi tải hiện cảnh báo có Thử lại và không hiện như danh sách trống", async () => {
    getActivity.mockRejectedValue(new Error("network"));
    render(<ActivityView userId={USER_ID} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Không tải được hoạt động");
    expect(alert.textContent).toContain("không có nghĩa là tài khoản không có hoạt động");
    expect(screen.getByText("Thử lại")).toBeTruthy();
    expect(screen.queryByText("Không có hoạt động trong khoảng thời gian này")).toBeNull();
  });

  it("bấm Thử lại tải lại và hiện kết quả", async () => {
    getActivity.mockRejectedValueOnce(new Error("network"));
    getActivity.mockResolvedValueOnce(page([item(1)]));
    render(<ActivityView userId={USER_ID} />);

    fireEvent.click(await screen.findByText("Thử lại"));

    expect(await screen.findByText("Đăng nhập")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(getActivity).toHaveBeenCalledTimes(2);
  });

  it("hiện (đã xoá) đúng cho dự án đã xoá và vẫn giữ tên đã lưu", async () => {
    getActivity.mockResolvedValue(
      page([
        item(1, {
          action: "project.created",
          targetType: "project",
          targetName: "Bài còn",
        }),
        item(2, {
          action: "project.created",
          targetType: "project",
          targetName: "Bài đã mất",
          targetDeleted: true,
        }),
      ]),
    );
    render(<ActivityView userId={USER_ID} />);

    expect(await screen.findByText(/Bài đã mất/)).toBeTruthy();
    expect(screen.getByText(/Bài còn/)).toBeTruthy();
    expect(screen.getAllByText("(đã xoá)")).toHaveLength(1);
  });

  it("hành động lạ không làm vỡ trang và có nhãn chung", async () => {
    getActivity.mockResolvedValue(
      page([item(1, { action: "community.jam_joined" }), item(2, { action: "zzz.unknown" })]),
    );
    render(<ActivityView userId={USER_ID} />);

    expect(await screen.findByText("Hoạt động cộng đồng")).toBeTruthy();
    expect(screen.getByText("Hoạt động khác")).toBeTruthy();
  });

  it("đổi bộ lọc loại đặt lại danh sách và bỏ con trỏ", async () => {
    getActivity.mockResolvedValueOnce(page([item(1), item(2)], "cursor-1"));
    getActivity.mockResolvedValueOnce(
      page([item(3, { action: "project.created", targetName: "Chỉ có dự án" })]),
    );
    render(<ActivityView userId={USER_ID} />);
    await screen.findAllByText("Đăng nhập");

    fireEvent.change(screen.getByLabelText("Loại hoạt động"), { target: { value: "projects" } });

    expect(await screen.findByText(/Chỉ có dự án/)).toBeTruthy();
    expect(screen.queryByText("Đăng nhập")).toBeNull();
    expect(screen.queryByText("Tải thêm")).toBeNull();
    const [, query] = getActivity.mock.calls[1];
    expect(query).toMatchObject({ type: "projects", cursor: null });
  });

  it("chọn Chỉ lượt đăng nhập gửi type=signin", async () => {
    getActivity.mockResolvedValue(page([]));
    render(<ActivityView userId={USER_ID} />);
    await screen.findByText("Không có hoạt động trong khoảng thời gian này");

    fireEvent.change(screen.getByLabelText("Loại hoạt động"), { target: { value: "signin" } });

    await waitFor(() => expect(getActivity).toHaveBeenCalledTimes(2));
    expect(getActivity.mock.calls[1][1]).toMatchObject({ type: "signin" });
  });

  it("đổi ngày gửi from và to", async () => {
    await withTimeZone("Asia/Ho_Chi_Minh", async () => {
      getActivity.mockResolvedValue(page([]));
      render(<ActivityView userId={USER_ID} />);
      await screen.findByText("Không có hoạt động trong khoảng thời gian này");

      fireEvent.change(screen.getByLabelText("Từ ngày"), { target: { value: "2026-10-01" } });
      fireEvent.change(screen.getByLabelText("Đến ngày"), { target: { value: "2026-10-31" } });

      await waitFor(() =>
        expect(getActivity.mock.calls.at(-1)?.[1]).toMatchObject({
          from: "2026-09-30T17:00:00.000Z",
          to: "2026-10-31T16:59:59.999Z",
        }),
      );
    });
  });

  it("khoảng ngày sai báo lỗi tại ô nhập, không gọi API và ẩn danh sách cũ", async () => {
    getActivity.mockResolvedValue(page([item(1)]));
    render(<ActivityView userId={USER_ID} />);
    await screen.findByText("Đăng nhập");
    const calls = getActivity.mock.calls.length;

    fireEvent.change(screen.getByLabelText("Đến ngày"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("Từ ngày"), { target: { value: "2026-10-31" } });

    expect(await screen.findByText("Ngày bắt đầu không được sau ngày kết thúc.")).toBeTruthy();
    expect(screen.queryByText("Đăng nhập")).toBeNull();
    expect(getActivity.mock.calls.length).toBe(calls + 1);
  });

  it("Tải thêm nối trang tiếp theo bằng con trỏ và không trùng dòng", async () => {
    getActivity.mockResolvedValueOnce(page([item(1), item(2)], "cursor-1"));
    getActivity.mockResolvedValueOnce(
      page(
        [item(2), item(3, { action: "project.created", targetName: "Dòng mới" })],
        null,
      ),
    );
    render(<ActivityView userId={USER_ID} />);
    await screen.findAllByText("Đăng nhập");

    fireEvent.click(screen.getByText("Tải thêm"));

    expect(await screen.findByText(/Dòng mới/)).toBeTruthy();
    expect(screen.getAllByText("Đăng nhập")).toHaveLength(2);
    expect(screen.queryByText("Tải thêm")).toBeNull();
    expect(getActivity.mock.calls[1][1]).toMatchObject({ cursor: "cursor-1" });
  });

  it("lỗi khi Tải thêm giữ nguyên các dòng đã có và hiện cảnh báo", async () => {
    getActivity.mockResolvedValueOnce(page([item(1)], "cursor-1"));
    getActivity.mockRejectedValueOnce(new Error("network"));
    render(<ActivityView userId={USER_ID} />);
    await screen.findByText("Đăng nhập");

    fireEvent.click(screen.getByText("Tải thêm"));

    expect((await screen.findByRole("alert")).textContent).toContain("Không tải được hoạt động");
    expect(screen.getByText("Đăng nhập")).toBeTruthy();
    expect(screen.getByText("Tải thêm")).toBeTruthy();
  });

  it("unmount khi đang tải thì huỷ yêu cầu và không lỗi", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let resolve: (value: ActivityPage) => void = () => undefined;
    getActivity.mockImplementation(
      () => new Promise<ActivityPage>((r) => (resolve = r)),
    );
    const { unmount } = render(<ActivityView userId={USER_ID} />);
    const signal = getActivity.mock.calls[0][2] as AbortSignal;

    unmount();
    resolve(page([item(1)]));
    await Promise.resolve();

    expect(signal.aborted).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("không có nút sửa hay xoá nhật ký", async () => {
    getActivity.mockResolvedValue(page([item(1)]));
    render(<ActivityView userId={USER_ID} />);
    await screen.findByText("Đăng nhập");

    expect(screen.queryByText(/Sửa|Xoá nhật ký|Xóa nhật ký/)).toBeNull();
  });
});

describe("ActivityView — khoảng thời gian cố định khi Tải thêm", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("không chọn ngày: lần tải đầu đã gửi cả from và to (30 ngày gần nhất)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-06T10:00:00.000Z"));
    getActivity.mockResolvedValue(page([]));
    render(<ActivityView userId={USER_ID} />);
    await screen.findByText("Không có hoạt động trong khoảng thời gian này");

    expect(getActivity.mock.calls[0][1]).toMatchObject({
      from: "2026-10-07T10:00:00.000Z",
      to: "2026-11-06T10:00:00.000Z",
    });
  });

  it("nhiều lần Tải thêm gửi đúng from/to của lần tải đầu dù thời gian trôi qua", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-06T10:00:00.000Z"));
    getActivity.mockResolvedValueOnce(page([item(1)], "cursor-1"));
    getActivity.mockResolvedValueOnce(page([item(2)], "cursor-2"));
    getActivity.mockResolvedValueOnce(page([item(3)], null));
    render(<ActivityView userId={USER_ID} />);
    await screen.findByText("Tải thêm");

    vi.setSystemTime(new Date("2026-11-06T10:30:00.000Z"));
    fireEvent.click(screen.getByText("Tải thêm"));
    await waitFor(() => expect(getActivity).toHaveBeenCalledTimes(2));
    await screen.findAllByText("Đăng nhập");
    vi.setSystemTime(new Date("2026-11-06T11:00:00.000Z"));
    fireEvent.click(await screen.findByText("Tải thêm"));
    await waitFor(() => expect(getActivity).toHaveBeenCalledTimes(3));

    expect(getActivity.mock.calls).toHaveLength(3);
    for (const call of getActivity.mock.calls) {
      expect(call[1]?.from).toBe("2026-10-07T10:00:00.000Z");
      expect(call[1]?.to).toBe("2026-11-06T10:00:00.000Z");
    }
    expect(getActivity.mock.calls[1][1]?.cursor).toBe("cursor-1");
    expect(getActivity.mock.calls[2][1]?.cursor).toBe("cursor-2");
  });

  it("đổi bộ lọc tính lại khoảng thời gian một lần mới", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-06T10:00:00.000Z"));
    getActivity.mockResolvedValue(page([]));
    render(<ActivityView userId={USER_ID} />);
    await screen.findByText("Không có hoạt động trong khoảng thời gian này");

    vi.setSystemTime(new Date("2026-11-06T12:00:00.000Z"));
    fireEvent.change(screen.getByLabelText("Loại hoạt động"), { target: { value: "signin" } });
    await waitFor(() => expect(getActivity).toHaveBeenCalledTimes(2));

    expect(getActivity.mock.calls[1][1]).toMatchObject({
      to: "2026-11-06T12:00:00.000Z",
      from: "2026-10-07T12:00:00.000Z",
    });
  });
});

describe("ActivityView — huỷ Tải thêm", () => {
  it("unmount khi đang Tải thêm thì huỷ yêu cầu và không lỗi", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    getActivity.mockResolvedValueOnce(page([item(1)], "cursor-1"));
    let resolve: (value: ActivityPage) => void = () => undefined;
    getActivity.mockImplementationOnce(() => new Promise<ActivityPage>((r) => (resolve = r)));
    const { unmount } = render(<ActivityView userId={USER_ID} />);
    fireEvent.click(await screen.findByText("Tải thêm"));
    await waitFor(() => expect(getActivity).toHaveBeenCalledTimes(2));
    const signal = getActivity.mock.calls[1][2] as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);

    unmount();
    resolve(page([item(2)]));
    await Promise.resolve();

    expect(signal.aborted).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("đổi bộ lọc khi đang Tải thêm thì huỷ yêu cầu cũ và không nối kết quả cũ", async () => {
    getActivity.mockResolvedValueOnce(page([item(1)], "cursor-1"));
    let resolveMore: (value: ActivityPage) => void = () => undefined;
    getActivity.mockImplementationOnce(() => new Promise<ActivityPage>((r) => (resolveMore = r)));
    getActivity.mockResolvedValueOnce(
      page([item(9, { action: "project.created", targetName: "Kết quả bộ lọc mới" })]),
    );
    render(<ActivityView userId={USER_ID} />);
    fireEvent.click(await screen.findByText("Tải thêm"));
    await waitFor(() => expect(getActivity).toHaveBeenCalledTimes(2));
    const moreSignal = getActivity.mock.calls[1][2] as AbortSignal;

    fireEvent.change(screen.getByLabelText("Loại hoạt động"), { target: { value: "projects" } });
    expect(await screen.findByText(/Kết quả bộ lọc mới/)).toBeTruthy();
    resolveMore(page([item(2, { action: "community.x", targetName: "Dòng của bộ lọc cũ" })]));
    await Promise.resolve();

    expect(moreSignal.aborted).toBe(true);
    expect(screen.queryByText(/Dòng của bộ lọc cũ/)).toBeNull();
  });

  it("yêu cầu Tải thêm bị huỷ không hiện thành lỗi cho người dùng", async () => {
    getActivity.mockResolvedValueOnce(page([item(1)], "cursor-1"));
    getActivity.mockImplementationOnce(
      (_id, _query, signal) =>
        new Promise<ActivityPage>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    getActivity.mockResolvedValueOnce(page([item(2)]));
    render(<ActivityView userId={USER_ID} />);
    fireEvent.click(await screen.findByText("Tải thêm"));
    await waitFor(() => expect(getActivity).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByLabelText("Loại hoạt động"), { target: { value: "signin" } });
    await waitFor(() => expect(getActivity).toHaveBeenCalledTimes(3));

    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("ActivityView — hiển thị thời điểm", () => {
  it("thời điểm có micro giây và +07:00 hiển thị đúng, không phải Invalid Date", async () => {
    getActivity.mockResolvedValue(
      page([item(1, { occurredAt: "2026-11-01T10:00:00.123456+07:00" })]),
    );
    render(<ActivityView userId={USER_ID} />);

    const expected = new Date("2026-11-01T10:00:00.123+07:00").toLocaleString("vi-VN");
    expect(await screen.findByText(expected)).toBeTruthy();
    expect(screen.queryByText(/Invalid Date/)).toBeNull();
  });

  it("thời điểm không parse được thì hiện chuỗi gốc", async () => {
    getActivity.mockResolvedValue(page([item(1, { occurredAt: "không rõ" })]));
    render(<ActivityView userId={USER_ID} />);

    expect(await screen.findByText("không rõ")).toBeTruthy();
    expect(screen.queryByText(/Invalid Date/)).toBeNull();
  });
});
