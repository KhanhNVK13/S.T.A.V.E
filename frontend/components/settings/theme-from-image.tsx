"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ImageUp, Loader2 } from "lucide-react";
import { useI18n } from "../../context/i18n-context";
import { applyCustomPalette, useTheme } from "../../context/theme-context";
import { saveMyCustomTheme } from "../../lib/api-billing";
import { errorSource, renderError, type ErrorSource } from "../../lib/error-message";
import { loadImagePixels } from "../../lib/load-image-pixels";
import {
  ThemeFromImageError,
  extractPalette,
  type Rgb,
} from "../../lib/theme-from-image";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { PALETTE_KEYS, type Palette } from "@stave/shared-types";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

interface ThemeFromImageProps {
  /** Đường dẫn quay lại sau khi nâng cấp gói. */
  returnTo?: string;
}

export function ThemeFromImage({ returnTo = "/profile?tab=personalisation" }: ThemeFromImageProps) {
  const { t } = useI18n();
  const { theme, loading: themeLoading, refresh } = useTheme();
  const [palette, setPalette] = useState<Palette | null>(null);
  const [error, setError] = useState<ErrorSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Quyền trả phí đến từ theme có hiệu lực mà ThemeProvider đã nạp — không gọi
  // API lần nữa, vì lỗi mạng không được báo nhầm thành "gói miễn phí".
  const hasPaidAccess = theme?.hasPaidAccess ?? false;

  // Chưa bấm "Áp dụng và lưu" mà rời trang -> gỡ toàn bộ biến CSS tạm.
  // Dùng ref chứ không dùng state: chỉ cần biết lúc unmount có đang xem trước
  // hay không, và phải KHÔNG gỡ khi theme đã lưu (ThemeProvider sẽ tự áp).
  const unsavedRef = useRef(false);
  useEffect(() => {
    return () => {
      if (unsavedRef.current) applyCustomPalette(null);
    };
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError(errorSource(null, "themeImage.badType"));
        return;
      }
      if (file.size > MAX_BYTES) {
        setError(errorSource(null, "themeImage.tooBig"));
        return;
      }

      setBusy(true);
      try {
        const pixels: Rgb[] = await loadImagePixels(file);
        const next = extractPalette(pixels);
        setPalette(next);
        unsavedRef.current = true;
        applyCustomPalette(next);
      } catch (err) {
        if (err instanceof ThemeFromImageError && err.code === "not_enough_color") {
          setError(errorSource(null, "themeImage.notEnoughColor"));
        } else {
          setError(errorSource(null, "themeImage.readFail"));
        }
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  async function handleSave() {
    if (!palette) return;
    setSaving(true);
    setError(null);
    try {
      await saveMyCustomTheme(palette);
      unsavedRef.current = false;
      await refresh();
    } catch (err) {
      // Lỗi lưu: bỏ xem trước rồi nạp lại theme ĐÃ LƯU để DOM khớp với DB
      // (không gỡ hết biến — làm vậy sẽ mất theme custom đang lưu).
      setPalette(null);
      await refresh();
      setError(errorSource(err, "themeImage.saveFail"));
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    // Bỏ xem trước, đưa DOM về theme đang lưu (ThemeProvider tự áp lại).
    setPalette(null);
    void refresh();
    setError(null);
  }

  const disabled = themeLoading || !hasPaidAccess || busy || saving;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{t("themeImage.title")}</h3>
        <Badge variant="info">{t("themeImage.stavePlusBadge")}</Badge>
      </div>
      <p className="text-xs text-muted">{t("themeImage.lead")}</p>

      {hasPaidAccess === false && (
        <p className="text-xs text-warning-foreground">
          {t("themeImage.paidOnly")}{" "}
          <Link
            href={`/plans?feature=theme_from_image&returnTo=${encodeURIComponent(returnTo)}`}
            className="font-semibold text-accent underline underline-offset-2"
          >
            {t("themeImage.upgradeLink")}
          </Link>
        </p>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        className={`rounded-card border border-dashed px-4 py-6 text-center transition-colors ${
          dragOver ? "border-accent bg-accent-muted/40" : "border-border-strong"
        } ${disabled ? "opacity-60" : ""}`}
      >
        <ImageUp aria-hidden="true" className="mx-auto h-6 w-6 text-muted" />
        <p className="mt-2 text-xs text-muted">{t("themeImage.hint")}</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          className="sr-only"
          aria-label={t("themeImage.fileLabel")}
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleFile(file);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {busy && <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
          {t("themeImage.chooseFile")}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {renderError(error)}
        </p>
      )}

      {palette && (
        <div className="space-y-3">
          <ul className="flex flex-wrap gap-1.5" aria-label={t("themeImage.previewLabel")}>
            {PALETTE_KEYS.map((key) => (
              <li key={key}>
                <span
                  title={key}
                  className="block h-7 w-7 rounded border border-border"
                  style={{ background: palette[key] }}
                />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving && <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
              {t("themeImage.applyAndSave")}
            </Button>
            <Button type="button" variant="secondary" onClick={handleDiscard} disabled={saving}>
              {t("themeImage.backToPreset")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
