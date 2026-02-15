-- Phase 7.5: Realtime ペイロードに全カラムを含めるため REPLICA IDENTITY FULL に変更
-- Supabase ダッシュボードの SQL Editor で手動実行すること
ALTER TABLE public.rooms REPLICA IDENTITY FULL;
