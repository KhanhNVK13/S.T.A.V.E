import Link from "next/link";

/**
 * Brand mark: khối vuông bo góc màu `foreground` với 3 thanh cao thấp khác nhau
 * (gợi hình thanh nhạc / biểu đồ commit). Dùng token nên tự đổi theo theme.
 */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 items-end justify-center gap-[2px] rounded-md bg-foreground px-1.5 py-[7px]">
        <span className="h-[7px] w-[3px] rounded-sm bg-surface" />
        <span className="h-[13px] w-[3px] rounded-sm bg-surface" />
        <span className="h-[10px] w-[3px] rounded-sm bg-surface" />
      </span>
      <span className="text-[15px] font-bold tracking-wide">STAVE</span>
    </Link>
  );
}
