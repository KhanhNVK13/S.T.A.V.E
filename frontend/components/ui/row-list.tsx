import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/**
 * Danh sách dạng hàng kiểu GitHub (repo list) — dùng cho MỌI danh sách project
 * (Khám phá / Dự án của tôi / Bảng xếp hạng / trang creator / Home).
 *
 * Hàng tiêu đề và hàng nội dung phải dùng CHUNG một chuỗi grid-template
 * (tham số `cols`) thì cột mới thẳng hàng — đừng canh cột bằng padding tay.
 * Dưới `md` grid tự xếp chồng thành 1 cột; những ô phụ nên tự ẩn ở kích thước
 * đó thay vì ép bảng cuộn ngang.
 */
export function RowList({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-card border border-border bg-surface ${className}`}>
      {children}
    </div>
  );
}

export function RowHeader({ cols, children }: { cols: string; children: ReactNode }) {
  return (
    <div
      className={`hidden h-[34px] items-center gap-3 border-b border-border bg-surface-subtle px-3.5 text-[10px] font-bold uppercase tracking-wide text-muted md:grid ${cols}`}
    >
      {children}
    </div>
  );
}

export function RowItem({
  cols,
  children,
  className = "",
}: {
  cols: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-[68px] flex-col gap-2 border-b border-border px-3.5 py-3 transition-colors last:border-b-0 hover:bg-surface-subtle md:grid md:items-center md:gap-3 ${cols} ${className}`}
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
        {meta && <span className="truncate text-[11px] text-muted">{meta}</span>}
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
    <span title={title} className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
      <Icon className="h-3.5 w-3.5" />
      {value.toLocaleString("vi-VN")}
    </span>
  );
}

/** Mốc thời gian — luôn dùng mono theo quy ước font (CLAUDE.md 4.7). */
export function RowTime({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[10px] text-muted md:text-right">{children}</span>;
}
