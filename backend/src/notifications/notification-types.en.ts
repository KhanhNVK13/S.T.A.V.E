export const ENGLISH_DEFAULTS: Record<
  string,
  { subject: string; body: string }
> = {
  'collab.invite': {
    subject: 'Collaboration invitation',
    body: '{{inviterName}} invited you to collaborate on "{{projectName}}".',
  },
  'collab.invite_accepted': {
    subject: 'Invitation accepted',
    body: '{{userName}} accepted the invitation to "{{projectName}}".',
  },
  'collab.invite_declined': {
    subject: 'Invitation declined',
    body: '{{userName}} declined the invitation to "{{projectName}}".',
  },
  'collab.permission_changed': {
    subject: 'Collaboration permission changed',
    body: 'Your permission in "{{projectName}}" changed to {{permissionLabel}}.',
  },
  'collab.access_removed': {
    subject: 'Access removed',
    body: 'You no longer have access to the project "{{projectName}}".',
  },
  'comment.new': {
    subject: 'New comment',
    body: '{{authorName}} commented in "{{projectName}}".',
  },
  'comment.reply': {
    subject: 'Reply to your comment',
    body: '{{authorName}} replied to your comment in "{{projectName}}".',
  },
  'fork.created': {
    subject: 'Your project was forked',
    body: '{{forkerName}} forked your project "{{projectName}}".',
  },
  'pr.opened': {
    subject: 'New pull request',
    body: '{{authorName}} proposed "{{title}}" for the project "{{projectName}}".',
  },
  'pr.comment': {
    subject: 'New comment on a pull request',
    body: '{{authorName}} commented on the pull request "{{title}}".',
  },
  'pr.merged': {
    subject: 'Pull request merged',
    body: 'The pull request "{{title}}" was merged into "{{projectName}}".',
  },
  'pr.closed': {
    subject: 'Pull request closed',
    body: '{{actorName}} closed the pull request "{{title}}".',
  },
  'jam.started': {
    subject: 'Jam event started',
    body: 'The Jam event "{{eventName}}" has started.',
  },
  'jam.ended': {
    subject: 'Jam event ended',
    body: 'The Jam event "{{eventName}}" has ended. See the result.',
  },
  'jam.end_extended': {
    subject: 'Jam event extended',
    body: 'The event "{{eventName}}" was extended until {{endsAt}}.',
  },
  'jam.cancelled': {
    subject: 'Jam event cancelled',
    body: 'The Jam event "{{eventName}}" was cancelled.',
  },
  'billing.payment_success': {
    subject: 'Payment successful',
    body: 'Your payment of {{amount}} for the {{planName}} plan went through.',
  },
  'billing.payment_failed': {
    subject: 'Payment failed',
    body: 'Your payment of {{amount}} for the {{planName}} plan did not go through.',
  },
  'billing.plan_changed': {
    subject: 'Plan change scheduled',
    body: 'Your plan will switch to {{planName}} on {{effectiveDate}}.',
  },
  'billing.canceled': {
    subject: 'Plan will not renew',
    body: 'The {{planName}} plan will not renew; it stays active until {{endDate}}.',
  },
  'billing.renewal_due': {
    subject: 'Plan renewal due',
    body: 'The {{planName}} plan needs to be renewed before {{dueDate}}.',
  },
  'billing.price_change': {
    subject: 'Plan price change',
    body: 'The {{planName}} plan price will change to {{newPrice}} from {{effectiveDate}}.',
  },
  'billing.issue_resolved': {
    subject: 'Payment issue resolved',
    body: 'Your payment issue was resolved: {{summary}}',
  },
  'security.google_connected': {
    subject: 'Google account linked',
    body: 'The Google account {{email}} was linked to your STAVE account.',
  },
  'security.google_disconnected': {
    subject: 'Google account unlinked',
    body: 'The Google account {{email}} was unlinked from your STAVE account.',
  },
  'moderation.project_removed': {
    subject: 'Project removed',
    body: 'The project "{{projectName}}" was removed. Reason: {{reason}}',
  },
  'moderation.project_restored': {
    subject: 'Project restored',
    body: 'The project "{{projectName}}" was restored.',
  },
  'report.reviewed': {
    subject: 'Report reviewed',
    body: 'Your report about "{{projectName}}" was reviewed.',
  },
};
