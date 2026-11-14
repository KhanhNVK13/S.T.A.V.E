"use client";

import { useId } from "react";
import { useT } from "../../context/i18n-context";
import type { ProjectLicense } from "../../lib/license";
import type { NewProjectVisibility } from "../../lib/new-project";
import { LicensePicker } from "./license-picker";

export function NewProjectVisibilityField({
  visibility,
  license,
  onVisibilityChange,
  onLicenseChange,
  disabled = false,
}: {
  visibility: NewProjectVisibility;
  license: ProjectLicense;
  onVisibilityChange: (next: NewProjectVisibility) => void;
  onLicenseChange: (next: ProjectLicense) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const name = useId();
  const options: { value: NewProjectVisibility; label: string; desc: string }[] = [
    { value: "private", label: t("new.visPrivate"), desc: t("new.visPrivateDesc") },
    { value: "public", label: t("new.visPublic"), desc: t("new.visPublicDesc") },
  ];
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="mb-1 text-[13px] font-semibold text-foreground">{t("new.visibility")}</legend>
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-start gap-3 rounded-card border border-border p-3 hover:bg-surface-subtle has-[:checked]:border-accent"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={visibility === option.value}
              onChange={() => onVisibilityChange(option.value)}
              className="mt-1 accent-accent"
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-foreground">{option.label}</span>
              <span className="block text-xs text-muted">{option.desc}</span>
            </span>
          </label>
        ))}
        {visibility === "public" && <p className="text-xs text-muted">{t("new.visPublicNote")}</p>}
      </fieldset>
      {visibility === "public" && <LicensePicker value={license} onChange={onLicenseChange} disabled={disabled} />}
    </div>
  );
}
