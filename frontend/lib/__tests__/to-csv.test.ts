import { describe, expect, it, vi } from "vitest";
import {
  CSV_BOM,
  CSV_MAX_ROWS,
  escapeCsvCell,
  escapeCsvFormula,
  exportPaginatedCsv,
  exportToCsv,
  toCsv,
  toCsvWithBom,
  type CsvColumn,
} from "../to-csv";

interface Row {
  id: string;
  amount: number;
  note: string | null;
}

const COLUMNS: CsvColumn<Row>[] = [
  { header: "Mã", value: (row) => row.id },
  { header: "Số tiền", value: (row) => row.amount },
  { header: "Ghi chú", value: (row) => row.note },
];

describe("to-csv — BOM UTF-8", () => {
  it("đặt BOM ở byte đầu của file", () => {
    const csv = toCsvWithBom([{ id: "a", amount: 1, note: null }], COLUMNS);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
  });

  it("BOM là ký tự U+FEFF dài 1", () => {
    expect(CSV_BOM).toBe("﻿");
    expect(CSV_BOM.length).toBe(1);
  });

  it("không có BOM trong bản CSV thô (chỉ bản tải file mới có)", () => {
    const csv = toCsv([{ id: "a", amount: 1, note: null }], COLUMNS);
    expect(csv.charCodeAt(0)).not.toBe(0xfeff);
  });
});

describe("to-csv — escape theo RFC 4180", () => {
  it("bọc ngoặc kép khi ô chứa dấu phẩy", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
  });

  it("bọc ngoặc kép khi ô chứa xuống dòng", () => {
    expect(escapeCsvCell("dòng 1\ndòng 2")).toBe('"dòng 1\ndòng 2"');
  });

  it("bọc ngoặc kép khi ô chứa carriage return", () => {
    expect(escapeCsvCell("a\rb")).toBe('"a\rb"');
  });

  it("nhân đôi dấu ngoặc kép bên trong ô", () => {
    expect(escapeCsvCell('nói "xin chào"')).toBe('"nói ""xin chào"""');
  });

  it("ô thường không bị bọc ngoặc kép", () => {
    expect(escapeCsvCell("STAVE+")).toBe("STAVE+");
  });

  it("null và undefined thành chuỗi rỗng", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("số được chuyển thành chuỗi", () => {
    expect(escapeCsvCell(49000)).toBe("49000");
  });

  it("dựng hàng đúng số cột, phân tách bằng CRLF", () => {
    const csv = toCsv(
      [
        { id: "a", amount: 1, note: "x" },
        { id: "b", amount: 2, note: null },
      ],
      COLUMNS,
    );
    expect(csv).toBe("Mã,Số tiền,Ghi chú\r\na,1,x\r\nb,2,");
  });

  it("giá trị chứa dấu phẩy trong dữ liệu vẫn tách cột đúng", () => {
    const csv = toCsv([{ id: "a", amount: 1, note: "x,y" }], COLUMNS);
    expect(csv).toBe('Mã,Số tiền,Ghi chú\r\na,1,"x,y"');
  });
});

describe("to-csv — chống CSV injection", () => {
  it.each(["=", "+", "-", "@", "\t", "\r"])(
    "tiền tố nguy hiểm %j được vô hiệu hoá",
    (prefix) => {
      const value = `${prefix}SUM(A1:A9)`;
      expect(escapeCsvFormula(value)).toBe(`'${value}`);
    },
  );

  it("ô bắt đầu bằng dấu = trong xuất CSV có tiền tố dấu nháy đơn", () => {
    expect(escapeCsvCell("=1+1")).toBe("'=1+1");
    expect(escapeCsvCell("@cmd")).toBe("'@cmd");
  });

  it("ô bắt đầu bằng - được bảo vệ", () => {
    expect(escapeCsvCell("-2+3")).toBe("'-2+3");
  });

  it("ô chứa ký tự nguy hiểm nhưng không ở đầu thì không đổi", () => {
    expect(escapeCsvCell("an toàn")).toBe("an toàn");
    expect(escapeCsvCell("a=b")).toBe("a=b");
  });

  it("ô rỗng không bị thêm tiền tố", () => {
    expect(escapeCsvCell("")).toBe("");
  });

  it("ô vừa bị chống injection vừa chứa dấu phẩy thì vẫn escape ngoặc kép", () => {
    expect(escapeCsvCell("=1,2")).toBe('"\'=1,2"');
  });
});

