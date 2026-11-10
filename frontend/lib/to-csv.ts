/**
 * Xuất CSV an toàn cho bảng quản trị (UC-104).
 *
 * Ba điều kiện bắt buộc:
 *  1. BOM UTF-8 ở đầu file — Excel trên Windows/macOS mở tiếng Việt đúng font.
 *  2. Escape theo RFC 4180: ô chứa `,` / `\n` / `\r` / `"` được bọc ngoặc kép,
 *     `"` bên trong thành `""`.
 *  3. Chống CSV injection: ô bắt đầu bằng `=`, `+`, `-`, `@`, `\t`, `\r` được
 *     thêm tiền tố `'` để Excel/Sheets không chạy công thức.
 */

export const CSV_BOM = "﻿";

/** Trần số dòng cho một lần xuất CSV — tránh tràn bộ nhớ trình duyệt. */
export const CSV_MAX_ROWS = 10_000;

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

export interface CsvColumn<T> {
  /** Tiêu đề cột trong file CSV. */
  header: string;
  /** Giá trị ô; `null`/`undefined` được ghi thành chuỗi rỗng. */
  value: (row: T) => string | number | null | undefined;
}

/** Vô hiệu hoá công thức: thêm `'` vào trước ký tự nguy hiểm ở đầu ô. */
export function escapeCsvFormula(value: string): string {
  if (value.length === 0) return value;
  if (FORMULA_PREFIXES.includes(value[0])) return `'${value}`;
  return value;
}

/** Escape một ô theo RFC 4180 + chống công thức. */
export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "number" ? String(value) : value;
  const guarded = escapeCsvFormula(raw);
  if (/[",\n\r]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

/** Dựng nội dung CSV (không BOM) từ dữ liệu và cột. */
export function toCsv<T>(data: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((column) => escapeCsvCell(column.header)).join(",");
  const rows = data.map((row) =>
    columns
      .map((column) => escapeCsvCell(column.value(row)))
      .join(","),
  );
  return [header, ...rows].join("\r\n");
}

/** Dựng nội dung CSV kèm BOM UTF-8. */
export function toCsvWithBom<T>(data: T[], columns: CsvColumn<T>[]): string {
  return CSV_BOM + toCsv(data, columns);
}

/**
 * Tải file CSV xuống máy.
 *
 * @param data        dữ liệu xuất
 * @param columns     định nghĩa cột
 * @param filename    tên file (thêm `.csv` nếu thiếu)
 */
export function exportToCsv<T>(
  data: T[],
  columns: CsvColumn<T>[],
  filename: string,
): void {
  const rows = data.slice(0, CSV_MAX_ROWS);
  const csv = toCsvWithBom(rows, columns);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export interface CsvPage<T> {
  items: T[];
  nextCursor: string | null;
}

/**
 * Lặp trang theo cursor để gom dữ liệu rồi xuất 1 file CSV.
 *
 * Dừng khi đã đủ `CSV_MAX_ROWS` dòng hoặc hết trang — không bao giờ vượt trần,
 * để không tràn bộ nhớ trình duyệt.
 *
 * @returns số dòng đã xuất
 */
export async function exportPaginatedCsv<T>(
  fetchPage: (cursor: string | null) => Promise<CsvPage<T>>,
  columns: CsvColumn<T>[],
  filename: string,
  onProgress?: (count: number) => void,
): Promise<number> {
  const rows: T[] = [];
  let cursor: string | null = null;

  while (rows.length < CSV_MAX_ROWS) {
    const page = await fetchPage(cursor);
    const remaining = CSV_MAX_ROWS - rows.length;
    rows.push(...page.items.slice(0, remaining));
    onProgress?.(rows.length);
    if (!page.nextCursor || page.items.length === 0) break;
    cursor = page.nextCursor;
  }

  exportToCsv(rows, columns, filename);
  return rows.length;
}
