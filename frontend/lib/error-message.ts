import { ApiError } from "./api-client";
import { getLang, tNow, type Lang, type TKey, type Vars } from "./i18n";

const API_MESSAGES: Record<string, Record<Lang, string>> = {
  "Choose a license before making the project public": { en: "Choose a license before making the project public.", vi: "Hãy chọn giấy phép trước khi công khai dự án." },
  "Unverified account cannot make project public": { en: "Verify your email address before making a project public.", vi: "Hãy xác minh địa chỉ email trước khi công khai dự án." },
  "Unverified account cannot open a pull request": { en: "Verify your email address before opening a pull request.", vi: "Hãy xác minh địa chỉ email trước khi mở pull request." },
  "Tags may only contain letters, numbers, hyphens and spaces": { en: "Tags may only contain letters, numbers, hyphens and spaces.", vi: "Thẻ chỉ gồm chữ, số, dấu gạch ngang và khoảng trắng." },
  "A project can have at most 5 tags": { en: "A project can have at most 5 tags.", vi: "Một dự án có tối đa 5 thẻ." },
  "Pick two different versions to compare": { en: "Pick two different versions to compare.", vi: "Hãy chọn hai phiên bản khác nhau để so sánh." },
  "Project not found": { en: "Project not found. It may have been deleted, or you may not have permission to view it.", vi: "Không tìm thấy dự án. Có thể dự án đã bị xoá hoặc bạn không có quyền xem." },
  "Branch not found": { en: "Branch not found. It may have just been deleted — reload the page.", vi: "Không tìm thấy nhánh. Có thể nhánh vừa bị xoá — hãy tải lại trang." },
  "Commit not found": { en: "Version not found. Reload the page.", vi: "Không tìm thấy phiên bản này. Hãy tải lại trang." },
  "Commit to restore not found": { en: "The version to restore was not found. Reload the page.", vi: "Không tìm thấy phiên bản cần khôi phục. Hãy tải lại trang." },
  "Target commit not found": { en: "The version to compare was not found. Reload the page.", vi: "Không tìm thấy phiên bản cần so sánh. Hãy tải lại trang." },
  "Base commit not found": { en: "The base version to compare against was not found. Reload the page.", vi: "Không tìm thấy phiên bản gốc để so sánh. Hãy tải lại trang." },
  "Starting commit not found": { en: "The branch's starting commit was not found. Reload the page.", vi: "Không tìm thấy commit bắt đầu của nhánh. Hãy tải lại trang." },
  "Source branch not found": { en: "Source branch not found. Reload the page.", vi: "Không tìm thấy nhánh nguồn. Hãy tải lại trang." },
  "Target branch not found": { en: "Target branch not found. Reload the page.", vi: "Không tìm thấy nhánh đích. Hãy tải lại trang." },
  "Target branch does not exist": { en: "The branch you want to switch to no longer exists. Reload the page.", vi: "Nhánh muốn chuyển tới không còn tồn tại. Hãy tải lại trang." },
  "Current branch not found": { en: "The open branch was not found. Reload the page.", vi: "Không tìm thấy nhánh đang mở. Hãy tải lại trang." },
  "Default branch not found": { en: "This project has no default branch yet.", vi: "Dự án chưa có nhánh mặc định." },
  "User not found": { en: "User not found.", vi: "Không tìm thấy người dùng." },
  "Custom sound not found": { en: "Sound not found. You may have just deleted it in another tab — reload.", vi: "Không tìm thấy âm thanh này. Có thể bạn vừa xoá nó ở thẻ khác — hãy tải lại." },
  "Profile not found": { en: "Profile not found.", vi: "Không tìm thấy hồ sơ." },
  "You do not have access to this project": { en: "You don't have access to this project.", vi: "Bạn không có quyền truy cập dự án này." },
  "You do not have edit access to this project": { en: "You don't have permission to edit this project.", vi: "Bạn không có quyền chỉnh sửa dự án này." },
  "You do not have edit permission on this project": { en: "You don't have permission to edit this project.", vi: "Bạn không có quyền chỉnh sửa dự án này." },
  "You do not have access to this branch": { en: "You don't have access to this branch.", vi: "Bạn không có quyền truy cập nhánh này." },
  "Admin privileges required": { en: "Only administrators can do this.", vi: "Chỉ quản trị viên mới làm được thao tác này." },
  "Account is not active": { en: "This account is not active.", vi: "Tài khoản không ở trạng thái hoạt động." },
  "This notification cannot be turned off": { en: "This type of notification is always sent, so it can't be turned off.", vi: "Loại thông báo này luôn được gửi nên không thể tắt." },
  "Project is no longer available": { en: "This project is no longer public, so it can't be forked.", vi: "Dự án này không còn công khai nên không thể fork." },
  "You cannot fork your own project": { en: "You can't fork your own project.", vi: "Bạn không thể fork dự án của chính mình." },
  "Title is required": { en: "Enter a title for the pull request.", vi: "Hãy nhập tiêu đề cho pull request." },
  "Title must not exceed 150 characters": { en: "The title can be at most 150 characters.", vi: "Tiêu đề tối đa 150 ký tự." },
  "Description must not exceed 2000 characters": { en: "The description can be at most 2000 characters.", vi: "Mô tả tối đa 2000 ký tự." },
  "Comment is required": { en: "Enter a comment.", vi: "Hãy nhập nội dung bình luận." },
  "Comment must not exceed 2000 characters": { en: "Comments can be at most 2000 characters.", vi: "Bình luận tối đa 2000 ký tự." },
  "There is nothing to propose": { en: "Nothing to propose: the fork has no new changes compared with the original project.", vi: "Không có gì để đề xuất: bản fork chưa có thay đổi mới so với dự án gốc." },
  "There is nothing to merge": { en: "Nothing left to merge: these changes are already in the target project.", vi: "Không còn gì để hợp nhất: các thay đổi này đã có trong dự án đích." },
  "This project is not a fork": { en: "Only forked projects can open a pull request.", vi: "Chỉ dự án được fork mới tạo được pull request." },
  "The original project is no longer available": { en: "Can't send the proposal because the original project is no longer public. The fork is still yours.", vi: "Không gửi được đề xuất vì dự án gốc không còn công khai. Bản fork vẫn là của bạn." },
  "Too many requests, please try again later": { en: "You're going too fast. Wait a few minutes and try again.", vi: "Bạn thao tác quá nhanh. Hãy đợi vài phút rồi thử lại." },
  "Draft was changed elsewhere": { en: "The draft was just updated in another tab. Resolve the draft conflict in the editor, then try again.", vi: "Bản nháp vừa được cập nhật ở tab khác. Hãy xử lý xung đột nháp trong trình soạn nhạc rồi thử lại." },
  "An open pull request already exists": { en: "There is already an open pull request for this pair of branches.", vi: "Đã có một pull request đang mở cho cặp nhánh này." },
  "Pull request is no longer open": { en: "This pull request was already handled by someone else. Reload the page.", vi: "Pull request này đã được xử lý bởi người khác. Hãy tải lại trang." },
  "Pull request not found": { en: "Pull request not found.", vi: "Không tìm thấy pull request này." },
  "This pull request can no longer be merged": { en: "This pull request can no longer be merged because the project or source branch no longer exists.", vi: "Pull request này không còn hợp nhất được vì dự án hoặc nhánh nguồn không còn tồn tại." },
  "This pull request can no longer be commented on": { en: "You can no longer comment on this pull request.", vi: "Bạn không còn quyền bình luận trong pull request này." },
  "You cannot merge this pull request": { en: "You don't have permission to merge this pull request.", vi: "Bạn không có quyền hợp nhất pull request này." },
  "You cannot close this pull request": { en: "You don't have permission to close this pull request.", vi: "Bạn không có quyền đóng pull request này." },
  "The branches are not related": { en: "These two branches share no history, so they can't be compared.", vi: "Hai nhánh này không có lịch sử chung nên không so sánh được." },
  "Start the merge before resolving conflicts": { en: "Start the merge first so the system can check for conflicts.", vi: "Hãy bấm hợp nhất trước để hệ thống kiểm tra xung đột." },
  "Notification not found": { en: "Notification not found. Reload the list.", vi: "Không tìm thấy thông báo này. Hãy tải lại danh sách." },
  "Archived projects are read-only. Restore the project first": { en: "Archived projects are view-only. Restore the project before editing.", vi: "Dự án đã lưu trữ chỉ để xem. Hãy khôi phục dự án trước khi chỉnh sửa." },
  "Account is not suspended": { en: "This account is not suspended.", vi: "Tài khoản này không bị đình chỉ." },
  "Cannot act on an administrator account or your own account": { en: "You can't act on an administrator account or your own account.", vi: "Không thể thao tác trên tài khoản quản trị viên hoặc tài khoản của chính bạn." },
  "Username confirmation does not match": { en: "The confirmation username doesn't match.", vi: "Username xác nhận không khớp." },
  "Username already taken": { en: "This username is already taken. Choose another.", vi: "Username này đã có người dùng. Hãy chọn tên khác." },
  "A branch with this name already exists in the project": { en: "The project already has a branch with this name. Choose another name.", vi: "Dự án đã có nhánh trùng tên. Hãy đặt tên khác." },
  "Tag name already exists in this project": { en: "This tag name is already used in the project. Choose another name.", vi: "Tên tag này đã được dùng trong dự án. Hãy chọn tên khác." },
  "Working draft is identical to the most recent commit": { en: "The draft is identical to the latest version — there are no changes to commit.", vi: "Bản nháp giống hệt phiên bản gần nhất — chưa có thay đổi nào để commit." },
  "Selected commit is already the most recent version on this branch": { en: "This version is already the latest on the branch, so there is nothing to restore.", vi: "Phiên bản này đang là phiên bản mới nhất của nhánh, không cần khôi phục." },
  "Branch has moved on with new commits. Please review changes.": { en: "The branch just received a new commit from elsewhere. Reload the page to review the changes before committing.", vi: "Nhánh vừa có commit mới từ nơi khác. Hãy tải lại trang để xem thay đổi trước khi commit." },
  "Target branch has moved on since this merge was started. Please restart the merge.": { en: "The target branch changed while you were merging. Start the merge again.", vi: "Nhánh đích vừa thay đổi trong lúc bạn hợp nhất. Hãy bắt đầu hợp nhất lại." },
  "Nothing to merge. Source branch has no commits the target does not already contain.": { en: "Nothing to merge — the target branch already has every commit of this branch.", vi: "Không có gì để hợp nhất — nhánh đích đã có mọi commit của nhánh này." },
  "Branches have no common ancestor": { en: "The two branches have no common point, so they can't be merged.", vi: "Hai nhánh không có điểm chung nên không hợp nhất được." },
  "Branches must belong to the same project": { en: "Both branches must belong to the same project.", vi: "Hai nhánh phải thuộc cùng một dự án." },
  "Project has no commits yet. Branching is unavailable.": { en: "This project has no commits yet. Make your first commit before creating a branch.", vi: "Dự án chưa có commit nào. Hãy commit lần đầu rồi mới tạo nhánh." },
  "Project has only one branch": { en: "The project has only one branch.", vi: "Dự án chỉ có một nhánh." },
  "Cannot delete the default branch": { en: "The default branch can't be deleted.", vi: "Không thể xoá nhánh mặc định." },
  "Cannot delete the branch currently open in the editor — switch to another branch first": { en: "This branch is open in the editor. Switch to another branch before deleting it.", vi: "Nhánh này đang mở trong editor. Hãy chuyển sang nhánh khác trước khi xoá." },
  "Cannot compare commits from different projects": { en: "Versions from two different projects can't be compared.", vi: "Không thể so sánh phiên bản của hai dự án khác nhau." },
  "Cannot restore a commit from a different project": { en: "A version from another project can't be restored.", vi: "Không thể khôi phục phiên bản của dự án khác." },
  "Current password is incorrect": { en: "The current password is incorrect.", vi: "Mật khẩu hiện tại không đúng." },
  "Branch is the working branch of a collaborator": { en: "A collaborator has chosen this branch as their working branch, so it can't be deleted yet. Ask them to switch to another branch first.", vi: "Có cộng tác viên đang chọn nhánh này làm nhánh làm việc nên chưa xoá được. Hãy nhờ họ chuyển sang nhánh khác trước." },
  "Commit history is too large to analyse": { en: "This project's commit history is too large to analyze right now. Contact an administrator.", vi: "Lịch sử commit của dự án quá lớn để phân tích lúc này. Hãy liên hệ người quản trị." },
  "Failed to fetch commit tags": { en: "Couldn't load the commit tags. Try again.", vi: "Chưa tải được tag của các commit. Hãy thử lại." },
  "Avatar file was not uploaded": { en: "The image wasn't fully uploaded. Try again.", vi: "Ảnh chưa được tải lên đầy đủ. Hãy thử lại." },
  "Avatar file is too large": { en: "The image is larger than 2 MB and can't be used. Choose a smaller image.", vi: "Ảnh lớn hơn 2 MB nên không dùng được. Hãy chọn ảnh nhỏ hơn." },
  "Invalid avatar path": { en: "Invalid avatar. Try uploading again.", vi: "Ảnh đại diện không hợp lệ. Hãy thử tải lại." },
  "Could not verify avatar file": { en: "Couldn't check the image you just uploaded. Try again.", vi: "Chưa kiểm tra được ảnh vừa tải lên. Hãy thử lại." },
  "Could not save avatar": { en: "Couldn't save the avatar. Try again.", vi: "Chưa lưu được ảnh đại diện. Hãy thử lại." },
  "Could not remove avatar": { en: "Couldn't remove the avatar. Try again.", vi: "Chưa xoá được ảnh đại diện. Hãy thử lại." },
  "New password must be different from the current password": { en: "The new password must be different from the current password.", vi: "Mật khẩu mới phải khác mật khẩu hiện tại." },
  "Password is incorrect": { en: "The password is incorrect.", vi: "Mật khẩu không đúng." },
  "Could not update password": { en: "Couldn't change the password. Try again.", vi: "Không đổi được mật khẩu. Hãy thử lại." },
  "Session revoked or not found": { en: "This session was revoked. Sign in again.", vi: "Phiên đăng nhập đã bị thu hồi. Hãy đăng nhập lại." },
  "Session not found": { en: "This session no longer exists. Sign in again.", vi: "Phiên đăng nhập không còn. Hãy đăng nhập lại." },
  "Missing bearer token": { en: "You need to sign in to continue.", vi: "Bạn cần đăng nhập để tiếp tục." },
  "Missing X-Session-Id header": { en: "Invalid session. Sign in again.", vi: "Phiên đăng nhập không hợp lệ. Hãy đăng nhập lại." },
  "Invalid or expired token": { en: "Your session has expired. Sign in again.", vi: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại." },
  "Message must not exceed 200 characters": { en: "The commit message can be at most 200 characters.", vi: "Nội dung commit tối đa 200 ký tự." },
  "Message is required": { en: "The commit message can't be empty.", vi: "Nội dung commit không được để trống." },
  "Tag name is required": { en: "The tag name can't be empty.", vi: "Tên tag không được để trống." },
  "Tag name must not exceed 30 characters": { en: "The tag name can be at most 30 characters.", vi: "Tên tag tối đa 30 ký tự." },
  "Branch name is required": { en: "The branch name can't be empty.", vi: "Tên nhánh không được để trống." },
  "Branch name must not exceed 50 characters": { en: "The branch name can be at most 50 characters.", vi: "Tên nhánh tối đa 50 ký tự." },
  "username must be 3-20 chars: lowercase letters, digits, _": { en: "Username must be 3–20 characters: lowercase letters, digits and underscores only.", vi: "Username dài 3–20 ký tự, chỉ gồm chữ thường, chữ số và dấu gạch dưới." },
  "No account matches the provided identifier": { en: "No account matches this information.", vi: "Không tìm thấy tài khoản ứng với thông tin này." },
  "An invitation is already pending for this person": { en: "An invitation for this person is already pending — no need to invite again.", vi: "Lời mời cho người này đang chờ — không cần mời lại." },
  "This person is already a collaborator": { en: "This person is already a collaborator on the project.", vi: "Người này đã là cộng tác viên của dự án." },
  "You are the project owner and already have full access": { en: "You own this project, so you don't need to invite yourself.", vi: "Bạn là chủ dự án, không cần mời chính mình." },
  "The project already has 10 collaborators (including pending invitations)": { en: "The project already has 10 collaborators (including pending invitations).", vi: "Dự án đã đủ 10 cộng tác viên (kể cả lời mời đang chờ)." },
  "Collaborator not found": { en: "Collaborator not found — they may have just been removed. Reload.", vi: "Không tìm thấy cộng tác viên này — có thể vừa được gỡ. Hãy tải lại." },
  "Invitation not found": { en: "This invitation no longer exists — it may have been handled. Reload.", vi: "Lời mời này không còn tồn tại — có thể đã được xử lý. Hãy tải lại." },
  "The project owner cannot be removed": { en: "The project owner can't be removed from the collaborator list.", vi: "Không thể gỡ chủ dự án khỏi danh sách cộng tác viên." },
  "Comment not found": { en: "This comment no longer exists. Reload the page.", vi: "Bình luận này không còn tồn tại. Hãy tải lại trang." },
  "Comment body must not be empty": { en: "The comment can't be empty.", vi: "Nội dung bình luận không được để trống." },
  "Comment body must not exceed 1000 characters": { en: "Comments can be at most 1000 characters.", vi: "Bình luận tối đa 1000 ký tự." },
  "Only one level of replies is allowed": { en: "Only one level of replies is allowed — you can't reply to a reply.", vi: "Chỉ được trả lời 1 cấp — không thể trả lời bình luận đã là trả lời." },
  "You are not allowed to delete this comment": { en: "You can't delete someone else's comment.", vi: "Bạn không thể xoá bình luận của người khác." },
  "Jam event not found": { en: "Jam event not found — it may have just been cancelled. Reload.", vi: "Không tìm thấy sự kiện Jam này — có thể vừa được huỷ. Hãy tải lại." },
  "The jam has not started yet": { en: "The Jam hasn't started yet. Come back when it opens.", vi: "Sự kiện Jam chưa bắt đầu. Hãy quay lại đúng giờ mở." },
  "The jam has already ended": { en: "The Jam has ended.", vi: "Sự kiện Jam đã kết thúc." },
  "Your account is not active": { en: "Your account is not active, so you can't join.", vi: "Tài khoản của bạn không ở trạng thái hoạt động nên không tham gia được." },
  "The jam room is full": { en: "The Jam room is full. Try another event.", vi: "Phòng Jam hiện đã đầy. Hãy thử sự kiện khác." },
  "Jam event has not ended yet": { en: "This Jam is still running. Redirecting you to the Jam room…", vi: "Sự kiện Jam này vẫn đang diễn ra. Đang chuyển hướng bạn đến phòng Jam..." },
  "Failed to load jam result": { en: "Couldn't load the Jam result. Please try again.", vi: "Không thể tải kết quả sự kiện Jam. Vui lòng thử lại." },
  "This jam has ended and can no longer be configured": { en: "This Jam has ended and can't be reconfigured. Create a new event.", vi: "Sự kiện Jam đã kết thúc — không thể cấu hình lại. Hãy tạo sự kiện mới." },
  "The new end time must be in the future": { en: "The new end time must be in the future.", vi: "Thời gian kết thúc mới phải là thời điểm trong tương lai." },
  "The end time is not a valid date": { en: "The end time is not valid.", vi: "Thời gian kết thúc không hợp lệ." },
  "The starting project does not exist": { en: "The starting project doesn't exist. Choose another project.", vi: "Dự án khởi đầu không tồn tại. Hãy chọn một dự án khác." },
  "The starting project must be public": { en: "Only public projects can be used as the starting project.", vi: "Chỉ dự án công khai mới được dùng làm dự án khởi đầu." },
  "A running jam cannot be cancelled; end it instead": { en: "A running event can't be cancelled — use “End now”.", vi: "Sự kiện đang diễn ra không thể huỷ — hãy dùng “Kết thúc ngay”." },
  "Only a scheduled jam can be cancelled": { en: "Only events that haven't started can be cancelled. Ended events can't be cancelled.", vi: "Chỉ sự kiện chưa bắt đầu mới huỷ được. Sự kiện đã kết thúc không huỷ được." },
  "Cannot configure an ended jam event": { en: "The event has ended, so its settings can't be changed.", vi: "Sự kiện đã kết thúc, không thể thay đổi cấu hình." },
  "Cannot modify immutable fields while jam is active": { en: "Core details can't be edited while the event is running.", vi: "Không thể chỉnh sửa thông tin cốt lõi khi sự kiện đang diễn ra." },
  "Only scheduled events can be cancelled": { en: "Only events that haven't started can be cancelled.", vi: "Chỉ có thể hủy sự kiện chưa bắt đầu." },
  "New end time must be in the future": { en: "The new end time must be in the future.", vi: "Thời gian kết thúc mới phải là thời điểm trong tương lai." },
  "New end time must be in the future and after start time": { en: "Invalid end time. It must be later than both the current time and the start time.", vi: "Thời gian kết thúc không hợp lệ. Thời gian phải lớn hơn thời điểm hiện tại và thời gian bắt đầu." },
  "Mã định danh sự kiện Jam không hợp lệ.": { en: "The Jam event identifier is not valid.", vi: "Mã định danh sự kiện Jam không hợp lệ." },
  "Không tìm thấy sự kiện Community Jam yêu cầu.": { en: "The requested Community Jam event was not found.", vi: "Không tìm thấy sự kiện Community Jam yêu cầu." },
  "Sự kiện Jam này đã kết thúc trước đó.": { en: "This Jam event has already ended.", vi: "Sự kiện Jam này đã kết thúc trước đó." },
  "Không thể kết thúc sự kiện Jam đã bị hủy bỏ.": { en: "A cancelled Jam event can't be ended.", vi: "Không thể kết thúc sự kiện Jam đã bị hủy bỏ." },
  "Không thể lưu trữ bản nhạc cuối cùng của sự kiện Jam. Vui lòng thử lại.": { en: "Couldn't save the final track of the Jam event. Please try again.", vi: "Không thể lưu trữ bản nhạc cuối cùng của sự kiện Jam. Vui lòng thử lại." },
  "Lỗi hệ thống khi cập nhật trạng thái sự kiện. Vui lòng thử lại sau.": { en: "A system error occurred while updating the event status. Please try again later.", vi: "Lỗi hệ thống khi cập nhật trạng thái sự kiện. Vui lòng thử lại sau." },
  "Order not found": { en: "Payment order not found. It may belong to another account.", vi: "Không tìm thấy đơn thanh toán. Có thể đơn thuộc tài khoản khác." },
  "Could not read the order": { en: "Couldn't load the payment order. Please try again.", vi: "Không tải được đơn thanh toán. Hãy thử lại." },
  "Could not complete the order": { en: "Couldn't record the payment result. Please try again.", vi: "Không ghi nhận được kết quả thanh toán. Hãy thử lại." },
  "Could not read subscription": { en: "Couldn't load your current plan. Please try again.", vi: "Không tải được gói bạn đang dùng. Hãy thử lại." },
  "Could not read plans": { en: "Couldn't load the plans. Please try again.", vi: "Không tải được danh sách gói. Hãy thử lại." },
  "Default plan is not configured": { en: "The free plan isn't set up yet. Please contact an administrator.", vi: "Gói miễn phí chưa được thiết lập. Hãy liên hệ quản trị viên." },
  "Payment provider unavailable": { en: "Payment isn't available right now. Please try again later.", vi: "Hiện chưa thanh toán được, vui lòng thử lại sau." },
  "Plan not found": { en: "This plan no longer exists. Reload the page.", vi: "Không tìm thấy gói này. Hãy tải lại trang." },
  "Plan is no longer available": { en: "This plan is no longer available. Reload the page to see current plans.", vi: "Gói này không còn mở bán. Hãy tải lại trang để xem các gói hiện có." },
  "You already have a paid plan": { en: "You already have a paid plan. Use \"Change plan\" instead.", vi: "Bạn đang dùng gói trả phí. Hãy dùng \"Đổi gói\"." },
  "You do not have a paid plan": { en: "You are on the free plan. Use \"Upgrade\" instead.", vi: "Bạn đang ở gói miễn phí. Hãy dùng \"Nâng cấp\"." },
  "You are already on this plan": { en: "You are already on this plan.", vi: "Bạn đang dùng gói này rồi." },
  "Only a more expensive plan can be bought as an upgrade": { en: "Only a more expensive plan can be bought as an upgrade.", vi: "Chỉ nâng cấp được lên gói có giá cao hơn." },
  "Only your current paid plan can be renewed": { en: "Only your current paid plan can be renewed.", vi: "Chỉ gia hạn được gói trả phí bạn đang dùng." },
  "This plan does not need payment": { en: "This plan is free and doesn't need payment.", vi: "Gói này miễn phí, không cần thanh toán." },
  "Could not create the order": { en: "Couldn't create the payment order. Please try again.", vi: "Không tạo được đơn thanh toán. Hãy thử lại." },
  "Could not read transactions": { en: "Couldn't load your transactions. Please try again.", vi: "Không tải được giao dịch. Hãy thử lại." },
  "Could not read your account": { en: "Couldn't load your account. Please try again.", vi: "Không tải được tài khoản của bạn. Hãy thử lại." },
  "Invalid webhook signature": { en: "Invalid payment notification.", vi: "Thông báo thanh toán không hợp lệ." },
  "Transaction not found": { en: "Transaction not found. It may belong to another account.", vi: "Không tìm thấy giao dịch. Có thể giao dịch thuộc tài khoản khác." },
  "This transaction already has an open issue": { en: "This transaction already has an issue being handled.", vi: "Giao dịch này đã có sự cố đang được xử lý." },
  "Could not report the issue": { en: "Couldn't send the issue. Please try again.", vi: "Không gửi được sự cố. Hãy thử lại." },
  "Default plan cannot be deactivated": { en: "The default plan can't be disabled.", vi: "Không thể tắt gói mặc định." },
  "Plan name already exists": { en: "A plan with this name already exists. Choose another name.", vi: "Đã có gói trùng tên. Hãy chọn tên khác." },
  "Subscription plan not found": { en: "Plan not found. Reload the page.", vi: "Không tìm thấy gói. Hãy tải lại trang." },
  "Payment issue not found": { en: "Payment issue not found. Reload the page.", vi: "Không tìm thấy sự cố thanh toán. Hãy tải lại trang." },
  "The from date must be before the to date": { en: "The start date must be before the end date.", vi: "Ngày bắt đầu phải trước ngày kết thúc." },
  "Could not update plan price": { en: "Couldn't schedule the price change. Please try again.", vi: "Không hẹn được lịch đổi giá. Hãy thử lại." },
  "Could not update plan status": { en: "Couldn't change the plan status. Please try again.", vi: "Không đổi được trạng thái gói. Hãy thử lại." },
  "Could not read default plan": { en: "Couldn't load the plans. Please try again.", vi: "Không tải được danh sách gói. Hãy thử lại." },
  "Could not read transaction": { en: "Couldn't load the transaction. Please try again.", vi: "Không tải được giao dịch. Hãy thử lại." },
  "Could not read the reporter": { en: "Couldn't load the payment issue. Please try again.", vi: "Không tải được sự cố thanh toán. Hãy thử lại." },
  "Could not read payment issues": { en: "Couldn't load payment issues. Please try again.", vi: "Không tải được sự cố thanh toán. Hãy thử lại." },
  "Invalid cursor": { en: "The list is out of date. Reload the page.", vi: "Danh sách đã cũ. Hãy tải lại trang." },
  "Description must be 1 to 500 characters": { en: "The description must be 1 to 500 characters.", vi: "Mô tả phải có từ 1 đến 500 ký tự." },
  "Could not update subscription": { en: "Couldn't save the change to your plan. Nothing was changed — please try again.", vi: "Không lưu được thay đổi gói. Chưa có gì thay đổi, hãy thử lại." },
  "No active paid plan to change": { en: "Your plan changed in the meantime. Reload the page.", vi: "Gói của bạn vừa thay đổi. Hãy tải lại trang." },
  "No plan change is scheduled": { en: "There is no scheduled plan change to cancel.", vi: "Không có lịch chuyển gói nào để huỷ." },
  "No active paid plan to cancel": { en: "You don't have a renewing paid plan to cancel.", vi: "Bạn không có gói trả phí đang gia hạn để huỷ." },
  "Only a canceled plan that is still running can be resumed": { en: "Only a canceled plan that is still running can be resumed. If it has ended, subscribe again.", vi: "Chỉ tiếp tục được gói đã huỷ nhưng còn hạn. Nếu gói đã hết hạn, hãy đăng ký lại." },
  "Resume your plan before scheduling a change": { en: "Your plan is canceled. Resume it before scheduling a change.", vi: "Gói của bạn đã được huỷ. Hãy tiếp tục gói trước khi đặt lịch đổi gói." },
  "Renew your plan before scheduling a change": { en: "Your paid period has ended. Renew it before scheduling a change.", vi: "Kỳ đã trả đã kết thúc. Hãy gia hạn trước khi đặt lịch đổi gói." },
  "Could not read your theme": { en: "Couldn't load your theme settings. Please try again.", vi: "Không tải được thiết lập giao diện của bạn. Hãy thử lại." },
  "Could not save theme": { en: "Couldn't save your theme. Please try again.", vi: "Không lưu được theme của bạn. Hãy thử lại." },
  "Could not apply theme": { en: "Couldn't apply your theme. Please try again.", vi: "Không áp dụng được theme của bạn. Hãy thử lại." },
  "Paid access required": { en: "This feature requires a STAVE+ plan.", vi: "Tính năng này yêu cầu gói STAVE+." },
  "palette must contain exactly the 10 allowed CSS variables with valid oklch(L C H) values": { en: "The generated palette couldn't be saved. Please try again.", vi: "Không lưu được bảng màu vừa tạo. Hãy thử lại." },
  "Cannot renew while downgrade is scheduled": { en: "Cancel the scheduled plan change before renewing.", vi: "Hãy huỷ lịch chuyển gói trước khi gia hạn." },
  "Payment provider unavailable, issue stays open": { en: "The payment provider could not be checked, so the issue stays open. Dismiss it instead, or try again later.", vi: "Chưa đối chiếu được với cổng thanh toán, sự cố vẫn mở. Hãy đánh dấu bỏ qua hoặc thử lại sau." },
  "Payment issue is already resolved": { en: "This issue was already resolved.", vi: "Sự cố này đã được xử lý." },
  "A note is required to resolve the issue": { en: "Add a note explaining the remedy, then try again.", vi: "Cần ghi chú giải thích biện pháp. Hãy bổ sung rồi thử lại." },
  "The note can be at most 1000 characters": { en: "The note is too long. Keep it under 1000 characters.", vi: "Ghi chú quá dài. Hãy giữ dưới 1000 ký tự." },
  "The original transaction was not successful": { en: "The original transaction was not successful, so this remedy cannot be applied.", vi: "Giao dịch gốc chưa thành công nên không áp dụng được biện pháp này." },
  "The original transaction has no account or plan": { en: "The original transaction has no account or plan, so this remedy cannot be applied.", vi: "Giao dịch gốc không gắn với tài khoản hay gói nên không áp dụng được biện pháp này." },
  "The account has no subscription to compensate": { en: "The account has no subscription to compensate.", vi: "Tài khoản không có đăng ký nào để đền bù." },
  "Could not resolve the payment issue": { en: "The remedy could not be applied. The issue stays open — please try again.", vi: "Không áp dụng được biện pháp. Sự cố vẫn mở — hãy thử lại." },
};

const VIETNAMESE = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

export function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const lang = getLang();
    const known = API_MESSAGES[err.message]?.[lang];
    if (known) return known;
    if (lang === "vi" && VIETNAMESE.test(err.message)) return err.message;
    if (err.message.startsWith('Cannot create a branch named "')) return tNow("err.branchName");
    if (err.status === 401) return tNow("err.sessionExpired");
    if (err.status === 403) return tNow("err.forbidden");
    if (err.status === 404) return `${fallback} ${tNow("err.notFound")}`;
    if (err.status === 409) return `${fallback} ${tNow("err.conflict")}`;
    if (err.status === 413) return `${fallback} ${tNow("err.tooLarge")}`;
    if (err.status === 429) return tNow("err.rateLimit");
    if (err.status >= 500) return `${fallback} ${tNow("err.server")}`;
    return fallback;
  }
  if (err instanceof TypeError) {
    return `${fallback} ${tNow("err.network")}`;
  }
  return fallback;
}

