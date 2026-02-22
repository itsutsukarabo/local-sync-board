-- ============================================
-- room_name の更新をホスト・コホストのみに制限する
-- BEFORE UPDATE トリガーを使用してカラムレベルの権限制御を実現
-- ============================================

-- room_name 更新権限チェック関数
-- RETURN NULL でサイレントキャンセル（0件更新・エラーなし）
CREATE OR REPLACE FUNCTION public.check_room_name_update_permission()
RETURNS TRIGGER AS $$
BEGIN
  -- room_name が変更される場合のみチェック
  IF NEW.room_name IS DISTINCT FROM OLD.room_name THEN
    -- ホストでもコホストでもない場合は更新をキャンセル
    IF auth.uid() IS DISTINCT FROM OLD.host_user_id AND
       NOT (OLD.co_host_ids @> jsonb_build_array(auth.uid()::text)) THEN
      RETURN NULL;  -- サイレントキャンセル: 0件更新・エラーなし（RLS 違反と同等の動作）
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- トリガー登録
CREATE TRIGGER rooms_check_room_name_update
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.check_room_name_update_permission();
