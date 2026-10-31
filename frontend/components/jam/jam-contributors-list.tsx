"use client";

import { Music4 } from "lucide-react";
import type { JamContributorDto } from "@stave/shared-types";
import { Avatar } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { EmptyState } from "../ui/empty-state";

/**
 * UC-68 — danh sách nghệ sĩ đã đóng góp vào sự kiện Jam đã kết thúc
 * (`jam_participants.edit_count > 0`, sort giảm theo số thao tác).
 */
export function JamContributorsList({
  contributors,
}: {
  contributors: JamContributorDto[];
}) {
  if (contributors.length === 0) {
    return (
      <EmptyState
        icon={Music4}
        title="Không có đóng góp"
        description="Sự kiện đã kết thúc mà không có đóng góp nào."
      />
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Nghệ sĩ tham gia đóng góp</h3>
      <ul className="space-y-2">
        {contributors.map((c) => {
          const name =
            c.displayName?.trim() || c.username?.trim() || "Người dùng";
          return (
            <li
              key={c.userId}
              className="flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-2.5"
            >
              <Avatar
                id={c.userId}
                label={name}
                imageUrl={c.avatarUrl}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{name}</p>
                {c.username && c.username !== c.displayName && (
                  <p className="truncate text-xs text-muted">@{c.username}</p>
                )}
              </div>
              <Badge variant="info">{c.actionCount} thao tác</Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
