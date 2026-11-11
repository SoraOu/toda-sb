-- Live updates: tell Supabase to broadcast changes on these tables.
-- Row Level Security still applies: each user only receives rows they are allowed to read.
alter publication supabase_realtime add table
  holders, holder_chassis, holder_renewals, holder_status_history, holder_transfers, activity_log;
