import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { APP_LOCALE } from "../../lib/format-date";

/**
 * Danh sách dạng hàng kiểu GitHub (repo list) — dùng cho MỌI danh sách project
 * (Khám phá / Dự án của tôi / Bảng xếp hạng / trang creator / Home).
 *
 * `cols` đặt trên `RowList` (một grid duy nhất); hàng tiêu đề và hàng nội dung
 * dùng `subgrid` nên cột `auto` được tính chung cho cả danh sách và luôn thẳng
 * hàng — đừng canh cột bằng padding tay.
 * Dưới `md` grid tự xếp chồng thành 1 cột; những ô phụ nên tự ẩn ở kích thước
 * đó thay vì ép bảng cuộn ngang.
 */
export function RowList({
  cols = "",
  children,
  className = "",
}: {
  cols?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-card border border-border bg-surface md:grid md:gap-x-3 md:[&>*]:col-span-full ${cols} ${className}`}
    >
      {children}
    </div>
  );
}

export function RowHeader({ children }: { children: ReactNode }) {
  return (
    <div
      className="hidden h-[34px] items-center border-b border-border bg-surface-subtle px-3.5 text-xs font-bold uppercase tracking-wide text-muted md:grid md:grid-cols-subgrid md:gap-x-3"
    >
      {children}
    </div>
  );
}

export function RowItem({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-[68px] flex-col gap-2 border-b border-border px-3.5 py-3 transition-colors last:border-b-0 hover:bg-surface-subtle md:grid md:grid-cols-subgrid md:items-center md:gap-x-3 ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Ô tên dự án: tiêu đề là link (phần tử tương tác duy nhất trong ô), dòng phụ
 * bên dưới là text thường — để không lồng link/button vào nhau.
 */
export function RowTitle({
  href,
  name,
  meta,
  leading,
}: {
  href: string;
  name: string;
  meta?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {leading}
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link href={href} className="truncate text-[13px] font-semibold hover:text-accent hover:underline">
          {name}
        </Link>
        {meta && <span className="truncate text-xs text-muted">{meta}</span>}
      </div>
    </div>
  );
}

/** Số liệu (lượt nghe, fork…) — canh trái trong ô cố định bề ngang. */
export function RowStat({
  icon: Icon,
  value,
  title,
}: {
  icon: LucideIcon;
  value: number;
  title: string;
}) {
  return (
    <span title={title} className="flex items-center gap-1.5 font-mono text-xs text-muted">
      <Icon className="h-3.5 w-3.5" />
      {value.toLocaleString(APP_LOCALE)}
    </span>
  );
}

/** Mốc thời gian — luôn dùng mono theo quy ước font (CLAUDE.md 4.7). */
export function RowTime({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap font-mono text-xs text-muted md:text-right">{children}</span>;
}
