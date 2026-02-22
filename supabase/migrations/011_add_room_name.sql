ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS room_name TEXT;
