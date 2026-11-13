"use client";

import { useRef, useState } from "react";
import { ApiError } from "../../../lib/api-client";
import {
  createNotificationTemplate,
  previewNotificationTemplate,
  type TemplateValidationError,
} from "../../../lib/admin-notification-templates-api";
import {
  TEMPLATE_BODY_MAX_LENGTH,
  TEMPLATE_NAME_MAX_LENGTH,
  TEMPLATE_SUBJECT_MAX_LENGTH,
  findMalformedPlaceholders,
  validateTemplatePlaceholders,
  type NotificationTemplateItem,
} from "@stave/shared-types";
import { Button } from "../../../components/ui/button";
import { FieldError, INPUT_CLASS } from "../../../components/ui/form";
import { Dialog, DialogActions, DialogError } from "../../../components/ui/dialog";
import { apiErrorMessage } from "../../../lib/error-message";
import { useI18n } from "../../../context/i18n-context";

/** Dữ liệu mẫu đang lưu; `null` nghĩa là loại chưa có mẫu → hộp tạo mới. */
export type ExistingTemplate = {
  id: string;
  name: string;
  subject: string;
  bodyTemplate: string;
  updatedAt: string;
};

interface TemplateDialogProps {
  type: string;
  placeholders: string[];
  /** Mẫu đang lưu; có giá trị → hộp sửa (điền sẵn). */
  existing?: ExistingTemplate | null;
  onCancel: () => void;
  onDone: (message: string) => void;
  /**
   * Gọi khi backend báo 409 đồng thời, để tải lại bảng mẫu. Trả về mẫu mới
   * (nếu có) để hộp dùng `updated_at` mới cho lần lưu kế tiếp.
   */
  onReload?: () =>
    | NotificationTemplateItem["template"]
    | undefined
    | Promise<NotificationTemplateItem["template"] | undefined>;
}

interface FieldErrors {
  name?: string;
  subject?: string;
  bodyTemplate?: string;
}

/**
 * Hộp tạo/sửa mẫu thông báo. Placeholder hợp lệ lấy từ API (nguồn sự thật là
 * `notification-types.ts` ở backend), kiểm tra dùng chung hàm ở shared-types
 * nên giao diện và backend luôn báo cùng một danh sách lỗi.
 *
 * Khi sửa, gửi kèm `expectedUpdatedAt` để phát hiện có admin khác vừa sửa
 * (UC-111): lệch → 409, giao diện tải lại bảng mẫu nhưng **giữ chữ người
 * dùng vừa nhập** để họ so sánh.
 */
