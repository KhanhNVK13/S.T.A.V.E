import type { Lang } from "./i18n";

export interface TermsSection {
  heading: string;
  paragraphs: string[];
}

export interface TermsDocument {
  title: string;
  updated: string;
  intro: string;
  sections: TermsSection[];
}

const en: TermsDocument = {
  title: "Terms of Use",
  updated: "Version 21 November 2026",
  intro:
    "These terms govern your use of STAVE, a web platform for version control of MIDI music projects. By creating an account you confirm that you have read them and agree to be bound by them. If you do not agree, you may not use STAVE.",
  sections: [
    {
      heading: "1. Who may use STAVE and your account",
      paragraphs: [
        "You must give accurate information when you register and keep your sign-in details secret. You are responsible for everything done through your account, including from devices you have signed in on.",
        "You may have one account for yourself. You may not sell, share or transfer it. Tell us through the report button, or sign out of the other devices on the Sessions page, if you think someone else has used your account.",
        "STAVE may suspend or remove an account that breaks these terms. A suspended account cannot sign in until an administrator reactivates it.",
      ],
    },
    {
      heading: "2. What STAVE does",
      paragraphs: [
        "STAVE lets you edit MIDI projects in the browser and keep their history with commits, branches, merges and comparisons. It also offers sharing, collaboration, pull requests, a public Explore area, timed Community Jam events, audio sketches, custom sounds and a paid STAVE+ plan for personalisation.",
        "Core version control is free. STAVE is provided as a student capstone project and may change, be interrupted or be withdrawn.",
      ],
    },
    {
      heading: "3. Rules for everyone",
      paragraphs: [
        "Do not break the law, harass or threaten anyone, publish hateful, sexual or violent content, spread spam or scams, or impersonate another person or organisation.",
        "Do not try to get around security or limits: no probing for weaknesses, no automated mass requests, no reverse engineering of private parts of the service, no access to other people's private projects or data.",
        "Keep comments, project names, profiles and pull request texts respectful. Administrators may edit or remove content that breaks these rules.",
      ],
    },
    {
      heading: "4. Your content and the licence you choose",
      paragraphs: [
        "You keep ownership of the projects, notes, audio sketches, custom sounds, comments and other material you add (your content). You give STAVE the permission it needs to store, process, display and play your content, and to deliver it to the people you choose, so that the service can work.",
        "New projects are private. Only you and the collaborators you accept can see a private project. When you make a project public you must choose a Creative Commons licence (CC BY, CC BY-SA or CC BY-NC). Other users may view, play, fork and export a public project under that licence. A fork keeps the licence of the original.",
        "You are responsible for your content. Do not upload anything that you do not have the right to share.",
      ],
    },
    {
      heading: "5. Copyright",
      paragraphs: [
        "A melody, a harmony or a MIDI file that copies a song may be protected by copyright even when it contains no recording. Only upload, publish or share music, MIDI files, samples and sounds that you wrote yourself, that you have permission to use, or that are free to use. Material leaked or taken without permission is never allowed.",
        "By uploading content you promise that you own it or have the right to share it, and that it does not infringe anyone's rights.",
        "STAVE treats itself as a host of content added by users. It does not check every project in advance. When a rights holder or an authorised agent reports an infringement, administrators review the report and, if it is justified, remove the project. Removal also hides every fork made from that project, because a fork carries the same material.",
        "To report an infringement, use the Report button on the project and choose copyright. You must give your name, say whether you are the owner or an authorised agent, describe the work, say how you can show your rights, and confirm in good faith that the use is not authorised and that your statement is accurate. A false report may lead to the loss of your own account.",
        "Repeat infringers: an account whose projects have been removed for copyright infringement three or more times may be suspended or removed.",
      ],
    },
    {
      heading: "6. Removed projects and appeals",
      paragraphs: [
        "When a project is removed you are told in your notifications, with the reason. The project is hidden from everyone but is kept for a retention period (30 days unless the administrators set another period) so that a mistake can be corrected.",
        "If you think the removal is wrong you can appeal from the Removed projects section on your Projects page, while the retention period is running. Explain why you have the right to the material. An administrator reviews the appeal. If it is accepted the project, and the forks hidden together with it, are restored. If it is rejected the decision is final for that removal. You can appeal a removal once. After the retention period a removed project may be deleted permanently.",
      ],
    },
    {
      heading: "7. Custom sounds and audio sketches",
      paragraphs: [
        "Audio sketches and custom sounds are stored privately for you and the people allowed to use the project. Each user has a storage quota that is set by STAVE. If you delete a custom sound that other users' projects depend on, the way the sound is kept or removed follows the option you choose when you delete it.",
        "Recordings you make with your microphone must not contain other people's copyrighted recordings or private conversations that you may not share.",
      ],
    },
    {
      heading: "8. Collaboration, pull requests and Community Jam",
      paragraphs: [
        "When you invite a collaborator you decide whether they can only view or also edit. Collaborators can see the history of the project. You remain responsible for what your collaborators add while you own the project.",
        "A pull request shares changes between two projects. The owner of the target project decides whether to merge it. Merged changes become part of that project's history and are not removed when the pull request author later leaves.",
        "Community Jam is a timed event run by administrators. Edits during a jam use a simple last write wins rule and no commits are made until the event ends, when the result is saved as one project. Take part respectfully.",
      ],
    },
    {
      heading: "9. AI assistance",
      paragraphs: [
        "STAVE can suggest a commit message, describe the risk of a merge and explain music theory patterns. These suggestions are produced by rules first; an AI service only helps to word the explanation. STAVE does not use AI to compose music for you.",
        "Only a short summary of changes is sent to the AI service, never your sign-in details. Suggestions can be wrong; check them before you use them. If the AI service is unavailable STAVE continues to work without it.",
      ],
    },
    {
      heading: "10. STAVE+ and payments",
      paragraphs: [
        "STAVE+ is a paid plan that unlocks personalisation features such as themes made from an image. The price shown when you subscribe is locked for your subscription. A price change applies only from the date announced to you.",
        "Payments are processed by a third-party payment provider. STAVE activates a plan only after the provider confirms the payment. If you believe a payment is wrong, use the payment problem report on the Billing page. You can cancel at any time; a cancelled plan stays active until the end of the period you paid for.",
      ],
    },
    {
      heading: "11. Personal data",
      paragraphs: [
        "STAVE stores the data you give it (email, display name, profile, projects, comments, sessions and subscription records) and technical records needed to run and protect the service, such as sign-in sessions and activity logs.",
        "We use your data to provide the service, keep it secure, send the notifications you can control in your settings, and handle reports. We do not sell your data. Other public information, such as the name of a public project and your public profile, can be seen by every visitor.",
        "You can delete your account from your profile. Deleting the account removes your projects and files, subject to the keeping of records that the law or the handling of an open report requires.",
      ],
    },
    {
      heading: "12. Suspension and ending of use",
      paragraphs: [
        "You can stop using STAVE and delete your account whenever you want. STAVE can suspend or remove an account or content that breaks these terms, that is the subject of a justified copyright report, or that puts the service or other users at risk.",
        "Administrators record important actions, such as removals and restorations, in an audit log.",
      ],
    },
    {
      heading: "13. No guarantees and limits of responsibility",
      paragraphs: [
        "STAVE is provided as it is. We work to keep your projects safe, but we cannot promise that the service will always be available or free of errors, and you should export important work. Within the limits allowed by law, STAVE and its authors are not responsible for lost data, for loss of profit, or for the content that users add.",
      ],
    },
    {
      heading: "14. Changes and governing law",
      paragraphs: [
        "We may update these terms. When the terms change in a way that matters, you will be asked to accept the new version before you continue. These terms are governed by the laws of Vietnam.",
      ],
    },
  ],
};

