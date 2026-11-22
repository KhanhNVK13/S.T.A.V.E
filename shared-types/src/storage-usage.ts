export type StorageCategoryKey = "custom_sounds" | "audio_sketches" | "avatar";

export interface StorageCategoryUsage {
  key: StorageCategoryKey;
  usedBytes: number;
  count: number;
  quotaBytes: number | null;
  maxFileBytes: number;
}

/** GET /users/me/storage */
export interface StorageUsage {
  categories: StorageCategoryUsage[];
  plan: { name: string; extraStorageBytes: number };
}
