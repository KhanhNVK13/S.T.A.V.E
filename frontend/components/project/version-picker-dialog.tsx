"use client";

import { useState } from "react";
import type { BranchHistoryCommit } from "../../lib/api-client";
import { Button } from "../ui/button";
import { Dialog, DialogActions, DialogError } from "../ui/dialog";
import { INPUT_CLASS } from "../ui/form";
import { useI18n } from "../../context/i18n-context";

export function versionLabel(commit: BranchHistoryCommit): string {
  const tag = commit.tags[0]?.name;
  const message = commit.message.length > 48 ? `${commit.message.slice(0, 47)}…` : commit.message;
  return `${tag ? `[${tag}] ` : ""}${message} · ${commit.id.slice(0, 7)}`;
}

function VersionSelect({
  label,
  value,
  commits,
  onChange,
}: {
  label: string;
  value: string;
  commits: BranchHistoryCommit[];
  onChange: (id: string) => void;
}) {
  const { t } = useI18n();
  const tagged = commits.filter((c) => c.tags.length > 0);
  return (
    <label className="mb-3 flex flex-col gap-1.5 text-[13px]">
      <span className="font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT_CLASS} w-full font-mono`}
      >
        {tagged.length > 0 && (
          <optgroup label={t("vpick.tagged")}>
            {tagged.map((c) => (
              <option key={`tag-${c.id}`} value={c.id}>
                {versionLabel(c)}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label={t("vpick.all")}>
          {commits.map((c) => (
            <option key={c.id} value={c.id}>
              {versionLabel(c)}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}

export function VersionPickerDialog({ open, ...rest }: PickerProps) {
  if (!open) return null;
  return <PickerBody {...rest} />;
}

interface PickerProps {
  open: boolean;
  mode: "compare" | "restore";
  commits: BranchHistoryCommit[];
  initialIds: string[];
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
}

function PickerBody({
  mode,
  commits,
  initialIds,
  onClose,
  onConfirm,
}: Omit<PickerProps, "open">) {
  const { t } = useI18n();
  const [first, setFirst] = useState(initialIds[0] || commits[0]?.id || "");
  const [second, setSecond] = useState(initialIds[1] || commits[1]?.id || commits[0]?.id || "");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (mode === "compare") {
      if (!first || !second || first === second) {
        setError(t("vpick.sameVersion"));
        return;
      }
      onConfirm([first, second]);
      return;
    }
    if (!first) {
      setError(t("vpick.chooseRestore"));
      return;
    }
    onConfirm([first]);
  }

  return (
    <Dialog
      title={mode === "compare" ? t("vpick.titleCompare") : t("vpick.titleRestore")}
      onClose={onClose}
      className="max-w-lg p-6"
    >
      <p className="mb-3 text-[13px] text-muted">
        {mode === "compare"
          ? t("vpick.leadCompare")
          : t("vpick.leadRestore")}
      </p>
      <VersionSelect
        label={mode === "compare" ? t("vpick.first") : t("vpick.version")}
        value={first}
        commits={commits}
        onChange={(id) => {
          setFirst(id);
          setError(null);
        }}
      />
      {mode === "compare" && (
        <VersionSelect
          label={t("vpick.second")}
          value={second}
          commits={commits}
          onChange={(id) => {
            setSecond(id);
            setError(null);
          }}
        />
      )}
      <DialogError message={error} />
      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {t("ui.cancel")}
        </Button>
        <Button onClick={submit}>{mode === "compare" ? t("vpick.compare") : t("vpick.next")}</Button>
      </DialogActions>
    </Dialog>
  );
}
