ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS co_host_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
