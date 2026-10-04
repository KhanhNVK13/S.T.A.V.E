import { ApiError } from "./api-client";

const API_MESSAGES: Record<string, string> = {
  "Project not found": "Không tìm thấy dự án. Có thể dự án đã bị xoá hoặc bạn không có quyền xem.",
  "Branch not found": "Không tìm thấy nhánh. Có thể nhánh vừa bị xoá — hãy tải lại trang.",
  "Commit not found": "Không tìm thấy phiên bản này. Hãy tải lại trang.",
  "Commit to restore not found": "Không tìm thấy phiên bản cần khôi phục. Hãy tải lại trang.",
  "Target commit not found": "Không tìm thấy phiên bản cần so sánh. Hãy tải lại trang.",
  "Base commit not found": "Không tìm thấy phiên bản gốc để so sánh. Hãy tải lại trang.",
  "Starting commit not found": "Không tìm thấy commit bắt đầu của nhánh. Hãy tải lại trang.",
  "Source branch not found": "Không tìm thấy nhánh nguồn. Hãy tải lại trang.",
  "Target branch not found": "Không tìm thấy nhánh đích. Hãy tải lại trang.",
  "Target branch does not exist": "Nhánh muốn chuyển tới không còn tồn tại. Hãy tải lại trang.",
  "Current branch not found": "Không tìm thấy nhánh đang mở. Hãy tải lại trang.",
  "Default branch not found": "Dự án chưa có nhánh mặc định.",
  "User not found": "Không tìm thấy người dùng.",
  "Profile not found": "Không tìm thấy hồ sơ.",
  "You do not have access to this project": "Bạn không có quyền truy cập dự án này.",
  "You do not have edit access to this project": "Bạn không có quyền chỉnh sửa dự án này.",
  "You do not have edit permission on this project": "Bạn không có quyền chỉnh sửa dự án này.",
  "You do not have access to this branch": "Bạn không có quyền truy cập nhánh này.",
  "Admin privileges required": "Chỉ quản trị viên mới làm được thao tác này.",
  "Account is not active": "Tài khoản không ở trạng thái hoạt động.",
  "Account is not suspended": "Tài khoản này không bị đình chỉ.",
  "Cannot act on an administrator account or your own account":
    "Không thể thao tác trên tài khoản quản trị viên hoặc tài khoản của chính bạn.",
  "Username confirmation does not match": "Username xác nhận không khớp.",
  "Username already taken": "Username này đã có người dùng. Hãy chọn tên khác.",
  "A project with this name already exists": "Bạn đã có một dự án trùng tên. Hãy đặt tên khác.",
  "A branch with this name already exists in the project": "Dự án đã có nhánh trùng tên. Hãy đặt tên khác.",
  "Tag name already exists in this project": "Tên tag này đã được dùng trong dự án. Hãy chọn tên khác.",
  "Working draft is identical to the most recent commit":
    "Bản nháp giống hệt phiên bản gần nhất — chưa có thay đổi nào để commit.",
  "Selected commit is already the most recent version on this branch":
    "Phiên bản này đang là phiên bản mới nhất của nhánh, không cần khôi phục.",
  "Branch has moved on with new commits. Please review changes.":
    "Nhánh vừa có commit mới từ nơi khác. Hãy tải lại trang để xem thay đổi trước khi commit.",
  "Target branch has moved on since this merge was started. Please restart the merge.":
    "Nhánh đích vừa thay đổi trong lúc bạn hợp nhất. Hãy bắt đầu hợp nhất lại.",
  "Nothing to merge. Source branch has no commits the target does not already contain.":
    "Không có gì để hợp nhất — nhánh đích đã có mọi commit của nhánh này.",
  "Branches have no common ancestor": "Hai nhánh không có điểm chung nên không hợp nhất được.",
  "Branches must belong to the same project": "Hai nhánh phải thuộc cùng một dự án.",
  "Project has no commits yet. Branching is unavailable.":
    "Dự án chưa có commit nào. Hãy commit lần đầu rồi mới tạo nhánh.",
  "Project has only one branch": "Dự án chỉ có một nhánh.",
  "Cannot delete the default branch": "Không thể xoá nhánh mặc định.",
  "Cannot delete the branch currently open in the editor — switch to another branch first":
    "Nhánh này đang mở trong editor. Hãy chuyển sang nhánh khác trước khi xoá.",
  "Cannot compare commits from different projects": "Không thể so sánh phiên bản của hai dự án khác nhau.",
  "Cannot restore a commit from a different project": "Không thể khôi phục phiên bản của dự án khác.",
  "Current password is incorrect": "Mật khẩu hiện tại không đúng.",
  "Password is incorrect": "Mật khẩu không đúng.",
  "Could not update password": "Không đổi được mật khẩu. Hãy thử lại.",
  "Session revoked or not found": "Phiên đăng nhập đã bị thu hồi. Hãy đăng nhập lại.",
  "Session not found": "Phiên đăng nhập không còn. Hãy đăng nhập lại.",
  "Missing bearer token": "Bạn cần đăng nhập để tiếp tục.",
  "Missing X-Session-Id header": "Phiên đăng nhập không hợp lệ. Hãy đăng nhập lại.",
  "Invalid or expired token": "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
  "Message must not exceed 200 characters": "Nội dung commit tối đa 200 ký tự.",
  "Message is required": "Nội dung commit không được để trống.",
  "Tag name is required": "Tên tag không được để trống.",
  "Tag name must not exceed 30 characters": "Tên tag tối đa 30 ký tự.",
  "Branch name is required": "Tên nhánh không được để trống.",
  "Branch name must not exceed 50 characters": "Tên nhánh tối đa 50 ký tự.",
  "username must be 3-20 chars: lowercase letters, digits, _":
    "Username dài 3–20 ký tự, chỉ gồm chữ thường, chữ số và dấu gạch dưới.",
};

