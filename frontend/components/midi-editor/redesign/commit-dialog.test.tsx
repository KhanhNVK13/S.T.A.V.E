import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  act,
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
  // Khoá ngôn ngữ cho test: app mặc định là "en", nhưng các khẳng định
  // dưới đây viết bằng tiếng Việt → ghim "vi" để test không phụ thuộc
  // ngôn ngữ mặc định (và không đụng localStorage của máy).
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

/**
 * Wrapper giữ `message` như editor thật (controlled), để luông gợi ý
 * "điền vào ô trống" chạy đúng như trong app.
 */
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

describe("CommitDialog — UC-70 gợi ý commit message bằng AI", () => {
  it("tự gọi AI khi hộp mở và điền gợi ý vào ô trống, hiện nhãn + nút Tạo lại", async () => {
    const onSuggest = vi.fn().mockResolvedValue(SUGGESTION);
    render(<Harness onSuggest={onSuggest} />);

    await waitFor(() => expect(onSuggest).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/Gợi ý bởi AI\./)).toBeTruthy());
    expect(
      (screen.getByLabelText("Nội dung commit") as HTMLTextAreaElement).value,
    ).toBe(SUGGESTION);
    expect(screen.getByRole("button", { name: /Tạo lại/i })).toBeTruthy();
  });

  it("không ghi đè nội dung người dùng đã gõ (5.1)", async () => {
    let resolveSuggest: ((value: string | null) => void) | null = null;
    const onSuggest = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          resolveSuggest = resolve;
        }),
    );
    render(<Harness onSuggest={onSuggest} />);

    // Người dùng gõ trước khi gợi ý về.
    fireEvent.change(screen.getByLabelText("Nội dung commit"), {
      target: { value: "Nội dung của tôi" },
    });
    await act(async () => {
      resolveSuggest!("Gợi ý AI");
    });

    expect(
      (screen.getByLabelText("Nội dung commit") as HTMLTextAreaElement).value,
    ).toBe("Nội dung của tôi");
  });

  it("nút \"Tạo lại\" xin gợi ý mới và ghi đè ô nhập", async () => {
    const onSuggest = vi
      .fn()
      .mockResolvedValueOnce("Gợi ý 1")
      .mockResolvedValueOnce("Gợi ý 2");
    render(<Harness onSuggest={onSuggest} />);

    await waitFor(() => expect(onSuggest).toHaveBeenCalledTimes(1));
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

  it("AI lỗi (ví dụ không có khoá) → ô trống, không báo lỗi, không chặn commit (BR-79)", async () => {
    const onSuggest = vi.fn().mockRejectedValue(new Error("no api key"));
    render(<Harness onSuggest={onSuggest} />);

    await waitFor(() => expect(onSuggest).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText(/Đang gợi ý/i)).toBeNull(),
    );
    expect(
      (screen.getByLabelText("Nội dung commit") as HTMLTextAreaElement).value,
    ).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("gợi ý null (AI bị bỏ qua: first commit / chạm trần / quá hạn) → ô trống, không lỗi", async () => {
    const onSuggest = vi.fn().mockResolvedValue(null);
    render(<Harness onSuggest={onSuggest} />);

    await waitFor(() => expect(onSuggest).toHaveBeenCalled());
    expect(
      (screen.getByLabelText("Nội dung commit") as HTMLTextAreaElement).value,
    ).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("huỷ yêu cầu khi hộp đóng (unmount)", async () => {
    let captured: AbortSignal | null = null;
    const onSuggest = vi.fn((signal: AbortSignal) => {
      captured = signal;
      return new Promise<string | null>(() => undefined);
    });
    const { unmount } = render(<Harness onSuggest={onSuggest} />);

    await waitFor(() => expect(onSuggest).toHaveBeenCalled());
    unmount();
    expect(captured!.aborted).toBe(true);
  });

  it("không gọi AI khi branch chưa có commit nào để so (aiEnabled=false)", async () => {
    const onSuggest = vi.fn().mockResolvedValue("Không nên gọi");
    render(<Harness onSuggest={onSuggest} aiEnabled={false} headSnapshot={null} />);

    await waitFor(() =>
      expect(screen.getByText(/Bản ghi phiên bản đầu tiên/)).toBeTruthy(),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(onSuggest).not.toHaveBeenCalled();
  });

  it("nút Tạo commit không bị chặn bởi AI (gợi ý chỉ là phụ)", async () => {
    const onSuggest = vi.fn().mockResolvedValue(SUGGESTION);
    render(<Harness onSuggest={onSuggest} />);

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Nội dung commit") as HTMLTextAreaElement).value,
      ).toBe(SUGGESTION),
    );
    // Có gợi ý → nút bật, commit không cần ai làm gì thêm (UC-70: không tự commit).
    const commitBtn = screen.getByRole("button", {
      name: /Tạo commit/i,
    }) as HTMLButtonElement;
    expect(commitBtn.disabled).toBe(false);
  });
});