describe("to-csv — dữ liệu rỗng", () => {
  it("vẫn xuất dòng tiêu đề khi không có dữ liệu", () => {
    const csv = toCsv([], COLUMNS);
    expect(csv).toBe("Mã,Số tiền,Ghi chú");
    expect(csv.split("\r\n")).toHaveLength(1);
  });

  it("bản có BOM với dữ liệu rỗng vẫn bắt đầu bằng BOM", () => {
    const csv = toCsvWithBom([], COLUMNS);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe("Mã,Số tiền,Ghi chú");
  });
});

describe("to-csv — giới hạn và tải file", () => {
  /**
   * jsdom không có `URL.createObjectURL` và `Blob.text()`. Thay vì dựng blob thật,
   * ta chặn constructor `Blob` để lấy đúng chuỗi được ghi ra — đó là nội dung
   * file CSV thực sự (kèm BOM).
   */
  function stubBlobAndObjectUrl(): {
    captured: { text: string; type: string }[];
    restore: () => void;
  } {
    const captured: { text: string; type: string }[] = [];
    const OriginalBlob = globalThis.Blob;
    const originalCreate = (URL as any).createObjectURL;

    class StubBlob {
      type: string;
      constructor(parts: unknown[], options?: { type?: string }) {
        this.type = options?.type ?? "";
        captured.push({
          text: parts.map((part) => String(part)).join(""),
          type: this.type,
        });
      }
    }
    (globalThis as any).Blob = StubBlob;
    (URL as any).createObjectURL = () => "blob:test";
    (URL as any).revokeObjectURL = () => {};

    return {
      captured,
      restore: () => {
        globalThis.Blob = OriginalBlob;
        (URL as any).createObjectURL = originalCreate;
      },
    };
  }

  it("trần số dòng là 10.000", () => {
    expect(CSV_MAX_ROWS).toBe(10_000);
  });

  it("exportToCsv chỉ ghi tối đa 10.000 dòng dữ liệu", () => {
    const rows: Row[] = Array.from({ length: CSV_MAX_ROWS + 50 }, (_, index) => ({
      id: `id-${index}`,
      amount: index,
      note: null,
    }));
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const element = originalCreate(tag);
      if (tag === "a") (element as HTMLAnchorElement).click = () => {};
      return element;
    });
    const { captured, restore } = stubBlobAndObjectUrl();

    exportToCsv(rows, COLUMNS, "giao-dich");

    expect(captured).toHaveLength(1);
    expect(captured[0].type).toContain("text/csv");
    const lines = captured[0].text.replace(/^﻿/, "").split("\r\n");
    // 1 dòng tiêu đề + tối đa 10.000 dòng dữ liệu.
    expect(lines).toHaveLength(CSV_MAX_ROWS + 1);
    expect(lines[lines.length - 1]).toContain(`id-${CSV_MAX_ROWS - 1}`);
    restore();
  });

  it("file xuất bắt đầu bằng BOM UTF-8", () => {
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const element = originalCreate(tag);
      if (tag === "a") (element as HTMLAnchorElement).click = () => {};
      return element;
    });
    const { captured, restore } = stubBlobAndObjectUrl();

    exportToCsv([{ id: "a", amount: 1, note: null }], COLUMNS, "giao-dich");

    expect(captured[0].text.charCodeAt(0)).toBe(0xfeff);
    restore();
  });

  it("tên file thiếu đuôi .csv được thêm", () => {
    const originalCreate = document.createElement.bind(document);
    let download = "";
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const element = originalCreate(tag);
      if (tag === "a") {
        (element as HTMLAnchorElement).click = () => {};
        Object.defineProperty(element, "download", {
          set(value: string) {
            download = value;
          },
          get() {
            return download;
          },
        });
      }
      return element;
    });
    const { restore } = stubBlobAndObjectUrl();

    exportToCsv([{ id: "a", amount: 1, note: null }], COLUMNS, "giao-dich");

    expect(download).toBe("giao-dich.csv");
    restore();
  });
});

