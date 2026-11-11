export interface NotificationParamsByType {
  'collab.invite': { inviterName: string; projectName: string };
  'collab.invite_accepted': { userName: string; projectName: string };
  'collab.invite_declined': { userName: string; projectName: string };
  'collab.permission_changed': { projectName: string; permissionLabel: string };
  'collab.access_removed': { projectName: string };
  'comment.new': { authorName: string; projectName: string };
  'comment.reply': { authorName: string; projectName: string };
  'fork.created': { forkerName: string; projectName: string; projectId: string };
  'pr.opened': {
    authorName: string;
    title: string;
    projectName: string;
    pullRequestId: string;
    projectId: string;
  };
  'pr.comment': { authorName: string; title: string; pullRequestId: string };
  'pr.merged': { title: string; projectName: string; pullRequestId: string };
  'pr.closed': { title: string; actorName: string; pullRequestId: string };
  'jam.started': { eventName: string };
  'jam.ended': { eventName: string };
  'jam.end_extended': { eventName: string; endsAt: string };
  'jam.cancelled': { eventName: string };
  'billing.payment_success': { planName: string; amount: number; orderCode: string | number };
  'billing.payment_failed': { planName: string; amount: number; orderCode: string | number };
  'billing.plan_changed': { planName: string; effectiveDate: string | null };
  'billing.canceled': { planName: string; endDate: string | null };
  'billing.renewal_due': { planName: string; dueDate: string | null };
  'billing.price_change': { planName: string; newPrice: number; effectiveDate: string | null };
  'billing.issue_resolved': {
    remedy: string;
    summary: string;
    days?: number;
    refundAmountVnd?: number;
  };
  'security.google_connected': { email: string };
  'security.google_disconnected': { email: string };
  'moderation.project_removed': { projectName: string; reason: string; projectId: string };
  'moderation.project_restored': { projectName: string; projectId: string };
  'report.reviewed': { projectName: string };
  account_suspended: { reason: string };
  account_reactivated: { reason: string };
}

export type NotificationType = keyof NotificationParamsByType;

export type NotificationParams<T extends NotificationType = NotificationType> =
  NotificationParamsByType[T];

/** Stored in `notifications.payload` (jsonb). `params` is the source of truth;
 * `title`/`body` are a Vietnamese fallback and `customText` marks an admin-edited
 * template whose stored text must be shown as is. */
export interface NotificationPayload {
  params?: Record<string, unknown>;
  title?: string;
  body?: string;
  customText?: boolean;
  [key: string]: unknown;
}
