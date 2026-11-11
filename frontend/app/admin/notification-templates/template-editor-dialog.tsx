"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  NOTIFICATION_TEMPLATE_BODY_MAX_LENGTH,
  NOTIFICATION_TEMPLATE_NAME_MAX_LENGTH,
  NOTIFICATION_TEMPLATE_SUBJECT_MAX_LENGTH,
  type NotificationTemplateInfo,
  type NotificationTemplatePreview,
} from "@stave/shared-types";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogActions, DialogError } from "../../../components/ui/dialog";
import { Field, INPUT_CLASS } from "../../../components/ui/form";
import { ApiError } from "../../../lib/api-client";
import { previewNotificationTemplate, saveNotificationTemplate } from "../../../lib/admin-notification-templates-api";
import { useI18n } from "../../../context/i18n-context";

type Target = "subject" | "body";

function placeholderNames(err: unknown): string[] | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null;
  const body = err.body as { code?: string; placeholders?: string[] } | undefined;
  return body?.code === "UNKNOWN_PLACEHOLDER" && Array.isArray(body.placeholders) ? body.placeholders : null;
}

export function TemplateEditorDialog({
  template,
  onClose,
  onSaved,
}: {
  template: NotificationTemplateInfo;
  onClose: () => void;
  onSaved: (created: boolean) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(template.custom?.name ?? "");
  const [subject, setSubject] = useState(template.custom?.subject ?? template.defaultSubject);
  const [body, setBody] = useState(template.custom?.body ?? template.defaultBody);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<NotificationTemplatePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const target = useRef<Target>("body");
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const isNew = template.custom === null;
  const nameEmpty = name.trim() === "";
  const subjectEmpty = subject.trim() === "";
  const bodyEmpty = body.trim() === "";
  const dirty =
    name !== (template.custom?.name ?? "") ||
    subject !== (template.custom?.subject ?? template.defaultSubject) ||
    body !== (template.custom?.body ?? template.defaultBody);
  const invalid = nameEmpty || subjectEmpty || bodyEmpty;

  function insertPlaceholder(key: string) {
    const token = `{{${key}}}`;
    const el = target.current === "subject" ? subjectRef.current : bodyRef.current;
    const current = target.current === "subject" ? subject : body;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    if (target.current === "subject") setSubject(next);
    else setBody(next);
    setPreview(null);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const caret = start + token.length;
      el.setSelectionRange(caret, caret);
    });
  }

  function describe(err: unknown, fallback: string): string {
    const names = placeholderNames(err);
    if (names) return t("ntpl.errPlaceholder", { names: names.map((n) => `{{${n}}}`).join(", ") });
    return fallback;
  }

  async function handlePreview() {
    setError(null);
    if (subjectEmpty || bodyEmpty) {
      setTouched(true);
      return;
    }
    setPreviewing(true);
    try {
      const result = await previewNotificationTemplate({ type: template.type, subject, body });
      if (mounted.current) setPreview(result);
    } catch (err) {
      if (mounted.current) setError(describe(err, t("ntpl.errPreview")));
    } finally {
      if (mounted.current) setPreviewing(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (invalid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await saveNotificationTemplate(template.type, {
        name: name.trim(),
        subject: subject.trim(),
        body: body.trim(),
      });
      if (!mounted.current) return;
      onSaved(result.created);
    } catch (err) {
      if (!mounted.current) return;
      setError(describe(err, t("ntpl.errSave")));
      setSaving(false);
    }
  }

  const required = t("ntpl.required");

  return (
    <Dialog
      title={isNew ? t("ntpl.createTitle") : t("ntpl.editTitle")}
      className="max-w-xl p-6"
      onClose={onClose}
      closeDisabled={saving}
      dirty={dirty}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          <span className="font-mono text-xs">{template.type}</span>
          <br />
          {t("ntpl.futureOnly")}
        </p>
        <DialogError message={error} />

        <Field label={t("ntpl.name")} error={touched && nameEmpty ? required : null}>
          <input
            name="template-name"
            autoComplete="off"
            maxLength={NOTIFICATION_TEMPLATE_NAME_MAX_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
            className={INPUT_CLASS}
          />
        </Field>

        <Field label={t("ntpl.subject")} error={touched && subjectEmpty ? required : null}>
          <input
            ref={subjectRef}
            name="template-subject"
            autoComplete="off"
            maxLength={NOTIFICATION_TEMPLATE_SUBJECT_MAX_LENGTH}
            value={subject}
            onFocus={() => {
              target.current = "subject";
            }}
            onChange={(e) => {
              setSubject(e.target.value);
              setPreview(null);
            }}
            disabled={saving}
            className={INPUT_CLASS}
          />
        </Field>

        <Field label={t("ntpl.body")} error={touched && bodyEmpty ? required : null}>
          <textarea
            ref={bodyRef}
            name="template-body"
            autoComplete="off"
            rows={4}
            maxLength={NOTIFICATION_TEMPLATE_BODY_MAX_LENGTH}
            value={body}
            onFocus={() => {
              target.current = "body";
            }}
            onChange={(e) => {
              setBody(e.target.value);
              setPreview(null);
            }}
            disabled={saving}
            className={`${INPUT_CLASS} resize-y`}
          />
        </Field>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold tracking-wide">{t("ntpl.placeholders")}</span>
          <div className="flex flex-wrap gap-2">
            {template.placeholders.map((key) => (
              <Button key={key} type="button" variant="secondary" onClick={() => insertPlaceholder(key)} disabled={saving}>
                <span className="font-mono">{`{{${key}}}`}</span>
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div>
            <Button type="button" variant="secondary" onClick={handlePreview} disabled={saving || previewing}>
              {previewing ? t("ui.processing") : t("ntpl.preview")}
            </Button>
          </div>
          {preview && (
            <div
              role="status"
              aria-label={t("ntpl.previewLabel")}
              className="rounded-card border border-border bg-surface-subtle p-3 text-sm"
            >
              <p className="font-semibold">{preview.subject}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-muted">{preview.body}</p>
            </div>
          )}
        </div>

        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            {t("ui.cancel")}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? t("ui.processing") : t("ntpl.save")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
