"use client";

import { useId } from "react";
import { LICENSES, LICENSE_DESC_KEYS, LICENSE_NAME_KEYS, type ProjectLicense } from "../../lib/license";
import { useT } from "../../context/i18n-context";

export function LicensePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: ProjectLicense;
  onChange: (next: ProjectLicense) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1 text-[13px] font-semibold text-foreground">{t("lic.legend")}</legend>
      {LICENSES.map((license) => (
        <label
          key={license}
          className="flex cursor-pointer items-start gap-3 rounded-card border border-border p-3 hover:bg-surface-subtle has-[:checked]:border-accent"
        >
          <input
            type="radio"
            name={name}
            value={license}
            checked={value === license}
            onChange={() => onChange(license)}
            className="mt-1 accent-accent"
          />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-foreground">{t(LICENSE_NAME_KEYS[license])}</span>
            <span className="block text-xs text-muted">{t(LICENSE_DESC_KEYS[license])}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
