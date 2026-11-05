import { tNow } from "./i18n";
interface NamedAuthor {
  id?: string | null;
  username?: string | null;
  display_name?: string | null;
}

/** Tên tác giả để hiển thị; tác giả không còn (tài khoản đã xoá) được gọi rõ là "Tài khoản đã xoá". */
export function formatAuthorName(author: NamedAuthor | null | undefined): string {
  if (!author?.id) return tNow('lib.deletedAccount');
  return author.display_name ?? author.username ?? tNow('lib.user');
}
