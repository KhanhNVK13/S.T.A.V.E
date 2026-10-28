"use client";

import { useState } from "react";
import type { BranchHistoryCommit } from "../../lib/api-client";
import { Button } from "../ui/button";
import { Dialog, DialogActions, DialogError } from "../ui/dialog";
import { INPUT_CLASS } from "../ui/form";

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
          <optgroup label="Phiên bản có tag">
            {tagged.map((c) => (
              <option key={`tag-${c.id}`} value={c.id}>
                {versionLabel(c)}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Tất cả commit">
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
  const [first, setFirst] = useState(initialIds[0] || commits[0]?.id || "");
  const [second, setSecond] = useState(initialIds[1] || commits[1]?.id || commits[0]?.id || "");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (mode === "compare") {
      if (!first || !second || first === second) {
        setError("Hãy chọn hai phiên bản khác nhau để so sánh.");
        return;
      }
      onConfirm([first, second]);
      return;
    }
    if (!first) {
      setError("Hãy chọn phiên bản cần khôi phục.");
      return;
    }
    onConfirm([first]);
  }

  return (
    <Dialog
      title={mode === "compare" ? "Chọn phiên bản để so sánh" : "Chọn phiên bản để khôi phục"}
      onClose={onClose}
      className="max-w-lg p-6"
    >
      <p className="mb-3 text-[13px] text-muted">
        {mode === "compare"
          ? "Chọn hai phiên bản, kể cả khi chúng nằm ở hai nhánh khác nhau. Phiên bản có tag được xếp lên đầu danh sách."
          : "Phiên bản có tag được xếp lên đầu danh sách. Bước sau sẽ cho bạn xác nhận trước khi khôi phục."}
      </p>
      <VersionSelect
        label={mode === "compare" ? "Phiên bản thứ nhất" : "Phiên bản"}
        value={first}
        commits={commits}
        onChange={(id) => {
          setFirst(id);
          setError(null);
        }}
      />
      {mode === "compare" && (
        <VersionSelect
          label="Phiên bản thứ hai"
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
          Huỷ
        </Button>
        <Button onClick={submit}>{mode === "compare" ? "So sánh" : "Tiếp tục"}</Button>
      </DialogActions>
    </Dialog>
  );
}