const vi: TermsDocument = {
  title: "Điều khoản sử dụng",
  updated: "Phiên bản ngày 21 tháng 11 năm 2026",
  intro:
    "Các điều khoản này điều chỉnh việc bạn sử dụng STAVE, nền tảng web quản lý phiên bản cho dự án nhạc MIDI. Khi tạo tài khoản, bạn xác nhận đã đọc và đồng ý bị ràng buộc bởi các điều khoản này. Nếu không đồng ý, bạn không được sử dụng STAVE.",
  sections: [
    {
      heading: "1. Ai được sử dụng STAVE và tài khoản của bạn",
      paragraphs: [
        "Bạn phải cung cấp thông tin chính xác khi đăng ký và giữ bí mật thông tin đăng nhập. Bạn chịu trách nhiệm cho mọi hoạt động qua tài khoản của mình, kể cả trên các thiết bị bạn đã đăng nhập.",
        "Mỗi người chỉ có một tài khoản cho riêng mình. Bạn không được bán, chia sẻ hoặc chuyển nhượng tài khoản. Nếu nghi ngờ người khác dùng tài khoản của bạn, hãy đăng xuất các thiết bị khác ở trang Phiên đăng nhập hoặc báo cho chúng tôi.",
        "STAVE có thể đình chỉ hoặc gỡ tài khoản vi phạm điều khoản. Tài khoản bị đình chỉ không đăng nhập được cho tới khi quản trị viên kích hoạt lại.",
      ],
    },
    {
      heading: "2. STAVE làm gì",
      paragraphs: [
        "STAVE cho phép bạn chỉnh sửa dự án MIDI ngay trên trình duyệt và giữ lịch sử bằng commit, nhánh, hợp nhất và so sánh. STAVE còn có chia sẻ, cộng tác, pull request, khu Khám phá công khai, sự kiện Community Jam theo giờ, bản thu nháp âm thanh, âm thanh tuỳ chỉnh và gói STAVE+ trả phí để cá nhân hoá giao diện.",
        "Quản lý phiên bản cốt lõi là miễn phí. STAVE được cung cấp như một đồ án tốt nghiệp của sinh viên và có thể thay đổi, bị gián đoạn hoặc ngừng hoạt động.",
      ],
    },
    {
      heading: "3. Quy tắc cho mọi người dùng",
      paragraphs: [
        "Không vi phạm pháp luật, quấy rối hoặc đe doạ người khác, đăng nội dung thù hận, khiêu dâm hoặc bạo lực, phát tán spam hoặc lừa đảo, hay mạo danh người hoặc tổ chức khác.",
        "Không tìm cách vượt qua cơ chế bảo mật hoặc giới hạn: không dò tìm lỗ hổng, không gửi yêu cầu tự động hàng loạt, không dịch ngược các phần riêng tư của dịch vụ, không truy cập dự án hay dữ liệu riêng tư của người khác.",
        "Hãy giữ văn minh trong bình luận, tên dự án, hồ sơ và nội dung pull request. Quản trị viên có thể sửa hoặc gỡ nội dung vi phạm các quy tắc này.",
      ],
    },
    {
      heading: "4. Nội dung của bạn và giấy phép bạn chọn",
      paragraphs: [
        "Bạn giữ quyền sở hữu các dự án, nốt nhạc, bản thu nháp âm thanh, âm thanh tuỳ chỉnh, bình luận và tài liệu khác bạn thêm vào (nội dung của bạn). Bạn cấp cho STAVE quyền cần thiết để lưu trữ, xử lý, hiển thị và phát nội dung của bạn, cũng như chuyển cho những người bạn chọn, để dịch vụ vận hành được.",
        "Dự án mới tạo ở chế độ riêng tư. Chỉ bạn và các cộng tác viên bạn chấp nhận xem được dự án riêng tư. Khi công khai một dự án, bạn phải chọn một giấy phép Creative Commons (CC BY, CC BY-SA hoặc CC BY-NC). Người dùng khác được xem, nghe, fork và xuất dự án công khai theo giấy phép đó. Bản fork giữ giấy phép của bản gốc.",
        "Bạn chịu trách nhiệm về nội dung của mình. Không tải lên thứ gì mà bạn không có quyền chia sẻ.",
      ],
    },
    {
      heading: "5. Bản quyền",
      paragraphs: [
        "Một giai điệu, một phần hoà âm hoặc một tệp MIDI sao chép bài hát có thể được bảo hộ bản quyền dù không chứa bản ghi âm nào. Chỉ tải lên, công khai hoặc chia sẻ nhạc, tệp MIDI, mẫu âm và âm thanh do chính bạn sáng tạo, được phép sử dụng hoặc được tự do sử dụng. Tuyệt đối không dùng tài liệu bị rò rỉ hoặc lấy mà không có sự cho phép.",
        "Khi tải nội dung lên, bạn cam kết bạn sở hữu hoặc có quyền chia sẻ nội dung đó và nội dung không xâm phạm quyền của bất kỳ ai.",
        "STAVE là nơi lưu trữ nội dung do người dùng thêm vào và không kiểm tra từng dự án trước khi đăng. Khi chủ sở hữu quyền hoặc người đại diện được uỷ quyền báo cáo vi phạm, quản trị viên xem xét và, nếu báo cáo có cơ sở, sẽ gỡ dự án. Việc gỡ cũng ẩn mọi bản fork tạo từ dự án đó, vì bản fork mang cùng nội dung.",
        "Để báo cáo vi phạm, hãy dùng nút Báo cáo trên dự án và chọn bản quyền. Bạn cần cung cấp họ tên, cho biết bạn là chủ sở hữu hay người được uỷ quyền, mô tả tác phẩm, nêu cách chứng minh quyền của bạn, và xác nhận một cách thiện chí rằng việc sử dụng không được phép và thông tin của bạn chính xác. Báo cáo sai sự thật có thể khiến tài khoản của chính bạn bị xử lý.",
        "Tái phạm: tài khoản có dự án bị gỡ vì vi phạm bản quyền từ ba lần trở lên có thể bị đình chỉ hoặc gỡ.",
      ],
    },
    {
      heading: "6. Dự án bị gỡ và kháng cáo",
      paragraphs: [
        "Khi dự án bị gỡ, bạn nhận được thông báo kèm lý do. Dự án bị ẩn với mọi người nhưng được giữ trong thời gian lưu giữ (30 ngày, trừ khi quản trị viên đặt thời hạn khác) để có thể sửa sai sót.",
        "Nếu cho rằng việc gỡ là sai, bạn có thể kháng cáo trong mục Dự án bị gỡ ở trang Dự án, khi thời gian lưu giữ còn hiệu lực. Hãy nêu lý do bạn có quyền với nội dung đó. Quản trị viên sẽ xem xét kháng cáo. Nếu được chấp nhận, dự án và các bản fork bị ẩn cùng đợt sẽ được khôi phục. Nếu bị bác bỏ, quyết định là cuối cùng đối với lần gỡ đó. Mỗi lần gỡ chỉ được kháng cáo một lần. Hết thời gian lưu giữ, dự án bị gỡ có thể bị xoá vĩnh viễn.",
      ],
    },
    {
      heading: "7. Âm thanh tuỳ chỉnh và bản thu nháp âm thanh",
      paragraphs: [
        "Bản thu nháp âm thanh và âm thanh tuỳ chỉnh được lưu riêng tư cho bạn và những người được phép dùng dự án. Mỗi người dùng có hạn mức lưu trữ do STAVE đặt. Nếu bạn xoá một âm thanh tuỳ chỉnh mà dự án của người khác đang dùng, cách giữ hay xoá âm thanh đó theo lựa chọn bạn đưa ra khi xoá.",
        "Bản thu bằng micro của bạn không được chứa bản ghi âm có bản quyền của người khác hoặc cuộc trò chuyện riêng tư mà bạn không có quyền chia sẻ.",
      ],
    },
    {
      heading: "8. Cộng tác, pull request và Community Jam",
      paragraphs: [
        "Khi mời cộng tác viên, bạn quyết định họ chỉ được xem hay được chỉnh sửa. Cộng tác viên xem được lịch sử dự án. Bạn vẫn chịu trách nhiệm về những gì cộng tác viên thêm vào khi bạn còn là chủ dự án.",
        "Pull request chia sẻ thay đổi giữa hai dự án. Chủ dự án đích quyết định có hợp nhất hay không. Thay đổi đã hợp nhất trở thành một phần lịch sử của dự án đó và không bị gỡ khi tác giả pull request rời đi sau này.",
        "Community Jam là sự kiện theo giờ do quản trị viên tổ chức. Trong jam, chỉnh sửa theo quy tắc ghi sau thắng và không tạo commit cho tới khi sự kiện kết thúc, khi kết quả được lưu thành một dự án. Hãy tham gia một cách văn minh.",
      ],
    },
    {
      heading: "9. Hỗ trợ bằng AI",
      paragraphs: [
        "STAVE có thể gợi ý nội dung commit, mô tả rủi ro khi hợp nhất và giải thích các mẫu nhạc lý. Các gợi ý này trước hết do quy tắc tính ra; dịch vụ AI chỉ giúp diễn đạt phần giải thích. STAVE không dùng AI để sáng tác nhạc thay bạn.",
        "Chỉ một bản tóm tắt ngắn về thay đổi được gửi tới dịch vụ AI, không bao giờ gửi thông tin đăng nhập của bạn. Gợi ý có thể sai; hãy kiểm tra trước khi dùng. Nếu dịch vụ AI không khả dụng, STAVE vẫn hoạt động bình thường mà không có phần này.",
      ],
    },
    {
      heading: "10. STAVE+ và thanh toán",
      paragraphs: [
        "STAVE+ là gói trả phí mở khoá các tính năng cá nhân hoá như giao diện tạo từ ảnh. Giá hiển thị khi bạn đăng ký được khoá cho gói của bạn. Thay đổi giá chỉ áp dụng từ ngày được thông báo cho bạn.",
        "Thanh toán do một nhà cung cấp thanh toán bên thứ ba xử lý. STAVE chỉ kích hoạt gói sau khi nhà cung cấp xác nhận đã thanh toán. Nếu cho rằng một khoản thanh toán có vấn đề, hãy dùng chức năng báo sự cố thanh toán ở trang Thanh toán. Bạn có thể huỷ bất cứ lúc nào; gói đã huỷ vẫn hoạt động đến hết kỳ bạn đã trả.",
      ],
    },
    {
      heading: "11. Dữ liệu cá nhân",
      paragraphs: [
        "STAVE lưu dữ liệu bạn cung cấp (email, tên hiển thị, hồ sơ, dự án, bình luận, phiên đăng nhập và thông tin gói đăng ký) và các bản ghi kỹ thuật cần để vận hành và bảo vệ dịch vụ, như phiên đăng nhập và nhật ký hoạt động.",
        "Chúng tôi dùng dữ liệu của bạn để cung cấp dịch vụ, giữ an toàn, gửi các thông báo mà bạn kiểm soát trong phần cài đặt và xử lý báo cáo. Chúng tôi không bán dữ liệu của bạn. Thông tin công khai khác, như tên dự án công khai và hồ sơ công khai của bạn, mọi khách truy cập đều xem được.",
        "Bạn có thể xoá tài khoản trong phần hồ sơ. Xoá tài khoản sẽ xoá dự án và tệp của bạn, trừ các bản ghi mà pháp luật hoặc việc xử lý một báo cáo đang mở yêu cầu giữ lại.",
      ],
    },
    {
      heading: "12. Đình chỉ và chấm dứt sử dụng",
      paragraphs: [
        "Bạn có thể ngừng sử dụng STAVE và xoá tài khoản bất cứ lúc nào. STAVE có thể đình chỉ hoặc gỡ tài khoản hay nội dung vi phạm điều khoản, là đối tượng của một báo cáo bản quyền có cơ sở, hoặc gây rủi ro cho dịch vụ và người dùng khác.",
        "Quản trị viên ghi lại các hành động quan trọng, như gỡ và khôi phục, trong nhật ký kiểm toán.",
      ],
    },
    {
      heading: "13. Không bảo đảm và giới hạn trách nhiệm",
      paragraphs: [
        "STAVE được cung cấp nguyên trạng. Chúng tôi cố gắng giữ dự án của bạn an toàn nhưng không thể hứa dịch vụ luôn sẵn sàng hay không có lỗi, và bạn nên xuất những công việc quan trọng. Trong phạm vi pháp luật cho phép, STAVE và nhóm tác giả không chịu trách nhiệm về dữ liệu bị mất, thiệt hại lợi nhuận hay nội dung do người dùng thêm vào.",
      ],
    },
    {
      heading: "14. Thay đổi và luật áp dụng",
      paragraphs: [
        "Chúng tôi có thể cập nhật các điều khoản này. Khi điều khoản thay đổi đáng kể, bạn sẽ được yêu cầu đồng ý phiên bản mới trước khi tiếp tục. Các điều khoản này chịu sự điều chỉnh của pháp luật Việt Nam.",
      ],
    },
  ],
};

export const TERMS_CONTENT: Record<Lang, TermsDocument> = { en, vi };
