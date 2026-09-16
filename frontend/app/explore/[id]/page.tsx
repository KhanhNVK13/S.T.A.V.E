import { redirect } from "next/navigation";

/**
 * Trang tổng quan dự án đã gộp về `/projects/[id]` — MỘT trang duy nhất cho cả
 * chủ dự án lẫn người ngoài (mô hình GitHub), khác nhau chỉ ở hành động khả
 * dụng. Route cũ giữ lại để link đã chia sẻ trước đây không chết.
 */
export default async function LegacyPublicProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/projects/${id}`);
}
