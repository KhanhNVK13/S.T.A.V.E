/**
 * Đổi các biểu thức màu CSS (`var(--token)`, `color-mix(...)`) thành chuỗi màu
 * cụ thể mà **canvas 2D** parse được.
 *
 * Vì sao cần: `ctx.fillStyle = "var(--surface)"` KHÔNG hoạt động — canvas
 * không có ngữ cảnh phần tử nên không resolve được biến CSS, và khi gán giá trị
 * không hợp lệ thì canvas **im lặng giữ nguyên màu cũ**, tức lỗi sẽ hiện ra dưới
 * dạng "màu sai" chứ không phải exception. Trước đây piano roll né chuyện này
 * bằng cách hardcode hex, nhưng như vậy thì không đổi theo theme được (UC-78/79).
 *
 * Cách làm: mượn chính trình duyệt để tính — gắn 1 phần tử ẩn vào DOM, đặt
 * `background-color` bằng biểu thức cần resolve rồi đọc `getComputedStyle`.
 * Giá trị trả về luôn là màu đã tính xong (`rgb(...)`/`oklab(...)`), do cùng
 * engine parse nên canvas chắc chắn hiểu.
 */
export function resolveCssColors<K extends string>(
  spec: Record<K, string>,
): Record<K, string> {
  const result = {} as Record<K, string>;

  // SSR / môi trường không có DOM: trả nguyên biểu thức, nơi gọi tự chịu trách
  // nhiệm chỉ vẽ canvas ở phía client.
  if (typeof document === "undefined") {
    return { ...spec };
  }

  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.pointerEvents = "none";
  probe.style.opacity = "0";
  probe.style.width = "0";
  probe.style.height = "0";
  document.body.appendChild(probe);

  try {
    for (const key of Object.keys(spec) as K[]) {
      probe.style.backgroundColor = "";
      probe.style.backgroundColor = spec[key];
      const computed = getComputedStyle(probe).backgroundColor;
      // Biểu thức sai cú pháp → trình duyệt bỏ qua, computed rơi về trong suốt.
      // Giữ lại nguyên bản để lỗi còn nhìn thấy được thay vì vẽ ra màu trong suốt.
      result[key] =
        computed && computed !== "rgba(0, 0, 0, 0)" ? computed : spec[key];
    }
  } finally {
    probe.remove();
  }

  return result;
}
