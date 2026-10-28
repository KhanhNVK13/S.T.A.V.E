alter table public.notification_preferences
  add column if not exists channel text not null default 'in_app'
    check (channel in ('in_app', 'email'));

create unique index if not exists notification_preferences_user_type_channel_key
  on public.notification_preferences (user_id, type, channel);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notification_preferences
  drop constraint if exists notification_preferences_user_id_type_key;
