alter table public.subscription_plans
  add column if not exists previous_price_vnd integer
  check (previous_price_vnd is null or previous_price_vnd >= 0);
