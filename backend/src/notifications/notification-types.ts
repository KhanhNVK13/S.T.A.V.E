export interface NotificationTypeDefinition {
  type: string;
  category: string;
  mandatory: boolean;
  placeholders: string[];
  defaultSubject: string;
  defaultBody: string;
}

const COLLABORATION = 'Cộng tác';
const COMMENTS = 'Bình luận';
const FORKS = 'Fork';
const PULL_REQUESTS = 'Pull request';
const JAM = 'Sự kiện Jam';
const SECURITY_BILLING = 'Bảo mật và thanh toán';
const MODERATION = 'Kiểm duyệt';
const REPORTS = 'Báo cáo';

function define(
  type: string,
  category: string,
  placeholders: string[],
  defaultSubject: string,
  defaultBody: string,
): NotificationTypeDefinition {
  return {
    type,
    category,
    mandatory: type.startsWith('security.') || type.startsWith('billing.'),
    placeholders,
    defaultSubject,
    defaultBody,
  };
}

export const NOTIFICATION_TYPES: NotificationTypeDefinition[] = [
  define(
    'collab.invite',
    COLLABORATION,
    ['inviterName', 'projectName'],
    'Lời mời cộng tác',
    '{{inviterName}} mời bạn cộng tác trong dự án "{{projectName}}".',
  ),
  define(
    'collab.invite_accepted',
    COLLABORATION,
    ['userName', 'projectName'],
    'Lời mời được chấp nhận',
    '{{userName}} đã chấp nhận lời mời vào "{{projectName}}".',
  ),
  define(
    'collab.invite_declined',
    COLLABORATION,
    ['userName', 'projectName'],
    'Lời mời bị từ chối',
    '{{userName}} đã từ chối lời mời vào "{{projectName}}".',
  ),
  define(
    'collab.permission_changed',
    COLLABORATION,
    ['projectName', 'permissionLabel'],
    'Quyền cộng tác đã đổi',
    'Quyền của bạn trong "{{projectName}}" đã đổi thành {{permissionLabel}}.',
  ),
  define(
    'collab.access_removed',
    COLLABORATION,
    ['projectName'],
    'Bạn không còn quyền truy cập',
    'Bạn không còn quyền truy cập dự án "{{projectName}}".',
  ),
  define(
    'comment.new',
    COMMENTS,
    ['authorName', 'projectName'],
    'Bình luận mới',
    '{{authorName}} đã bình luận trong "{{projectName}}".',
  ),
  define(
    'comment.reply',
    COMMENTS,
    ['authorName', 'projectName'],
    'Có người trả lời bình luận của bạn',
    '{{authorName}} đã trả lời bình luận của bạn trong "{{projectName}}".',
  ),
  define(
    'fork.created',
    FORKS,
    ['forkerName', 'projectName'],
    'Dự án của bạn được fork',
    '{{forkerName}} đã fork dự án "{{projectName}}" của bạn.',
  ),
  define(
    'pr.opened',
    PULL_REQUESTS,
    ['authorName', 'title', 'projectName'],
    'Pull request mới',
    '{{authorName}} đề xuất "{{title}}" cho dự án "{{projectName}}".',
  ),
  define(
    'pr.comment',
    PULL_REQUESTS,
    ['authorName', 'title'],
    'Bình luận mới trong pull request',
    '{{authorName}} đã bình luận trong pull request "{{title}}".',
  ),
  define(
    'pr.merged',
    PULL_REQUESTS,
    ['title', 'projectName'],
    'Pull request đã được hợp nhất',
    'Pull request "{{title}}" đã được hợp nhất vào "{{projectName}}".',
  ),
  define(
    'pr.closed',
    PULL_REQUESTS,
    ['title', 'actorName'],
    'Pull request đã đóng',
    '{{actorName}} đã đóng pull request "{{title}}".',
  ),
  define(
    'jam.started',
    JAM,
    ['eventName'],
    'Sự kiện Jam bắt đầu',
    'Sự kiện Jam "{{eventName}}" đã bắt đầu.',
  ),
  define(
    'jam.ended',
    JAM,
    ['eventName'],
    'Sự kiện Jam kết thúc',
    'Sự kiện Jam "{{eventName}}" đã kết thúc. Xem kết quả.',
  ),
  define(
    'jam.end_extended',
    JAM,
    ['eventName', 'endsAt'],
    'Sự kiện Jam được kéo dài',
    'Sự kiện "{{eventName}}" được kéo dài đến {{endsAt}}.',
  ),
  define(
    'jam.cancelled',
    JAM,
    ['eventName'],
    'Sự kiện Jam bị huỷ',
    'Sự kiện Jam "{{eventName}}" đã bị huỷ.',
  ),
  define(
    'billing.payment_success',
    SECURITY_BILLING,
    ['planName', 'amount'],
    'Thanh toán thành công',
    'Thanh toán {{amount}} cho gói {{planName}} thành công.',
  ),
  define(
    'billing.payment_failed',
    SECURITY_BILLING,
    ['planName', 'amount'],
    'Thanh toán không thành công',
    'Thanh toán {{amount}} cho gói {{planName}} không thành công.',
  ),
  define(
    'billing.plan_changed',
    SECURITY_BILLING,
    ['planName', 'effectiveDate'],
    'Gói dịch vụ sẽ đổi',
    'Gói của bạn sẽ chuyển sang {{planName}} từ {{effectiveDate}}.',
  ),
  define(
    'billing.canceled',
    SECURITY_BILLING,
    ['planName', 'endDate'],
    'Gói dịch vụ sẽ không gia hạn',
    'Gói {{planName}} sẽ không gia hạn; còn hiệu lực đến {{endDate}}.',
  ),
  define(
    'billing.renewal_due',
    SECURITY_BILLING,
    ['planName', 'dueDate'],
    'Cần gia hạn gói dịch vụ',
    'Gói {{planName}} cần gia hạn trước {{dueDate}}.',
  ),
  define(
    'billing.price_change',
    SECURITY_BILLING,
    ['planName', 'newPrice', 'effectiveDate'],
    'Giá gói dịch vụ sẽ đổi',
    'Giá gói {{planName}} sẽ đổi thành {{newPrice}} từ {{effectiveDate}}.',
  ),
  define(
    'billing.issue_resolved',
    SECURITY_BILLING,
    ['summary'],
    'Sự cố thanh toán đã được xử lý',
    'Sự cố thanh toán của bạn đã được xử lý: {{summary}}',
  ),
  define(
    'security.google_connected',
    SECURITY_BILLING,
    ['email'],
    'Đã liên kết tài khoản Google',
    'Tài khoản Google {{email}} đã được liên kết với tài khoản STAVE của bạn.',
  ),
  define(
    'security.google_disconnected',
    SECURITY_BILLING,
    ['email'],
    'Đã gỡ tài khoản Google',
    'Tài khoản Google {{email}} đã được gỡ khỏi tài khoản STAVE của bạn.',
  ),
  define(
    'moderation.project_removed',
    MODERATION,
    ['projectName', 'reason'],
    'Dự án đã bị gỡ',
    'Dự án "{{projectName}}" đã bị gỡ. Lý do: {{reason}}',
  ),
  define(
    'moderation.project_restored',
    MODERATION,
    ['projectName'],
    'Dự án đã được khôi phục',
    'Dự án "{{projectName}}" đã được khôi phục.',
  ),
  define(
    'report.reviewed',
    REPORTS,
    ['projectName'],
    'Báo cáo đã được xem xét',
    'Báo cáo của bạn về "{{projectName}}" đã được xem xét.',
  ),
];

const BY_TYPE = new Map(NOTIFICATION_TYPES.map((def) => [def.type, def]));

export function getNotificationType(
  type: string,
): NotificationTypeDefinition | undefined {
  return BY_TYPE.get(type);
}

export function isMandatoryType(type: string): boolean {
  return BY_TYPE.get(type)?.mandatory ?? false;
}

export function renderTemplate(
  template: string,
  values: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_match, key) => {
    const value = values[key as string];
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return JSON.stringify(value);
  });
}
