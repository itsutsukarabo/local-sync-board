-- ============================================
-- Phase 7.3: 履歴・精算データを current_state から分離
-- room_history / room_settlements テーブルの作成
-- ============================================

-- --------------------------------------------
-- 1. room_history テーブル
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_room_history_room_id_created
  ON public.room_history(room_id, created_at DESC);

-- RLS
ALTER TABLE public.room_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view room history"
  ON public.room_history FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert room history"
  ON public.room_history FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can delete room history"
  ON public.room_history FOR DELETE USING (true);

-- Realtime は不要（REST で取得するため）

COMMENT ON TABLE public.room_history IS '操作履歴（current_state から分離）';

-- --------------------------------------------
-- 2. room_settlements テーブル
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('settlement', 'adjustment')),
  player_results JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_room_settlements_room_id_created
  ON public.room_settlements(room_id, created_at ASC);

-- RLS
ALTER TABLE public.room_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view room settlements"
  ON public.room_settlements FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert room settlements"
  ON public.room_settlements FOR INSERT WITH CHECK (true);

COMMENT ON TABLE public.room_settlements IS '精算・調整履歴（current_state から分離）';

-- --------------------------------------------
-- 3. 既存データのマイグレーション
-- current_state.__history__ → room_history
-- current_state.__settlements__ → room_settlements
-- その後 current_state から __history__, __settlements__, __writeId__ を除去
-- --------------------------------------------

-- 3a. __history__ の移行
INSERT INTO public.room_history (room_id, message, snapshot, created_at)
SELECT
  r.id,
  entry->>'message',
  COALESCE(entry->'snapshot', '{}'::jsonb),
  to_timestamp((entry->>'timestamp')::bigint / 1000.0) AT TIME ZONE 'UTC'
FROM public.rooms r,
     jsonb_array_elements(r.current_state->'__history__') AS entry
WHERE r.current_state ? '__history__'
  AND jsonb_array_length(r.current_state->'__history__') > 0;

-- 3b. __settlements__ の移行
INSERT INTO public.room_settlements (id, room_id, type, player_results, created_at)
SELECT
  (entry->>'id')::uuid,
  r.id,
  COALESCE(entry->>'type', 'settlement'),
  COALESCE(entry->'playerResults', '{}'::jsonb),
  to_timestamp((entry->>'timestamp')::bigint / 1000.0) AT TIME ZONE 'UTC'
FROM public.rooms r,
     jsonb_array_elements(r.current_state->'__settlements__') AS entry
WHERE r.current_state ? '__settlements__'
  AND jsonb_array_length(r.current_state->'__settlements__') > 0;

-- 3c. current_state から __history__, __settlements__, __writeId__ を除去
UPDATE public.rooms
SET current_state = current_state - '__history__' - '__settlements__' - '__writeId__'
WHERE current_state ? '__history__'
   OR current_state ? '__settlements__'
   OR current_state ? '__writeId__';
