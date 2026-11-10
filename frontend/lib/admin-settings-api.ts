import type {
  PlatformSettingsResponse,
  ReductionConfirmationRequired,
  SettingsValidationError,
  UpdateSettingsRequest,
  UpdateSettingsResponse,
} from "@stave/shared-types";
import { ApiError, apiFetch } from "./api-client";

export function getPlatformSettings(signal?: AbortSignal): Promise<PlatformSettingsResponse> {
  return apiFetch<PlatformSettingsResponse>("/admin/settings", { signal });
}

export function updatePlatformSettings(
  request: UpdateSettingsRequest,
  signal?: AbortSignal,
): Promise<UpdateSettingsResponse> {
  return apiFetch<UpdateSettingsResponse>("/admin/settings", {
    method: "PUT",
    body: JSON.stringify(request),
    signal,
  });
}

function bodyOf(err: unknown, status: number): Record<string, unknown> | null {
  if (!(err instanceof ApiError) || err.status !== status) return null;
  return typeof err.body === "object" && err.body !== null ? (err.body as Record<string, unknown>) : null;
}

export function readReductionRequired(err: unknown): ReductionConfirmationRequired | null {
  const body = bodyOf(err, 409);
  if (!body || body.requiresConfirmation !== true) return null;
  const max = Number(body.maxUsageBytes);
  return Number.isFinite(max) ? { requiresConfirmation: true, maxUsageBytes: max } : null;
}

export function readValidationErrors(err: unknown): SettingsValidationError[] | null {
  const body = bodyOf(err, 400);
  if (!body || !Array.isArray(body.errors)) return null;
  const errors = body.errors.filter(
    (e): e is SettingsValidationError =>
      typeof e === "object" && e !== null && typeof (e as { key?: unknown }).key === "string" && typeof (e as { code?: unknown }).code === "string",
  );
  return errors.length > 0 ? errors : null;
}
