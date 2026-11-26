import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import type { DraftSnapshot } from "@stave/shared-types";
import { CommitDialog } from "./commit-dialog";
import { setLang } from "../../../lib/i18n/store";

beforeEach(() => {
  setLang("vi");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const HEAD: DraftSnapshot = {
  schemaVersion: 1,
  meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
  tracks: [
    {
      id: "t1",
      name: "Piano",
      order: 0,
      color: "#222",
      volume: 0.8,
      pan: 0,
      muted: false,
      solo: false,
      instrument: null,
    },
  ],
  notes: [{ id: "n1", trackId: "t1", pitch: 60, start: 0, duration: 480, velocity: 100 }],
};

const DRAFT: DraftSnapshot = {
  ...HEAD,
  notes: [{ id: "n1", trackId: "t1", pitch: 60, start: 0, duration: 480, velocity: 120 }],
};

const SUGGESTION = "Thêm nốt trên đoạn 1";

function Harness({
  onSuggest,
  aiEnabled = true,
  headSnapshot = HEAD,
  initialMessage = "",
  onMessageChangeSpy,
}: {
  onSuggest?: (signal: AbortSignal) => Promise<string | null>;
  aiEnabled?: boolean;
  headSnapshot?: DraftSnapshot | null;
  initialMessage?: string;
  onMessageChangeSpy?: ReturnType<typeof vi.fn>;
}) {
  const [message, setMessage] = useState(initialMessage);
  return (
    <CommitDialog
      snapshot={DRAFT}
      headSnapshot={headSnapshot}
      submitting={false}
      error={null}
      message={message}
      onMessageChange={(v) => {
        setMessage(v);
        onMessageChangeSpy?.(v);
      }}
      onSubmit={vi.fn()}
      onClose={vi.fn()}
      aiEnabled={aiEnabled}
      onSuggestCommitMessage={onSuggest}
    />
  );
}

describe("CommitDialog — gợi ý commit message bằng AI theo nút bấm", () => {
  it("không tự gọi AI khi hộp mở; chỉ gọi khi người dùng bấm nút Gợi ý bởi AI", async () => {
    const onSuggest = vi.fn().mockResolvedValue(SUGGESTION);
    render(<Harness onSuggest={onSuggest} />);

    expect(onSuggest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Gợi ý bởi AI/i }));

    await waitFor(() => expect(onSuggest).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/Gợi ý bởi AI\./)).toBeTruthy());
    expect(
      (screen.getByLabelText("Nội dung commit") as HTMLTextAreaElement).value,
    ).toBe(SUGGESTION);
    expect(screen.getByText("AI")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tạo lại/i })).toBeTruthy();
  });

  it("chuyển sang nhãn Đã chỉnh sửa khi người dùng sửa lại câu AI gợi ý", async () => {
    const onSuggest = vi.fn().mockResolvedValue(SUGGESTION);
    render(<Harness onSuggest={onSuggest} />);

    fireEvent.click(screen.getByRole("button", { name: /Gợi ý bởi AI/i }));
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Nội dung commit") as HTMLTextAreaElement).value,
      ).toBe(SUGGESTION),
    );

    fireEvent.change(screen.getByLabelText("Nội dung commit"), {
      target: { value: "Nội dung của tôi" },
    });

    expect(screen.getByText(/Đã chỉnh sửa từ gợi ý AI\./)).toBeTruthy();
  });

  it("nút Tạo lại xin gợi ý mới và cập nhật ô nhập", async () => {
    const onSuggest = vi
      .fn()
      .mockResolvedValueOnce("Gợi ý 1")
      .mockResolvedValueOnce("Gợi ý 2");
    render(<Harness onSuggest={onSuggest} />);

    fireEvent.click(screen.getByRole("button", { name: /Gợi ý bởi AI/i }));
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Nội dung commit") as HTMLTextAreaElement).value,
      ).toBe("Gợi ý 1"),
    );

    fireEvent.click(screen.getByRole("button", { name: /Tạo lại/i }));
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Nội dung commit") as HTMLTextAreaElement).value,
      ).toBe("Gợi ý 2"),
    );
    expect(onSuggest).toHaveBeenCalledTimes(2);
  });

  it("AI lỗi hoặc trả null → hiện thông báo nhẹ, không chặn commit", async () => {
    const onSuggest = vi.fn().mockRejectedValue(new Error("no api key"));
    render(<Harness onSuggest={onSuggest} />);

    fireEvent.click(screen.getByRole("button", { name: /Gợi ý bởi AI/i }));
    await waitFor(() => expect(onSuggest).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText(/Chưa lấy được gợi ý từ AI/i)).toBeTruthy(),
    );
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.change(screen.getByLabelText("Nội dung commit"), {
      target: { value: "Tự viết message" },
    });
    const commitBtn = screen.getByRole("button", {
      name: /Tạo commit/i,
    }) as HTMLButtonElement;
    expect(commitBtn.disabled).toBe(false);
  });

  it("gợi ý null → giữ ô trống và báo nhẹ không dùng role=alert", async () => {
    const onSuggest = vi.fn().mockResolvedValue(null);
    render(<Harness onSuggest={onSuggest} />);

    fireEvent.click(screen.getByRole("button", { name: /Gợi ý bởi AI/i }));
    await waitFor(() => expect(onSuggest).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText(/Chưa lấy được gợi ý từ AI/i)).toBeTruthy(),
    );
    expect(
      (screen.getByLabelText("Nội dung commit") as HTMLTextAreaElement).value,
    ).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("huỷ yêu cầu đang chờ khi hộp đóng (unmount)", async () => {
    let captured: AbortSignal | null = null;
    const onSuggest = vi.fn((signal: AbortSignal) => {
      captured = signal;
      return new Promise<string | null>(() => undefined);
    });
    const { unmount } = render(<Harness onSuggest={onSuggest} />);

    fireEvent.click(screen.getByRole("button", { name: /Gợi ý bởi AI/i }));
    await waitFor(() => expect(onSuggest).toHaveBeenCalledTimes(1));
    unmount();
    expect(captured!.aborted).toBe(true);
  });

  it("ẩn nút AI khi branch chưa có commit nào để so (aiEnabled=false)", () => {
    const onSuggest = vi.fn().mockResolvedValue("Không nên gọi");
    render(<Harness onSuggest={onSuggest} aiEnabled={false} headSnapshot={null} />);

    expect(screen.getByText(/Bản ghi phiên bản đầu tiên/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Gợi ý bởi AI/i })).toBeNull();
    expect(onSuggest).not.toHaveBeenCalled();
  });
});
