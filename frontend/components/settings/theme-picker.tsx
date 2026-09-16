"use client";

import { Check, Upload } from "lucide-react";
import type { PresetThemeKey } from "../../lib/api-client";
import { useTheme } from "../../context/theme-context";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

const PRESETS: { key: PresetThemeKey; name: string; description: string }[] = [
  { key: "unleashed", name: "Unleashed", description: "Trung tính tím-xám, mặc định" },
  { key: "moss", name: "Moss Circuit", description: "Nền ngả xanh rêu, dịu mắt" },
  { key: "claret", name: "Claret Studio", description: "Nền ngả đỏ rượu, ấm" },
];

/**
 * Bản xem trước thu nhỏ của 1 theme. Mỗi thẻ tự đặt `data-theme` của riêng nó
 * nên khối bên trong hiển thị đúng màu của preset đó mà không cần đổi theme
 * toàn trang.
 */
function ThemeSwatch({ preset }: { preset: PresetThemeKey }) {
  return (
    <div
      data-theme={preset}
      className="grid h-[86px] grid-cols-[22px_1fr] gap-1.5 rounded-md border border-border bg-background p-3"
    >
      <span className="row-span-3 border-r border-border bg-surface-subtle" />
      <span className="h-2 rounded-sm bg-foreground" />
      <span className="h-[18px] rounded-sm border border-border bg-surface" />
      <span className="h-2.5 w-[42%] rounded-sm bg-accent" />
    </div>
  );
}

/**
 * UC-78 — chọn preset theme (miễn phí mọi gói, BR-83).
 *
 * BR-90: preset chỉ đổi màu TRANG TRÍ; accent xanh cho hành động, đỏ cảnh báo,
 * vàng "đã sửa đổi" giữ nguyên ở mọi theme — vì thế 3 ô xem trước bên dưới chỉ
 * khác nhau ở tông nền/viền/chữ, còn thanh accent thì giống hệt nhau. Đó là
 * đúng thiết kế, không phải lỗi.
 */
export function ThemePicker() {
  const { activePreset, savedPreset, isDirty, preview, cancelPreview, save, saving, error } =
    useTheme();

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Cá nhân hoá</h2>
          <p className="mt-1.5 text-xs text-muted">
            Đổi tông màu trang trí của giao diện. Màu mang ý nghĩa (hành động, cảnh báo, xung
            đột) giữ nguyên ở mọi theme.
          </p>
        </div>
        <Badge variant="metal">STAVE+</Badge>
      </div>

      <h3 className="mb-2.5 mt-5 text-[11px] uppercase tracking-wide text-muted">
        Theme có sẵn
      </h3>

      <div className="grid gap-2.5 sm:grid-cols-3">
        {PRESETS.map((item) => {
          const selected = activePreset === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => preview(item.key)}
              className={`rounded-md border p-1.5 text-left transition-colors ${
                selected ? "border-accent ring-1 ring-accent" : "border-border hover:bg-surface-subtle"
              }`}
            >
              <ThemeSwatch preset={item.key} />
              <div className="flex items-center justify-between gap-2 px-1 pb-0.5 pt-2">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold">{item.name}</p>
                  <p className="truncate text-[9px] text-muted">{item.description}</p>
                </div>
                {savedPreset === item.key && (
                  <span className="flex shrink-0 items-center gap-1 text-[9px] text-muted">
                    <Check className="h-3 w-3" /> Đang dùng
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => void save()} disabled={!isDirty || saving}>
          {saving ? "Đang lưu…" : "Lưu theme"}
        </Button>
        {isDirty && (
          <Button variant="secondary" onClick={cancelPreview} disabled={saving}>
            Huỷ thay đổi
          </Button>
        )}
        {isDirty && !saving && (
          <span className="text-[11px] text-muted">
            Đang xem trước — chưa lưu vào tài khoản.
          </span>
        )}
      </div>

      {/*
        UC-79 (sinh theme từ ảnh) là tính năng của gói STAVE+ và phụ thuộc module
        Subscription & Payment (Sprint 6) — chưa xây dựng, xem PROJECT_STATE §27.
      */}
      <div className="mt-7 border-t border-border pt-5">
        <Badge variant="metal">STAVE+</Badge>
        <h3 className="mb-1.5 mt-2.5 text-base font-semibold">
          Tạo theme từ ảnh (PLACEHOLDER)
        </h3>
        <p className="max-w-[480px] text-[11px] leading-relaxed text-muted">
          Tải lên ảnh bìa hoặc ảnh chụp, STAVE sẽ trích một bảng màu trung tính từ ảnh và ánh xạ
          vào các vai trò giao diện. Ảnh chỉ dùng để lấy màu, không lưu lại.
        </p>
        <Button variant="secondary" disabled className="mt-3" title="PLACEHOLDER — chưa xây dựng">
          <Upload className="h-3.5 w-3.5" /> Tải ảnh lên (PLACEHOLDER)
        </Button>
      </div>
    </>
  );
}
