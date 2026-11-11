import type { TKey } from "./i18n";

export const LICENSES = ["CC-BY", "CC-BY-SA", "CC-BY-NC"] as const;
export type ProjectLicense = (typeof LICENSES)[number];

export const DEFAULT_LICENSE: ProjectLicense = "CC-BY";

export const LICENSE_NAME_KEYS: Record<ProjectLicense, TKey> = {
  "CC-BY": "lic.ccBy",
  "CC-BY-SA": "lic.ccBySa",
  "CC-BY-NC": "lic.ccByNc",
};

export const LICENSE_DESC_KEYS: Record<ProjectLicense, TKey> = {
  "CC-BY": "lic.ccBy.desc",
  "CC-BY-SA": "lic.ccBySa.desc",
  "CC-BY-NC": "lic.ccByNc.desc",
};

export function asLicense(value: string | null | undefined): ProjectLicense | null {
  return (LICENSES as readonly string[]).includes(value ?? "") ? (value as ProjectLicense) : null;
}
