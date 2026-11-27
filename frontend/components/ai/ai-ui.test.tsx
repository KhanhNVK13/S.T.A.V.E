import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { setLang } from "../../lib/i18n";
import { AiActionButton, AiBadge, AiCallout } from "./ai-ui";

beforeEach(() => {
  setLang("vi");
});

afterEach(() => {
  cleanup();
});

describe("AI UI components", () => {
  it("renders AiBadge with default AI label", () => {
    render(<AiBadge />);
    expect(screen.getByText("AI")).toBeTruthy();
  });

  it("renders AiActionButton with loading state and fires onClick", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <AiActionButton label="Tóm tắt PR bằng AI" onClick={onClick} />,
    );
    const btn = screen.getByRole("button", { name: "Tóm tắt PR bằng AI" });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <AiActionButton label="Tóm tắt PR bằng AI" loading onClick={onClick} />,
    );
    const busy = screen.getByRole("button");
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.textContent).toContain("AI đang phân tích…");
  });

  it("renders AiCallout bullet list, copy action, regenerate action, and fallback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const onRegenerate = vi.fn();

    const { rerender } = render(
      <AiCallout
        title="Tóm tắt"
        text={"- Thêm 4 nốt.\n- Đổi tempo lên 132 BPM."}
        copyText="- Thêm 4 nốt."
        onRegenerate={onRegenerate}
        subtitle="Diễn giải khách quan"
      />,
    );

    expect(screen.getByText("AI")).toBeTruthy();
    expect(screen.getByText("Thêm 4 nốt.")).toBeTruthy();
    expect(screen.getByText("Đổi tempo lên 132 BPM.")).toBeTruthy();
    expect(screen.getByText("Diễn giải khách quan")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Sao chép" }));
    expect(writeText).toHaveBeenCalledWith("- Thêm 4 nốt.");

    fireEvent.click(screen.getByRole("button", { name: "Tạo lại" }));
    expect(onRegenerate).toHaveBeenCalledTimes(1);

    rerender(<AiCallout title="Tóm tắt" unavailable />);
    expect(
      screen.getByText(/AI hiện chưa phản hồi hoặc đã chạm giới hạn lượt dùng/),
    ).toBeTruthy();
  });
});
