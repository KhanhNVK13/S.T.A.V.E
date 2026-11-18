-- UC-94: cancelling a scheduled Jam event sets status 'cancelled', but the enum only had
-- scheduled / active / ended, so the update failed at the database. Adds the missing value.
alter type public.jam_status_enum add value if not exists 'cancelled';
