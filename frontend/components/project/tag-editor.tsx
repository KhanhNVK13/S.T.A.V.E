"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useT } from "../../context/i18n-context";
import { INPUT_CLASS } from "../ui/form";
import { Button } from "../ui/button";

export const MAX_TAGS = 5;
export const MAX_TAG_LENGTH = 30;
const TAG_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\- ]*$/u;

export function cleanTag(raw: string): string {
  return raw.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function TagEditor({
  tags,
  onChange,
  disabled = false,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function add() {
    const tag = cleanTag(draft);
    if (tag === "") return;
    if (tags.includes(tag)) {
      setProblem(t("tag.duplicate"));
      return;
    }
    if (tags.length >= MAX_TAGS) {
      setProblem(t("tag.limit", { n: MAX_TAGS }));
      return;
    }
    if (tag.length > MAX_TAG_LENGTH || !TAG_PATTERN.test(tag)) {
      setProblem(t("tag.invalid", { n: MAX_TAG_LENGTH }));
      return;
    }
    setProblem(null);
    setDraft("");
    onChange([...tags, tag]);
  }

  return (
    <div>
      {tags.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-1.5" aria-label={t("tag.listLabel")}>
          {tags.map((tag) => (
            <li
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-subtle py-0.5 pl-2.5 pr-1 text-xs"
            >
              #{tag}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(tags.filter((x) => x !== tag))}
                aria-label={t("tag.remove", { tag })}
                className="rounded-full p-1 text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-50"
              >
                <X aria-hidden="true" className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          name="tag"
          type="text"
          autoComplete="off"
          value={draft}
          disabled={disabled || tags.length >= MAX_TAGS}
          maxLength={MAX_TAG_LENGTH + 10}
          placeholder={t("tag.placeholder")}
          aria-label={t("tag.inputLabel")}
          aria-invalid={problem !== null}
          onChange={(e) => {
            setDraft(e.target.value);
            setProblem(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          className={INPUT_CLASS}
        />
        <Button type="button" variant="secondary" disabled={disabled || draft.trim() === "" || tags.length >= MAX_TAGS} onClick={add}>
          {t("tag.add")}
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted">{t("tag.count", { n: tags.length, max: MAX_TAGS })}</p>
      {problem && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