const VIETNAMESE = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const known = API_MESSAGES[err.message];
    if (known) return known;
    if (VIETNAMESE.test(err.message)) return err.message;
    if (err.message.startsWith('Cannot create a branch named "')) {
      return "Tên nhánh này không dùng được. Hãy chọn tên khác.";
    }
    if (err.status === 401) return "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.";
    if (err.status === 403) return "Bạn không có quyền thực hiện thao tác này.";
    if (err.status === 404) return `${fallback} Dữ liệu không còn tồn tại — hãy tải lại trang.`;
    if (err.status === 409) return `${fallback} Dữ liệu vừa thay đổi — hãy tải lại trang rồi thử lại.`;
    if (err.status === 413) return `${fallback} Dữ liệu gửi lên quá lớn.`;
    if (err.status === 429) return "Bạn thao tác quá nhanh. Hãy đợi một lát rồi thử lại.";
    if (err.status >= 500) return `${fallback} Máy chủ đang gặp sự cố, hãy thử lại sau.`;
    return fallback;
  }
  if (err instanceof TypeError) {
    return `${fallback} Không kết nối được máy chủ — kiểm tra mạng rồi thử lại.`;
  }
  return fallback;
}

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: "Email hoặc mật khẩu không đúng.",
  email_not_confirmed: "Email này chưa được xác nhận. Hãy mở thư xác nhận trong hộp thư, hoặc gửi lại thư bên dưới.",
  user_already_exists: "Email này đã được đăng ký. Hãy đăng nhập hoặc dùng \"Quên mật khẩu\".",
  email_exists: "Email này đã được đăng ký. Hãy đăng nhập hoặc dùng \"Quên mật khẩu\".",
  weak_password: "Mật khẩu quá yếu. Hãy dùng ít nhất 8 ký tự, kết hợp chữ và số.",
  same_password: "Mật khẩu mới phải khác mật khẩu cũ.",
  email_address_invalid: "Địa chỉ email không hợp lệ.",
  over_email_send_rate_limit: "Hệ thống vừa gửi thư cho email này. Hãy đợi khoảng 1 phút rồi thử lại.",
  over_request_rate_limit: "Bạn thao tác quá nhanh. Hãy đợi một lát rồi thử lại.",
  otp_expired: "Liên kết đã hết hạn hoặc đã được dùng. Hãy yêu cầu gửi liên kết mới.",
  user_banned: "Tài khoản này đang bị đình chỉ.",
  session_not_found: "Phiên đặt lại mật khẩu không còn hiệu lực. Hãy yêu cầu gửi liên kết mới.",
  session_expired: "Phiên đã hết hạn. Hãy yêu cầu gửi liên kết mới.",
  signup_disabled: "Hiện chưa mở đăng ký tài khoản mới.",
  validation_failed: "Thông tin nhập chưa hợp lệ. Hãy kiểm tra lại.",
};

export function authErrorMessage(error: { code?: string; message?: string; status?: number } | null | undefined): string {
  if (!error) return "Có lỗi xảy ra. Hãy thử lại.";
  if (error.code && AUTH_MESSAGES[error.code]) return AUTH_MESSAGES[error.code];
  if (error.status === 429) return AUTH_MESSAGES.over_request_rate_limit;
  if (error.message && /fetch/i.test(error.message)) {
    return "Không kết nối được máy chủ — kiểm tra mạng rồi thử lại.";
  }
  return "Có lỗi xảy ra. Hãy thử lại.";
}
