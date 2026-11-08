-- Speed up client_channel_summary query on shootings
CREATE INDEX IF NOT EXISTS idx_shootings_owner_channel
ON public.shootings(owner_id, channel)
WHERE channel IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shootings_channel
ON public.shootings(channel)
WHERE channel IS NOT NULL;
