alter table public.subscription_plans
  add column if not exists previous_features jsonb,
  add column if not exists features_effective_at timestamptz;