const AUTH_CODES = [
  "invalid_credentials",
  "identity_already_exists",
  "manual_linking_disabled",
  "single_identity_not_deletable",
  "identity_not_found",
  "access_denied",
  "email_not_confirmed",
  "user_already_exists",
  "email_exists",
  "weak_password",
  "same_password",
  "email_address_invalid",
  "over_email_send_rate_limit",
  "over_request_rate_limit",
  "otp_expired",
  "user_banned",
  "session_not_found",
  "session_expired",
  "signup_disabled",
  "validation_failed",
] as const;

type AuthCode = (typeof AUTH_CODES)[number];

function isAuthCode(code: string): code is AuthCode {
  return (AUTH_CODES as readonly string[]).includes(code);
}

export function authErrorMessage(error: { code?: string; message?: string; status?: number } | null | undefined): string {
  if (!error) return tNow("err.generic");
  if (error.code && isAuthCode(error.code)) return tNow(`autherr.${error.code}` as TKey);
  if (error.status === 429) return tNow("autherr.over_request_rate_limit");
  if (error.message && /fetch/i.test(error.message)) return tNow("err.network");
  return tNow("err.generic");
}

export interface ErrorSource {
  err: unknown;
  fallback: TKey;
  vars?: Vars;
  text?: string;
  auth?: AuthErrorLike;
}

type AuthErrorLike = { code?: string; message?: string; status?: number } | null | undefined;

export function errorSource(err: unknown, fallback: TKey, vars?: Vars): ErrorSource {
  return { err, fallback, vars };
}

export function authErrorSource(error: AuthErrorLike): ErrorSource {
  return { err: null, fallback: "err.generic", auth: error ?? null };
}

export function rawErrorSource(text: string): ErrorSource {
  return { err: null, fallback: "err.generic", text };
}

export function renderError(source: ErrorSource | null | undefined): string | null {
  if (!source) return null;
  if (source.text !== undefined) return source.text;
  if (source.auth !== undefined) return authErrorMessage(source.auth);
  return apiErrorMessage(source.err, tNow(source.fallback, source.vars));
}
