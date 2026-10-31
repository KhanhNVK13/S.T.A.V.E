"use client";

import Link from "next/link";
import { Snowflake } from "lucide-react";
import { Button } from "../ui/button";

export interface JamFrozenBannerProps {
  eventId: string;
}

/**
 * UC-95 (BR-70) — banner đóng băng hiện khi sự kiện vừa kết thúc (nhận
 * `jam:ended` / `jam:event_ended` hoặc `event.status === 'ended'`). Piano
 * roll lúc này ở chế độ chỉ đọc; banner dẫn người tham gia về trang kết
 * quả (UC-68: nghe lại hoặc Fork).
 */
export function JamFrozenBanner({ eventId }: JamFrozenBannerProps) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-accent/30 bg-accent-muted px-4 py-3"
    >
      <span className="flex items-center gap-2 text-sm">
        <Snowflake className="h-4 w-4 text-accent" />
        Sự kiện Jam đã kết thúc! Bản nhạc đã được đóng băng. Bạn có thể nghe
        lại tác phẩm hoặc Fork về không gian cá nhân.
      </span>
      <Link href={`/jam/${eventId}/result`}>
        <Button variant="secondary">Xem kết quả Jam</Button>
      </Link>
    </div>
  );
}