describe("to-csv — xuất lặp trang theo cursor", () => {
  function stubDownload(): { texts: string[]; restore: () => void } {
    const texts: string[] = [];
    const OriginalBlob = globalThis.Blob;
    const originalCreate = (URL as any).createObjectURL;
    class StubBlob {
      type: string;
      constructor(parts: unknown[], options?: { type?: string }) {
        this.type = options?.type ?? "";
        texts.push(parts.map((part) => String(part)).join(""));
      }
    }
    (globalThis as any).Blob = StubBlob;
    (URL as any).createObjectURL = () => "blob:test";
    (URL as any).revokeObjectURL = () => {};
    const originalElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const element = originalElement(tag);
      if (tag === "a") (element as HTMLAnchorElement).click = () => {};
      return element;
    });
    return {
      texts,
      restore: () => {
        globalThis.Blob = OriginalBlob;
        (URL as any).createObjectURL = originalCreate;
      },
    };
  }

  it("lặp qua các trang cho tới khi hết cursor", async () => {
    const { texts, restore } = stubDownload();
    const cursors: (string | null)[] = [];

    const count = await exportPaginatedCsv(
      async (cursor) => {
        cursors.push(cursor);
        if (cursor === null) {
          return {
            items: [
              { id: "a", amount: 1, note: null },
              { id: "b", amount: 2, note: null },
            ],
            nextCursor: "c2",
          };
        }
        return {
          items: [{ id: "c", amount: 3, note: null }],
          nextCursor: null,
        };
      },
      COLUMNS,
      "giao-dich",
    );

    expect(count).toBe(3);
    expect(cursors).toEqual([null, "c2"]);
    const lines = texts[0].replace(/^﻿/, "").split("\r\n");
    expect(lines).toHaveLength(4);
    restore();
  });

  it("dừng ở trần 10.000 dòng", async () => {
    const { texts, restore } = stubDownload();
    let calls = 0;

    const count = await exportPaginatedCsv(
      async () => {
        calls += 1;
        const items: Row[] = Array.from({ length: 100 }, (_, index) => ({
          id: `id-${index}`,
          amount: index,
          note: null,
        }));
        return { items, nextCursor: `cursor-${calls}` };
      },
      COLUMNS,
      "giao-dich",
    );

    expect(count).toBe(CSV_MAX_ROWS);
    const lines = texts[0].replace(/^﻿/, "").split("\r\n");
    expect(lines).toHaveLength(CSV_MAX_ROWS + 1);
    restore();
  });

  it("báo tiến độ qua onProgress", async () => {
    const { restore } = stubDownload();
    const counts: number[] = [];

    await exportPaginatedCsv(
      async (cursor) =>
        cursor === null
          ? { items: [{ id: "a", amount: 1, note: null }], nextCursor: "c2" }
          : { items: [{ id: "b", amount: 2, note: null }], nextCursor: null },
      COLUMNS,
      "giao-dich",
      (count) => counts.push(count),
    );

    expect(counts).toEqual([1, 2]);
    restore();
  });

  it("trang rỗng thì dừng ngay, không gọi lại", async () => {
    const { restore } = stubDownload();
    let calls = 0;

    const count = await exportPaginatedCsv(
      async () => {
        calls += 1;
        return { items: [], nextCursor: "c2" };
      },
      COLUMNS,
      "giao-dich",
    );

    expect(count).toBe(0);
    expect(calls).toBe(1);
    restore();
  });
});
