import type { ReactNode } from "react";

/**
 * Giống RowItem nhưng báo cho trang biết hàng nào đang được rê chuột / focus bàn phím,
 * để chòm sao tương ứng sáng lên. Chỉ là hiệu ứng nhìn: không gọi API nào.
 */
export function GalaxyRow({
  children,
  onActiveChange,
}: {
  children: ReactNode;
  onActiveChange: (active: boolean) => void;
}) {
  return (
    <div
      onPointerEnter={() => onActiveChange(true)}
      onPointerLeave={() => onActiveChange(false)}
      onFocus={() => onActiveChange(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onActiveChange(false);
      }}
      className="flex min-h-[68px] flex-col gap-2 border-b border-border px-3.5 py-3 transition-colors last:border-b-0 hover:bg-surface-subtle focus-within:bg-surface-subtle md:grid md:grid-cols-subgrid md:items-center md:gap-x-3"
    >
      {children}
    </div>
  );
}
