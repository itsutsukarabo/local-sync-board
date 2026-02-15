-- room_settlements に DELETE ポリシーを追加
-- ロールバック・Undo 時に RPC (SECURITY DEFINER) から精算レコードを削除するために必要
-- Supabase ダッシュボードの SQL Editor で手動実行すること

CREATE POLICY "Authenticated users can delete room settlements"
  ON public.room_settlements FOR DELETE USING (true);