export function TemplateDialog({
  type,
  placeholders,
  existing = null,
  onCancel,
  onDone,
  onReload,
}: TemplateDialogProps) {
  const { t } = useI18n();
  const isEdit = existing !== null;
  const [name, setName] = useState(existing?.name ?? "");
  const [subject, setSubject] = useState(existing?.subject ?? "");
  const [bodyTemplate, setBodyTemplate] = useState(existing?.bodyTemplate ?? "");
  /**
   * Mốc `updated_at` dùng cho khoá đồng thời. Sau một lần 409, danh sách được
   * tải lại nên mốc cũ đã hết hiệu lực — cập nhật mốc này để lần bấm "Lưu" kế
   * tiếp kiểm đồng thời với bản **mới nhất**, không phải bản cũ đã bị sửa.
   */
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(existing?.updatedAt ?? "");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(
    null,
  );
  const subjectRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  /** Chèn placeholder vào đúng vị trí con trỏ của ô đang được sửa. */
  function insertPlaceholder(placeholder: string, field: "subject" | "body") {
    const ref = field === "subject" ? subjectRef : bodyRef;
    const element = ref.current;
    const token = `{{${placeholder}}}`;
    if (!element) {
      if (field === "subject") setSubject((value) => value + token);
      else setBodyTemplate((value) => value + token);
      return;
    }
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? start;
    const value = element.value;
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`;
    if (field === "subject") setSubject(next);
    else setBodyTemplate(next);
    // Trả focus về ô và đặt con trỏ sau token vừa chèn.
    requestAnimationFrame(() => {
      element.focus();
      const caret = start + token.length;
      element.setSelectionRange(caret, caret);
    });
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    const trimmedName = name.trim();
    const trimmedSubject = subject.trim();
    const trimmedBody = bodyTemplate.trim();

    if (!trimmedName) errors.name = t("ntp.nameRequired");
    else if (trimmedName.length > TEMPLATE_NAME_MAX_LENGTH)
      errors.name = t("ntp.nameTooLong", { max: TEMPLATE_NAME_MAX_LENGTH });

    if (!trimmedSubject) errors.subject = t("ntp.subjectRequired");
    else if (trimmedSubject.length > TEMPLATE_SUBJECT_MAX_LENGTH)
      errors.subject = t("ntp.subjectTooLong", {
        max: TEMPLATE_SUBJECT_MAX_LENGTH,
      });

    if (!trimmedBody) errors.bodyTemplate = t("ntp.bodyRequired");
    else if (trimmedBody.length > TEMPLATE_BODY_MAX_LENGTH)
      errors.bodyTemplate = t("ntp.bodyTooLong", {
        max: TEMPLATE_BODY_MAX_LENGTH,
      });

    // Lỗi placeholder được gán về đúng ô chứa nó: tiêu đề trước, nội dung sau.
    const subjectResult = validateTemplatePlaceholders(
      trimmedSubject,
      "",
      placeholders,
    );
    const bodyResult = validateTemplatePlaceholders("", trimmedBody, placeholders);

    if (subjectResult.invalid.length > 0) {
      errors.subject = t("ntp.unknownPlaceholder", {
        name: subjectResult.invalid[0],
      });
    } else if (bodyResult.invalid.length > 0) {
      errors.bodyTemplate = t("ntp.unknownPlaceholder", {
        name: bodyResult.invalid[0],
      });
    }

    const malformedSubject = findMalformedPlaceholders(trimmedSubject);
    const malformedBody = findMalformedPlaceholders(trimmedBody);
    if (malformedSubject.length > 0) {
      errors.subject = t("ntp.malformedPlaceholder", {
        token: malformedSubject[0],
      });
    } else if (malformedBody.length > 0) {
      errors.bodyTemplate = t("ntp.malformedPlaceholder", {
        token: malformedBody[0],
      });
    }

    return errors;
  }

  async function handlePreview() {
    setError(null);
    setPreview(null);
    try {
      const result = await previewNotificationTemplate({
        type,
        subject,
        bodyTemplate,
      });
      setPreview(result);
    } catch (err) {
      setError(apiErrorMessage(err, t("ntp.saveFail")));
    }
  }

  async function handleSubmit() {
    setError(null);
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await createNotificationTemplate(type, {
        name: name.trim(),
        subject: subject.trim(),
        bodyTemplate: bodyTemplate.trim(),
        // Chỉ gửi khi sửa: khoá đồng thời so với bản đang mở.
        ...(isEdit ? { expectedUpdatedAt: baseUpdatedAt } : {}),
      });
      onDone(isEdit ? t("ntp.updatedToast") : t("ntp.savedToast"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        const body = err.body as TemplateValidationError | undefined;
        const invalid = body?.invalid?.[0];
        const malformed = body?.malformed?.[0];
        if (invalid) {
          setFieldErrors({ subject: t("ntp.unknownPlaceholder", { name: invalid }) });
        } else if (malformed) {
          setFieldErrors({
            bodyTemplate: t("ntp.malformedPlaceholder", { token: malformed }),
          });
        } else {
          setError(t("ntp.saveFailInvalid"));
        }
      } else if (err instanceof ApiError && err.status === 409 && isEdit) {
        // Có admin khác vừa sửa: tải lại bảng mẫu, giữ chứ người dùng nhập.
        setError(t("ntp.concurrencyNote"));
        const reloaded = await onReload?.();
        if (reloaded?.updatedAt) setBaseUpdatedAt(reloaded.updatedAt);
      } else if (err instanceof ApiError && err.status === 409) {
        setError(`${t("ntp.conflict")} ${t("ntp.existsBody")}`);
      } else if (err instanceof ApiError && err.status === 404) {
        setError(t("ntp.notFound"));
      } else {
        setError(apiErrorMessage(err, t("ntp.saveFail")));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      title={isEdit ? t("ntp.editTitle", { type }) : t("ntp.createTitle", { type })}
      titleClassName="text-foreground text-base"
      onClose={onCancel}
      closeDisabled={submitting}
      className="max-w-2xl p-6"
    >
      <div className="space-y-3">
        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium">{t("ntp.nameLabel")}</span>
          <input
            name="template-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setFieldErrors((prev) => ({ ...prev, name: undefined }));
            }}
            autoComplete="off"
            spellCheck={false}
            placeholder={t("ntp.namePlaceholder")}
            data-autofocus
            className={`${INPUT_CLASS} w-full`}
          />
          {fieldErrors.name && <FieldError>{fieldErrors.name}</FieldError>}
        </label>

        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium">{t("ntp.subjectLabel")}</span>
          <textarea
            ref={subjectRef}
            name="template-subject"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setFieldErrors((prev) => ({ ...prev, subject: undefined }));
            }}
            rows={2}
            autoComplete="off"
            spellCheck={false}
            className={`${INPUT_CLASS} w-full`}
          />
          {fieldErrors.subject && <FieldError>{fieldErrors.subject}</FieldError>}
        </label>

        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium">{t("ntp.bodyLabel")}</span>
          <textarea
            ref={bodyRef}
            name="template-body"
            value={bodyTemplate}
            onChange={(e) => {
              setBodyTemplate(e.target.value);
              setFieldErrors((prev) => ({ ...prev, bodyTemplate: undefined }));
            }}
            rows={5}
            autoComplete="off"
            spellCheck={false}
            className={`${INPUT_CLASS} w-full`}
          />
          {fieldErrors.bodyTemplate && (
            <FieldError>{fieldErrors.bodyTemplate}</FieldError>
          )}
        </label>

        <div className="rounded-card border border-border bg-surface-subtle p-3">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted">
            {t("ntp.placeholdersLabel")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {placeholders.map((placeholder) => (
              <Button
                key={placeholder}
                type="button"
                variant="secondary"
                onClick={() => insertPlaceholder(placeholder, "subject")}
                aria-label={`${t("ntp.insert")} {{${placeholder}}}`}
              >
                {`{{${placeholder}}}`}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Button type="button" variant="secondary" onClick={() => void handlePreview()}>
            {t("ntp.preview")}
          </Button>
          {preview && (
            <div className="min-w-0 flex-1 pl-3 text-xs text-muted">
              <p className="truncate font-semibold text-foreground">
                {preview.subject || t("ntp.previewEmpty")}
              </p>
              <p className="break-words">{preview.body}</p>
            </div>
          )}
        </div>
      </div>

      <DialogError message={error} />
      <DialogActions>
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          {t("ui.cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={() => void handleSubmit()}
          disabled={submitting}
        >
          {submitting ? t("ui.processing") : t("ui.confirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
